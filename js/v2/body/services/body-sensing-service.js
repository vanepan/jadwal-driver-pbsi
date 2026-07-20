/* ============================================================
   BODY-SENSING-SERVICE.JS — Body Intelligence (V2, Phase 12.5.3)

   PURPOSE: the ONE orchestrator that threads Sensor -> Entity/
   Relationship/Event together — the Body Intelligence equivalent of
   knowledge/'s acquisition-engine.js (Connector -> Repository). The ONE
   legitimate writer of relationship-repository.js's `create()` and
   body-event-repository.js's `append()` — enforced by
   scripts/body-ownership-check.mjs. Entity writes are delegated to
   services/entity-service.js (the Entity Repository's own owner) rather
   than duplicated here.

   DELIBERATELY IMPORTS NO SENSOR FILE. Looks a sensor up by id via
   registry/sensor-registry.js#getSensor(entityType) at CALL time, exactly
   the way a registry-based lookup is supposed to decouple an orchestrator
   from concrete implementations. This means body-sensing-service.js
   itself has ZERO V1/Firebase dependency and is fully Node-testable with
   FAKE sensors registered directly against the registry (see
   scripts/body-sensors-check.mjs) — the 3 real pilot sensors only become
   reachable once something separately imports sensors/index.js (or an
   individual sensor file), mirroring how knowledge/'s acquisition engine
   never statically imports nor-connector.js either.

   RECONCILIATION: `senseEntityType` compares the sensor's proposed
   observedState against the entity's PRIOR version (if any) and emits:
     - ENTITY_OBSERVED  — first-time observation (a genuinely new Entity)
     - STATE_CHANGED    — observedState differs from the prior version
     - (nothing)        — a re-observation confirming the SAME state is
                          still recorded (a new Entity version is still
                          appended — versionCount reflects observation
                          count / freshness, not edit count, unlike
                          Knowledge — but no BodyEvent is emitted, the same
                          idempotent-when-unchanged discipline
                          learning-service.js#recordCorrection already
                          established for this platform, applied here to
                          avoid flooding the event log with no-op ticks)
   A relationship id is deterministic per (fromEntityId, toEntityId, type)
   — see contracts/entity-relationship-contract.js's callers
   (sensors/assignment-mapping.js) — so re-deriving the SAME still-true
   edge hits relationship-repository.js's DUPLICATE_ID and is treated as
   an idempotent no-op here, never an error. A genuinely NEW edge (e.g. a
   reassigned vehicle) gets a new deterministic id naturally.

   A sensor that returns NOT_IMPLEMENTED (any of the 16 placeholders) is
   NOT special-cased — its honest failure is recorded as a real
   SENSE_FAILED BodyEvent, the same "must say so, never quietly render a
   zero" principle dormant-subsystems.js established for this platform.

   RESPONSIBILITY: senseEntityType(entityType, opts), senseAll(opts).

   DEPENDENCIES: registry/sensor-registry.js, services/entity-service.js,
   repository/relationship-repository.js, repository/body-event-repository.js,
   contracts/{body-event}-contract.js.

   NON-GOALS: does not decide WHEN to run (no scheduler/cron here — a
   later, separately-approved sprint wires this to a real trigger). Does
   not call any sensor not already registered.
   ============================================================ */

'use strict';

import { getSensor, listSensors } from '../registry/sensor-registry.js';
import { observeEntity, getEntity } from './entity-service.js';
import { create as relationshipCreate } from '../repository/relationship-repository.js';
import { append as eventAppend } from '../repository/body-event-repository.js';
import { makeBodyEvent, BODY_EVENT_TYPE } from '../contracts/body-event-contract.js';
import { RELATIONSHIP_REPOSITORY_ERRORS } from '../repository/relationship-repository.js';

export const SENSING_ERRORS = Object.freeze({
  UNKNOWN_SENSOR: 'UNKNOWN_SENSOR',
});

function recordEntityObservation(candidate) {
  const priorResult = getEntity(candidate.id);
  const priorState = priorResult.ok ? priorResult.data.observedState : null;
  const outcome = observeEntity(candidate);
  if (!outcome.ok) return { outcome, event: null };

  if (outcome.op === 'create') {
    const event = makeBodyEvent({
      type: BODY_EVENT_TYPE.ENTITY_OBSERVED, entityId: outcome.data.id, entityType: outcome.data.entityType,
      detail: { observedState: outcome.data.observedState }, sensorId: outcome.data.observability.sensorId,
    });
    eventAppend(event);
    return { outcome, event };
  }
  if (priorState !== null && priorState !== outcome.data.observedState) {
    const event = makeBodyEvent({
      type: BODY_EVENT_TYPE.STATE_CHANGED, entityId: outcome.data.id, entityType: outcome.data.entityType,
      detail: { fromState: priorState, toState: outcome.data.observedState }, sensorId: outcome.data.observability.sensorId,
    });
    eventAppend(event);
    return { outcome, event };
  }
  return { outcome, event: null };
}

function recordRelationship(relationship, sensorId) {
  const created = relationshipCreate(relationship);
  if (created.ok) {
    // entityType is required by the BodyEvent contract — a relationship
    // event is about an edge, not a single entityType, so it carries the
    // sensor's own entityType (the referencing side) rather than leaving
    // the field meaningless.
    const event = makeBodyEvent({
      type: BODY_EVENT_TYPE.RELATIONSHIP_OBSERVED, entityId: relationship.fromEntityId, entityType: sensorId,
      detail: { toEntityId: relationship.toEntityId, relationshipType: relationship.type }, sensorId,
    });
    return eventAppend(event);
  }
  const isIdempotentDuplicate = created.error && created.error.code === RELATIONSHIP_REPOSITORY_ERRORS.DUPLICATE_ID;
  return isIdempotentDuplicate ? { ok: true, data: null, error: null, idempotent: true } : created;
}

/**
 * @param {string} entityType
 * @param {{since?: string|null}} [opts]
 */
export function senseEntityType(entityType, opts = {}) {
  const sensor = getSensor(entityType);
  if (!sensor) {
    return { ok: false, data: null, error: { code: SENSING_ERRORS.UNKNOWN_SENSOR, message: `No sensor registered for entityType "${entityType}".` } };
  }
  const result = sensor.sense(opts.since ?? null);
  if (!result.ok) {
    eventAppend(makeBodyEvent({
      type: BODY_EVENT_TYPE.SENSE_FAILED, entityId: null, entityType,
      detail: { code: result.error ? result.error.code : 'UNKNOWN', message: result.error ? result.error.message : null },
      sensorId: entityType,
    }));
    return { ok: false, data: null, error: result.error };
  }

  const observed = [];
  for (const candidate of result.entities) {
    const { outcome } = recordEntityObservation(candidate);
    observed.push(outcome);
  }
  const relationshipOutcomes = (result.relationships || []).map((r) => recordRelationship(r, entityType));

  return {
    ok: true,
    error: null,
    data: {
      entityType,
      observedCount: observed.filter((o) => o.ok).length,
      failedCount: observed.filter((o) => !o.ok).length,
      relationshipCount: relationshipOutcomes.filter((r) => r.ok && !r.idempotent).length,
      warnings: result.warnings || [],
    },
  };
}

/** Senses every REGISTERED sensor — real or placeholder alike. A
 *  placeholder's honest NOT_IMPLEMENTED failure becomes a real,
 *  observable SENSE_FAILED BodyEvent, never silently skipped. */
export function senseAll(opts = {}) {
  return listSensors().map((s) => ({ entityType: s.entityType, result: senseEntityType(s.entityType, opts) }));
}
