/* ============================================================
   INDEX.JS — Knowledge Promotion public barrel (V2.0.4, Phase 9.3)

   PURPOSE: single entry point for promotion-engine.js,
   conflict-resolution-engine.js, knowledge-merge-engine.js, and their
   contracts.

   RESPONSIBILITY: re-export only.

   DEPENDENCIES: every module under knowledge/promotion/. Pure — no V1
   dependency, safe to re-export from knowledge/index.js.
   ============================================================ */

'use strict';

export * from './promotion-engine.js';
export * from './conflict-resolution-engine.js';
export * from './knowledge-merge-engine.js';
export * from './contracts/event-contract.js';
export * from './contracts/merge-contract.js';
