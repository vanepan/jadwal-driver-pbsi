/* ============================================================
   REPOSITORY-CONTRACT.JS — Live Word Workspace Repository (V2, Phase 12.8.2)

   PURPOSE: fix the ONE interface every Workspace repository backend
   (Null, Memory, and eventually Firebase) implements — a per-domain copy
   of the SAME shape body/repository/contracts/repository-contract.js and
   recognition/repository/contracts/repository-contract.js already
   establish. Each V2 domain owns its own copy rather than importing a
   shared one — deliberate, matching this platform's existing precedent
   (body/ and recognition/ each hold their own byte-for-byte-equivalent
   copy, not a cross-domain import), so no domain's repository infra ever
   becomes another domain's dependency.

   RESPONSIBILITY: define the Repository shape and RepositoryResult
   envelope, covering Read, Write, History, and Metrics lookup.

   DEPENDENCIES: none.

   NON-GOALS: no backend is implemented here. `rollback`/`getPendingReview`
   are absent — a Workspace has no human-gated review workflow of its own
   (review status lives on the ComposerDocument it wraps).
   ============================================================ */

'use strict';

export const REPOSITORY_SCHEMA = 'workspace-repository@1';

export const REPOSITORY_ERRORS = Object.freeze({
  NO_BACKEND_CONFIGURED: 'NO_BACKEND_CONFIGURED',
  NOT_FOUND: 'NOT_FOUND',
  DUPLICATE_ID: 'DUPLICATE_ID',
  INVALID_ITEM: 'INVALID_ITEM',
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
 * @property {(id: string) => RepositoryResult} getById
 * @property {(filter?: object) => RepositoryResult} list
 * @property {(item: object) => RepositoryResult} create
 * @property {(id: string, patch: object) => RepositoryResult} appendVersion
 * @property {(id: string) => RepositoryResult} getHistory
 * @property {() => RepositoryResult} getMetrics
 */

export const REPOSITORY_CONTRACT = Object.freeze({
  schema: REPOSITORY_SCHEMA,
  methods: Object.freeze(['getById', 'list', 'create', 'appendVersion', 'getHistory', 'getMetrics']),
  errorCodes: REPOSITORY_ERRORS,
});

/** Structural check that an object satisfies the Repository contract. */
export function isRepository(r) {
  if (!r || typeof r !== 'object') return false;
  if (typeof r.id !== 'string' || !r.id) return false;
  if (typeof r.version !== 'string' || !r.version) return false;
  return REPOSITORY_CONTRACT.methods.every((m) => typeof r[m] === 'function');
}
