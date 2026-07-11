/* ============================================================
   INDEX.JS — Knowledge Review Workflow public barrel (V2.0.3, Phase 9.2)

   PURPOSE: single entry point for review — the Phase 5
   review-workflow-engine.js (submit/approve/reject/rollback, real since
   Phase 5) plus V2.0.3's session/queue/conflict/history layer on top.

   RESPONSIBILITY: re-export only.

   DEPENDENCIES: every module under knowledge/review/. Pure — no V1
   dependency, safe to re-export from knowledge/index.js.
   ============================================================ */

'use strict';

export * from './review-workflow-engine.js';
export * from './review-queue-engine.js';
export * from './conflict-detection-engine.js';
// review-session-engine.js's own `startReviewSession` (session + event
// bookkeeping) is the one callers should use — it shadows
// contracts/session-contract.js's pure constructor of the same name, which
// is why that contract's constructors are re-exported by name below rather
// than via a blanket `export *` (which would otherwise silently drop the
// colliding name per the ES module spec, not error).
export * from './review-session-engine.js';
export * from './review-history.js';
export { REVIEW_SESSION_SCHEMA, REVIEW_SESSION_STATUS } from './contracts/session-contract.js';
export * from './contracts/event-contract.js';
export * from './contracts/promotion-contract.js';
