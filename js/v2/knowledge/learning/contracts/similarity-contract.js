/* ============================================================
   SIMILARITY-CONTRACT.JS — Teach Once, Learn Forever (V2.0.5, Phase 9.4)

   PURPOSE: fix the shape of a similarity comparison between two
   KnowledgeItems — used by similarity-detection-engine.js so a correction
   or a new candidate can be checked against existing items before
   deciding "this is an update" vs "this is genuinely new."

   RESPONSIBILITY: define SimilarityResult and a constructor.

   DEPENDENCIES: none.
   ============================================================ */

'use strict';

export const SIMILARITY_SCHEMA = 'knowledge-similarity-result@1';

/**
 * @typedef {Object} SimilarityResult
 * @property {string} itemAId
 * @property {string} itemBId
 * @property {number} score          - 0..1, Jaccard similarity over top-level payload keys+values
 * @property {string[]} matchedFields - top-level payload keys with equal values in both
 */

export function makeSimilarityResult(itemAId, itemBId, score, matchedFields) {
  return Object.freeze({ itemAId, itemBId, score, matchedFields: Object.freeze([...matchedFields]) });
}
