/* ============================================================
   RECOGNITION-RECOMMENDATION-TYPE-REGISTRY.JS — Recognition Foundation (Phase 12.7.1)

   PURPOSE: register the vocabulary of `recommendationType` values
   Recognition writes into knowledge/contracts/recommendation-evidence-
   contract.js's `RecommendationEvidence.recommendationType` field —
   Recognition is this platform's first real producer of that contract
   (see its own header: "V2.0.12 produces zero RecommendationEvidence
   instances in production code... a future recommendation engine
   constructs these against this exact shape"). Recognition does NOT
   define its own competing recommendation contract — it populates the
   one that already exists and was built for exactly this.

   Disambiguated on purpose from two existing, unrelated "recommendation"
   concepts this platform already has (same word, third deliberately
   different concern):
     - reasoning/contracts's Recommendation — cites Approved Knowledge,
       answers "what should be done about THIS Problem, right now."
     - learning/contracts/learning-recommendation-contract.js's
       LearningRecommendation — answers "based on repeated observation,
       what should a human consider doing to the platform's OWN
       knowledge" (Phase 12.6).
     - THIS — answers a third question: "these things APPEAR related —
       should a human confirm it." Never auto-promotes past a suggestion;
       a human confirming one is a real, existing Knowledge review
       decision, not a new gate this registry invents.

   RESPONSIBILITY: register/list/check recommendationType ids and labels.

   DEPENDENCIES: none.

   NON-GOALS: does not produce a RecommendationEvidence (Sprint 12.7.5+).
   ============================================================ */

'use strict';

/** @type {Map<string, {id: string, label: string}>} */
const _recommendationTypes = new Map();

export function registerRecommendationType(id, label) {
  if (typeof id !== 'string' || !id) throw new Error('registerRecommendationType: id must be a non-empty string');
  if (typeof label !== 'string' || !label) throw new Error('registerRecommendationType: label must be a non-empty string');
  _recommendationTypes.set(id, Object.freeze({ id, label }));
}

export function hasRecommendationType(id) {
  return _recommendationTypes.has(id);
}

export function getRecommendationType(id) {
  return _recommendationTypes.get(id) || null;
}

export function listRecommendationTypes() {
  return Object.freeze([..._recommendationTypes.values()]);
}

/** Test/teardown helper. Not used by any runtime path. */
export function resetRecommendationTypeRegistry() {
  _recommendationTypes.clear();
  bootstrap();
}

function bootstrap() {
  registerRecommendationType('confirm_duplicate', 'Confirm Duplicate');
  registerRecommendationType('confirm_relationship', 'Confirm Relationship');
  registerRecommendationType('confirm_classification', 'Confirm Classification');
  registerRecommendationType('merge_cluster', 'Merge Cluster');
}

bootstrap();
