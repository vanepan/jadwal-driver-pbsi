/* ============================================================
   REPOSITORY-CONTRACT.JS — Body Intelligence Entity Repository (V2, Phase 12.5.2)

   PURPOSE: fix the ONE interface every Entity repository backend (Null,
   Memory, and eventually Firebase) implements — mirrors
   knowledge/repository/contracts/repository-contract.js's pattern, so
   swapping backends is a registry selection, not a caller-code change.
   Entities are the one Body concept a future swappable backend is
   plausible for (a materialized-into-RTDB dashboard, say) — unlike
   relationship-repository.js / body-event-repository.js, which stay
   Learning-style (direct functions, no Null variant; see their own
   headers for why).

   TRIMMED FROM KNOWLEDGE'S SHAPE ON PURPOSE. `rollback` and
   `getPendingReview` are absent — both are Knowledge-specific concepts of
   a human-gated ReviewDecision workflow, and body/ deliberately has none
   (see contracts/entity-state-contract.js's header and
   js/v2/body/README.md §1: an Entity is a derived projection, never
   platform-gated, so there is nothing to "roll back to" or "queue for
   review"). `search` is also omitted — not needed by any Phase 12.5
   consumer; adding it later is a pure addition, not a breaking change.

   RESPONSIBILITY: define the Repository shape and RepositoryResult
   envelope, covering Read, Write, Version, History, Dependency, and
   Metrics lookup.

   DEPENDENCIES: none.

   NON-GOALS: no backend is implemented here. No method is called by this
   file.

   FUTURE EVOLUTION: a future Firebase-backed repository implements this
   exact interface; callers written against repository/entity-repository.js
   never need to change.
   ============================================================ */

'use strict';

export const REPOSITORY_SCHEMA = 'body-entity-repository@1';

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
 * @property {(id: string, opts?: object) => RepositoryResult} getById
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
