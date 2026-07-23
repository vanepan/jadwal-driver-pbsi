/* ============================================================
   SESSION-CONTRACT.JS — Knowledge Review Workflow (V2.0.3, Phase 9.2)

   PURPOSE: fix the shape of one reviewer's sitting — mirrors
   acquisition/contracts/session-contract.js's KnowledgeAcquisitionSession
   pattern exactly (same start/complete shape), applied to a human
   reviewing items instead of a connector acquiring them.

   RESPONSIBILITY: define ReviewSession and constructors.

   DEPENDENCIES: none.
   ============================================================ */

'use strict';

export const REVIEW_SESSION_SCHEMA = 'knowledge-review-session@1';

export const REVIEW_SESSION_STATUS = Object.freeze({
  OPEN: 'open',
  COMPLETED: 'completed',
});

/**
 * @typedef {Object} ReviewSession
 * @property {string} sessionId
 * @property {string} reviewerId
 * @property {string} startedAt    - ISO 8601
 * @property {string|null} completedAt
 * @property {string} status       - one of REVIEW_SESSION_STATUS
 * @property {import('./promotion-contract.js').PromotionRecord[]} decisions
 */

let _counter = 0;

export function startReviewSession(reviewerId) {
  _counter += 1;
  return Object.freeze({
    sessionId: `review-session:${reviewerId}:${Date.now()}:${_counter}`,
    reviewerId,
    startedAt: new Date().toISOString(),
    completedAt: null,
    status: REVIEW_SESSION_STATUS.OPEN,
    decisions: Object.freeze([]),
  });
}

/** Pure — returns a NEW session with `record` appended to `decisions`. */
export function appendDecision(session, record) {
  return Object.freeze({ ...session, decisions: Object.freeze([...session.decisions, record]) });
}

export function completeReviewSession(session) {
  return Object.freeze({ ...session, completedAt: new Date().toISOString(), status: REVIEW_SESSION_STATUS.COMPLETED });
}
