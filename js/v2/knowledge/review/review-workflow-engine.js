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
import { requestTransition } from '../lifecycle/lifecycle-engine.js';
import { getById, rollback as repositoryRollback } from '../repository/knowledge-repository.js';

/** Structural pre-check only. */
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
  return requestTransition(id, from, LIFECYCLE_STATE.PENDING_REVIEW);
}

/** Records an Approved ReviewDecision (requires `preferenceRationale`). */
export function approve(id, reviewDecision) {
  const from = currentState(id);
  if (!isValidReviewDecision({ ...reviewDecision, toState: LIFECYCLE_STATE.APPROVED }, from)) {
    return Object.freeze({ ok: false, data: null, error: Object.freeze({ code: 'INVALID_REVIEW_DECISION', message: 'approve: requires a valid ReviewDecision with preferenceRationale.' }) });
  }
  return requestTransition(id, from, LIFECYCLE_STATE.APPROVED, {
    approvedBy: reviewDecision.approverId,
    approvedAt: reviewDecision.decidedAt,
    preferenceRationale: reviewDecision.preferenceRationale,
  }, { viaReviewDecision: true });
}

/** Sends a Pending Review item back to Candidate. */
export function reject(id, reviewDecision) {
  const from = currentState(id);
  if (!isValidReviewDecision({ ...reviewDecision, toState: LIFECYCLE_STATE.CANDIDATE }, from)) {
    return Object.freeze({ ok: false, data: null, error: Object.freeze({ code: 'INVALID_REVIEW_DECISION', message: 'reject: requires a valid ReviewDecision.' }) });
  }
  return requestTransition(id, from, LIFECYCLE_STATE.CANDIDATE);
}

/** Approves a prior version as current — itself an auditable ReviewDecision. */
export function rollback(id, toVersion, reviewDecision) {
  return repositoryRollback(id, toVersion, reviewDecision);
}

export { isValidReviewDecision };
