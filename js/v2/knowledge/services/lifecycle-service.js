/* ============================================================
   LIFECYCLE-SERVICE.JS — Knowledge Services (V2, Phase 6)

   PURPOSE: the public surface for validating/requesting a lifecycle
   transition directly (bypassing the named review workflow) — used by
   non-human-gated moves (e.g. Draft -> Deprecated, an author withdrawing
   their own submission), where review-service.js's named methods
   (submitForReview/approve/reject) don't apply.

   RESPONSIBILITY: pure delegation to lifecycle-engine.js.

   DEPENDENCIES: knowledge/lifecycle/lifecycle-engine.js.

   NON-GOALS: does not bypass the human gate on Approved — `requestTransition`
   still requires `viaReviewDecision: true` for any human-gated target,
   enforced in the engine, not re-implemented here.

   FUTURE EVOLUTION: unchanged as lifecycle-engine.js evolves.
   ============================================================ */

'use strict';

import { validateTransition, requestTransition, LIFECYCLE_STATE } from '../lifecycle/lifecycle-engine.js';

export { validateTransition, requestTransition, LIFECYCLE_STATE };
