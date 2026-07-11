/* ============================================================
   INDEX.JS — Knowledge Language Foundation public barrel (V2, Phase 3.5)

   PURPOSE: single entry point for the language contracts, mirroring the
   barrel pattern used at every other level of js/v2/.

   RESPONSIBILITY: re-export only.

   DEPENDENCIES: every module under knowledge/language/ (contracts/ and
   examples.js).

   NON-GOALS: not imported by anything outside js/v2/ in Phase 3.5.

   FUTURE EVOLUTION: unchanged as connectors start emitting real payloads
   against these shapes.
   ============================================================ */

'use strict';

export * from './contracts/lexical-contract.js';
export * from './contracts/taxonomy-contract.js';
export * from './contracts/pattern-contract.js';
export * from './contracts/reference-contract.js';
export * from './contracts/metadata-contract.js';
export * from './contracts/statistics-confidence-contract.js';
export * as languageExamples from './examples.js';
