/* ============================================================
   RECOGNITION-GRAPH-ENGINE.JS — Relationship Discovery (Phase 12.7.5)

   PURPOSE: getNeighbors/getSubgraph/getGraphStats over RecognitionRelationship
   records — a THIRD occurrence of this exact shape in this platform:
     1. knowledge/dependency-graph/knowledge-graph-engine.js — over
        KnowledgeItem `kind:'relationship'` items (hand-curated, evidentiary).
     2. body/graph/entity-relationship-graph-engine.js — over Body
        Entities, edges DERIVED from sensor-read V1 FK fields.
     3. THIS FILE — over RecognitionScope keys, edges DISCOVERED by
        Recognition's own engines (Sprint 12.7.4's co-clustering, this
        sprint's relationship-discovery-engine.js).

   This platform's own documented discipline (learning-signal-similarity-
   engine.js's header) says a THIRD occurrence of the same shape is
   precisely the trigger to build the GENERIC version, not clone a fourth
   time — so unlike its two predecessors (each hardcoded to one node
   type), this engine is genuinely NODE-TYPE-AGNOSTIC: a node is just a
   scopeKey() string, which may name a KnowledgeItem, an ArchiveRecord, or
   a Body Entity indifferently. The two existing engines are explicitly
   NOT modified or migrated onto this one in this phase — that is a real,
   separately-approved future opportunity (see this sprint's own report),
   not attempted here.

   SIMPLER THAN ORIGINALLY SKETCHED, DISCLOSED: this phase's own
   architecture review proposed a "node-resolver + edge-source callback"
   abstraction to keep this engine domain-agnostic. In practice, the
   cross-domain capability comes entirely from RecognitionRelationship's
   own fromScopeKey/toScopeKey fields (which may already name scopes of
   ANY domainType/entityType) — this engine simply reads Recognition's
   OWN repository for `RECORD_TYPE.RELATIONSHIP` records, the exact same
   "read your own domain's relationship storage" pattern both predecessor
   engines already use for THEIRS. A callback-injected edge source would
   have added indirection with no real capability gained; this is a
   small, deliberate, disclosed simplification of the original sketch.

   No unscoped/whole-graph traversal entry point — getSubgraph always
   requires a starting scopeKey and a bounded maxHops (default 2), same
   restraint knowledge-graph-engine.js already applies.

   RESPONSIBILITY: getNeighbors, getSubgraph, getGraphStats.

   DEPENDENCIES: ../services/recognition-service.js (read-only —
   listRecognitionRecords), ../contracts/recognition-record-contract.js.

   NON-GOALS: does not discover a relationship (relationship-discovery-
   engine.js). No shortest-path, no centrality, no connected-components
   algorithm — same non-goal knowledge-graph-engine.js already states.
   ============================================================ */

'use strict';

import { listRecognitionRecords } from '../services/recognition-service.js';
import { RECORD_TYPE } from '../contracts/recognition-record-contract.js';

function allRelationshipRecords() {
  const result = listRecognitionRecords({ recordType: RECORD_TYPE.RELATIONSHIP });
  return result.ok ? result.data : [];
}

/**
 * One hop from `scopeKeyValue`.
 * @param {string} scopeKeyValue
 * @param {{relationshipType?: string|null, direction?: 'both'|'incoming'|'outgoing'}} [opts]
 * @returns {{neighborScopeKey: string, relationshipType: string, direction: string, relationshipId: string}[]}
 */
export function getNeighbors(scopeKeyValue, { relationshipType = null, direction = 'both' } = {}) {
  const neighbors = [];
  for (const record of allRelationshipRecords()) {
    const { fromScopeKey, toScopeKey, relationshipType: rt } = record.payload;
    if (relationshipType && rt !== relationshipType) continue;
    if ((direction === 'both' || direction === 'outgoing') && fromScopeKey === scopeKeyValue) {
      neighbors.push({
        neighborScopeKey: toScopeKey, relationshipType: rt, direction: 'outgoing', relationshipId: record.id,
      });
    }
    if ((direction === 'both' || direction === 'incoming') && toScopeKey === scopeKeyValue) {
      neighbors.push({
        neighborScopeKey: fromScopeKey, relationshipType: rt, direction: 'incoming', relationshipId: record.id,
      });
    }
  }
  return neighbors;
}

/**
 * Bounded BFS from a real starting scopeKey — never an unscoped/whole-
 * graph traversal.
 * @param {string} scopeKeyValue
 * @param {{maxHops?: number, relationshipType?: string|null}} [opts]
 * @returns {{nodes: string[], edges: {fromScopeKey: string, toScopeKey: string, relationshipType: string}[]}}
 */
export function getSubgraph(scopeKeyValue, { maxHops = 2, relationshipType = null } = {}) {
  const nodes = new Set([scopeKeyValue]);
  const edges = [];
  const seenRelationshipIds = new Set();
  let frontier = [scopeKeyValue];

  for (let hop = 0; hop < maxHops && frontier.length > 0; hop += 1) {
    const nextFrontier = [];
    for (const node of frontier) {
      for (const n of getNeighbors(node, { relationshipType })) {
        if (!seenRelationshipIds.has(n.relationshipId)) {
          seenRelationshipIds.add(n.relationshipId);
          edges.push(n.direction === 'outgoing'
            ? { fromScopeKey: node, toScopeKey: n.neighborScopeKey, relationshipType: n.relationshipType }
            : { fromScopeKey: n.neighborScopeKey, toScopeKey: node, relationshipType: n.relationshipType });
        }
        if (!nodes.has(n.neighborScopeKey)) {
          nodes.add(n.neighborScopeKey);
          nextFrontier.push(n.neighborScopeKey);
        }
      }
    }
    frontier = nextFrontier;
  }

  return { nodes: [...nodes], edges };
}

/**
 * @param {{relationshipType?: string|null}} [filter]
 * @returns {{nodeCount: number, edgeCount: number, byRelationshipType: Object<string, number>}}
 */
export function getGraphStats({ relationshipType = null } = {}) {
  const records = allRelationshipRecords().filter((r) => !relationshipType || r.payload.relationshipType === relationshipType);
  const nodeSet = new Set();
  const byRelationshipType = {};
  for (const record of records) {
    nodeSet.add(record.payload.fromScopeKey);
    nodeSet.add(record.payload.toScopeKey);
    byRelationshipType[record.payload.relationshipType] = (byRelationshipType[record.payload.relationshipType] || 0) + 1;
  }
  return {
    nodeCount: nodeSet.size, edgeCount: records.length, byRelationshipType,
  };
}
