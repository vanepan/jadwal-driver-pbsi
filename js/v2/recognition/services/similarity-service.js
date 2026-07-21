/* ============================================================
   SIMILARITY-SERVICE.JS — Similarity Discovery (Phase 12.7.3)

   PURPOSE: pure delegation to similarity/similarity-strategy-registry.js
   — mirrors knowledge/services/statistics-service.js's own "no new math,
   just a services-facade doorway" role, so every later Recognition
   sprint (Structural Clustering, Relationship Discovery) reads through
   services/index.js's namespaced barrel, never the engine directly.

   RESPONSIBILITY: pure delegation.

   DEPENDENCIES: ../similarity/similarity-strategy-registry.js.

   NON-GOALS: no new math.
   ============================================================ */

'use strict';

export {
  registerStrategy, hasStrategy, getStrategy, listStrategies, resetStrategyRegistry,
  dispatchSimilarity, jaccardSetSimilarity, SIMILARITY_STRATEGY_ERRORS,
} from '../similarity/similarity-strategy-registry.js';
