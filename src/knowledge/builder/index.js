/* ============================================================
   INDEX.JS — Knowledge Builder Foundation public barrel (V2, Phase 4)

   PURPOSE: single entry point for the Builder — contracts, stage registry,
   orchestrator, and the public runIncremental/runFull entry points.

   RESPONSIBILITY: re-export only.

   DEPENDENCIES: every module under knowledge/builder/.

   NON-GOALS: not imported by anything outside js/v2/ in Phase 4.

   FUTURE EVOLUTION: unchanged as real stages are registered.
   ============================================================ */

'use strict';

export * from './contracts/pipeline-contract.js';
export * from './contracts/context-contract.js';
export * from './contracts/state-contract.js';
export * from './contracts/error-contract.js';
export * from './stage-registry.js';
export * from './builder-orchestrator.js';
export * from './knowledge-builder.js';
