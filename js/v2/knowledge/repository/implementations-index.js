/* ============================================================
   IMPLEMENTATIONS-INDEX.JS — Knowledge Repository Foundation (V2, Phase 5)

   PURPOSE: barrel for the two Phase 5 Repository implementations, kept
   separate from repository/index.js's own top-level barrel purely to give
   `implementations` its own clean namespace there.

   RESPONSIBILITY: re-export only.
   DEPENDENCIES: implementations/null-repository.js, implementations/memory-repository.js.
   NON-GOALS: not imported outside js/v2/.
   FUTURE EVOLUTION: a future Firebase-backed implementation is added here.
   ============================================================ */

'use strict';

export * from './implementations/null-repository.js';
export * from './implementations/memory-repository.js';
