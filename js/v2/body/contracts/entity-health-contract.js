/* ============================================================
   ENTITY-HEALTH-CONTRACT.JS — Body Intelligence (V2, Phase 12.5.1)

   PURPOSE: fix the shape of "Entity Health" — the THIRD "health" concept
   in this platform, after knowledge/contracts/metrics-contract.js's
   KnowledgeHealthReport ("is our learned knowledge trustworthy") and
   organizational-memory/contracts/health-contract.js's ArchiveHealthReport
   ("is our organizational memory complete"). This one asks a different
   question again — "is this operational entity's data trustworthy/
   current" — not a duplicate of either, same disambiguation discipline
   ArchiveHealthReport's own header already establishes for itself.

   RESPONSIBILITY: define EntityHealthReport. `mode` distinguishes a real
   pass-through of a V1-computed score from Body's own generic
   observability score — see health/entity-health-engine.js for why
   passthrough is preferred wherever a V1 score already exists (never a
   second computation of the same number — the brief's own "no duplicated
   concepts" rule).

   DEPENDENCIES: none (structural — entity-health-engine.js computes it).
   ============================================================ */

'use strict';

export const ENTITY_HEALTH_SCHEMA = 'entity-health-report@1';

export const ENTITY_HEALTH_MODE = Object.freeze({
  SOURCE_PASSTHROUGH: 'source_passthrough',
  OBSERVABILITY_ONLY: 'observability_only',
});

/**
 * @typedef {Object} EntityHealthReport
 * @property {string} id
 * @property {string} entityId
 * @property {string} entityType
 * @property {string} mode                  - one of ENTITY_HEALTH_MODE
 * @property {number|null} sourceScore       - the V1 engine's own 0-100 score, verbatim, only when mode is source_passthrough
 * @property {string|null} sourceScoreOrigin - e.g. 'js/services/vehicle-asset-service.js#normalizeVehicleAsset().health.overall' — traceability
 * @property {number} observabilityScore     - 0-100, ALWAYS computed: freshness + completeness of the sensor read. The ONLY score Body ever invents — about data quality, never business meaning.
 * @property {string} computedAt             - ISO 8601
 */

export function makeEntityHealthReport({
  id, entityId, entityType, mode, sourceScore = null, sourceScoreOrigin = null, observabilityScore,
}) {
  return Object.freeze({
    id, entityId, entityType, mode, sourceScore, sourceScoreOrigin, observabilityScore,
    computedAt: new Date().toISOString(),
  });
}

export function isEntityHealthReport(h) {
  return !!h && typeof h === 'object'
    && typeof h.entityId === 'string' && h.entityId.length > 0
    && typeof h.entityType === 'string' && h.entityType.length > 0
    && typeof h.mode === 'string' && Object.values(ENTITY_HEALTH_MODE).includes(h.mode)
    && (h.sourceScore === null || typeof h.sourceScore === 'number')
    && typeof h.observabilityScore === 'number' && h.observabilityScore >= 0 && h.observabilityScore <= 100;
}
