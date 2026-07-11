/* ============================================================
   RECOMMENDATION-EVIDENCE-CONTRACT.JS — Knowledge Platform (V2.0.12)

   PURPOSE: fix the shape a future recommendation engine must use to
   cite the Evidence[] backing a recommendation it produced — "why
   should this be recommended" answered as data, not prose.

   RESPONSIBILITY: define the RecommendationEvidence typedef and a
   structural validator, built on evidence-contract.js.

   DEPENDENCIES: knowledge/contracts/evidence-contract.js.

   NON-GOALS: no recommendation engine exists yet anywhere in js/v2 —
   this fixes the shape only a future recommendation engine populates.
   V2.0.12 produces zero RecommendationEvidence instances in production
   code; it is exercised only by this contract's own validator checks.
   Mirrors how connector-contract.js predated any real connector.

   FUTURE EVOLUTION: a future recommendation engine constructs these
   against this exact shape; this contract should not need to change
   to accommodate a new recommendationType — that is registry-backed
   vocabulary, same pattern as domainType/kind.
   ============================================================ */

'use strict';

import { isEvidenceList } from './evidence-contract.js';

export const RECOMMENDATION_EVIDENCE_SCHEMA = 'recommendation-evidence@1';

/**
 * @typedef {Object} RecommendationEvidence
 * @property {string} recommendationId    - stable identity of the recommendation this backs
 * @property {string} recommendationType  - what kind of recommendation (opaque to this contract)
 * @property {import('./evidence-contract.js').Evidence[]} evidence - non-empty
 * @property {number} confidence          - 0–1
 * @property {string} rationale           - human-readable, non-empty
 * @property {string} generatedAt         - ISO 8601
 */

/**
 * Structural validity check.
 * @param {*} r
 * @returns {boolean}
 */
export function isRecommendationEvidence(r) {
  return !!r && typeof r === 'object'
    && typeof r.recommendationId === 'string' && r.recommendationId.length > 0
    && typeof r.recommendationType === 'string' && r.recommendationType.length > 0
    && isEvidenceList(r.evidence) && r.evidence.length > 0
    && typeof r.confidence === 'number' && r.confidence >= 0 && r.confidence <= 1
    && typeof r.rationale === 'string' && r.rationale.length > 0
    && typeof r.generatedAt === 'string' && r.generatedAt.length > 0;
}
