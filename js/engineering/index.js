/* ============================================================
   INDEX.JS — Engineering Operations Foundation (public barrel)
   (v1.20.0)

   The single lazy-load entry point for the Engineering module. A future
   Workspace route can `import('./engineering/index.js')` and reach the whole
   foundation — config, model, engines, store, provider, analytics and
   settings — through one tree-shakeable surface, without deep-importing.

   This barrel adds NO logic; it only re-exports. No UI, no Firebase wiring.
   ============================================================ */

'use strict';

export * from './config/engineering-config.js';
export * from './utils/engineering-utils.js';
export * from './models/engineering-assignment.js';
export * from './timeline/timeline-engine.js';
export * from './engines/assignment-engine.js';
export * from './engines/verification-engine.js';
export * from './notifications/notification-engine.js';
export * from './settings/engineering-settings.js';
export * from './stores/engineering-store.js';
export * from './providers/engineering-provider.js';
export * from './analytics/engineering-analytics.js';
