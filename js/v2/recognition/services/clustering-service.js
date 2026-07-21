/* ============================================================
   CLUSTERING-SERVICE.JS — Structural Clustering (Phase 12.7.4)

   PURPOSE: thin orchestration between the pure
   structural-clustering-engine.js and recognition-service.js's ONE write
   owner — same "compute via a pure engine, persist via the one service
   that owns writes" role classification-service.js already established
   this phase.

   Only ever persists a REAL cluster (size >= 2) — clusterScopes() itself
   already excludes singletons; this service adds no further filtering,
   only persistence.

   RESPONSIBILITY: recordClusters(items, strategyId, opts).

   DEPENDENCIES: ../clustering/structural-clustering-engine.js,
   ./recognition-service.js, ../contracts/recognition-cluster-contract.js.

   NON-GOALS: does not assemble ClusterableItems itself (a future,
   separately-wired caller's job).
   ============================================================ */

'use strict';

import { clusterScopes, computeClusterConfidence } from '../clustering/structural-clustering-engine.js';
import { recordObservation } from './recognition-service.js';
import { RECORD_TYPE } from '../contracts/recognition-record-contract.js';
import { makeRecognitionScope } from '../contracts/recognition-scope-contract.js';
import { EVIDENCE_KIND } from '../../knowledge/contracts/evidence-contract.js';

/** Deterministic id from a cluster's own sorted membership — re-deriving
 *  the SAME cluster from the SAME real population reconciles via
 *  appendVersion, never duplicates (the same "same real facts, same id"
 *  discipline generateKnowledgeId's own header describes). */
function makeClusterId(clusterType, memberScopeKeys) {
  return `cluster:${clusterType}:${[...memberScopeKeys].sort().join('|')}`;
}

/**
 * @param {import('../clustering/structural-clustering-engine.js').ClusterableItem[]} items
 * @param {string} strategyId       - also used as the persisted cluster's `clusterType` (see recognition-cluster-contract.js's header — a cluster reuses the signatureType/strategy vocabulary rather than a parallel one)
 * @param {{threshold?: number, producerId?: string}} [opts]
 * @returns {{ok: boolean, clusters: object[], errors: string[]}}
 */
export function recordClusters(items, strategyId, { threshold = 0.6, producerId = 'structural-clustering-engine' } = {}) {
  const found = clusterScopes(items, strategyId, threshold);
  const clusters = [];
  const errors = [];
  const now = new Date().toISOString();

  for (const { memberScopeKeys, size } of found) {
    const id = makeClusterId(strategyId, memberScopeKeys);
    const sorted = [...memberScopeKeys].sort();
    const payload = Object.freeze({
      clusterType: strategyId,
      memberScopeKeys: sorted,
      representativeScopeKey: sorted[0] || null,
    });
    const confidence = computeClusterConfidence(size, items.length);
    const evidence = Object.freeze([Object.freeze({
      itemId: id,
      kind: EVIDENCE_KIND.STATISTIC,
      weight: Math.round(confidence * 100) / 100,
      rationale: `${size} of ${items.length} observed items grouped by "${strategyId}" similarity.`,
    })]);
    const candidate = Object.freeze({
      id,
      version: 1,
      recordType: RECORD_TYPE.CLUSTER,
      // A Cluster is not "about" one scope — it names its own domainType
      // as the strategy family, entityId null (see recognition-scope-
      // contract.js: null is honest here, not a placeholder).
      scope: makeRecognitionScope({ domainType: 'recognition-cluster', entityType: strategyId }),
      payload,
      confidence,
      evidence,
      provenance: { producerId, computedAt: now },
      createdAt: now,
      updatedAt: now,
    });
    const written = recordObservation(candidate);
    if (written.ok) clusters.push(written.data);
    else errors.push(written.error ? written.error.message : `Failed to persist cluster ${id}`);
  }

  return { ok: errors.length === 0, clusters, errors };
}
