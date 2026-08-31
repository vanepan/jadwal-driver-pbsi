/* ============================================================
   NOR-REGISTRY.JS — NOR Registry Foundation (V2, Phase 0)

   PURPOSE: THE canonical, module-independent registry of official NOR
   documents (PART 9). Every NOR generated anywhere in the application —
   Petty Cash today, Sarpras Intelligence tomorrow, any future module —
   is meant to be registered HERE, and to obtain/validate its number
   through HERE (PART 11). No module mints NOR numbers independently.

       Petty Cash ─┐
   Sarpras Intel ──┼──▶  NOR Registry  ──▶  active backend (Null in Phase 0)
   Future module ──┘         │
                             └── suggestNextNumber()  (advisory, from
                                 organizational-memory/numbering-engine.js)

   RESPONSIBILITY: pure delegation to the active backend
   (contracts/registry-contract.js), PLUS Registry Events (a process-wide
   listener registry mirroring src/knowledge/repository/knowledge-repository.js
   and js/petty-cash/petty-cash-store.js's notify pattern), PLUS the
   re-exported number-suggestion authority.

   DEPENDENCIES: intelligence/nor-registry/contracts/{registry,nor-record,
   nor-numbering}-contract.js, intelligence/nor-registry/backends/
   null-nor-registry-backend.js.

   NON-GOALS: does not itself persist, number, or render anything. Phase 0
   ships the Null backend only, so every write returns NOT_IMPLEMENTED.
   Does NOT rewire Petty Cash's existing NOR flow — that is a later,
   deliberate migration (PART 11).

   FUTURE EVOLUTION: a real Firebase/RTDB backend is registered and made
   active with setActiveBackend(); Petty Cash's generateNor() and the
   Sarpras Intelligence publish step both call register()/publish() here;
   callers never change when the backend does.
   ============================================================ */

'use strict';

import {
  NOR_REGISTRY_ERRORS,
  registryFailure,
  isNorRegistryBackend,
  NOR_REGISTRY_CONTRACT,
} from './contracts/registry-contract.js';
import { nullNorRegistryBackend, NULL_NOR_REGISTRY_BACKEND_ID } from './backends/null-nor-registry-backend.js';
import { suggestNextNumber, makeNumberAllocation, reserveNumber, NUMBERING_OWNER } from './contracts/nor-numbering-contract.js';

export { NOR_REGISTRY_ERRORS, NOR_REGISTRY_CONTRACT, NOR_REGISTRY_SCHEMA } from './contracts/registry-contract.js';
export { suggestNextNumber, makeNumberAllocation, reserveNumber, NUMBERING_OWNER } from './contracts/nor-numbering-contract.js';
export {
  NOR_STATUS,
  NOR_STATUS_GRAPH,
  canNorTransition,
  NUMBER_SOURCE,
  NOR_SOURCE_MODULE,
  registerNorSourceModule,
  listNorSourceModules,
  makeNorRecord,
  isNorRecord,
} from './contracts/nor-record-contract.js';

/* ── backend registry — Null is the default and the reset target ───────── */

const _backends = new Map();
let _activeBackendId = null;

export const DEFAULT_BACKEND_ID = NULL_NOR_REGISTRY_BACKEND_ID;

export function registerBackend(backend) {
  if (!isNorRegistryBackend(backend)) {
    const err = new Error('registerBackend: backend must satisfy the NOR_REGISTRY_CONTRACT method set.');
    err.code = 'INVALID_BACKEND';
    throw err;
  }
  _backends.set(backend.id, backend);
  if (_activeBackendId === null) _activeBackendId = backend.id;
  return backend;
}

export function setActiveBackend(id) {
  if (!_backends.has(id)) {
    const err = new Error(`setActiveBackend: no backend registered under "${id}".`);
    err.code = 'UNKNOWN_BACKEND';
    throw err;
  }
  _activeBackendId = id;
  return _backends.get(id);
}

export function getActiveBackendId() {
  return _activeBackendId;
}

export function listBackends() {
  return Object.freeze([..._backends.values()].map((b) => Object.freeze({
    id: b.id, version: b.version, active: b.id === _activeBackendId,
  })));
}

/** Test/teardown helper — restore just the Null backend, active. */
export function resetNorRegistry() {
  _backends.clear();
  _activeBackendId = null;
  registerBackend(nullNorRegistryBackend);
  setActiveBackend(DEFAULT_BACKEND_ID);
  _listeners.length = 0;
}

function active(method, ...args) {
  const backend = _backends.get(_activeBackendId);
  if (!backend) return registryFailure(NOR_REGISTRY_ERRORS.NO_BACKEND_CONFIGURED, `No active NOR Registry backend (method: ${method}).`);
  return backend[method](...args);
}

/* ── Registry Events (mirrors knowledge-repository.js) ─────────────────── */

/** @type {Function[]} */
const _listeners = [];

export function registerRegistryListener(cb) {
  if (typeof cb === 'function') _listeners.push(cb);
}

export function unregisterRegistryListener(cb) {
  const i = _listeners.indexOf(cb);
  if (i !== -1) _listeners.splice(i, 1);
}

export const REGISTRY_EVENT = Object.freeze({
  REGISTERED: 'nor.registered',
  VERSION_APPENDED: 'nor.version_appended',
  PUBLISHED: 'nor.published',
});

function notify(type, record) {
  const event = Object.freeze({
    type,
    at: new Date().toISOString(),
    norId: record && record.norId ? record.norId : null,
    status: record && record.status ? record.status : null,
    version: record && record.currentVersion ? record.currentVersion : null,
  });
  for (const cb of _listeners) cb(event);
}

/* ── facade methods ──────────────────────────────────────────────────── */

/** Register a NEW NorRecord. Callers build one via makeNorRecord(). */
export function register(record) {
  const result = active('register', record);
  if (result.ok) notify(REGISTRY_EVENT.REGISTERED, result.data);
  return result;
}

export const getById = (norId) => active('getById', norId);
export const list = (filter) => active('list', filter);

/** Edit a NOR = append a new version, never an overwrite (PART 13). */
export function appendVersion(norId, patch, note) {
  const result = active('appendVersion', norId, patch, note);
  if (result.ok) notify(REGISTRY_EVENT.VERSION_APPENDED, result.data);
  return result;
}

/**
 * Publish a NOR: set its official number + publishedVersion + status.
 * `opts.publishedNumber` is the final issued number (from a human, a
 * suggestion, or — later — reserveNumber()). Phase 0: NOT_IMPLEMENTED.
 */
export function publish(norId, opts = {}) {
  const result = active('publish', norId, opts);
  if (result.ok) notify(REGISTRY_EVENT.PUBLISHED, result.data);
  return result;
}

export const getHistory = (norId) => active('getHistory', norId);

/* ── bootstrap ──────────────────────────────────────────────────────── */
registerBackend(nullNorRegistryBackend);
setActiveBackend(DEFAULT_BACKEND_ID);
