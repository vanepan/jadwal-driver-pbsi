/* ============================================================
   INDEX.JS — Document Intelligence Runtime public barrel (V2, Phase 7 core / V2.0.6, Phase 9.5)

   PURPOSE: single entry point for the Document Intelligence contracts,
   registries, and the now-real pipeline orchestrator + session store.

   RESPONSIBILITY: re-export only.

   DEPENDENCIES: every module under document-intelligence/ except nor/
   (deliberately excluded — see nor/index.js's own header: importing it is
   the explicit act that registers the NOR pilot's steps).

   NON-GOALS: not imported by anything outside js/v2/. Not imported by
   js/v2/knowledge/ (dependency direction is one-way: Document Intelligence
   may read Knowledge, never the reverse). Does not re-export `nor` — a
   caller wanting the NOR pilot active imports document-intelligence/nor/index.js
   explicitly.

   FUTURE EVOLUTION: unchanged as more domainType pilots register their own
   steps the same way NOR does.
   ============================================================ */

'use strict';

export * from './contracts/document-analysis-contract.js';
export * from './contracts/document-context-contract.js';
export * from './contracts/document-draft-contract.js';
export * from './contracts/document-pipeline-contract.js';
export * from './registry/document-registry.js';
export * from './registry/step-registry.js';
export * from './document-intelligence-engine.js';
export * from './session-store.js';
