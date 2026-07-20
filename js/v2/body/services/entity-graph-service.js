/* ============================================================
   ENTITY-GRAPH-SERVICE.JS — Body Intelligence (V2, Phase 12.5.4)

   PURPOSE: pure delegation over graph/entity-relationship-graph-engine.js
   — mirrors knowledge/services/knowledge-graph-service.js's identical
   role, so services/index.js's namespaced barrel has one thin, consistent
   surface per engine rather than every consumer reaching into graph/
   directly.

   DEPENDENCIES: graph/entity-relationship-graph-engine.js.
   ============================================================ */

'use strict';

export { getNeighbors, getSubgraph, getGraphStats, ENTITY_RELATIONSHIP_TYPE } from '../graph/entity-relationship-graph-engine.js';
