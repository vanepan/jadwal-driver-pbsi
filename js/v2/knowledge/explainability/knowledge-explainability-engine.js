/* ============================================================
   KNOWLEDGE-EXPLAINABILITY-ENGINE.JS — Knowledge Platform (V2, Phase 5)

   PURPOSE: answer, for any Approved KnowledgeItem, the five questions
   fixed in contracts/explainability-contract.js — now wired for real. Four
   of the five questions are read directly off the item itself; the fifth
   (corroboration) is derived from the dependency graph engine, exactly as
   that contract specified in Phase 3.

   RESPONSIBILITY: `explain(item)`.

   DEPENDENCIES: knowledge/contracts/explainability-contract.js,
   knowledge/dependency-graph/knowledge-dependency-graph-engine.js.

   NON-GOALS: does not reconcile with js/prediction/explainability.js or
   js/services/dispatch-presentation.js (an explicitly open, deferred
   decision — architecture doc §5).

   FUTURE EVOLUTION: unchanged when that reconciliation is eventually
   decided — this function's shape (answers to five fixed questions) is
   the stable surface any unification would target.
   ============================================================ */

'use strict';

import { isProvenance } from '../contracts/explainability-contract.js';
import { getDependencies } from '../dependency-graph/knowledge-dependency-graph-engine.js';

/**
 * @param {import('../contracts/knowledge-item-contract.js').KnowledgeItem} item
 * @returns {{ok: boolean, data: object|null, error: object|null}}
 */
export function explain(item) {
  if (!item || !isProvenance(item.provenance)) {
    return { ok: false, data: null, error: { code: 'INVALID_ITEM', message: 'explain: item must be a KnowledgeItem with a valid provenance.' } };
  }
  const deps = getDependencies(item.id);
  const corroborationCount = deps.ok
    ? deps.data.filter((r) => r.payload && r.payload.type === 'corroborates').length
    : 0;

  return {
    ok: true,
    error: null,
    data: Object.freeze({
      whereLearned: item.provenance,
      corroborationCount,
      approvedAt: item.approvedAt ?? null,
      approvedBy: item.approvedBy ?? null,
      whyPreferred: item.preferenceRationale ?? null,
    }),
  };
}
