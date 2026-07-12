/* ============================================================
   INDEX.JS — Organizational Memory public barrel (V2.0.7, Phase 10)

   PURPOSE: single entry point for Organizational Memory — contracts,
   repository, and every domain-agnostic engine (ingestion, numbering, gap
   detection/workflow, duplicate detection, timeline, health, knowledge
   contribution).

   RESPONSIBILITY: re-export only.

   DEPENDENCIES: every module under organizational-memory/ except
   sources/ (deliberately excluded — see sources/index.js's own header:
   importing it is the explicit act that registers the real `nor` archive
   source and pulls in its Firebase-backed V1 dependency chain).

   NON-GOALS: does not re-export `sources/`. Not imported by
   js/v2/knowledge/ or js/v2/document-intelligence/ (Organizational
   Memory sits downstream of Knowledge per the frozen architecture —
   Official Documents -> Knowledge Acquisition -> Knowledge Repository ->
   Organizational Memory -> Applications — dependency direction is
   one-way: this tree may read knowledge/, never the reverse).
   ============================================================ */

'use strict';

export * from './contracts/archive-record-contract.js';
export * from './contracts/archive-source-contract.js';
export * from './contracts/gap-contract.js';
export * from './contracts/numbering-contract.js';
export * from './contracts/health-contract.js';
export * from './contracts/event-contract.js';
export * from './contracts/upload-recommendation-contract.js';

export * from './registry/archive-source-registry.js';
export * from './repository/archive-repository.js';

export * from './document-hash.js';
export * from './archive-ingestion-engine.js';
export * from './numbering-engine.js';
export * from './gap-detection-engine.js';
export * from './gap-workflow-engine.js';
export * from './duplicate-detection-engine.js';
export * from './archive-timeline-engine.js';
export * from './archive-health-engine.js';
export * from './knowledge-contribution-engine.js';
export * from './upload-recommendation-engine.js';
