/* ============================================================
   INDEX.JS — Knowledge Repository Foundation public barrel (V2, Phase 5)

   PURPOSE: single entry point for the repository layer.

   RESPONSIBILITY: re-export only. The registry and the two implementations
   are namespaced (`registry`, `implementations`) rather than flattened,
   since `knowledge-repository.js` already re-exports the three registry
   convenience functions (`setActiveRepository`, `getActiveRepositoryId`,
   `listRepositories`) callers actually need — flattening the full registry
   API too would create ambiguous duplicate exports.

   DEPENDENCIES: every module under knowledge/repository/.

   NON-GOALS: not imported by anything outside js/v2/ in Phase 5.

   FUTURE EVOLUTION: a future Firebase-backed implementation is added under
   `implementations/` and namespaced here the same way.
   ============================================================ */

'use strict';

export * from './contracts/repository-contract.js';
export * from './knowledge-repository.js';
export * as registry from './repository-registry.js';
export * as implementations from './implementations-index.js';
