/* ============================================================
   DEPENDENCY-GRAPH-SERVICE.JS — Knowledge Services (V2, Phase 6)

   PURPOSE: the public surface for querying relationships between
   KnowledgeItems.

   RESPONSIBILITY: pure delegation.

   DEPENDENCIES: knowledge/dependency-graph/knowledge-dependency-graph-engine.js.

   NON-GOALS: no graph traversal beyond one hop — the engine itself is a
   linear filter, not a real graph structure (see that engine's NON-GOALS).

   FUTURE EVOLUTION: unchanged if a real graph index is ever added inside
   a repository implementation.
   ============================================================ */

'use strict';

import { getDependencies, RELATIONSHIP_TYPE } from '../dependency-graph/knowledge-dependency-graph-engine.js';

export { getDependencies, RELATIONSHIP_TYPE };
