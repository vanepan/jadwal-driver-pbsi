/* ============================================================
   RECOGNITION-CLUSTER-CONTRACT.JS — Recognition Foundation (Phase 12.7.1)

   PURPOSE: fix the payload shape for RECORD_TYPE.CLUSTER — a group of
   scopes this platform's Recognition layer believes share something
   (same template, same vendor, same structure). Populated for real by
   Sprint 12.7.4 (Structural Clustering), which generalizes the existing,
   dormant knowledge/machine-learning/clustering-engine.js#clusterItems
   (single-linkage over a similarity threshold) rather than reimplementing
   a different algorithm — this contract fixes only clustering's OUTPUT
   shape, kept deliberately independent of that algorithm's own
   KnowledgeItem-specific input shape.

   Membership is stored as `memberScopeKeys` — bare scopeKey() STRINGS,
   never full RecognitionScope objects and never a resolved record — the
   same "cross-domain reference is a bare id string, never an import"
   discipline js/v2/README.md states for LearningEvent's own cross-domain
   fields. A consumer resolves a scopeKey back to real records itself.

   RESPONSIBILITY: define RecognitionClusterPayload.

   DEPENDENCIES: none.

   NON-GOALS: does not cluster anything. Does not decide a similarity
   threshold (recognition/similarity/, Sprint 12.7.3).
   ============================================================ */

'use strict';

export const RECOGNITION_CLUSTER_SCHEMA = 'recognition-cluster@1';

/**
 * @typedef {Object} RecognitionClusterPayload
 * @property {string} clusterType          - e.g. 'structural-shape' | 'exact-hash' | ... (registry-backed, see recognition-signature-type-registry.js — a cluster forms FROM a signature comparison, so it reuses that same vocabulary rather than inventing a parallel one)
 * @property {string[]} memberScopeKeys    - scopeKey() strings, length >= 2 (a singleton is not a cluster — same "no corroboration for a singleton" rule pattern-mining-engine.js already enforces)
 * @property {string|null} representativeScopeKey - one member picked as the cluster's representative for display purposes, or null
 */

export function isRecognitionClusterPayload(p) {
  return !!p && typeof p === 'object'
    && typeof p.clusterType === 'string' && p.clusterType.length > 0
    && Array.isArray(p.memberScopeKeys) && p.memberScopeKeys.length >= 2
    && p.memberScopeKeys.every((k) => typeof k === 'string' && k.length > 0)
    && (p.representativeScopeKey === null || p.memberScopeKeys.includes(p.representativeScopeKey));
}
