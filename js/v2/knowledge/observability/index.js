/* ============================================================
   INDEX.JS — Knowledge Observability public barrel (V2, Phase 9.1)

   PURPOSE: single entry point for the cross-cutting observability shapes —
   Progress, Warning, Conflict Report, Import Statistics, Incremental
   Cursor. Event contracts live next to what emits them instead
   (acquisition/contracts/event-contract.js, repository/contracts/
   event-contract.js, lifecycle/contracts/event-contract.js) — see this
   directory's README for why.

   RESPONSIBILITY: re-export only.

   DEPENDENCIES: every module under knowledge/observability/. Pure — no V1
   dependency, safe to re-export from knowledge/index.js.
   ============================================================ */

'use strict';

export * from './contracts/progress-contract.js';
export * from './contracts/warning-contract.js';
export * from './contracts/conflict-report-contract.js';
export * from './contracts/import-statistics-contract.js';
export * from './contracts/incremental-cursor-contract.js';
