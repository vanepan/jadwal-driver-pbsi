/* ============================================================
   INDEX.JS — Teach Once, Learn Forever public barrel (V2.0.5, Phase 9.4)

   PURPOSE: single entry point for the Correction Pipeline, Similarity
   Detection, Knowledge Evolution, the Diff Model (V2.0.15/V2.0.16), and
   Diff Learning (V2.0.16).

   RESPONSIBILITY: re-export only.

   DEPENDENCIES: every module under knowledge/learning/. Pure — no V1
   dependency, safe to re-export from knowledge/index.js.
   ============================================================ */

'use strict';

export * from './correction-pipeline-engine.js';
export * from './similarity-detection-engine.js';
export * from './knowledge-evolution-engine.js';
export * from './contracts/correction-contract.js';
export * from './contracts/session-contract.js';
export * from './contracts/similarity-contract.js';
export * from './contracts/evolution-contract.js';
export * from './contracts/learning-metrics-contract.js';
export * from './contracts/event-contract.js';
export * from './contracts/diff-contract.js';
export * from './diff-engine.js';
export * from './diff-learning-engine.js';
