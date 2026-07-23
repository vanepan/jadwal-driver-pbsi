/* ============================================================
   REVIEW-WORKFLOW-ENGINE.JS — Knowledge Platform (V2, Phase 5)

   PURPOSE: the ONLY named entry points by which a KnowledgeItem may move
   through Draft → Candidate → Pending Review → Approved → Deprecated —
   structurally enforcing Decision 6 ("teach once, learn forever") by
   exposing named transitions instead of a generic `setState()`.

   RESPONSIBILITY: `submitForReview()`, `approve()`, `reject()`, and
   `rollback()`, each validated against contracts/review-contract.js and
   performed through lifecycle-engine.js / knowledge-repository.js — now
   wired for real (Phase 5's repository exists; NullRepository is the safe
   default until a real backend is selected).

   DEPENDENCIES: knowledge/contracts/lifecycle-contract.js,
   knowledge/contracts/review-contract.js,
   knowledge/lifecycle/lifecycle-engine.js,
   knowledge/repository/knowledge-repository.js (for rollback, which is a
   repository-level operation distinct from a lifecycle transition).

   NON-GOALS: does not check approver authority/role (open Phase 4+
   question — see review-contract.js header) — `approverId` is accepted and
   recorded, never authorized here.

   FUTURE EVOLUTION: Phase 4+ resolves the approver-authority question and
   layers an authorization check in front of these methods; the methods
   themselves should not need to change shape.
   ============================================================ */

'use strict';

import { LIFECYCLE_STATE } from '../contracts/lifecycle-contract.js';
import { isValidReviewDecision } from '../contracts/review-contract.js';
// Phase 3 — lifecycle-engine.js#requestTransition is no longer imported here.
// It has exactly one caller in the platform now (services/knowledge-service.js),
// and this engine reaches it only through that owner.
import {
  getKnowledge as getById,
  submitKnowledgeForReview as serviceSubmitForReview,
  promoteKnowledge, requestChanges, restoreKnowledge,
} from '../services/knowledge-service.js';

/** Structural pre-check only. */
/* Phase 3 — THIS ENGINE IS NOW A CLIENT.
 *
 * Every verb below used to call lifecycle-engine.requestTransition() (and, for
 * rollback, the repository) directly. It no longer does: each is a thin,
 * named delegation to services/knowledge-service.js, which is the single
 * authority on Knowledge lifecycle. The verbs, their signatures and their
 * error shapes are UNCHANGED — review-service.js, review-session-engine.js and
 * promotion-engine.js keep working exactly as before, and the tests that cover
 * them keep passing. What changed is who is entitled to perform the move.
 *
 * This file is kept (rather than deleted into the Service) because "submit for
 * review" and "reject" are REVIEW vocabulary, and the review subsystem is a
 * legitimate place for that vocabulary to live. It just no longer holds the
 * authority behind it.
 */

export function canSubmitForReview(fromState) {
  return fromState === LIFECYCLE_STATE.CANDIDATE;
}

function currentState(id) {
  const result = getById(id);
  return result.ok ? result.data.lifecycleState : null;
}

/** Moves a Candidate item into Pending Review. */
export function submitForReview(id) {
  const from = currentState(id);
  if (!canSubmitForReview(from)) {
    return Object.freeze({ ok: false, data: null, error: Object.freeze({ code: 'ILLEGAL_TRANSITION', message: `Cannot submit for review from state "${from}".` }) });
  }
  return serviceSubmitForReview(id);
}

/** Records an Approved ReviewDecision (requires `preferenceRationale`). */
export function approve(id, reviewDecision) {
  const from = currentState(id);
  if (!isValidReviewDecision({ ...reviewDecision, toState: LIFECYCLE_STATE.APPROVED }, from)) {
    return Object.freeze({ ok: false, data: null, error: Object.freeze({ code: 'INVALID_REVIEW_DECISION', message: 'approve: requires a valid ReviewDecision with preferenceRationale.' }) });
  }
  return promoteKnowledge(id, reviewDecision);
}

/** Sends a Pending Review item back to Candidate. */
export function reject(id, reviewDecision) {
  const from = currentState(id);
  if (!isValidReviewDecision({ ...reviewDecision, toState: LIFECYCLE_STATE.CANDIDATE }, from)) {
    return Object.freeze({ ok: false, data: null, error: Object.freeze({ code: 'INVALID_REVIEW_DECISION', message: 'reject: requires a valid ReviewDecision.' }) });
  }
  return requestChanges(id, reviewDecision);
}

/** Approves a prior version as current — itself an auditable ReviewDecision. */
export function rollback(id, toVersion, reviewDecision) {
  return restoreKnowledge(id, toVersion, reviewDecision);
}

export { isValidReviewDecision };
