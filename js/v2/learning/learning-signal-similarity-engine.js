/* ============================================================
   LEARNING-SIGNAL-SIMILARITY-ENGINE.JS — Universal Learning Engine (Phase 12.6.3)

   PURPOSE: non-blocking, informational dedup-CANDIDATE surfacing for
   signals that don't share a scopeKey() but look like the same underlying
   fact (e.g. two independently-worded pattern observations). The PRIMARY
   dedup defense for identically-scoped signals remains
   learning-service.js#record()'s own existing targetKey+deep-equality
   no-op path, unchanged by this file — this engine only adds value for
   signals record() would otherwise treat as unrelated.

   Same Jaccard-over-top-level-keys formula as
   knowledge/learning/similarity-detection-engine.js#computeSimilarity —
   REIMPLEMENTED, not imported: scripts/learning-ownership-check.mjs
   already fails any learning/ file that imports a knowledge/ ENGINE (only
   bare /contracts/[^/]+\\.js$ leaves are allowlisted), and
   similarity-detection-engine.js lives in knowledge/learning/, not
   knowledge/contracts/. Duplicating these ~10 pure, stateless lines across
   two domains forbidden from depending on each other is the same trade
   every cross-domain "shape, not code" precedent in this platform already
   makes. If this formula ever needs a THIRD independent copy, that is the
   trigger to promote it to a shared, contracts-only leaf utility — not
   before.

   RESPONSIBILITY: computeSignalSimilarity(afterA, afterB) (pure),
   findSimilarSignals(signal, candidates, threshold) (pure, over a
   caller-supplied candidate pool — this engine never reads a repository
   itself).

   DEPENDENCIES: none.

   NON-GOALS: no semantic/NLP comparison — same honesty as the original:
   a field-overlap ratio over opaque structured data, not a stand-in for
   real natural-language similarity.
   ============================================================ */

'use strict';

/** Pure. Jaccard similarity over top-level keys whose values are ===-equal
 *  (or deep-equal via JSON.stringify for nested values) — 0 if neither
 *  object has any keys. Identical formula to knowledge/learning/
 *  similarity-detection-engine.js#computeSimilarity. */
export function computeSignalSimilarity(afterA, afterB) {
  const keysA = Object.keys(afterA || {});
  const keysB = Object.keys(afterB || {});
  const allKeys = new Set([...keysA, ...keysB]);
  if (allKeys.size === 0) return { score: 0, matchedFields: [] };

  const matchedFields = [];
  for (const key of allKeys) {
    if (!(key in (afterA || {})) || !(key in (afterB || {}))) continue;
    const equal = afterA[key] === afterB[key]
      || JSON.stringify(afterA[key]) === JSON.stringify(afterB[key]);
    if (equal) matchedFields.push(key);
  }
  return { score: matchedFields.length / allKeys.size, matchedFields };
}

/**
 * @param {import('./contracts/learning-signal-contract.js').LearningSignal} signal
 * @param {Array<{id: string, after: *}>} candidates - caller-supplied comparison pool (e.g. recent LearningEvents in the same domainType)
 * @param {number} [threshold=0.5]
 * @returns {Array<{candidateId: string, score: number, matchedFields: string[]}>} sorted by score, descending
 */
export function findSimilarSignals(signal, candidates, threshold = 0.5) {
  return (candidates || [])
    .map((candidate) => {
      const { score, matchedFields } = computeSignalSimilarity(signal.after, candidate.after);
      return { candidateId: candidate.id, score, matchedFields };
    })
    .filter((r) => r.score >= threshold)
    .sort((a, b) => b.score - a.score);
}
