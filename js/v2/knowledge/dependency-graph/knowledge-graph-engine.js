/* ============================================================
   KNOWLEDGE-GRAPH-ENGINE.JS — Knowledge Platform (V2.0.12)

   PURPOSE: "KnowledgeGraph" — a read-only, multi-hop composition over
   the existing single-hop knowledge-dependency-graph-engine.js#getDependencies.
   Every traversal here is a plain loop over that existing primitive —
   no shortest-path, no centrality, no connected-components, no new
   storage. Relationships remain ordinary `kind:'relationship'`
   KnowledgeItems, exactly as dependency-graph-contract.js documents;
   this file adds zero new relationship semantics.

   RESPONSIBILITY: `getNeighbors(itemId, opts)` (one hop, resolved),
   `getSubgraph(itemId, opts)` (BFS composition of getNeighbors),
   `getGraphStats(opts)` (repository-wide relationship tally).

   DEPENDENCIES: contracts/dependency-graph-contract.js,
   dependency-graph/knowledge-dependency-graph-engine.js,
   repository/knowledge-repository.js.

   NON-GOALS: does not store or traverse a real GRAPH data structure —
   same non-goal as the sibling single-hop engine, unchanged by this
   file. `getSubgraph`'s maxHops is a loop bound, not a graph index.

   FUTURE EVOLUTION: if traversal performance ever matters at scale, an
   index can be added inside a repository implementation without
   changing this engine's public shape (same evolution note as the
   single-hop engine).
   ============================================================ */

'use strict';

import { RELATIONSHIP_TYPE } from '../contracts/dependency-graph-contract.js';
import { getDependencies } from './knowledge-dependency-graph-engine.js';
import {
  getKnowledge as getById,
  listKnowledge as list,
} from '../services/knowledge-service.js';

function neighborIdAndDirection(itemId, payload) {
  if (payload.fromId === itemId) return { neighborId: payload.toId, direction: 'outgoing' };
  return { neighborId: payload.fromId, direction: 'incoming' };
}

/**
 * One hop, resolved: every relationship touching `itemId`, with the other
 * endpoint's full KnowledgeItem attached.
 * @param {string} itemId
 * @param {{relationshipType?: string, direction?: 'both'|'incoming'|'outgoing'}} [opts]
 * @returns {{ok: boolean, data: Array<{neighborId: string, neighbor: object|null, relationship: object, direction: string}>, error: object|null}}
 */
export function getNeighbors(itemId, opts = {}) {
  const { relationshipType, direction = 'both' } = opts;
  const depsResult = getDependencies(itemId, relationshipType);
  if (!depsResult.ok) return depsResult;

  const data = depsResult.data
    .map((relationship) => {
      const { neighborId, direction: edgeDirection } = neighborIdAndDirection(itemId, relationship.payload);
      const neighborResult = getById(neighborId);
      return {
        neighborId,
        neighbor: neighborResult.ok ? neighborResult.data : null,
        relationship,
        direction: edgeDirection,
      };
    })
    .filter((entry) => direction === 'both' || entry.direction === direction);

  return { ok: true, data, error: null };
}

/**
 * BFS composition of getNeighbors — no shortest-path, no weighting, just a
 * bounded breadth-first walk deduping nodes/edges already visited.
 * @param {string} itemId
 * @param {{maxHops?: number, relationshipType?: string}} [opts]
 * @returns {{ok: boolean, data: {nodes: string[], edges: Array<{fromId: string, toId: string, type: string}>}|null, error: object|null}}
 */
export function getSubgraph(itemId, opts = {}) {
  const { maxHops = 2, relationshipType } = opts;
  const rootResult = getById(itemId);
  if (!rootResult.ok) return { ok: false, data: null, error: rootResult.error };

  const visitedNodes = new Set([itemId]);
  const visitedEdges = new Map();
  let frontier = [itemId];

  for (let hop = 0; hop < maxHops && frontier.length > 0; hop++) {
    const nextFrontier = [];
    for (const nodeId of frontier) {
      const neighborsResult = getNeighbors(nodeId, { relationshipType });
      if (!neighborsResult.ok) continue;
      for (const entry of neighborsResult.data) {
        visitedEdges.set(entry.relationship.id, {
          fromId: entry.relationship.payload.fromId,
          toId: entry.relationship.payload.toId,
          type: entry.relationship.payload.type,
        });
        if (!visitedNodes.has(entry.neighborId)) {
          visitedNodes.add(entry.neighborId);
          nextFrontier.push(entry.neighborId);
        }
      }
    }
    frontier = nextFrontier;
  }

  return {
    ok: true,
    error: null,
    data: {
      nodes: [...visitedNodes],
      edges: [...visitedEdges.values()],
    },
  };
}

/**
 * Repository-wide relationship tally — one `list()` call, grouped by type.
 * @param {{domainType?: string}} [opts]
 * @returns {{ok: boolean, data: {nodeCount: number, edgeCount: number, byRelationshipType: Object<string, number>}, error: object|null}}
 */
export function getGraphStats(opts = {}) {
  const { domainType } = opts;
  const filter = { kind: 'relationship', ...(domainType ? { domainType } : {}) };
  const listResult = list(filter);
  if (!listResult.ok) return listResult;

  const nodeIds = new Set();
  const byRelationshipType = {};
  for (const item of listResult.data) {
    const { fromId, toId, type } = item.payload;
    nodeIds.add(fromId);
    nodeIds.add(toId);
    byRelationshipType[type] = (byRelationshipType[type] || 0) + 1;
  }

  return {
    ok: true,
    error: null,
    data: { nodeCount: nodeIds.size, edgeCount: listResult.data.length, byRelationshipType },
  };
}

export { RELATIONSHIP_TYPE };
