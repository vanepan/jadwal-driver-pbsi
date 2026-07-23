/* ============================================================
   EVENT-CONTRACT.JS — Knowledge Promotion Observability (V2.0.4, Phase 9.3)

   PURPOSE: fix the shape of Promotion Engine events — distinct from
   review/contracts/event-contract.js's ReviewEvent (session-scoped: a
   human reviewer's sitting) and lifecycle/contracts/event-contract.js's
   LifecycleEvent (fires for every transition, unconditionally). A
   PromotionEvent is emitted by the named verbs in promotion-engine.js /
   conflict-resolution-engine.js / knowledge-merge-engine.js specifically —
   useful for a caller that only cares about promotion-engine activity,
   without subscribing to every raw lifecycle transition.

   RESPONSIBILITY: define PROMOTION_EVENT_TYPE and PromotionEvent.

   DEPENDENCIES: none.
   ============================================================ */

'use strict';

export const PROMOTION_EVENT_TYPE = Object.freeze({
  PROMOTED: 'promoted',
  DEPRECATED: 'deprecated',
  ROLLED_BACK: 'rolled_back',
  CONFLICT_RESOLVED: 'conflict_resolved',
  MERGE_PROPOSED: 'merge_proposed',
});

/**
 * @typedef {Object} PromotionEvent
 * @property {string} type   - one of PROMOTION_EVENT_TYPE
 * @property {string|null} itemId
 * @property {string} at     - ISO 8601
 * @property {*} [detail]
 */

export function makePromotionEvent(type, { itemId = null, detail } = {}) {
  return Object.freeze({ type, itemId, at: new Date().toISOString(), detail: detail ?? null });
}
