/* ============================================================
   SIMILARITY-STRATEGY-REGISTRY.JS — Similarity Discovery (Phase 12.7.3)

   PURPOSE: generalize this platform's THREE existing, independently-built,
   single-domain similarity/duplicate primitives into one dispatchable
   registry, WITHOUT touching or duplicating any of them — mirrors
   js/prediction/prediction-provider.js's shape exactly (a registry +
   never-throws dispatch + an explicit success/failure result), the same
   contract pattern this codebase already uses to make swapping a
   provider a zero-blast-radius change.

   Registered at bootstrap, one strategy per registered
   recognition-signature-type-registry.js signatureType — reusing THAT
   vocabulary rather than inventing a parallel one (see this file's own
   bootstrap()):

     'exact-hash'        -> byte/field-identical comparison. Wraps
                            file-storage/file-hash.js and organizational-
                            memory/document-hash.js's already-computed
                            hash VALUES (plain string equality) — this
                            registry never recomputes a hash itself.
     'field-overlap'     -> delegates to knowledge/services/
                            similarity-service.js#computeSimilarity
                            (Jaccard over KnowledgeItem payload keys/
                            values), added as a services-facade export
                            THIS sprint specifically so recognition/ can
                            depend on it the same "services-only" way
                            every other cross-domain edge in this
                            platform already does.
     'structural-shape'   -> Jaccard over two SETS of present field
                            names — the genuinely new, cross-domain-
                            capable strategy (comparing a KnowledgeItem's
                            field shape to a Body Entity's attribute
                            shape is meaningless as VALUE comparison, but
                            meaningful as SHAPE comparison).
     'metadata-shape'      -> Jaccard over two SETS of caller-supplied
                            vocabulary tokens (e.g. filename/folder
                            tokens) — reuses the same generic set-overlap
                            primitity as 'structural-shape'; this file
                            does NOT tokenize a filename itself (that
                            stays knowledge/datasets/import-session/
                            metadata-inference-engine.js's job, a
                            knowledge/-domain ENGINE file this registry
                            deliberately does not import — see
                            classification-suggestion-engine.js's header
                            for the identical restraint).

   RESPONSIBILITY: registerStrategy/hasStrategy/getStrategy/
   listStrategies/resetStrategyRegistry, dispatchSimilarity (never-throws).

   DEPENDENCIES: knowledge/services/similarity-service.js (a services-
   facade import, added this sprint).

   NON-GOALS: does not compute a signature (recognition/contracts/
   recognition-signature-contract.js + a future extractor). Does not
   decide WHICH strategy applies to a given scope pair — that is the
   caller's job (it already knows what signatureType it computed).
   ============================================================ */

'use strict';

import { computeSimilarity } from '../../../../src/knowledge/services/similarity-service.js';

/** @type {Map<string, {id: string, fn: Function}>} */
const _strategies = new Map();

export const SIMILARITY_STRATEGY_ERRORS = Object.freeze({
  UNKNOWN_STRATEGY: 'UNKNOWN_STRATEGY',
  STRATEGY_THREW: 'STRATEGY_THREW',
});

export function registerStrategy(id, fn) {
  if (typeof id !== 'string' || !id) throw new Error('registerStrategy: id must be a non-empty string');
  if (typeof fn !== 'function') throw new Error('registerStrategy: fn must be a function');
  _strategies.set(id, Object.freeze({ id, fn }));
}

export function hasStrategy(id) {
  return _strategies.has(id);
}

export function getStrategy(id) {
  return _strategies.get(id) || null;
}

export function listStrategies() {
  return Object.freeze([..._strategies.values()].map((s) => Object.freeze({ id: s.id })));
}

/** Test/teardown helper. Not used by any runtime path. */
export function resetStrategyRegistry() {
  _strategies.clear();
  bootstrap();
}

/**
 * Never-throws dispatch — same discipline js/prediction/prediction-
 * provider.js's own registry already established: an unknown strategy or
 * a strategy that throws is a reported failure, never an uncaught
 * exception a caller must remember to wrap.
 * @param {string} strategyId
 * @param {*} a
 * @param {*} b
 * @returns {{ok: boolean, score: number|null, strategyId: string, matchedFields: string[]|null, error: string|null}}
 */
export function dispatchSimilarity(strategyId, a, b) {
  const strategy = getStrategy(strategyId);
  if (!strategy) {
    return Object.freeze({
      ok: false, score: null, strategyId, matchedFields: null, error: `No similarity strategy registered under "${strategyId}".`,
    });
  }
  try {
    const result = strategy.fn(a, b);
    return Object.freeze({
      ok: true, score: result.score, strategyId, matchedFields: result.matchedFields || null, error: null,
    });
  } catch (err) {
    return Object.freeze({
      ok: false, score: null, strategyId, matchedFields: null, error: err && err.message ? err.message : String(err),
    });
  }
}

/** Pure Jaccard over two sets — the shared primitive both 'structural-shape'
 *  and 'metadata-shape' below are built from. Exported so a future
 *  extractor can reuse it directly rather than re-deriving it. */
export function jaccardSetSimilarity(setA, setB) {
  const a = new Set(setA || []);
  const b = new Set(setB || []);
  const union = new Set([...a, ...b]);
  if (union.size === 0) return { score: 0, matchedFields: [] };
  const intersection = [...a].filter((x) => b.has(x));
  return { score: intersection.length / union.size, matchedFields: intersection };
}

function bootstrap() {
  registerStrategy('exact-hash', (valueA, valueB) => ({
    score: (typeof valueA === 'string' && typeof valueB === 'string' && valueA === valueB) ? 1 : 0,
    matchedFields: [],
  }));
  registerStrategy('field-overlap', (payloadA, payloadB) => computeSimilarity(payloadA, payloadB));
  registerStrategy('structural-shape', (fieldsA, fieldsB) => jaccardSetSimilarity(fieldsA, fieldsB));
  registerStrategy('metadata-shape', (tokensA, tokensB) => jaccardSetSimilarity(tokensA, tokensB));
}

bootstrap();
