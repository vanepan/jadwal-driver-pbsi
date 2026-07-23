/* ============================================================
   LEARNING-RECOMMENDATION-CONTRACT.JS — Universal Learning Engine (Phase 12.6.1)

   PURPOSE: fix the shape of a Learning Recommendation — DISAMBIGUATED from
   reasoning/contracts/recommendation-contract.js's Recommendation, which
   this is not a rename or a subtype of:
     - reasoning/'s Recommendation cites APPROVED KnowledgeItems and answers
       "what should be done about THIS Problem" — a per-instance, right-now
       verdict, computed by reason(), never stored.
     - LearningRecommendation is synthesized from ACCUMULATED LearningEvents
       and answers "based on repeated observation, what should a human
       consider doing to the platform's own knowledge" — a standing,
       scope-level judgment, computed by learning-recommendation-engine.js
       (Phase 12.6.5), never stored (same "holds no repository" precedent
       reasoning-service.js already sets for itself).

   "LEARNING RULE" DELIBERATELY HAS NO SEPARATE CONTRACT. Knowledge's own
   registry/kind-registry.js already registers 'rule' as a first-class
   KnowledgeItem kind; a standalone LearningRule contract would be a THIRD
   home for "what is a rule," directly contradicting "never duplicate
   learning." A recurring pattern strong enough to be a rule candidate is
   represented here as `recommendationType: PROMOTE_TO_RULE` — it only ever
   POINTS AT Knowledge's existing mechanism, never defines a competing one.

   Same cite-or-abstain discipline reasoning/'s own Recommendation enforces:
   `citedLearningEventIds` is required and non-empty — structurally
   impossible to have an uncited LearningRecommendation.

   RESPONSIBILITY: define RECOMMENDATION_TYPE, LearningRecommendation, and
   a structural validator.

   DEPENDENCIES: contracts/learning-scope-contract.js,
   contracts/learning-confidence-contract.js.

   NON-GOALS: never auto-applied, never written back to any source domain.
   Promoting a recommendation to a real KnowledgeItem happens entirely
   inside Knowledge's own existing promoteKnowledge()/review-workflow path
   — see services/learning-outcome-service.js's header (Phase 12.6.5) for
   the governance rule this enforces.
   ============================================================ */

'use strict';

import { isLearningScope } from './learning-scope-contract.js';
import { isLearningConfidence } from './learning-confidence-contract.js';

export const LEARNING_RECOMMENDATION_SCHEMA = 'learning-recommendation@1';

export const RECOMMENDATION_TYPE = Object.freeze({
  PROMOTE_TO_RULE: 'promote_to_rule',   // a recurring pattern is a candidate for Knowledge's kind:'rule'
  FLAG_FOR_REVIEW: 'flag_for_review',   // a KnowledgeItem shows a recurring correction/anomaly signal
  FLAG_ANOMALY: 'flag_anomaly',         // an entity/domain shows a recurring unexplained deviation
  MERGE_CANDIDATE: 'merge_candidate',   // two signals look like the same underlying fact (see learning-signal-similarity-engine.js)
});

/**
 * @typedef {Object} LearningRecommendation
 * @property {string} id                      - deterministic: `learning-recommendation:<recommendationType>:<scopeKey>`
 * @property {string} recommendationType       - one of RECOMMENDATION_TYPE
 * @property {import('./learning-scope-contract.js').LearningScope} scope
 * @property {string} claim                    - built ONLY from cited LearningEvents' own after/evidence — never generated prose
 * @property {string[]} citedLearningEventIds   - required, non-empty — cite-or-abstain
 * @property {import('./learning-confidence-contract.js').LearningConfidence} confidence
 * @property {string} rationale
 * @property {string} computedAt                - ALWAYS fresh — never persisted as its own row
 */

export function makeLearningRecommendation({
  id, recommendationType, scope, claim, citedLearningEventIds, confidence, rationale,
}) {
  return Object.freeze({
    id, recommendationType, scope, claim,
    citedLearningEventIds: Object.freeze([...citedLearningEventIds]),
    confidence, rationale,
    computedAt: new Date().toISOString(),
  });
}

export function isLearningRecommendation(r) {
  return !!r && typeof r === 'object'
    && typeof r.id === 'string' && r.id.length > 0
    && typeof r.recommendationType === 'string' && Object.values(RECOMMENDATION_TYPE).includes(r.recommendationType)
    && isLearningScope(r.scope)
    && typeof r.claim === 'string' && r.claim.length > 0
    && Array.isArray(r.citedLearningEventIds) && r.citedLearningEventIds.length > 0
    && isLearningConfidence(r.confidence);
}
