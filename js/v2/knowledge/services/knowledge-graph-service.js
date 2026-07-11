/* ============================================================
   KNOWLEDGE-GRAPH-SERVICE.JS — Knowledge Services (V2.0.12)

   PURPOSE: the public surface for multi-hop KnowledgeGraph reads.

   RESPONSIBILITY: pure delegation.

   DEPENDENCIES: knowledge/dependency-graph/knowledge-graph-engine.js.

   NON-GOALS: contains no traversal logic itself — the BFS loop lives
   in the engine (same layering as dependency-graph-service.js, which
   delegates to knowledge-dependency-graph-engine.js).

   FUTURE EVOLUTION: unchanged if the engine's traversal is ever
   backed by a real graph index inside a repository implementation.
   ============================================================ */

'use strict';

import { getNeighbors, getSubgraph, getGraphStats, RELATIONSHIP_TYPE } from '../dependency-graph/knowledge-graph-engine.js';

export { getNeighbors, getSubgraph, getGraphStats, RELATIONSHIP_TYPE };
