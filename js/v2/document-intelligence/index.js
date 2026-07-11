/* ============================================================
   INDEX.JS — Document Intelligence Foundation public barrel (V2, Phase 7)

   PURPOSE: single entry point for the Document Intelligence contracts,
   registry, and engine stub.

   RESPONSIBILITY: re-export only.

   DEPENDENCIES: every module under document-intelligence/.

   NON-GOALS: not imported by anything outside js/v2/ in Phase 7. Not
   imported by js/v2/knowledge/ (dependency direction is one-way: Document
   Intelligence may read Knowledge, never the reverse).

   FUTURE EVOLUTION: Phase 8 adds `nor` as a namespaced sub-export once
   the NOR pilot exists.
   ============================================================ */

'use strict';

export * from './contracts/document-analysis-contract.js';
export * from './contracts/document-context-contract.js';
export * from './contracts/document-draft-contract.js';
export * from './contracts/document-pipeline-contract.js';
export * from './registry/document-registry.js';
export * from './document-intelligence-engine.js';
