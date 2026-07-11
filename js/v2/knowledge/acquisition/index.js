/* ============================================================
   INDEX.JS — Knowledge Acquisition public barrel (V2, Phase 9)

   PURPOSE: single entry point for the acquisition layer — contracts plus
   the acquisition-engine's runAcquisition().

   RESPONSIBILITY: re-export only.

   DEPENDENCIES: every module under knowledge/acquisition/.
   ============================================================ */

'use strict';

export * from './contracts/source-contract.js';
export * from './contracts/batch-contract.js';
export * from './contracts/extraction-contract.js';
export * from './contracts/normalization-contract.js';
export * from './contracts/session-contract.js';
export * from './contracts/import-report-contract.js';
export * from './acquisition-engine.js';
