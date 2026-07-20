/* ============================================================
   INDEX.JS — Body Intelligence dormant barrel (V2, Phase 12.5.1)

   PURPOSE: prove, structurally, that js/v2/body/ is dormant — mirrors
   js/v2/index.js exactly. This file exists so there is one obvious place
   a future caller WOULD import from, and the fact that nothing does yet
   is itself this sprint's success criterion (grep the repository for
   "from '.*js/v2/body" — or the relative equivalent — to verify).

   RESPONSIBILITY: none at runtime. Re-exports nothing yet.

   DEPENDENCIES: none. Deliberately does not import services/index.js —
   even a re-export is a form of wiring this phase defers, same as
   js/v2/index.js's own Phase 3 precedent.

   NON-GOALS: this file must never gain business logic, UI, or Firebase
   access. It is a manifest, not an engine.

   FUTURE EVOLUTION: a later, separately-approved phase adds
   `export * from './services/index.js'` once body/ has a real caller
   (conversation/, reasoning/, or ui/) — until then this file is imported
   by nothing.
   ============================================================ */

'use strict';

export const BODY_PHASE = '12.5';
export const BODY_DORMANT = true;
