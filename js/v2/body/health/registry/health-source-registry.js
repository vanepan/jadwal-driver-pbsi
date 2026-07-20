/* ============================================================
   HEALTH-SOURCE-REGISTRY.JS — Body Intelligence (V2, Phase 12.5.5)

   PURPOSE: the process-wide directory of PASS-THROUGH health sources —
   one registration per entityType that already has a real, standing,
   V1-computed score worth reusing rather than re-deriving. Mirrors the
   Map + register/get/list shape every other registry in this platform
   uses. An entityType with NO registered source is not an error — it
   simply means entity-health-engine.js falls back to
   ENTITY_HEALTH_MODE.OBSERVABILITY_ONLY for it (the honest default; see
   that engine's header for why Driver/Assignment start there).

   RESPONSIBILITY: register/get/list health sources by entityType.

   DEPENDENCIES: none at the registry level. The one real registration
   (vehicle) is bootstrapped here because js/services/vehicle-asset-service.js
   is genuinely PURE (its own header: "no DOM, no Firebase, no window" —
   confirmed by successfully importing it in plain Node) — unlike a
   Sensor, registering it here does NOT transitively load Firebase, so no
   dormancy-by-omission split is needed for this one registration.

   NON-GOALS: `compute(rawSourceRecord)` here NEVER reads V1 itself — it
   takes an already-resolved raw V1 record as a parameter (see
   entity-health-engine.js's header for where that record comes from: a
   later, separately-approved wiring sprint, same "structurally complete,
   deferred live wiring" precedent body-context-builder.js sets).
   ============================================================ */

'use strict';

import { normalizeVehicleAsset } from '../../../../services/vehicle-asset-service.js';
import { ENTITY_HEALTH_MODE } from '../../contracts/entity-health-contract.js';

const _sources = new Map();

/**
 * @param {string} entityType
 * @param {{mode: string, compute: (rawSourceRecord: object) => {score: number, origin: string}, origin: string}} source
 */
export function registerHealthSource(entityType, source) {
  if (typeof entityType !== 'string' || !entityType) throw new Error('registerHealthSource: entityType must be a non-empty string');
  if (!source || typeof source.compute !== 'function') throw new Error('registerHealthSource: source.compute must be a function');
  _sources.set(entityType, Object.freeze({ entityType, ...source }));
}

export function getHealthSource(entityType) {
  return _sources.get(entityType) || null;
}

export function hasHealthSource(entityType) {
  return _sources.has(entityType);
}

export function listHealthSources() {
  return Object.freeze([..._sources.values()].map((s) => Object.freeze({ entityType: s.entityType, mode: s.mode, origin: s.origin })));
}

/** Test/teardown helper. Not used by any runtime path. */
export function resetHealthSourceRegistry() {
  _sources.clear();
  bootstrap();
}

function bootstrap() {
  registerHealthSource('vehicle', {
    mode: ENTITY_HEALTH_MODE.SOURCE_PASSTHROUGH,
    origin: 'js/services/vehicle-asset-service.js#normalizeVehicleAsset().health.overall (computeVehicleHealth)',
    compute: (rawVehicleRecord) => {
      const asset = normalizeVehicleAsset(rawVehicleRecord);
      return { score: asset.health.overall, band: asset.health.band, label: asset.health.label };
    },
  });
  // Driver and Assignment are deliberately NOT registered here.
  // js/services/unified-scoring.js / driver-recommendation-engine.js
  // compute a driver/dispatch score AT RECOMMENDATION TIME, over a
  // specific dispatch decision — not a standing, retrievable per-driver
  // score the way computeVehicleHealth() is. Passing a context-dependent
  // recommendation through as if it were stored "driver health" would
  // misrepresent it (see entity-health-engine.js's header) — they stay on
  // the honest OBSERVABILITY_ONLY default until V1 exposes a real
  // standing per-driver score, never fabricated to fill the gap.
}

bootstrap();
