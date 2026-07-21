/* ============================================================
   REPOSITORY-CONTRACT.JS — Recognition Foundation Repository (Phase 12.7.1)

   PURPOSE: fix the ONE interface every RecognitionRecord repository
   backend (Null, Memory, and eventually Firebase) implements — mirrors
   body/repository/contracts/repository-contract.js's pattern (itself
   mirroring knowledge/repository/contracts/repository-contract.js), so
   swapping backends is a registry selection, not a caller-code change.

   TRIMMED FROM KNOWLEDGE'S SHAPE, SAME REASONING AS BODY'S OWN REPOSITORY.
   `rollback` and `getPendingReview` are absent — both are Knowledge-
   specific concepts of a human-gated ReviewDecision workflow. Recognition
   has no lifecycle/ directory of its own (a Recognition Recommendation
   that needs human confirmation rides Knowledge's EXISTING review
   workflow once promoted — see recognition-recommendation-type-
   registry.js's header — Recognition itself never invents a second
   human-gate). `search` is also omitted, same "not needed by any Phase
   12.7.1 consumer" reasoning body/'s own repository-contract.js states.

   RESPONSIBILITY: define the Repository shape and RepositoryResult
   envelope, covering Read, Write, Version, History, and Metrics lookup.

   DEPENDENCIES: none.

   NON-GOALS: no backend is implemented here. No method is called by this
   file.
   ============================================================ */

'use strict';

export const REPOSITORY_SCHEMA = 'recognition-record-repository@1';

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
 * @property {(id: string, version: number) => RepositoryResult} getVersion
 * @property {(filter?: object) => RepositoryResult} list
 * @property {(item: object) => RepositoryResult} create
 * @property {(id: string, patch: object) => RepositoryResult} appendVersion
 * @property {(id: string) => RepositoryResult} getHistory
 * @property {() => RepositoryResult} getMetrics
 */

export const REPOSITORY_CONTRACT = Object.freeze({
  schema: REPOSITORY_SCHEMA,
  methods: Object.freeze(['getById', 'getVersion', 'list', 'create', 'appendVersion', 'getHistory', 'getMetrics']),
  errorCodes: REPOSITORY_ERRORS,
});

/** Structural check that an object satisfies the Repository contract. */
export function isRepository(r) {
  if (!r || typeof r !== 'object') return false;
  if (typeof r.id !== 'string' || !r.id) return false;
  if (typeof r.version !== 'string' || !r.version) return false;
  return REPOSITORY_CONTRACT.methods.every((m) => typeof r[m] === 'function');
}
