/* ============================================================
   VERSIONING-SERVICE.JS — Knowledge Services (V2, Phase 6)

   PURPOSE: the public surface for "everything about a KnowledgeItem's
   version history" — get a specific version, get full history, or roll
   back — grouped separately from lifecycle-service.js because versioning
   (which snapshot) and lifecycle (which state) are different questions
   about the same append-only log.

   RESPONSIBILITY: pure delegation to the repository facade.

   DEPENDENCIES: knowledge/repository/knowledge-repository.js.

   NON-GOALS: no new versioning scheme — identity-contract.js's
   `nextVersion` remains the one place version arithmetic lives.

   FUTURE EVOLUTION: unchanged as a real backend replaces Memory.
   ============================================================ */

'use strict';

import { getVersion, getHistory, rollback } from '../repository/knowledge-repository.js';

export { getVersion, getHistory, rollback };
