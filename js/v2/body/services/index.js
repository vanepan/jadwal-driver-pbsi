/* ============================================================
   INDEX.JS — Body Intelligence Services public barrel (V2, Phase 12.5.6)

   PURPOSE: single entry point for every real Body service — mirrors
   knowledge/services/index.js's exact shape: NAMESPACED re-exports
   (never flattened), the same discipline for the same reason (multiple
   services could plausibly grow same-named exports over time).

   DELIBERATELY DOES NOT RE-EXPORT ANY SENSOR. `sensing` here is
   body-sensing-service.js, which itself imports NO sensor file (registry
   lookup only, see that file's header) — so importing this barrel stays
   exactly as Firebase-free as importing body-sensing-service.js alone.
   Activating real sensing still requires a separate, deliberate import of
   sensors/index.js, unchanged by this file's existence.

   DEPENDENCIES: every module under body/services/, plus
   context/body-context-builder.js (re-exported here as `context`, the
   same way knowledge/services/index.js re-exports engines that don't
   literally live under services/).

   NON-GOALS: not imported by body/index.js (still a dormant barrel — see
   that file's header) and not imported by anything outside js/v2/body/ in
   Phase 12.5.
   ============================================================ */

'use strict';

export * as entities from './entity-service.js';
export * as sensing from './body-sensing-service.js';
export * as graph from './entity-graph-service.js';
export * as health from './entity-health-service.js';
export * as context from '../context/body-context-builder.js';
