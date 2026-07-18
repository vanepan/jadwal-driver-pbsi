/* ============================================================
   COMPOSER-REVIEW-CONTRACT.JS — Review Workflow (Phase 10, Sprint 10.4)

   PURPOSE: fix the ComposerDocument review lifecycle as data — mirroring
   knowledge/contracts/lifecycle-contract.js's exact proven shape (a frozen
   state enum, a frozen transition graph, a pure canTransition() check) —
   but this is a DELIBERATELY SEPARATE graph, not a reuse of that one.

   WHY NOT REUSE knowledge/contracts/lifecycle-contract.js: that graph
   (draft -> candidate -> pending_review -> approved -> deprecated) governs
   WHETHER A FACT IS TRUE OF THE ORGANIZATION — KnowledgeItem promotion.
   This graph governs WHETHER A DOCUMENT IS READY TO LEAVE THE PLATFORM —
   a completely different question, with a "Needs Revision" loop-back and
   a "Published" terminal state neither exists in nor makes sense for the
   Knowledge graph. Confirmed hard-coupled to LIFECYCLE_STATE by Phase 10
   planning research (review-contract.js/review-queue-engine.js both
   import it directly) — reusing it would either force ComposerDocument
   through states that don't apply to it, or silently redefine what
   "approved" means for Knowledge.

   Draft -> In Review -> {Needs Revision, Approved, Rejected}
   Needs Revision -> In Review
   Approved -> Published

   RESPONSIBILITY: define COMPOSER_REVIEW_STATE, the transition graph, and
   canTransitionComposerReview(from, to).

   DEPENDENCIES: none.

   NON-GOALS: does not perform a transition, does not persist anything,
   does not decide WHO may approve — see composer-store.js#transitionStatus
   and, for real reviewer/approver identity, Sprint 10.5.

   SCOPE NOTE (Sprint 10.4): the "Published" state exists in this graph so
   the contract is complete, but no UI exposes an Approved -> Published
   button until Sprint 10.6 — publishing is export + archive, a materially
   heavier action than a bare status flip, deliberately not faked as a
   no-op status change here.
   ============================================================ */

'use strict';

export const COMPOSER_REVIEW_STATE = Object.freeze({
  DRAFT: 'draft',
  IN_REVIEW: 'in_review',
  NEEDS_REVISION: 'needs_revision',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  PUBLISHED: 'published',
});

export const COMPOSER_REVIEW_STATE_DEFS = Object.freeze([
  Object.freeze({ id: COMPOSER_REVIEW_STATE.DRAFT, label: 'Draf' }),
  Object.freeze({ id: COMPOSER_REVIEW_STATE.IN_REVIEW, label: 'Dalam Tinjauan' }),
  Object.freeze({ id: COMPOSER_REVIEW_STATE.NEEDS_REVISION, label: 'Perlu Revisi' }),
  Object.freeze({ id: COMPOSER_REVIEW_STATE.APPROVED, label: 'Disetujui' }),
  Object.freeze({ id: COMPOSER_REVIEW_STATE.REJECTED, label: 'Ditolak' }),
  Object.freeze({ id: COMPOSER_REVIEW_STATE.PUBLISHED, label: 'Diterbitkan' }),
]);

/** The ONE authority on legal state moves for a ComposerDocument's review
 *  status. Rejected/Published are terminal — the spec's own linear
 *  diagram implies this; not revisited unless a real reopen need arises. */
export const COMPOSER_REVIEW_GRAPH = Object.freeze({
  [COMPOSER_REVIEW_STATE.DRAFT]: Object.freeze([COMPOSER_REVIEW_STATE.IN_REVIEW]),
  [COMPOSER_REVIEW_STATE.IN_REVIEW]: Object.freeze([
    COMPOSER_REVIEW_STATE.APPROVED, COMPOSER_REVIEW_STATE.NEEDS_REVISION, COMPOSER_REVIEW_STATE.REJECTED,
  ]),
  [COMPOSER_REVIEW_STATE.NEEDS_REVISION]: Object.freeze([COMPOSER_REVIEW_STATE.IN_REVIEW]),
  [COMPOSER_REVIEW_STATE.APPROVED]: Object.freeze([COMPOSER_REVIEW_STATE.PUBLISHED]),
  [COMPOSER_REVIEW_STATE.REJECTED]: Object.freeze([]),
  [COMPOSER_REVIEW_STATE.PUBLISHED]: Object.freeze([]),
});

/** States never automatic — spec: "No automatic approval." No path INTO
 *  these may be taken without an explicit human transitionStatus() call
 *  carrying a real actor id (and, for APPROVED, a real rationale — see
 *  composer-store.js#transitionStatus). */
export const COMPOSER_REVIEW_HUMAN_GATED_STATES = Object.freeze([
  COMPOSER_REVIEW_STATE.APPROVED, COMPOSER_REVIEW_STATE.PUBLISHED,
]);

/**
 * Pure structural check: is `from -> to` a legal single-step transition?
 * @param {string} from
 * @param {string} to
 * @returns {boolean}
 */
export function canTransitionComposerReview(from, to) {
  const reachable = COMPOSER_REVIEW_GRAPH[from];
  return Array.isArray(reachable) && reachable.includes(to);
}

/** Whether `to` requires the structural human-approval gate. */
export function isComposerReviewHumanGated(to) {
  return COMPOSER_REVIEW_HUMAN_GATED_STATES.includes(to);
}

/** Human label for a state id (falls back to the id). */
export function composerReviewStateLabel(id) {
  const def = COMPOSER_REVIEW_STATE_DEFS.find((d) => d.id === id);
  return def ? def.label : id;
}
