/* ============================================================
   SOURCE-WEIGHT-SERVICE.JS — Knowledge Services (V2, Phase 6)

   PURPOSE: the public surface for looking up a source's corroboration
   weight.

   RESPONSIBILITY: pure delegation.

   DEPENDENCIES: knowledge/contracts/source-weight-contract.js.

   NON-GOALS: no weight is computed here or in the contract it wraps —
   still Phase 4+ work (contracts/source-weight-contract.js's own
   NON-GOALS).

   FUTURE EVOLUTION: once real weights are populated, this file's shape
   does not need to change.
   ============================================================ */

'use strict';

import { getSourceWeight } from '../contracts/source-weight-contract.js';

export { getSourceWeight };
