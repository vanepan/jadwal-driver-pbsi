/* ============================================================
   INDEX.JS — Live Word Workspace dormant barrel (V2, Phase 12.8.1)

   PURPOSE: prove, structurally, that js/v2/workspace/ is dormant — mirrors
   js/v2/index.js and js/v2/body/index.js exactly. One obvious place a
   future caller WOULD import from; the fact that nothing does yet is
   itself this sprint's success criterion (grep the repository for
   "from '.*js/v2/workspace" — or the relative equivalent — to verify).

   RESPONSIBILITY: none at runtime. Re-exports nothing yet.

   DEPENDENCIES: none. Deliberately does not import services/index.js —
   even a re-export is a form of wiring this sprint defers, same as
   body/index.js's own Phase 12.5.1 precedent.

   NON-GOALS: this file must never gain business logic, UI, or Firebase
   access. It is a manifest, not an engine.

   FUTURE EVOLUTION: `export * from './services/index.js'` once
   workspace/ has a real caller (ui/review-workspace.js, Sprint 12.8.4) —
   until then this file is imported by nothing.
   ============================================================ */

'use strict';

export const WORKSPACE_PHASE = '12.8';
export const WORKSPACE_DORMANT = true;
