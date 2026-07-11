/* ============================================================
   REVIEW-CONTRACT.JS — Knowledge Platform (V2, Phase 3)

   PURPOSE: fix the shape of the human-approval workflow that structurally
   enforces Decision 6 ("teach once, learn forever") — no KnowledgeItem may
   reach Approved without an explicit, recorded human action. A Draft or
   Candidate item, however many times resubmitted or however confident an
   automated check is, never auto-promotes.

   RESPONSIBILITY: define the ReviewQueueEntry and ReviewDecision typedefs.
   Approval authority (WHO may approve) is deliberately left an open
   parameter (`approverId: string`) rather than a hard dependency — the
   architecture doc (§5, closing question 4) leaves unresolved whether
   review should reuse js/config/role-registry.js's capability model or use
   a separate Knowledge-specific role concept. This file does not decide
   that; it only requires that SOME approver identity is recorded.

   DEPENDENCIES: knowledge/contracts/lifecycle-contract.js (the states a
   ReviewDecision may move an item between).

   NON-GOALS: does not check any role or capability. Does not call
   js/config/role-registry.js. Does not implement a queue.

   FUTURE EVOLUTION: Phase 4+ resolves the open approver-authority question
   above, then knowledge/review/review-workflow-engine.js (Phase 3 stub)
   implements `submitForReview` / `approve` / `reject` / `rollback` against
   whichever model is chosen — this contract's shape should not need to
   change either way, since `approverId` is already role-agnostic.
   ============================================================ */

'use strict';

import { LIFECYCLE_STATE, canTransition } from './lifecycle-contract.js';

export const REVIEW_SCHEMA = 'knowledge-review@1';

/**
 * @typedef {Object} ReviewQueueEntry
 * @property {string} itemId          - KnowledgeItem id
 * @property {number} itemVersion
 * @property {string} enteredQueueAt  - ISO 8601, when the item reached Pending Review
 */

/**
 * @typedef {Object} ReviewDecision
 * @property {string} itemId
 * @property {number} itemVersion
 * @property {string} toState         - one of LIFECYCLE_STATE; must be human-gated to require this record
 * @property {string} approverId      - who decided — identity model is an open Phase 4+ question, see header
 * @property {string} decidedAt       - ISO 8601
 * @property {string|null} preferenceRationale - required when toState is APPROVED (Decision 5); human-written
 */

/**
 * Structural check that a ReviewDecision is well-formed and legal against
 * the lifecycle graph. Does NOT check approver authority (open question).
 * @param {*} decision
 * @param {string} fromState
 * @returns {boolean}
 */
export function isValidReviewDecision(decision, fromState) {
  if (!decision || typeof decision !== 'object') return false;
  if (typeof decision.approverId !== 'string' || !decision.approverId) return false;
  if (!canTransition(fromState, decision.toState)) return false;
  if (decision.toState === LIFECYCLE_STATE.APPROVED
    && (typeof decision.preferenceRationale !== 'string' || !decision.preferenceRationale)) {
    return false;
  }
  return true;
}
