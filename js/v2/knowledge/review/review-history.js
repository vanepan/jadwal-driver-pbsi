/* ============================================================
   REVIEW-HISTORY.JS — Knowledge Review Workflow (V2.0.3, Phase 9.2)

   PURPOSE: the audit log of WHO decided WHAT, across items — distinct from
   repository/knowledge-repository.js#getHistory(id) (every version of ONE
   item). "Review History" answers "what has this reviewer done" or "how
   did this item get promoted", not "what does this item's version 3 say."

   RESPONSIBILITY: an in-memory, process-wide log of PromotionRecords —
   the same non-durable singleton idiom as acquisition-engine.js's own
   report log and every registry in this tree.

   DEPENDENCIES: none — records are appended by review-session-engine.js.
   ============================================================ */

'use strict';

/** @type {import('./contracts/promotion-contract.js').PromotionRecord[]} */
const _history = [];

export function recordPromotion(record) {
  _history.push(record);
  return record;
}

export function listReviewHistory(itemId = null) {
  return itemId ? _history.filter((r) => r.itemId === itemId) : [..._history];
}

/** Test/teardown helper. Not used by any runtime path. */
export function resetReviewHistory() {
  _history.length = 0;
}
