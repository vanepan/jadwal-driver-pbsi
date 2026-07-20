/* ============================================================
   BODY-SIGNAL-ADAPTER.JS — Universal Learning Engine, Body Bridge (Phase 12.6.6)

   PURPOSE: PURE mapping — one BodyEvent (js/v2/body/contracts/
   body-event-contract.js) becomes one LearningSignal seed
   (js/v2/learning/contracts/learning-signal-contract.js). The reason this
   file — and this whole js/v2/learning-bridge/ domain — exists at all:
   js/v2/body/ and js/v2/learning/ are BOTH forbidden from importing each
   other's engines (body/README.md: "knowledge/, organizational-memory/,
   learning/, ... never depend on body/"; learning-service.js's header:
   "Learning depends on NOTHING above it"), so something outside both has
   to be the one place that sees both — mirrors problem-solving/'s exact
   precedent as "the ONE layer allowed to see all."

   targetKey IS NOT SET HERE — deliberately left to
   learning-signal-service.js#emitLearningSignal()'s own default
   (scopeKey(signal.scope) = `body:<entityType>:<entityId>:<signalType>`).
   This is the load-bearing detail the Phase 12.6 plan's risk section
   flags: scoping by (entityType, entityId, signalType) — NOT the raw
   BodyEvent id — is exactly what makes a REPEATED state change on the
   same entity/field supersede instead of accumulating unboundedly.

   DEPENDENCIES: js/v2/body/contracts/body-event-contract.js
   (BODY_EVENT_TYPE, isBodyEvent — a bare, zero-dependency CONTRACT leaf,
   the same "pure vocabulary reuse" precedent
   knowledge/contracts/identity-contract.js#nextVersion and
   knowledge/observability/contracts/warning-contract.js already
   establish elsewhere in this platform — never a body/ ENGINE or
   SERVICE).

   NON-GOALS: reads nothing, writes nothing — see
   services/body-learning-bridge-service.js for the one impure orchestrator
   that actually calls body-event-repository.js and emitLearningSignal().
   ============================================================ */

'use strict';

import { BODY_EVENT_TYPE, isBodyEvent } from '../../body/contracts/body-event-contract.js';

const SIGNAL_TYPE_BY_BODY_EVENT_TYPE = Object.freeze({
  [BODY_EVENT_TYPE.ENTITY_OBSERVED]: 'body:entity_observed',
  [BODY_EVENT_TYPE.STATE_CHANGED]: 'body:state_changed',
  [BODY_EVENT_TYPE.RELATIONSHIP_OBSERVED]: 'body:relationship_observed',
  [BODY_EVENT_TYPE.SENSE_FAILED]: 'body:sense_failed',
});

/**
 * @param {import('../../body/contracts/body-event-contract.js').BodyEvent} event
 * @returns {Object} a LearningSignal seed, ready for
 *   learning/services/learning-signal-service.js#emitLearningSignal()
 */
export function mapBodyEventToSignalSeed(event) {
  if (!isBodyEvent(event)) throw new Error('mapBodyEventToSignalSeed: not a well-formed BodyEvent.');

  const signalType = SIGNAL_TYPE_BY_BODY_EVENT_TYPE[event.type] || `body:${event.type}`;
  const isStateChange = event.type === BODY_EVENT_TYPE.STATE_CHANGED;

  return {
    domainType: 'body',
    entityType: event.entityType,
    entityId: event.entityId,
    signalType,
    sourceType: 'sensor-observation',
    actorId: event.sensorId,
    before: isStateChange ? { state: event.detail.fromState } : null,
    after: isStateChange ? { state: event.detail.toState } : { ...event.detail },
    evidence: { bodyEventId: event.id, observedAt: event.observedAt },
  };
}
