/* ============================================================
   SOURCE-WEIGHT-SERVICE.JS — Knowledge Services (V2, Phase 6 / V2.0.9, Phase 12)

   PURPOSE: the public surface for looking up a source's corroboration
   weight — real since V2.0.9 (contracts/source-weight-contract.js's own
   weight table).

   RESPONSIBILITY: pure delegation.

   DEPENDENCIES: knowledge/contracts/source-weight-contract.js.

   FUTURE EVOLUTION: this file's shape does not need to change as the
   weight table's values are tuned.
   ============================================================ */

'use strict';

import { getSourceWeight, listSourceWeights } from '../contracts/source-weight-contract.js';

export { getSourceWeight, listSourceWeights };
