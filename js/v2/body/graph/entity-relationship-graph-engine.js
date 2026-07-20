/* ============================================================
   ENTITY-RELATIONSHIP-GRAPH-ENGINE.JS — Body Intelligence (V2, Phase 12.5.4)

   PURPOSE: "Entity Relationship Graph" — a read-only, multi-hop
   composition over relationship-repository.js's single-hop edges. A
   functional lift of knowledge/dependency-graph/knowledge-graph-engine.js's
   exact shape (getNeighbors/getSubgraph/getGraphStats), deliberately
   disambiguated by name AND by data source — see
   contracts/entity-relationship-contract.js's header for the full
   comparison table. Every traversal here is a plain loop; no shortest-
   path, no centrality, no new storage — same non-goal the Knowledge Graph
   states for itself.

   RESPONSIBILITY: getNeighbors(entityId, opts) (one hop, resolved),
   getSubgraph(entityId, opts) (BFS composition of getNeighbors),
   getGraphStats(opts) (repository-wide relationship tally).

   DEPENDENCIES: repository/relationship-repository.js,
   services/entity-service.js (reads only — never the entity repository
   directly, same "who reads?" discipline every prior domain follows).

   NON-GOALS: does not store or traverse a real GRAPH data structure.
   `getSubgraph`'s maxHops is a loop bound, not a graph index. Never
   scoped wider than a starting entityId — there is no unscoped/whole-
   graph traversal entry point (see the Phase 12.5 plan's performance
   risk note: a caller always supplies a starting entity).

   FUTURE EVOLUTION: if traversal performance ever matters at scale, an
   index can be added inside relationship-repository.js without changing
   this engine's public shape.
   ============================================================ */

'use strict';

import { ENTITY_RELATIONSHIP_TYPE } from '../contracts/entity-relationship-contract.js';
import { getForEntity, list as relationshipList } from '../repository/relationship-repository.js';
import { getEntity } from '../services/entity-service.js';

function neighborIdAndDirection(entityId, relationship) {
  if (relationship.fromEntityId === entityId) return { neighborId: relationship.toEntityId, direction: 'outgoing' };
  return { neighborId: relationship.fromEntityId, direction: 'incoming' };
}

/**
 * One hop, resolved: every relationship touching `entityId`, with the
 * other endpoint's full Entity attached.
 * @param {string} entityId
 * @param {{relationshipType?: string, direction?: 'both'|'incoming'|'outgoing'}} [opts]
 * @returns {{ok: boolean, data: Array<{neighborId: string, neighbor: object|null, relationship: object, direction: string}>, error: object|null}}
 */
export function getNeighbors(entityId, opts = {}) {
  const { relationshipType, direction = 'both' } = opts;
  const edgesResult = getForEntity(entityId);
  if (!edgesResult.ok) return edgesResult;

  const data = edgesResult.data
    .filter((r) => !relationshipType || r.type === relationshipType)
    .map((relationship) => {
      const { neighborId, direction: edgeDirection } = neighborIdAndDirection(entityId, relationship);
      const neighborResult = getEntity(neighborId);
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
 * BFS composition of getNeighbors — bounded, deduped, no weighting.
 * ALWAYS requires a starting entityId; there is no whole-graph traversal.
 * @param {string} entityId
 * @param {{maxHops?: number, relationshipType?: string}} [opts]
 * @returns {{ok: boolean, data: {nodes: string[], edges: Array<{fromEntityId: string, toEntityId: string, type: string}>}|null, error: object|null}}
 */
export function getSubgraph(entityId, opts = {}) {
  const { maxHops = 2, relationshipType } = opts;
  const rootResult = getEntity(entityId);
  if (!rootResult.ok) return { ok: false, data: null, error: rootResult.error };

  const visitedNodes = new Set([entityId]);
  const visitedEdges = new Map();
  let frontier = [entityId];

  for (let hop = 0; hop < maxHops && frontier.length > 0; hop++) {
    const nextFrontier = [];
    for (const nodeId of frontier) {
      const neighborsResult = getNeighbors(nodeId, { relationshipType });
      if (!neighborsResult.ok) continue;
      for (const entry of neighborsResult.data) {
        visitedEdges.set(entry.relationship.id, {
          fromEntityId: entry.relationship.fromEntityId,
          toEntityId: entry.relationship.toEntityId,
          type: entry.relationship.type,
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
    data: { nodes: [...visitedNodes], edges: [...visitedEdges.values()] },
  };
}

/**
 * Repository-wide relationship tally — one list() call, grouped by type.
 * @param {{relationshipType?: string}} [opts]
 * @returns {{ok: boolean, data: {edgeCount: number, nodeCount: number, byRelationshipType: Object<string, number>}, error: object|null}}
 */
export function getGraphStats(opts = {}) {
  const { relationshipType } = opts;
  const listResult = relationshipList(relationshipType ? { type: relationshipType } : {});
  if (!listResult.ok) return listResult;

  const nodeIds = new Set();
  const byRelationshipType = {};
  for (const r of listResult.data) {
    nodeIds.add(r.fromEntityId);
    nodeIds.add(r.toEntityId);
    byRelationshipType[r.type] = (byRelationshipType[r.type] || 0) + 1;
  }

  return { ok: true, error: null, data: { edgeCount: listResult.data.length, nodeCount: nodeIds.size, byRelationshipType } };
}

export { ENTITY_RELATIONSHIP_TYPE };
