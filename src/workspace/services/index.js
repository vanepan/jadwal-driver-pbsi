/* ============================================================
   INDEX.JS — Live Word Workspace Services public barrel (V2, Phase 12.8.2)

   PURPOSE: single entry point for every real Workspace service — mirrors
   body/services/index.js's and recognition/services/index.js's exact
   shape: NAMESPACED re-exports (never flattened).

   `flags` re-exports workspace-flags.js's WORKSPACE_LIVE_SUGGESTIONS_ENABLED
   here too (in addition to its own module) purely for import-path
   convenience — ui/review-workspace.js (Sprint 12.8.4) is expected to
   import both this barrel and workspace-flags.js directly, since ESM live
   bindings only stay live through a re-export, and a UI polling a flag on
   every render benefits from importing the flag module directly rather
   than through a barrel that could (in a future sprint) grow its own
   caching.

   DEPENDENCIES: every module under workspace/services/, plus the
   sibling context/suggestion/explainability/snapshot modules, the same
   way body/services/index.js re-exports context/body-context-builder.js
   despite it not living under services/.

   NON-GOALS: not imported by workspace/index.js (still a dormant barrel
   — see that file's header) and not imported by anything outside
   js/v2/workspace/ until Sprint 12.8.4 gives it its first real caller.
   ============================================================ */

'use strict';

export * as workspace from './workspace-service.js';
export * as context from '../context/workspace-context-builder.js';
export * as suggestion from '../suggestion/workspace-suggestion-engine.js';
export * as explainability from '../explainability/workspace-explainability-service.js';
export * as snapshot from '../snapshot/workspace-snapshot-cache.js';
