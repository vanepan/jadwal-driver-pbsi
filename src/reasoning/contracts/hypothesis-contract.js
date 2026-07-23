/* ============================================================
   HYPOTHESIS-CONTRACT.JS — Organizational Reasoning Foundation
   (V2, Phase 8-10, Part 2)

   PURPOSE: fix the shape of ONE candidate explanation for a Problem — "an
   experienced Sarpras staff member's job is not to answer, it is to
   decide what to find out first," which requires holding several possible
   causes in mind at once, ranked, until evidence narrows them. Same
   cite-or-abstain discipline as recommendation-contract.js: a Hypothesis
   with zero evidenceRefs is structurally invalid, never a guess dressed up
   as a candidate.

   RESPONSIBILITY: Hypothesis typedef, HYPOTHESIS_STATUS, constructor,
   structural check.

   DEPENDENCIES: none.

   NON-GOALS: does not generate or rank hypotheses — see
   hypothesis-engine.js. A Hypothesis is never itself a Decision — same
   read-only-advisory posture as a Recommendation.
   ============================================================ */

'use strict';

export const HYPOTHESIS_SCHEMA = 'reasoning-hypothesis@1';

export const HYPOTHESIS_STATUS = Object.freeze({
  CANDIDATE: 'candidate',
  CONFIRMED: 'confirmed',
  RULED_OUT: 'ruled_out',
});

/**
 * @typedef {Object} Hypothesis
 * @property {string} id             - deterministic: `${problem.domainType}:hypothesis:${sourceKnowledgeId}`
 * @property {string} cause          - human-readable — built ONLY from the cited item's own recorded text
 * @property {string[]} evidenceRefs - KnowledgeItem ids — MANDATORY, non-empty (cite-or-abstain)
 * @property {number} likelihood     - 0-1, plain arithmetic, never a model score
 * @property {string} status         - one of HYPOTHESIS_STATUS
 */
export function makeHypothesis({
  id, cause, evidenceRefs, likelihood, status = HYPOTHESIS_STATUS.CANDIDATE,
}) {
  return Object.freeze({
    id, cause, evidenceRefs: Object.freeze([...evidenceRefs]), likelihood, status,
  });
}

export function isHypothesis(h) {
  return !!h && typeof h === 'object'
    && typeof h.id === 'string' && h.id.length > 0
    && typeof h.cause === 'string' && h.cause.length > 0
    && Array.isArray(h.evidenceRefs) && h.evidenceRefs.length > 0
    && typeof h.likelihood === 'number' && h.likelihood >= 0 && h.likelihood <= 1
    && Object.values(HYPOTHESIS_STATUS).includes(h.status);
}
