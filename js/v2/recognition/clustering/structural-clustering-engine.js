/* ============================================================
   STRUCTURAL-CLUSTERING-ENGINE.JS — Structural Clustering (Phase 12.7.4)

   NAMING: this sprint is named "Structural Clustering" in this
   implementation, not the original brief's "Semantic Clustering" — see
   docs/PHASE_12_SPRINT_12_7_APPLE_PHOTOS_LEARNING.md §0. Nothing here
   performs natural-language/semantic analysis; every grouping is a
   deterministic threshold over a registered similarity-strategy/similarity-
   contract.js#RecognitionSimilarity score (Sprint 12.7.3), preserving
   js/v2/README.md's standing invariant ("No AI/LLM/OCR/NLP code exists
   anywhere in this tree").

   PURPOSE: group RecognitionScopes whose comparable values are similar
   enough, via similarity/similarity-strategy-registry.js's
   dispatchSimilarity() (Phase 12.7.3), into RecognitionCluster payloads.

   ALGORITHM — cites and mirrors knowledge/machine-learning/
   clustering-engine.js#clusterItems' exact shape (single-linkage: join
   the FIRST existing cluster where ANY member scores >= threshold against
   the candidate, else start a new singleton cluster; sorted largest-
   first), for the same reason learning/'s engines already reimplement
   knowledge/'s formulas rather than importing them: `clusterItems` takes
   KnowledgeItem[] specifically (an object with a `.payload` field); a
   real adapter to synthesize that shape from an arbitrary
   RecognitionScope+strategyId pair would have no benefit over citing the
   same algorithm directly against Recognition's own, more general input
   shape (`{scopeKey, value}`, compared via WHATEVER strategy the caller
   names, not hardcoded to Jaccard-over-payload). This is a small,
   deliberate, disclosed deviation from this phase's own original
   architecture sketch (which proposed literally calling `clusterItems`
   for the KnowledgeItem-only case) — see this sprint's own report.

   Singleton clusters (size 1) are EXCLUDED from the output — same "no
   corroboration for a singleton" rule pattern-mining-engine.js already
   enforces; a cluster of one is not a cluster.

   RESPONSIBILITY: clusterScopes(items, strategyId, threshold).

   DEPENDENCIES: ../similarity/similarity-strategy-registry.js.

   NON-GOALS: does not persist anything (services/clustering-service.js,
   this same sprint, does). Does not decide which strategyId applies —
   the caller already knows what it computed.

   KNOWN LIMITATION (disclosed, not silently absorbed): O(N²) worst case
   over the input pool, same accepted-limitation class
   learning-recommendation-engine.js#computeRecommendations' MERGE_CANDIDATE
   rule already documents for itself — acceptable at this phase's
   zero-live-producer data volumes.
   ============================================================ */

'use strict';

import { dispatchSimilarity } from '../similarity/similarity-strategy-registry.js';

/**
 * @typedef {Object} ClusterableItem
 * @property {string} scopeKey   - a real scopeKey() string
 * @property {*} value           - whatever the named strategyId expects (a hash string, a payload object, a field-name array, a token array)
 */

/**
 * Pure, deterministic single-linkage clustering. Returns groups of size
 * >= 2 only, largest-first — mirrors clusterItems' exact output shape,
 * generalized to Recognition's own scopeKey-tagged input.
 * @param {ClusterableItem[]} items
 * @param {string} strategyId
 * @param {number} [threshold=0.6]
 * @returns {{memberScopeKeys: string[], size: number}[]}
 */
export function clusterScopes(items, strategyId, threshold = 0.6) {
  const clusters = [];
  for (const item of (Array.isArray(items) ? items : [])) {
    let joinedCluster = null;
    for (const cluster of clusters) {
      const joins = cluster.some((member) => {
        const result = dispatchSimilarity(strategyId, item.value, member.value);
        return result.ok && typeof result.score === 'number' && result.score >= threshold;
      });
      if (joins) { joinedCluster = cluster; break; }
    }
    if (joinedCluster) joinedCluster.push(item);
    else clusters.push([item]);
  }
  return clusters
    .filter((c) => c.length >= 2)
    .sort((a, b) => b.length - a.length)
    .map((c) => ({ memberScopeKeys: c.map((i) => i.scopeKey), size: c.length }));
}

/** Confidence for a cluster — cites and extends pattern-mining-engine.js's
 *  own documented formula (`confidence = min(1, clusterSize/totalItems)`),
 *  reimplemented as arithmetic (not imported — that file is a
 *  knowledge/-domain ENGINE, same ownership-boundary reasoning as every
 *  other confidence reimplementation in this platform's history). */
export function computeClusterConfidence(clusterSize, totalItems) {
  if (!totalItems || totalItems <= 0) return 0;
  return Math.min(1, clusterSize / totalItems);
}
