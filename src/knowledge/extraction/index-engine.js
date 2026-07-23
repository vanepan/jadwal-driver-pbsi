/* ============================================================
   INDEX-ENGINE.JS — Knowledge Learning Foundation (V2.0.8, Phase 11)

   PURPOSE: "Knowledge Indexing" — a real, purpose-built index over the
   repository's current snapshot, grouped by `${domainType}:${kind}`
   (the exact grouping every extraction engine in this directory needs
   repeatedly). `repository.list(filter)` is already a correct linear
   scan for point queries; this index exists so the extraction engines
   below don't each re-scan the whole repository once per call — build
   once per extraction run, query many times.

   RESPONSIBILITY: `buildKnowledgeIndex(lifecycleStates?)`.

   DEPENDENCIES: repository/knowledge-repository.js.

   NON-GOALS: not a persistent index — rebuilt fresh (a pure snapshot)
   every time a caller asks, exactly like knowledge-metrics-engine.js's
   computeHealthReport() re-derives from the live repository rather than
   maintaining stale cached state.
   ============================================================ */

'use strict';

import {
  listKnowledge as list,
} from '../services/knowledge-service.js';
import { LIFECYCLE_STATE } from '../contracts/lifecycle-contract.js';

/**
 * @param {string[]} [lifecycleStates] - defaults to [APPROVED] — extraction
 *   should learn from settled knowledge, not from other in-flight Drafts/
 *   Candidates (which could themselves be extraction output — see
 *   pattern-extraction-engine.js's NON-GOALS on avoiding feedback loops).
 * @returns {{byDomainKind: Map<string, import('../contracts/knowledge-item-contract.js').KnowledgeItem[]>, totalIndexed: number, builtAt: string}}
 */
export function buildKnowledgeIndex(lifecycleStates = [LIFECYCLE_STATE.APPROVED]) {
  const byDomainKind = new Map();
  let totalIndexed = 0;

  for (const lifecycleState of lifecycleStates) {
    const result = list({ lifecycleState });
    if (!result.ok) continue;
    for (const item of result.data) {
      const key = `${item.domainType}:${item.kind}`;
      if (!byDomainKind.has(key)) byDomainKind.set(key, []);
      byDomainKind.get(key).push(item);
      totalIndexed += 1;
    }
  }

  return Object.freeze({ byDomainKind, totalIndexed, builtAt: new Date().toISOString() });
}

/** Convenience accessor over an already-built index. */
export function indexGroup(index, domainType, kind) {
  return index.byDomainKind.get(`${domainType}:${kind}`) || [];
}
