/* ============================================================
   RECOMMENDATION-CONTRACT.JS — Organizational Reasoning Foundation
   (V2, Phase 4-7)

   PURPOSE: fix the shape of the Reasoning Engine's ONE output — a
   Recommendation that is always traceable back to Knowledge Assets,
   Evidence, Business Rules and Reasoning Rules, per this phase's own
   binding constraint ("never hallucinate, never invent business rules").

   RESPONSIBILITY: Recommendation typedef + constructor + structural check.

   DEPENDENCIES: none.

   NON-GOALS: does not compute confidence, does not resolve citations, does
   not decide conflicts — see reasoning-engine.js and
   conflict-detection-engine.js. A Recommendation is never itself a
   Decision — see reasoning-engine.js's header for why it can only ever be
   an input to the existing, unmodified human-gated review workflow
   (knowledge-service.js#promoteKnowledge).
   ============================================================ */

'use strict';

export const RECOMMENDATION_SCHEMA = 'reasoning-recommendation@1';

export const RECOMMENDATION_ERRORS = Object.freeze({
  NO_APPLICABLE_KNOWLEDGE: 'NO_APPLICABLE_KNOWLEDGE',
});

/**
 * @typedef {Object} RuleConflict
 * @property {string} ruleId
 * @property {string} conflictsWithRuleId
 * @property {string} relationshipId   - the kind:'relationship' KnowledgeItem id backing this conflict
 */

/**
 * @typedef {Object} Recommendation
 * @property {import('./problem-contract.js').Problem} problem
 * @property {string} claim                - the recommendation itself, built ONLY from cited rules' own recorded text — never a generated sentence
 * @property {string[]} citedRuleIds       - Approved 'rule'/'policy' KnowledgeItem ids this claim rests on
 * @property {string[]} citedKnowledgeIds  - any other Approved KnowledgeItem ids cited as supporting evidence
 * @property {RuleConflict[]} conflicts    - conflicting rule pairs detected among the applicable set — never silently resolved
 * @property {number} confidence           - 0-1
 * @property {string} confidenceBasis      - human-readable justification for the number above
 * @property {Object[]} explanation        - one explainability-service#explain() result per cited item
 * @property {string} createdAt            - ISO 8601
 */

export function makeRecommendation({
  problem, claim, citedRuleIds = [], citedKnowledgeIds = [], conflicts = [], confidence, confidenceBasis, explanation = [],
}) {
  return Object.freeze({
    problem,
    claim,
    citedRuleIds: Object.freeze([...citedRuleIds]),
    citedKnowledgeIds: Object.freeze([...citedKnowledgeIds]),
    conflicts: Object.freeze(conflicts.map((c) => Object.freeze({ ...c }))),
    confidence,
    confidenceBasis,
    explanation: Object.freeze([...explanation]),
    createdAt: new Date().toISOString(),
  });
}

/** A Recommendation must ALWAYS cite at least one rule or one piece of
 *  supporting knowledge — an uncited Recommendation is not a lesser one,
 *  it is an invalid one (cite-or-abstain, Architecture Assessment §7). */
export function isRecommendation(r) {
  return !!r && typeof r === 'object'
    && typeof r.claim === 'string' && r.claim.length > 0
    && Array.isArray(r.citedRuleIds) && Array.isArray(r.citedKnowledgeIds)
    && (r.citedRuleIds.length > 0 || r.citedKnowledgeIds.length > 0)
    && typeof r.confidence === 'number' && r.confidence >= 0 && r.confidence <= 1
    && typeof r.confidenceBasis === 'string' && r.confidenceBasis.length > 0;
}
