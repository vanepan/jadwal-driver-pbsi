/* ============================================================
   KNOWLEDGE-MERGE-ENGINE.JS — Knowledge Promotion (V2.0.4, Phase 9.3)

   PURPOSE: reconcile multiple conflicting KnowledgeItems into ONE new
   Draft item, as an alternative to conflict-resolution-engine.js picking a
   strict winner. `mergePayloads()` is deliberately a single honest,
   generic reference strategy — a shallow, last-item-wins field merge, the
   same "reference implementation, not a real X" honesty as
   repository/implementations/memory-repository.js's naive search(). A
   real per-`kind` reconciliation strategy (e.g. union two vocabulary
   lists instead of overwriting) is future work this contract does not
   foreclose (see contracts/merge-contract.js's NON-GOALS) but does not
   fake here either.

   RESPONSIBILITY: `mergePayloads(items)` (pure) and
   `proposeMergedDraft(items, opts)` — builds a new Draft KnowledgeItem
   from a MergeProposal, ready for repository.create(). Never writes to the
   repository itself — the caller decides whether/when to `create()` it,
   same as any connector's output.

   DEPENDENCIES: contracts/merge-contract.js,
   contracts/identity-contract.js, contracts/lifecycle-contract.js.

   NON-GOALS: does not write to the repository. Does not auto-promote the
   merged Draft — it re-enters the exact same acquisition -> review ->
   promotion pipeline as any other Draft item; Decision 6 still applies.
   Requires every input item to share domainType + kind (a merge across
   different kinds is not a merge, it's two unrelated facts).
   ============================================================ */

'use strict';

import { makeMergeProposal } from './contracts/merge-contract.js';
import { generateKnowledgeId } from '../contracts/identity-contract.js';
import { LIFECYCLE_STATE } from '../contracts/lifecycle-contract.js';
import { PROMOTION_EVENT_TYPE, makePromotionEvent } from './contracts/event-contract.js';

/** Pure. Later items' fields win over earlier ones — the ONE documented
 *  reference rule, not a semantic reconciliation. */
export function mergePayloads(items) {
  return items.reduce((acc, item) => ({ ...acc, ...item.payload }), {});
}

/**
 * @param {import('../contracts/knowledge-item-contract.js').KnowledgeItem[]} items - >= 2, same domainType + kind
 * @param {{proposedBy: string, onEvent?: Function}} opts
 * @returns {import('../contracts/knowledge-item-contract.js').KnowledgeItem}
 */
export function proposeMergedDraft(items, { proposedBy, onEvent } = {}) {
  if (!Array.isArray(items) || items.length < 2) throw new Error('proposeMergedDraft: requires at least 2 items.');
  const [first, ...rest] = items;
  if (rest.some((it) => it.domainType !== first.domainType || it.kind !== first.kind)) {
    throw new Error('proposeMergedDraft: every item must share the same domainType and kind.');
  }

  const proposal = makeMergeProposal({
    domainType: first.domainType,
    kind: first.kind,
    sourceItemIds: items.map((it) => it.id),
    mergedPayload: mergePayloads(items),
    proposedBy,
  });

  const now = new Date().toISOString();
  const draft = Object.freeze({
    id: generateKnowledgeId({ domainType: proposal.domainType, sourceType: 'merge', sourceRef: proposal.mergeId }),
    version: 1,
    domainType: proposal.domainType,
    sourceType: 'merge',
    kind: proposal.kind,
    payload: proposal.mergedPayload,
    confidence: Math.min(...items.map((it) => it.confidence)),
    lifecycleState: LIFECYCLE_STATE.DRAFT,
    provenance: Object.freeze({ connectorId: 'merge', sourceRef: proposal.mergeId, capturedAt: now }),
    approvedBy: null,
    approvedAt: null,
    preferenceRationale: null,
    createdAt: now,
    updatedAt: now,
  });

  if (typeof onEvent === 'function') {
    onEvent(makePromotionEvent(PROMOTION_EVENT_TYPE.MERGE_PROPOSED, { itemId: draft.id, detail: proposal }));
  }

  return draft;
}
