/* ============================================================
   GRAPH-SERVICE.JS — Relationship Discovery (Phase 12.7.5)

   PURPOSE: thin orchestration between relationship-discovery-engine.js
   and recognition-service.js's ONE write owner (same role classification-
   service.js and clustering-service.js already established this phase),
   plus a pure delegation re-export of recognition-graph-engine.js's
   read-only traversal (getNeighbors/getSubgraph/getGraphStats) — so
   every consumer reads through services/index.js's namespaced barrel,
   never the engines directly.

   RESPONSIBILITY: recordDiscoveredRelationships(clusterRecords, opts).

   DEPENDENCIES: ../graph/{relationship-discovery,recognition-graph}-
   engine.js, ./recognition-service.js, ../contracts/recognition-record-
   contract.js.

   NON-GOALS: does not fetch cluster records itself — the caller already
   has them (from clustering-service.js#recordClusters' own return value,
   or from listRecognitionRecords({recordType: 'cluster'})).
   ============================================================ */

'use strict';

import { discoverRelationshipsFromClusters } from '../graph/relationship-discovery-engine.js';
import { recordObservation } from './recognition-service.js';
import { RECORD_TYPE } from '../contracts/recognition-record-contract.js';
import { makeRecognitionScope } from '../contracts/recognition-scope-contract.js';

/** Deterministic id — re-discovering the SAME relationship between the
 *  SAME two scopes reconciles via appendVersion, never duplicates. Sorted
 *  so (a,b) and (b,a) always name the same id regardless of discovery
 *  order — a relationship is symmetric evidence even when its payload's
 *  from/to fields (kept for readability) are not. */
function makeRelationshipId(relationshipType, fromScopeKey, toScopeKey) {
  const [a, b] = [fromScopeKey, toScopeKey].sort();
  return `relationship:${relationshipType}:${a}::${b}`;
}

/**
 * @param {object[]} clusterRecords - real RecognitionRecords, recordType === 'cluster'
 * @param {{producerId?: string}} [opts]
 * @returns {{ok: boolean, relationships: object[], errors: string[]}}
 */
export function recordDiscoveredRelationships(clusterRecords, { producerId = 'relationship-discovery-engine' } = {}) {
  const discovered = discoverRelationshipsFromClusters(clusterRecords);
  const relationships = [];
  const errors = [];
  const now = new Date().toISOString();

  for (const { payload, evidence, confidence } of discovered) {
    const id = makeRelationshipId(payload.relationshipType, payload.fromScopeKey, payload.toScopeKey);
    const candidate = Object.freeze({
      id,
      version: 1,
      recordType: RECORD_TYPE.RELATIONSHIP,
      scope: makeRecognitionScope({ domainType: 'recognition-relationship', entityType: payload.relationshipType }),
      payload,
      confidence,
      evidence,
      provenance: { producerId, computedAt: now },
      createdAt: now,
      updatedAt: now,
    });
    const written = recordObservation(candidate);
    if (written.ok) relationships.push(written.data);
    else errors.push(written.error ? written.error.message : `Failed to persist relationship ${id}`);
  }

  return { ok: errors.length === 0, relationships, errors };
}

export { getNeighbors, getSubgraph, getGraphStats } from '../graph/recognition-graph-engine.js';
