/* ============================================================
   PROMOTION-CONTRACT.JS — Knowledge Review Workflow (V2.0.3, Phase 9.2)

   PURPOSE: fix the shape of a record documenting ONE promotion — a
   lifecycle transition that resulted from a human ReviewDecision (as
   opposed to lifecycle/contracts/event-contract.js's LifecycleEvent, which
   fires for EVERY transition, human-gated or not). A PromotionRecord is
   what V2.0.4's Promotion Engine will consume/replay; this milestone only
   fixes its shape and populates it from real review-session activity.

   RESPONSIBILITY: define PromotionRecord and a constructor.

   DEPENDENCIES: none.

   NON-GOALS: does not perform a promotion — see review-session-engine.js,
   which builds one alongside every approve()/reject()/rollback() call.
   ============================================================ */

'use strict';

export const PROMOTION_SCHEMA = 'knowledge-promotion-record@1';

/**
 * @typedef {Object} PromotionRecord
 * @property {string} itemId
 * @property {number} itemVersion   - the version resulting FROM this promotion
 * @property {string} fromState
 * @property {string} toState
 * @property {string} approverId
 * @property {string} decidedAt     - ISO 8601
 * @property {string|null} preferenceRationale
 * @property {string|null} reviewSessionId
 */

export function makePromotionRecord({ itemId, itemVersion, fromState, toState, approverId, decidedAt, preferenceRationale = null, reviewSessionId = null }) {
  return Object.freeze({ itemId, itemVersion, fromState, toState, approverId, decidedAt, preferenceRationale, reviewSessionId });
}
