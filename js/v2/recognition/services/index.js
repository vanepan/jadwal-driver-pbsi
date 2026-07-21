/* ============================================================
   INDEX.JS — Recognition Services public barrel (Phase 12.7.1)

   PURPOSE: single entry point for every real Recognition service —
   mirrors knowledge/services/index.js's and body/services/index.js's
   exact shape: NAMESPACED re-exports (never flattened), so multiple
   services can grow same-named exports over time without collision.

   `records` (Foundation, 12.7.1) and `classification` (12.7.2) are real
   as of this sprint — future sprints add `similarity` (12.7.3),
   `clustering` (12.7.4), `graph` (12.7.5) as their own namespaced
   exports here, each a thin service/engine over recognition-service.js's
   one write owner, never a second one.

   DEPENDENCIES: ./recognition-service.js, ./classification-service.js.

   NON-GOALS: not imported by recognition/index.js (still a dormant
   barrel — see that file's header) and not imported by anything outside
   js/v2/recognition/ this phase.
   ============================================================ */

'use strict';

export * as records from './recognition-service.js';
export * as classification from './classification-service.js';
export * as similarity from './similarity-service.js';
export * as clustering from './clustering-service.js';
export * as graph from './graph-service.js';
export * as learning from './learning-emission-service.js';
