/* ============================================================
   IDENTITY-SERVICE.JS — Knowledge Services (V2, Phase 6)

   PURPOSE: the public surface for identity/version concerns.

   RESPONSIBILITY: pure delegation.

   DEPENDENCIES: knowledge/contracts/identity-contract.js.

   NON-GOALS: `generateKnowledgeId` remains NOT_IMPLEMENTED (the canonical
   id format is still an open Phase 4+ decision) — this service does not
   paper over that with a fake id generator.

   FUTURE EVOLUTION: unchanged once identity-contract.js's open question is
   resolved.
   ============================================================ */

'use strict';

import { generateKnowledgeId, nextVersion, IDENTITY_INVARIANTS } from '../contracts/identity-contract.js';

export { generateKnowledgeId, nextVersion, IDENTITY_INVARIANTS };
