/* ============================================================
   PROMOTION-ENGINE.JS — Knowledge Promotion (V2.0.4, Phase 9.3)

   PURPOSE: ONE cohesive named-verb API over the whole five-state lifecycle
   graph (Draft -> Candidate -> Pending Review -> Approved -> Deprecated),
   completing the verb coverage lifecycle-engine.js's own header calls for
   ("exposing named transitions instead of a generic setState()") — before
   this file, Draft -> Candidate had NO named verb anywhere (only raw
   `lifecycle-engine.requestTransition()` calls could do it); Candidate/
   Pending Review/Approved -> Deprecated had none either. Every OTHER edge
   (submit/approve/reject/rollback) is real since Phase 5
   (review/review-workflow-engine.js) and is REUSED here, not reimplemented
   — this file adds `promoteToCandidate()` and `deprecate()`, and wraps
   `rollback()` with the same PromotionRecord/event bookkeeping.

   RESPONSIBILITY: promoteToCandidate, deprecate, rollbackPromotion — each
   recording a review/contracts/promotion-contract.js#PromotionRecord into
   review/review-history.js (the SAME history log V2.0.3 built — a
   promotion IS a review-history entry, not a second competing log) and
   emitting a PromotionEvent.

   DEPENDENCIES: lifecycle/lifecycle-engine.js, repository/knowledge-repository.js,
   review/review-workflow-engine.js (rollback), review/contracts/
   promotion-contract.js, review/review-history.js, contracts/event-contract.js.

   NON-GOALS: never auto-approves anything — `promoteToCandidate` and
   `deprecate` both move into states that are NOT human-gated
   (HUMAN_GATED_STATES = [APPROVED] only, contracts/lifecycle-contract.js),
   so neither requires nor accepts a ReviewDecision; reaching Approved
   still only ever happens through review-workflow-engine.js#approve().
   ============================================================ */

'use strict';

import { requestTransition, LIFECYCLE_STATE } from '../lifecycle/lifecycle-engine.js';
import { rollback as workflowRollback } from '../review/review-workflow-engine.js';
import { getById } from '../repository/knowledge-repository.js';
import { makePromotionRecord } from '../review/contracts/promotion-contract.js';
import { recordPromotion } from '../review/review-history.js';
import { PROMOTION_EVENT_TYPE, makePromotionEvent } from './contracts/event-contract.js';

function emit(onEvent, type, itemId, detail) {
  if (typeof onEvent === 'function') onEvent(makePromotionEvent(type, { itemId, detail }));
}

function currentState(id) {
  const r = getById(id);
  return r.ok ? r.data.lifecycleState : null;
}

function record(id, fromState, result, actorId, rationale) {
  const promotion = makePromotionRecord({
    itemId: id,
    itemVersion: result.data.version,
    fromState,
    toState: result.data.lifecycleState,
    approverId: actorId,
    decidedAt: result.data.updatedAt,
    preferenceRationale: rationale,
    reviewSessionId: null,
  });
  recordPromotion(promotion);
  return promotion;
}

/** Draft -> Candidate. Not human-gated — "ready for review" is a curation
 *  step, not an approval. `actorId` is recorded for the audit trail even
 *  though no ReviewDecision is required. */
export function promoteToCandidate(id, { actorId = null, onEvent } = {}) {
  const fromState = currentState(id);
  const result = requestTransition(id, fromState, LIFECYCLE_STATE.CANDIDATE);
  if (result.ok) {
    record(id, fromState, result, actorId, null);
    emit(onEvent, PROMOTION_EVENT_TYPE.PROMOTED, id, { fromState, toState: LIFECYCLE_STATE.CANDIDATE });
  }
  return result;
}

/** Candidate, Pending Review, or Approved -> Deprecated. Supersession, not
 *  rejection — `reason` is recorded as the PromotionRecord's rationale
 *  even though Deprecated is not human-gated (no ReviewDecision object is
 *  required to construct it). */
export function deprecate(id, reason, { actorId = null, onEvent } = {}) {
  const fromState = currentState(id);
  const result = requestTransition(id, fromState, LIFECYCLE_STATE.DEPRECATED);
  if (result.ok) {
    record(id, fromState, result, actorId, reason ?? null);
    emit(onEvent, PROMOTION_EVENT_TYPE.DEPRECATED, id, { fromState, reason: reason ?? null });
  }
  return result;
}

/** Thin wrapper around review-workflow-engine.js#rollback() adding the
 *  same PromotionRecord/event bookkeeping every other verb here has —
 *  the rollback mechanics themselves (repository/knowledge-repository.js's
 *  rollback, real since Phase 5) are untouched. */
export function rollbackPromotion(id, toVersion, reviewDecision, { onEvent } = {}) {
  const fromState = currentState(id);
  const result = workflowRollback(id, toVersion, reviewDecision);
  if (result.ok) {
    record(id, fromState, result, reviewDecision.approverId, reviewDecision.preferenceRationale);
    emit(onEvent, PROMOTION_EVENT_TYPE.ROLLED_BACK, id, { fromState, toVersion });
  }
  return result;
}
