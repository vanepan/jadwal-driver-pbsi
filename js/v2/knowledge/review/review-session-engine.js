/* ============================================================
   REVIEW-SESSION-ENGINE.JS — Knowledge Review Workflow (V2.0.3, Phase 9.2)

   PURPOSE: the ONE orchestration layer that wraps a human reviewer's
   sitting around the existing review/review-workflow-engine.js entry
   points (submitForReview/approve/reject — real since Phase 5, NOT
   duplicated here), turning each successful call into a recorded
   PromotionRecord (review-history.js) and a ReviewEvent
   (contracts/event-contract.js), mirroring acquisition-engine.js's own
   "wrap the real primitive, add session/event/history bookkeeping" shape.

   RESPONSIBILITY: startReviewSession/submitInSession/approveInSession/
   rejectInSession/finishReviewSession.

   DEPENDENCIES: review-workflow-engine.js (the real transitions),
   repository/knowledge-repository.js (read current state),
   contracts/{session,event,promotion}-contract.js, review-history.js.

   NON-GOALS: does not implement a NEW transition — every state change
   still flows through review-workflow-engine.js -> lifecycle-engine.js,
   so lifecycle/contracts/event-contract.js's LifecycleEvent still fires
   for each of these exactly as it did before this file existed.
   ============================================================ */

'use strict';

import { submitForReview, approve, reject } from './review-workflow-engine.js';
import {
  startReviewSession as start, appendDecision, completeReviewSession as complete,
} from './contracts/session-contract.js';
import { makePromotionRecord } from './contracts/promotion-contract.js';
import { REVIEW_EVENT_TYPE, makeReviewEvent } from './contracts/event-contract.js';
import { recordPromotion } from './review-history.js';
import { getById } from '../repository/knowledge-repository.js';

function emit(onEvent, type, sessionId, detail) {
  if (typeof onEvent === 'function') onEvent(makeReviewEvent(type, { sessionId, detail }));
}

function currentState(id) {
  const r = getById(id);
  return r.ok ? r.data.lifecycleState : null;
}

export function startReviewSession(reviewerId, opts = {}) {
  const session = start(reviewerId);
  emit(opts.onEvent, REVIEW_EVENT_TYPE.SESSION_STARTED, session.sessionId, { reviewerId });
  return session;
}

function decide(session, action, id, extra, opts) {
  const fromState = currentState(id);
  let result;
  if (action === 'submit') result = submitForReview(id);
  else if (action === 'approve') result = approve(id, { ...extra, approverId: session.reviewerId });
  else if (action === 'reject') result = reject(id, { ...extra, approverId: session.reviewerId });
  else throw new Error(`decide: unknown action "${action}".`);

  if (!result.ok) return { session, result };

  const record = makePromotionRecord({
    itemId: id,
    itemVersion: result.data.version,
    fromState,
    toState: result.data.lifecycleState,
    approverId: session.reviewerId,
    decidedAt: result.data.updatedAt,
    preferenceRationale: result.data.preferenceRationale,
    reviewSessionId: session.sessionId,
  });
  recordPromotion(record);
  const nextSession = appendDecision(session, record);
  emit(opts.onEvent, REVIEW_EVENT_TYPE.DECISION_RECORDED, session.sessionId, { itemId: id, action, fromState, toState: record.toState });
  return { session: nextSession, result };
}

/** @returns {{session: import('./contracts/session-contract.js').ReviewSession, result: object}} */
export function submitInSession(session, id, opts = {}) { return decide(session, 'submit', id, {}, opts); }
export function approveInSession(session, id, reviewDecision, opts = {}) { return decide(session, 'approve', id, reviewDecision, opts); }
export function rejectInSession(session, id, reviewDecision, opts = {}) { return decide(session, 'reject', id, reviewDecision, opts); }

export function finishReviewSession(session, opts = {}) {
  const completed = complete(session);
  emit(opts.onEvent, REVIEW_EVENT_TYPE.SESSION_COMPLETED, session.sessionId, { decisionsCount: completed.decisions.length });
  return completed;
}
