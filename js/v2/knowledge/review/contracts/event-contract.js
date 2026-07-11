/* ============================================================
   EVENT-CONTRACT.JS — Knowledge Review Workflow Observability (V2.0.3, Phase 9.2)

   PURPOSE: fix the shape of REVIEW-specific events — "a session started",
   "a decision was recorded", "a conflict was flagged in the queue" —
   distinct from lifecycle/contracts/event-contract.js's LifecycleEvent
   (which only knows about state transitions, not sessions or conflicts).

   RESPONSIBILITY: define REVIEW_EVENT_TYPE and ReviewEvent.

   DEPENDENCIES: none.

   NON-GOALS: does not emit anything — see review-session-engine.js.
   ============================================================ */

'use strict';

export const REVIEW_EVENT_TYPE = Object.freeze({
  SESSION_STARTED: 'session_started',
  DECISION_RECORDED: 'decision_recorded',
  SESSION_COMPLETED: 'session_completed',
  CONFLICT_FLAGGED: 'conflict_flagged',
});

/**
 * @typedef {Object} ReviewEvent
 * @property {string} type       - one of REVIEW_EVENT_TYPE
 * @property {string} sessionId
 * @property {string} at         - ISO 8601
 * @property {*} [detail]
 */

export function makeReviewEvent(type, { sessionId, detail } = {}) {
  return Object.freeze({ type, sessionId: sessionId ?? null, at: new Date().toISOString(), detail: detail ?? null });
}
