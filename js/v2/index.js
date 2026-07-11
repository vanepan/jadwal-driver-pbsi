/* ============================================================
   INDEX.JS — V2 Foundation dormant barrel (Phase 3)

   PURPOSE: prove, structurally, that js/v2/ is dormant. This file exists so
   there is one obvious place a future caller WOULD import from — and the
   fact that nothing does yet is itself the Phase 3 success criterion.

   RESPONSIBILITY: none at runtime. It re-exports nothing yet. When Phase 4+
   starts wiring real callers, this barrel is where the public surface of
   knowledge/ and ai-foundation/ gets assembled for tree-shakeable import,
   mirroring js/engineering/index.js's barrel pattern.

   DEPENDENCIES: none. Deliberately does not import knowledge/ or
   ai-foundation/ yet — Phase 3 is schema/contract only, and even a
   re-export is a form of wiring this phase defers.

   NON-GOALS: this file must never gain business logic, UI, or Firebase
   access. It is a manifest, not an engine.

   FUTURE EVOLUTION: Phase 4+ adds `export * from './knowledge/index.js'`
   and `export * from './ai-foundation/index.js'` once those trees have real
   callers. Until then, this file is imported by nothing — grep the
   repository for "from '.*js/v2" (or the relative equivalent) to verify.
   ============================================================ */

'use strict';

export const V2_FOUNDATION_PHASE = 3;
export const V2_DORMANT = true;
