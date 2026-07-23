/* ============================================================
   BATCH-CONTRACT.JS — Knowledge Acquisition (V2, Phase 9)

   PURPOSE: fix the shape of a KnowledgeBatch — the set of Draft
   KnowledgeItems a connector produces in one extraction call, kept as its
   own unit so a session can report "3 batches, 47 items" and a failure can
   be attributed to one batch without losing the others.

   RESPONSIBILITY: define KnowledgeBatch and a constructor.

   DEPENDENCIES: none (items are validated elsewhere — knowledge/contracts/
   knowledge-item-contract.js's isKnowledgeItem — this module only fixes
   the envelope shape around them).

   NON-GOALS: does not write anything to the repository — see
   acquisition-engine.js.
   ============================================================ */

'use strict';

export const BATCH_SCHEMA = 'knowledge-batch@1';

let _counter = 0;

/**
 * @typedef {Object} KnowledgeBatch
 * @property {string} batchId
 * @property {string} connectorId
 * @property {string} sourceId
 * @property {import('../../contracts/knowledge-item-contract.js').KnowledgeItem[]} items - always Draft-lifecycle
 * @property {string} extractedAt - ISO 8601
 */

export function makeBatch(connectorId, sourceId, items) {
  _counter += 1;
  return Object.freeze({
    batchId: `batch:${connectorId}:${Date.now()}:${_counter}`,
    connectorId,
    sourceId,
    items: Object.freeze([...(items || [])]),
    extractedAt: new Date().toISOString(),
  });
}

/** Structural check that an object satisfies the KnowledgeBatch contract. */
export function isKnowledgeBatch(b) {
  return !!b && typeof b === 'object'
    && typeof b.batchId === 'string' && b.batchId.length > 0
    && typeof b.connectorId === 'string' && b.connectorId.length > 0
    && typeof b.sourceId === 'string' && b.sourceId.length > 0
    && Array.isArray(b.items);
}
