/* ============================================================
   REPOSITORY-CONTRACT.JS — Knowledge Repository Foundation (V2, Phase 5)

   PURPOSE: fix the ONE interface every repository backend (Null, Memory,
   and eventually Firebase) implements, mirroring the provider-contract
   pattern (js/prediction/prediction-provider.js) so swapping backends is a
   registry selection, not a caller-code change.

   RESPONSIBILITY: define the Repository shape and RepositoryResult
   envelope, covering Read, Write, Version, Snapshot, Rollback, Search,
   Identity lookup, Dependency lookup, History lookup, Metrics lookup, and
   Review lookup — the eleven capabilities named in Phase 5.

   DEPENDENCIES: none.

   NON-GOALS: no backend is implemented here. No method is called by this
   file.

   FUTURE EVOLUTION: a future Firebase-backed repository implements this
   exact interface; callers written against
   knowledge/repository/knowledge-repository.js never need to change.
   ============================================================ */

'use strict';

export const REPOSITORY_SCHEMA = 'knowledge-repository@1';

export const REPOSITORY_ERRORS = Object.freeze({
  NO_BACKEND_CONFIGURED: 'NO_BACKEND_CONFIGURED',
  NOT_FOUND: 'NOT_FOUND',
  DUPLICATE_ID: 'DUPLICATE_ID',
  INVALID_ITEM: 'INVALID_ITEM',
  ILLEGAL_TRANSITION: 'ILLEGAL_TRANSITION',
  INVALID_REVIEW_DECISION: 'INVALID_REVIEW_DECISION',
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
});

/**
 * @typedef {Object} RepositoryResult
 * @property {boolean} ok
 * @property {*} data
 * @property {{code: string, message: string}|null} error
 */

export function repositorySuccess(data) {
  return Object.freeze({ ok: true, data: data ?? null, error: null });
}

export function repositoryFailure(code, message) {
  return Object.freeze({ ok: false, data: null, error: Object.freeze({ code, message }) });
}

/**
 * @typedef {Object} Repository
 * @property {string} id
 * @property {string} version
 * @property {(id: string, opts?: object) => RepositoryResult} getById       - Read / Identity lookup
 * @property {(id: string, version: number) => RepositoryResult} getVersion  - Snapshot
 * @property {(filter?: object) => RepositoryResult} list                   - Read
 * @property {(query: string) => RepositoryResult} search                   - Search
 * @property {(item: object) => RepositoryResult} create                    - Write
 * @property {(id: string, patch: object) => RepositoryResult} appendVersion - Version / Write
 * @property {(id: string) => RepositoryResult} getHistory                  - History lookup
 * @property {(id: string, toVersion: number, reviewDecision: object) => RepositoryResult} rollback - Rollback
 * @property {(id: string) => RepositoryResult} getDependencies             - Dependency lookup
 * @property {() => RepositoryResult} getMetrics                           - Metrics lookup
 * @property {() => RepositoryResult} getPendingReview                     - Review lookup
 */

export const REPOSITORY_CONTRACT = Object.freeze({
  schema: REPOSITORY_SCHEMA,
  methods: Object.freeze([
    'getById', 'getVersion', 'list', 'search', 'create', 'appendVersion',
    'getHistory', 'rollback', 'getDependencies', 'getMetrics', 'getPendingReview',
  ]),
  errorCodes: REPOSITORY_ERRORS,
});

/** Structural check that an object satisfies the Repository contract. */
export function isRepository(r) {
  if (!r || typeof r !== 'object') return false;
  if (typeof r.id !== 'string' || !r.id) return false;
  if (typeof r.version !== 'string' || !r.version) return false;
  return REPOSITORY_CONTRACT.methods.every((m) => typeof r[m] === 'function');
}
