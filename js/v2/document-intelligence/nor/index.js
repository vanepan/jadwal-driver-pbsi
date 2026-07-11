/* ============================================================
   INDEX.JS — NOR Intelligence Foundation public barrel (V2, Phase 8)

   PURPOSE: single entry point for the NOR pilot contracts.

   RESPONSIBILITY: re-export only.

   DEPENDENCIES: every module under document-intelligence/nor/.

   NON-GOALS: not imported by anything outside js/v2/ in Phase 8. Not
   imported by document-intelligence/index.js itself (NOR is a pilot
   nested UNDER Document Intelligence, not re-exported at that layer's top
   level, to keep the generic barrel free of any domain-specific name).

   FUTURE EVOLUTION: unchanged once a real NorGenerator is implemented.
   ============================================================ */

'use strict';

export * from './contracts/nor-session-contract.js';
export * from './contracts/nor-draft-contract.js';
export * from './contracts/nor-knowledge-contract.js';
export * from './nor-generator-contract.js';
