/* ============================================================
   MERGE-CONTRACT.JS — Knowledge Promotion (V2.0.4, Phase 9.3)

   PURPOSE: fix the shape of a proposal to reconcile multiple conflicting
   KnowledgeItems (see review/conflict-detection-engine.js) into ONE new
   Draft item, instead of picking a strict winner
   (conflict-resolution-engine.js). "Knowledge Merge" per the V2.0.4 brief.

   RESPONSIBILITY: define KnowledgeMergeProposal and a validity check.

   DEPENDENCIES: none.

   NON-GOALS: does not decide HOW to merge two payloads — that is
   knowledge-merge-engine.js's job, and it is deliberately a single honest,
   generic reference strategy (shallow field-level merge), not a
   domain-aware reconciliation algorithm. A merge proposal is always a NEW
   Draft item — Decision 6 ("teach once, learn forever") still applies:
   nothing here is ever auto-approved.
   ============================================================ */

'use strict';

export const MERGE_SCHEMA = 'knowledge-merge-proposal@1';

/**
 * @typedef {Object} KnowledgeMergeProposal
 * @property {string} mergeId
 * @property {string} domainType
 * @property {string} kind
 * @property {string[]} sourceItemIds - >= 2, the items being reconciled
 * @property {*} mergedPayload        - the reconciled payload (shape depends on `kind`, same as KnowledgeItem.payload)
 * @property {string} proposedBy
 * @property {string} proposedAt      - ISO 8601
 */

let _counter = 0;

export function makeMergeProposal({ domainType, kind, sourceItemIds, mergedPayload, proposedBy }) {
  _counter += 1;
  return Object.freeze({
    mergeId: `merge:${domainType}:${Date.now()}:${_counter}`,
    domainType, kind,
    sourceItemIds: Object.freeze([...sourceItemIds]),
    mergedPayload,
    proposedBy,
    proposedAt: new Date().toISOString(),
  });
}

export function isKnowledgeMergeProposal(p) {
  return !!p && typeof p === 'object'
    && typeof p.mergeId === 'string' && p.mergeId.length > 0
    && typeof p.domainType === 'string' && p.domainType.length > 0
    && typeof p.kind === 'string' && p.kind.length > 0
    && Array.isArray(p.sourceItemIds) && p.sourceItemIds.length >= 2
    && typeof p.proposedBy === 'string' && p.proposedBy.length > 0;
}
