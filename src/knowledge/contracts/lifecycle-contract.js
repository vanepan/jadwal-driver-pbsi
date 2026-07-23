/* ============================================================
   LIFECYCLE-CONTRACT.JS — Knowledge Platform (V2, Phase 3)

   PURPOSE: fix the five-state Knowledge lifecycle as data — the ONE
   authority on legal state moves, so an invalid transition is impossible by
   construction — mirroring the proven pattern in
   js/engineering/config/engineering-config.js's LIFECYCLE graph.

   Draft → Candidate → Pending Review → Approved → Deprecated

   RESPONSIBILITY: define the state set, the transition graph, and a pure
   `canTransition(from, to)` check. This is the ONLY place that graph is
   allowed to live; the review workflow engine and the lifecycle engine both
   read it rather than each re-deriving their own notion of "legal move".

   DEPENDENCIES: none.

   NON-GOALS: this module does not perform a transition, does not persist
   anything, and does not decide WHO may approve — see
   knowledge/review/review-workflow-engine.js and
   knowledge/lifecycle/lifecycle-engine.js for the (still-empty, Phase 3)
   engines that will consume this graph.

   FUTURE EVOLUTION: none of this graph is expected to change shape — Phase
   4+ work is wiring real persistence and a real review UI against it, not
   redesigning the states.
   ============================================================ */

'use strict';

export const LIFECYCLE_STATE = Object.freeze({
  DRAFT: 'draft',
  CANDIDATE: 'candidate',
  PENDING_REVIEW: 'pending_review',
  APPROVED: 'approved',
  DEPRECATED: 'deprecated',
});

export const LIFECYCLE_STATE_DEFS = Object.freeze([
  Object.freeze({ id: LIFECYCLE_STATE.DRAFT, label: 'Draft' }),
  Object.freeze({ id: LIFECYCLE_STATE.CANDIDATE, label: 'Candidate' }),
  Object.freeze({ id: LIFECYCLE_STATE.PENDING_REVIEW, label: 'Pending Review' }),
  Object.freeze({ id: LIFECYCLE_STATE.APPROVED, label: 'Approved' }),
  Object.freeze({ id: LIFECYCLE_STATE.DEPRECATED, label: 'Deprecated' }),
]);

/**
 * The ONE authority on legal state moves. Every key maps to the set of
 * states reachable from it. Approved → Deprecated covers supersession;
 * "rollback" is a NEW version transitioning Approved (never an edit of a
 * Deprecated row) — see repository/knowledge-repository.js's append-only
 * non-goal note.
 */
export const LIFECYCLE_GRAPH = Object.freeze({
  [LIFECYCLE_STATE.DRAFT]: Object.freeze([LIFECYCLE_STATE.CANDIDATE, LIFECYCLE_STATE.DEPRECATED]),
  [LIFECYCLE_STATE.CANDIDATE]: Object.freeze([LIFECYCLE_STATE.PENDING_REVIEW, LIFECYCLE_STATE.DEPRECATED]),
  [LIFECYCLE_STATE.PENDING_REVIEW]: Object.freeze([LIFECYCLE_STATE.APPROVED, LIFECYCLE_STATE.CANDIDATE, LIFECYCLE_STATE.DEPRECATED]),
  // APPROVED -> APPROVED is a deliberate self-loop: it is what a ROLLBACK is
  // (re-approving a different prior version while already Approved), never a
  // silent overwrite — still gated by isValidReviewDecision requiring a real
  // ReviewDecision with preferenceRationale, same as any other move into
  // APPROVED (Decision 6). DEPRECATED -> APPROVED is the same operation
  // applied to a superseded item (reviving a past version as current).
  [LIFECYCLE_STATE.APPROVED]: Object.freeze([LIFECYCLE_STATE.DEPRECATED, LIFECYCLE_STATE.APPROVED]),
  [LIFECYCLE_STATE.DEPRECATED]: Object.freeze([LIFECYCLE_STATE.APPROVED]),
});

/** States never automatic — Decision 6 ("teach once, learn forever"): no
 *  path INTO these may be taken without an explicit human review action. */
export const HUMAN_GATED_STATES = Object.freeze([LIFECYCLE_STATE.APPROVED]);

/**
 * Pure structural check: is `from -> to` a legal single-step transition?
 * Does not check WHO may perform it (see review-workflow-engine.js) and
 * does not mutate or persist anything.
 * @param {string} from
 * @param {string} to
 * @returns {boolean}
 */
export function canTransition(from, to) {
  const reachable = LIFECYCLE_GRAPH[from];
  return Array.isArray(reachable) && reachable.includes(to);
}

/** Whether `to` requires the structural human-approval gate (Decision 6). */
export function isHumanGated(to) {
  return HUMAN_GATED_STATES.includes(to);
}
