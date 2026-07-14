/* ============================================================
   LIFECYCLE-SERVICE.JS — Knowledge Services (V2, Phase 6 -> Phase 3 ownership)

   PURPOSE: the READ-ONLY public surface for reasoning about the Knowledge
   lifecycle graph — "is this move legal?", "what are the states?" — without
   being able to perform one.

   PHASE 3 — WHAT WAS REMOVED, AND WHY IT MATTERED.

   This file used to re-export `requestTransition` — the raw, unguarded
   lifecycle mutator — and services/index.js re-exports this file as
   `export * as lifecycle`. The net effect: ANY module in the platform,
   including any UI workspace, could write

       import { lifecycle } from 'knowledge/services/index.js';
       lifecycle.requestTransition(id, 'candidate', 'deprecated');

   ...and move organizational knowledge with nothing in its way. Nobody ever
   did. But the Phase 2.6 ownership audit named this exactly for what it was:
   luck, not design — a facade whose stated job is to be the safe public
   surface, quietly handing out the one primitive that makes the owner
   optional. It is the same hole that had already been closed on
   import-session-service.js, still open here.

   `requestTransition` now has exactly ONE caller in the platform:
   services/knowledge-service.js, the Knowledge domain's owner. To move
   knowledge, call the owner:

       promoteKnowledge / submitKnowledgeForReview / promoteToCandidate /
       requestChanges / rejectKnowledge / archiveKnowledge / restoreKnowledge

   `validateTransition` stays — it is a pure predicate over LIFECYCLE_GRAPH
   and mutates nothing, so it is safe for any consumer that wants to know
   whether a move WOULD be legal (e.g. to enable or disable a button).

   RESPONSIBILITY: pure, read-only delegation to lifecycle-engine.js.

   DEPENDENCIES: knowledge/lifecycle/lifecycle-engine.js.
   ============================================================ */

'use strict';

import { validateTransition, LIFECYCLE_STATE } from '../lifecycle/lifecycle-engine.js';

export { validateTransition, LIFECYCLE_STATE };
