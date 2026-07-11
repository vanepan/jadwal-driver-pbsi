/* ============================================================
   SIMILARITY-DETECTION-ENGINE.JS — Teach Once, Learn Forever (V2.0.5, Phase 9.4)

   PURPOSE: before generating a brand-new Candidate from a correction,
   check whether an existing item already says approximately the same
   thing — so a correction becomes an UPDATE to that item instead of a
   near-duplicate new one. Deliberately one honest, generic reference
   metric — Jaccard similarity over top-level payload keys+values — the
   same "reference implementation, not a real X" honesty as
   promotion/knowledge-merge-engine.js's shallow merge and
   memory-repository.js's naive search().

   RESPONSIBILITY: `computeSimilarity(payloadA, payloadB)` (pure) and
   `findSimilarItems(domainType, kind, payload, threshold)` (queries the
   repository for the comparison pool).

   DEPENDENCIES: repository/knowledge-repository.js,
   contracts/similarity-contract.js.

   NON-GOALS: no semantic/NLP comparison — payloads are opaque, structured
   data (this platform's `kind` payloads are counts/flags/patterns, not
   prose) and a field-overlap ratio is the honest generic answer for that
   shape, not a stand-in for real natural-language similarity.
   ============================================================ */

'use strict';

import { list } from '../repository/knowledge-repository.js';
import { makeSimilarityResult } from './contracts/similarity-contract.js';

/** Pure. Jaccard similarity over top-level keys whose values are ===-equal
 *  (or deep-equal via JSON.stringify for nested values) — 0 if neither
 *  payload has any keys. */
export function computeSimilarity(payloadA, payloadB) {
  const keysA = Object.keys(payloadA || {});
  const keysB = Object.keys(payloadB || {});
  const allKeys = new Set([...keysA, ...keysB]);
  if (allKeys.size === 0) return { score: 0, matchedFields: [] };

  const matchedFields = [];
  for (const key of allKeys) {
    if (!(key in payloadA) || !(key in payloadB)) continue;
    const equal = payloadA[key] === payloadB[key]
      || JSON.stringify(payloadA[key]) === JSON.stringify(payloadB[key]);
    if (equal) matchedFields.push(key);
  }
  return { score: matchedFields.length / allKeys.size, matchedFields };
}

/**
 * @param {string} domainType
 * @param {string} kind
 * @param {*} payload
 * @param {number} [threshold=0.5]
 * @returns {import('./contracts/similarity-contract.js').SimilarityResult[]} sorted by score, descending
 */
export function findSimilarItems(domainType, kind, payload, threshold = 0.5) {
  const result = list({ domainType, kind });
  if (!result.ok) return [];
  return result.data
    .map((item) => {
      const { score, matchedFields } = computeSimilarity(payload, item.payload);
      return makeSimilarityResult('candidate', item.id, score, matchedFields);
    })
    .filter((r) => r.score >= threshold)
    .sort((a, b) => b.score - a.score);
}
