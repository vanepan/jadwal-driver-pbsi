/* ============================================================
   ADAPTER-CONTRACT.JS — AI Foundation (V2, Phase 3)

   PURPOSE: fix the ONE shape every AI/LLM provider conforms to (Decision
   7), deliberately mirroring the already-proven
   js/prediction/prediction-provider.js shape (registry + never-throws +
   explicit success/failure result) — the same contract pattern that
   already makes swapping js/prediction/rule-provider.js for
   js/prediction/python-provider.js a zero-blast-radius change.

   RESPONSIBILITY: define the Adapter shape and its result contract.

   DEPENDENCIES: none. A real adapter (Phase 4+) will depend on
   js/v2/knowledge/ (read-only, for the knowledge context it may cite) and
   on whatever provider SDK it wraps — this contract file has neither.

   NON-GOALS: no adapter is implemented here. `query()` is never called by
   Phase 3 code.

   FUTURE EVOLUTION: registry/adapter-registry.js (Phase 3, bootstrapped
   with three stubs) is where a real adapter registers once implemented;
   this contract is what `isAdapter()` checks against. Replacing a
   provider must only ever mean writing one new file conforming to this
   contract — if it ever requires touching knowledge/, the design has
   failed (Decision 7's literal test).
   ============================================================ */

'use strict';

export const ADAPTER_SCHEMA = 'ai-adapter@1';

/** Closed set of adapter error codes. */
export const ADAPTER_ERRORS = Object.freeze({
  QUERY_FAILED: 'QUERY_FAILED',
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
});

/**
 * @typedef {Object} Adapter
 * @property {string} id           - e.g. 'claude' | 'openai' | 'local-model'
 * @property {string} provider     - human label
 * @property {string} version
 * @property {(knowledgeContext: object, prompt: string) => AdapterResult} query
 */

/**
 * @typedef {Object} AdapterResult
 * @property {boolean} ok
 * @property {string|null} answer
 * @property {string[]} citedKnowledgeIds - KnowledgeItem ids the answer cites, empty if none
 * @property {{code: string, message: string}|null} error
 */

export const ADAPTER_CONTRACT = Object.freeze({
  schema: ADAPTER_SCHEMA,
  adapter: Object.freeze(['id', 'provider', 'version', 'query']),
  result: Object.freeze(['ok', 'answer', 'citedKnowledgeIds', 'error']),
  errorCodes: ADAPTER_ERRORS,
});

/** A successful query. */
export function adapterSuccess(answer, citedKnowledgeIds = []) {
  return Object.freeze({
    ok: true,
    answer: answer ?? null,
    citedKnowledgeIds: Object.freeze([...citedKnowledgeIds]),
    error: null,
  });
}

/** A predictable query failure. Adapters return this instead of throwing. */
export function adapterFailure(code, message) {
  return Object.freeze({
    ok: false,
    answer: null,
    citedKnowledgeIds: Object.freeze([]),
    error: Object.freeze({ code, message }),
  });
}

/** Structural check that an object satisfies the adapter contract. */
export function isAdapter(a) {
  return !!a && typeof a === 'object'
    && typeof a.id === 'string' && a.id.length > 0
    && typeof a.provider === 'string' && a.provider.length > 0
    && typeof a.version === 'string' && a.version.length > 0
    && typeof a.query === 'function';
}
