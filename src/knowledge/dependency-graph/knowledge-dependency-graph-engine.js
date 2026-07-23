/* ============================================================
   KNOWLEDGE-DEPENDENCY-GRAPH-ENGINE.JS — Knowledge Platform (V2, Phase 5)

   PURPOSE: the read-side entry point for querying relationships between
   KnowledgeItems — now wired for real via the repository's
   `getDependencies()` (Phase 5).

   RESPONSIBILITY: `getRelated()` (public, filterable) delegates to the
   active repository.

   DEPENDENCIES: knowledge/contracts/dependency-graph-contract.js,
   knowledge/repository/knowledge-repository.js.

   NON-GOALS: does not store or traverse a real GRAPH data structure —
   relationships remain ordinary `kind: 'relationship'` KnowledgeItems (no
   second storage mechanism); this is a linear filter over the repository's
   own list, same as MemoryRepository's own `getDependencies()`
   implementation.

   FUTURE EVOLUTION: if traversal performance ever matters at scale, an
   index can be added inside a repository implementation without changing
   this engine's public shape.
   ============================================================ */

'use strict';

import { RELATIONSHIP_TYPE } from '../contracts/dependency-graph-contract.js';
import {
  getKnowledgeDependencies as repositoryGetDependencies,
} from '../services/knowledge-service.js';

/**
 * Returns every relationship-kind item that references `itemId`,
 * optionally filtered by relationship type.
 * @param {string} itemId
 * @param {string} [relationshipType] - one of RELATIONSHIP_TYPE
 */
export function getDependencies(itemId, relationshipType) {
  const result = repositoryGetDependencies(itemId);
  if (!result.ok || !relationshipType) return result;
  return { ...result, data: result.data.filter((r) => r.payload && r.payload.type === relationshipType) };
}

export { RELATIONSHIP_TYPE };
