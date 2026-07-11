/* ============================================================
   EXPLAINABILITY-SERVICE.JS — Knowledge Services (V2, Phase 6)

   PURPOSE: the public surface for "explain this item", so a future
   consumer (e.g. Document Intelligence citing a source) imports one
   module rather than reaching into knowledge-explainability-engine.js.

   RESPONSIBILITY: pure delegation.

   DEPENDENCIES: knowledge/explainability/knowledge-explainability-engine.js.

   NON-GOALS: no new explanation logic — see the engine for where the five
   questions are actually answered.

   FUTURE EVOLUTION: unchanged if/when the two other explainability
   surfaces (prediction-side, dispatch-side) are ever reconciled with this
   one — that reconciliation is still explicitly deferred.
   ============================================================ */

'use strict';

import { explain } from '../explainability/knowledge-explainability-engine.js';

export { explain };
