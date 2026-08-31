/* ============================================================
   REGISTRY-CONTRACT.JS — NOR Registry Foundation (V2, Phase 0)

   PURPOSE: fix the ONE interface every NOR Registry backend implements
   (Null now; a real Firebase/RTDB backend later), plus the RegistryResult
   envelope — mirroring src/knowledge/repository/contracts/repository-contract.js
   so swapping the store is a registry selection, not a caller-code change.

   RESPONSIBILITY: NOR_REGISTRY_SCHEMA, NOR_REGISTRY_ERRORS,
   registrySuccess / registryFailure, NOR_REGISTRY_CONTRACT (method list as
   data), isNorRegistryBackend.

   DEPENDENCIES: none.

   NON-GOALS: no backend is implemented here; no method is called by this
   file.

   FUTURE EVOLUTION: a real backend implements this exact interface; callers
   written against nor-registry.js never change.
   ============================================================ */

'use strict';

export const NOR_REGISTRY_SCHEMA = 'nor-registry@1';

export const NOR_REGISTRY_ERRORS = Object.freeze({
  NO_BACKEND_CONFIGURED: 'NO_BACKEND_CONFIGURED',
  NOT_FOUND: 'NOT_FOUND',
  DUPLICATE_ID: 'DUPLICATE_ID',
  DUPLICATE_NUMBER: 'DUPLICATE_NUMBER',
  INVALID_RECORD: 'INVALID_RECORD',
  ILLEGAL_TRANSITION: 'ILLEGAL_TRANSITION',
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
});

/**
 * @typedef {Object} RegistryResult
 * @property {boolean} ok
 * @property {*} data
 * @property {{code: string, message: string}|null} error
 */

export function registrySuccess(data) {
  return Object.freeze({ ok: true, data: data ?? null, error: null });
}

export function registryFailure(code, message) {
  return Object.freeze({ ok: false, data: null, error: Object.freeze({ code, message: String(message || '') }) });
}

/**
 * @typedef {Object} NorRegistryBackend
 * @property {string} id
 * @property {string} version
 * @property {(record: object) => RegistryResult} register        - Write a NEW NorRecord
 * @property {(norId: string) => RegistryResult} getById          - Read
 * @property {(filter?: object) => RegistryResult} list           - Read
 * @property {(norId: string, patch: object, note?: string) => RegistryResult} appendVersion - Edit = new version
 * @property {(norId: string, opts: object) => RegistryResult} publish - Mark published + set number/publishedVersion
 * @property {(norId: string) => RegistryResult} getHistory       - Version history
 */

export const NOR_REGISTRY_CONTRACT = Object.freeze({
  schema: NOR_REGISTRY_SCHEMA,
  methods: Object.freeze(['register', 'getById', 'list', 'appendVersion', 'publish', 'getHistory']),
  errorCodes: NOR_REGISTRY_ERRORS,
});

/** Structural check that an object satisfies the backend contract. */
export function isNorRegistryBackend(b) {
  if (!b || typeof b !== 'object') return false;
  if (typeof b.id !== 'string' || !b.id) return false;
  if (typeof b.version !== 'string' || !b.version) return false;
  return NOR_REGISTRY_CONTRACT.methods.every((m) => typeof b[m] === 'function');
}
