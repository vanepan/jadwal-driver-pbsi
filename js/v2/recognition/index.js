/* ============================================================
   INDEX.JS — Recognition dormant barrel (Phase 12.7.1)

   PURPOSE: prove, structurally, that js/v2/recognition/ is dormant —
   mirrors js/v2/index.js and js/v2/body/index.js exactly. This file
   exists so there is one obvious place a future caller WOULD import
   from, and the fact that nothing does yet is itself this sprint's
   success criterion (grep the repository for "from '.*js/v2/recognition"
   — or the relative equivalent — to verify).

   RESPONSIBILITY: none at runtime. Re-exports nothing yet.

   DEPENDENCIES: none. Deliberately does not import services/index.js —
   even a re-export is a form of wiring this phase defers, same as
   js/v2/index.js's own Phase 3 precedent and body/index.js's Phase 12.5
   repeat of it.

   NON-GOALS: this file must never gain business logic, UI, or Firebase
   access. It is a manifest, not an engine.

   FUTURE EVOLUTION: a later, separately-approved phase adds
   `export * from './services/index.js'` once recognition/ has a real
   caller (conversation/, reasoning/, problem-intelligence/, or ui/) —
   until then this file is imported by nothing. See
   docs/PHASE_12_SPRINT_12_7_APPLE_PHOTOS_LEARNING.md, Open Question 2.
   ============================================================ */

'use strict';

export const RECOGNITION_PHASE = '12.7';
export const RECOGNITION_DORMANT = true;
