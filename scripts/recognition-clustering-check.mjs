/* recognition-clustering-check.mjs — Phase 12.7.4, "Structural Clustering"
   (renamed from the original brief's "Semantic Clustering" — see
   docs/PHASE_12_SPRINT_12_7_APPLE_PHOTOS_LEARNING.md §0; nothing here is
   NLP/semantic).

   Verifies: clusterScopes() correctly implements single-linkage grouping
   (mirrors knowledge/machine-learning/clustering-engine.js#clusterItems'
   documented algorithm shape, cross-checked conceptually, not by import —
   see the engine's own header for why); singleton "clusters" are excluded;
   output is sorted largest-first; computeClusterConfidence matches
   pattern-mining-engine.js's documented formula; clustering-service.js
   persists only real (size >= 2) clusters, with a deterministic id so
   re-deriving the SAME cluster from the SAME population reconciles via
   append rather than duplicating.

   Deterministic. No V1, no Firebase, no AI, no NLP.
   Run: node scripts/recognition-clustering-check.mjs   (exit 0 = pass) */

import { clusterScopes, computeClusterConfidence } from '../js/v2/recognition/clustering/structural-clustering-engine.js';
import { recordClusters } from '../js/v2/recognition/services/clustering-service.js';
import { resetRepositoryRegistry } from '../js/v2/recognition/repository/repository-registry.js';
import { setActiveRepository } from '../js/v2/recognition/repository/recognition-repository.js';
import { getRecognitionHistory } from '../js/v2/recognition/services/recognition-service.js';
import { resetStrategyRegistry } from '../js/v2/recognition/similarity/similarity-strategy-registry.js';

let pass = 0; let fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); }
}

console.log('\n[clusterScopes — single-linkage grouping over exact-hash]');
{
  resetStrategyRegistry();
  const items = [
    { scopeKey: 'a', value: 'hash-1' },
    { scopeKey: 'b', value: 'hash-1' },
    { scopeKey: 'c', value: 'hash-1' },
    { scopeKey: 'd', value: 'hash-2' },
    { scopeKey: 'e', value: 'hash-3' }, // a genuine singleton
  ];
  const clusters = clusterScopes(items, 'exact-hash', 1);
  check('one real 3-member cluster forms from the 3 identical hashes', clusters.some((c) => c.size === 3 && c.memberScopeKeys.sort().join(',') === 'a,b,c'));
  check('a genuine singleton (hash-3) is EXCLUDED from the output entirely', !clusters.some((c) => c.memberScopeKeys.includes('e')));
  check('exactly 1 real cluster total (hash-2 alone is also a singleton, excluded)', clusters.length === 1);
  check('output is sorted largest-first', clusters[0].size === 3);
}

console.log('\n[clusterScopes — Jaccard-based grouping over structural-shape]');
{
  const items = [
    { scopeKey: 'x1', value: ['id', 'subject', 'amount'] },
    { scopeKey: 'x2', value: ['id', 'subject', 'amount'] },
    { scopeKey: 'y1', value: ['id', 'title', 'author'] },
  ];
  const clusters = clusterScopes(items, 'structural-shape', 0.9);
  check('identical field-shapes cluster together under a strict threshold', clusters.some((c) => c.memberScopeKeys.sort().join(',') === 'x1,x2'));
  check('a structurally different item never joins under a strict threshold', !clusters.some((c) => c.memberScopeKeys.includes('y1')));
}

console.log('\n[computeClusterConfidence — cites pattern-mining-engine.js\'s documented formula]');
{
  check('confidence = clusterSize/totalItems (min(1, ...))', computeClusterConfidence(3, 10) === 0.3);
  check('confidence never exceeds 1 even if clusterSize > totalItems (a defensive floor, never a real case)', computeClusterConfidence(12, 10) === 1);
  check('zero totalItems never divides by zero', computeClusterConfidence(0, 0) === 0);
}

console.log('\n[clustering-service.js — only real clusters are persisted, deterministic reconciliation]');
{
  resetRepositoryRegistry();
  setActiveRepository('memory');
  resetStrategyRegistry();
  const items = [
    { scopeKey: 'p1', value: 'same-hash' },
    { scopeKey: 'p2', value: 'same-hash' },
    { scopeKey: 'p3', value: 'only-one' },
  ];
  const first = recordClusters(items, 'exact-hash', { threshold: 1 });
  check('recordClusters succeeds', first.ok);
  check('exactly 1 real cluster persisted (the singleton is never written)', first.clusters.length === 1);
  check('the persisted cluster has RECORD_TYPE.CLUSTER shape', first.clusters[0].recordType === 'cluster');
  check('the persisted cluster carries real evidence (first real STATISTIC-kind evidence producer)', first.clusters[0].evidence.length === 1 && first.clusters[0].evidence[0].kind === 'statistic');

  // Re-deriving the SAME cluster from the SAME population must reconcile,
  // never duplicate — the deterministic-id discipline every append-only
  // repository in this platform relies on.
  const second = recordClusters(items, 'exact-hash', { threshold: 1 });
  check('re-deriving the identical cluster reconciles via append, not a new row', second.clusters[0].id === first.clusters[0].id);
  const history = getRecognitionHistory(first.clusters[0].id);
  check('exactly 2 real versions exist (1 create + 1 reconciling append)', history.ok && history.data.length === 2);
}

console.log(`\n${pass}/${pass + fail} checks passed.`);
if (fail > 0) process.exit(1);
