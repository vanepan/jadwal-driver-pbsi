/* ============================================================
   CLUSTERING-ENGINE.JS — Machine Learning Foundation (V2.0.9, Phase 12)

   PURPOSE: "Clustering" — groups items whose payloads are similar
   (not necessarily identical, unlike knowledge/extraction/
   scope-detection-engine.js's exact-match grouping), using single-linkage
   over the ALREADY-REAL similarity metric
   knowledge/learning/similarity-detection-engine.js#computeSimilarity
   (V2.0.5, Jaccard over payload keys) — reused, not reimplemented.
   Deterministic, no AI: same input always produces the same clusters.

   RESPONSIBILITY: `clusterItems(items, threshold)`.

   DEPENDENCIES: knowledge/extraction/index-engine.js,
   knowledge/learning/similarity-detection-engine.js.

   NON-GOALS: does not write anything — see pattern-mining-engine.js,
   which clusters then extracts a pattern per cluster.
   ============================================================ */

'use strict';

import { computeSimilarity } from '../learning/similarity-detection-engine.js';

const DEFAULT_THRESHOLD = 0.6;

/**
 * Single-linkage clustering: item A joins item B's cluster if A is
 * similar enough to ANY member already in that cluster. Pure, order-
 * independent in outcome (though not in cluster labeling order).
 * @param {import('../contracts/knowledge-item-contract.js').KnowledgeItem[]} items
 * @param {number} [threshold]
 * @returns {import('../contracts/knowledge-item-contract.js').KnowledgeItem[][]} clusters, largest first
 */
export function clusterItems(items, threshold = DEFAULT_THRESHOLD) {
  const clusters = [];

  for (const item of items) {
    let joined = null;
    for (const cluster of clusters) {
      const isSimilarToCluster = cluster.some((member) => computeSimilarity(item.payload, member.payload).score >= threshold);
      if (isSimilarToCluster) { joined = cluster; break; }
    }
    if (joined) joined.push(item);
    else clusters.push([item]);
  }

  return clusters.sort((a, b) => b.length - a.length);
}
