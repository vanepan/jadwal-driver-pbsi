/* ============================================================
   ENTITY-HEALTH-ENGINE.JS — Body Intelligence (V2, Phase 12.5.5)

   PURPOSE: "Entity Health" — the THIRD, disambiguated health concept in
   this platform (see contracts/entity-health-contract.js's header).
   Passes through a real V1-computed score wherever
   health/registry/health-source-registry.js has one registered (Vehicle
   today); otherwise computes ONLY a generic observability (freshness +
   completeness) score — the one score Body is allowed to invent, because
   it is about DATA QUALITY, never business meaning. NEVER computes a
   second, competing business-meaningful score for an entityType that
   already has a real V1 one — that would be exactly the duplicated-
   concept risk the Phase 12.5 brief warns against.

   WHY `rawSourceRecord` IS A PARAMETER, NOT A LOOKUP THIS FILE DOES
   ITSELF: js/vehicles-store.js (the only place a raw Vehicle record
   lives) transitively imports js/firebase.js's `https://` CDN Firebase
   SDK, unresolvable by Node's ESM loader — importing it here would make
   this whole engine untestable in Node, the same problem
   sensors/vehicle-mapping.js's split from vehicle-sensor.js solves.
   `computeEntityHealth` therefore accepts an already-resolved
   `rawSourceRecord` from its caller. In THIS phase, nothing supplies one
   in production — computeEntityHealth is structurally complete and fully
   Node-tested against synthetic fixtures, but has no live caller, the
   same "structurally complete, deferred live wiring" precedent
   context/body-context-builder.js sets (Phase 12.5.6). A later,
   separately-approved sprint wires a real caller (e.g.
   body-sensing-service.js resolving `getVehicleById(entity.sourceRef)`
   and passing it in) once that governance decision is made.

   RESPONSIBILITY: computeEntityHealth(entity, opts).

   DEPENDENCIES: health/registry/health-source-registry.js,
   contracts/entity-health-contract.js.

   NON-GOALS: never re-derives a business score. Never reads V1 itself.
   ============================================================ */

'use strict';

import { getHealthSource } from './registry/health-source-registry.js';
import { ENTITY_HEALTH_MODE, makeEntityHealthReport } from '../contracts/entity-health-contract.js';

const FRESHNESS_FULL_CREDIT_HOURS = 1;
const FRESHNESS_ZERO_CREDIT_HOURS = 24 * 30; // 30 days

/** Deterministic, documented formula — data-quality only, never business
 *  meaning. Linear decay from full credit at <=1h old to zero at >=30d. */
function freshnessScore(observedAt, now) {
  const ageMs = new Date(now).getTime() - new Date(observedAt).getTime();
  const ageHours = ageMs / (1000 * 60 * 60);
  if (!Number.isFinite(ageHours) || ageHours < 0) return 0;
  if (ageHours <= FRESHNESS_FULL_CREDIT_HOURS) return 100;
  if (ageHours >= FRESHNESS_ZERO_CREDIT_HOURS) return 0;
  const pct = 1 - (ageHours - FRESHNESS_FULL_CREDIT_HOURS) / (FRESHNESS_ZERO_CREDIT_HOURS - FRESHNESS_FULL_CREDIT_HOURS);
  return Math.round(pct * 100);
}

/** Fraction of `attributes` fields that are non-empty/non-null. */
function completenessScore(attributes) {
  const values = Object.values(attributes || {});
  if (values.length === 0) return 0;
  const present = values.filter((v) => v !== null && v !== undefined && v !== '').length;
  return Math.round((present / values.length) * 100);
}

function computeObservabilityScore(entity, now) {
  const freshness = freshnessScore(entity.observability.observedAt, now);
  const completeness = completenessScore(entity.attributes);
  return Math.round((freshness + completeness) / 2);
}

/**
 * @param {import('../contracts/entity-contract.js').Entity} entity
 * @param {{rawSourceRecord?: object|null, now?: string}} [opts]
 * @returns {import('../contracts/entity-health-contract.js').EntityHealthReport}
 */
export function computeEntityHealth(entity, opts = {}) {
  const now = opts.now || new Date().toISOString();
  const source = getHealthSource(entity.entityType);
  const observabilityScore = computeObservabilityScore(entity, now);

  if (source && source.mode === ENTITY_HEALTH_MODE.SOURCE_PASSTHROUGH && opts.rawSourceRecord) {
    const { score } = source.compute(opts.rawSourceRecord);
    return makeEntityHealthReport({
      id: `${entity.id}:health:${now}`, entityId: entity.id, entityType: entity.entityType,
      mode: ENTITY_HEALTH_MODE.SOURCE_PASSTHROUGH, sourceScore: score, sourceScoreOrigin: source.origin,
      observabilityScore,
    });
  }

  // No registered source, OR a source exists but the caller couldn't
  // supply the raw V1 record this call — honest fallback, never a
  // fabricated passthrough score.
  return makeEntityHealthReport({
    id: `${entity.id}:health:${now}`, entityId: entity.id, entityType: entity.entityType,
    mode: ENTITY_HEALTH_MODE.OBSERVABILITY_ONLY, sourceScore: null, sourceScoreOrigin: null,
    observabilityScore,
  });
}
