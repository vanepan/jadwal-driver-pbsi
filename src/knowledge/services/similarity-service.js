/* ============================================================
   SIMILARITY-SERVICE.JS — Knowledge Services (Phase 12.7.3)

   PURPOSE: the public surface for KnowledgeItem payload similarity — real
   since V2.0.5's learning/similarity-detection-engine.js, never before
   exposed through the services façade. Added so a cross-domain caller
   (recognition/'s Similarity Strategy Registry, Phase 12.7.3) can depend
   on knowledge/ the same "services-only" way every other cross-domain
   dependency in this platform already does (reasoning/, conversation/,
   problem-intelligence/) — mirrors statistics-service.js's own precedent
   exactly: a small, additive, one-line-per-export wrapper, no new math.

   RESPONSIBILITY: pure delegation.

   DEPENDENCIES: learning/similarity-detection-engine.js.

   NON-GOALS: no new math — explicitly NOT reimplementing anything
   similarity-detection-engine.js already computes. Not a rename or a
   replacement of that file — it stays the real owner; this is only its
   services-facade doorway.

   FUTURE EVOLUTION: unchanged as similarity-detection-engine.js's own
   formula evolves.
   ============================================================ */

'use strict';

import { computeSimilarity, findSimilarItems } from '../learning/similarity-detection-engine.js';

export { computeSimilarity, findSimilarItems };
