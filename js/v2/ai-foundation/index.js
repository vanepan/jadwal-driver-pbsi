/* ============================================================
   INDEX.JS — AI Foundation public barrel (V2, Phase 3)

   PURPOSE: single lazy-load entry point for the adapter layer, mirroring
   js/engineering/index.js's barrel pattern.

   RESPONSIBILITY: re-export only. Adds no logic of its own.

   DEPENDENCIES: every module under ai-foundation/.

   NON-GOALS: not imported by anything outside js/v2/ in Phase 3.

   FUTURE EVOLUTION: unchanged as real adapters replace stub bodies — only
   file contents change, not this barrel's shape.
   ============================================================ */

'use strict';

export * from './contracts/adapter-contract.js';
export * from './registry/adapter-registry.js';

export { claudeAdapter } from './adapters/claude-adapter.js';
export { openaiAdapter } from './adapters/openai-adapter.js';
export { localModelAdapter } from './adapters/local-model-adapter.js';
