/* ============================================================
   IMPORT-BATCH-REPOSITORY.JS — Batch History Foundation (V2.1.2)

   PURPOSE: the version-safe Import Batch store — same Map-backed,
   append-only, RTDB-persisted shape as import-session-repository.js (see
   that file's header for the full lazy-Firebase-import + debounced-
   rehydration reasoning, reused identically here, not re-derived).

   RESPONSIBILITY: create/appendVersion/getById/getHistory/list/
   resetImportBatchRepository/initImportBatchSync.

   DEPENDENCIES: knowledge/contracts/identity-contract.js (nextVersion),
   ../contracts/import-batch-contract.js (isImportBatchRecord),
   js/firebase.js (lazy).

   NON-GOALS: unlike Import Session, Batch status has no strict
   transition graph — it is operational bookkeeping (Pause/Resume/Cancel/
   Complete), not a trust-sensitive human-gated curation lifecycle, so no
   canTransition guard is enforced here.
   ============================================================ */

'use strict';

import { nextVersion } from '../../../contracts/identity-contract.js';
import { isImportBatchRecord, normalizeImportBatchRecord } from '../contracts/import-batch-contract.js';

export const IMPORT_BATCH_REPOSITORY_ERRORS = Object.freeze({
  NOT_FOUND: 'NOT_FOUND',
  DUPLICATE_ID: 'DUPLICATE_ID',
  INVALID_RECORD: 'INVALID_RECORD',
});

function success(data) { return Object.freeze({ ok: true, data: data ?? null, error: null }); }
function failure(code, message) { return Object.freeze({ ok: false, data: null, error: Object.freeze({ code, message }) }); }

/** @type {Map<string, object[]>} id -> ordered version array, oldest first */
const _store = new Map();

function latestOf(id) {
  const versions = _store.get(id);
  return versions && versions.length ? versions[versions.length - 1] : null;
}

function allLatest() {
  return [..._store.values()].map((versions) => versions[versions.length - 1]);
}

/* ── V2.1.2 RTDB persistence (lazy, opt-in only) ──────────────────── */

const RTDB_PATH = 'v2_sarpras/import_batches';
const HYDRATE_DEBOUNCE_MS = 250;

let _remoteWrite = null;
let _syncStarted = false;
let _hydrateTimer = null;
let _pendingRawSnapshot = undefined;

// Cross-tab live wiring — see import-session-repository.js's identical
// comment for why notify() only fires from applyRemoteSnapshot().
const _changeListeners = [];
export function registerChangeListener(cb) { if (typeof cb === 'function') _changeListeners.push(cb); }
function notifyChange() {
  _changeListeners.forEach((cb) => { try { cb(); } catch (e) { console.error('[import-batch-repository] listener error', e); } });
}

/** Phase 2.6 — THE cancellation fix. RTDB drops `sessionIds: []` and
 *  `finishedAt: null` entirely, so a rehydrated batch fails
 *  isImportBatchRecord()'s `Array.isArray(r.sessionIds)` check on the NEXT
 *  appendVersion() — which is why cancelBatch() silently wrote nothing after
 *  a refresh. Normalizing here, at the one boundary a remote record enters
 *  the cache, restores the declared shape before anything reads or merges it.
 *  See ../contracts/import-batch-contract.js#normalizeImportBatchRecord. */
function applyRemoteSnapshot(raw) {
  _store.clear();
  if (raw) {
    for (const [id, versions] of Object.entries(raw)) {
      if (Array.isArray(versions) && versions.length) {
        _store.set(id, versions.map((v) => Object.freeze(normalizeImportBatchRecord(v))));
      }
    }
  }
  notifyChange();
}

function scheduleHydrate(raw) {
  _pendingRawSnapshot = raw;
  clearTimeout(_hydrateTimer);
  _hydrateTimer = setTimeout(() => {
    applyRemoteSnapshot(_pendingRawSnapshot);
    _pendingRawSnapshot = undefined;
  }, HYDRATE_DEBOUNCE_MS);
}

export async function initImportBatchSync() {
  if (_syncStarted) return;
  _syncStarted = true;
  const { subscribeNode, storeFirebaseData, readNode } = await import('../../../../../firebase.js');
  _remoteWrite = storeFirebaseData;
  const initial = await readNode(RTDB_PATH);
  if (initial.status === 'ok') applyRemoteSnapshot(initial.value);
  subscribeNode(RTDB_PATH, (snapshot) => {
    scheduleHydrate(snapshot.exists() ? snapshot.val() : null);
  }, { onError: (err) => console.error('[import-batch-repository] RTDB sync error:', err) });
}

function persistRemote(id) {
  if (!_remoteWrite) return;
  const versions = _store.get(id);
  if (!versions) return;
  _remoteWrite(`${RTDB_PATH}/${id}`, versions).catch((err) => {
    console.error(`[import-batch-repository] RTDB write failed for "${id}":`, err);
  });
}

/* ── CRUD ─────────────────────────────────────────────────────────── */

export function getById(id) {
  const latest = latestOf(id);
  return latest ? success(latest) : failure(IMPORT_BATCH_REPOSITORY_ERRORS.NOT_FOUND, `No import batch with id "${id}".`);
}

export function list(filter = {}) {
  let items = allLatest();
  if (filter.status) items = items.filter((i) => i.status === filter.status);
  if (filter.domainType) items = items.filter((i) => i.domainType === filter.domainType);
  return success(items.sort((a, b) => b.startedAt.localeCompare(a.startedAt)));
}

export function create(record) {
  if (!record || typeof record.id !== 'string' || !record.id) {
    return failure(IMPORT_BATCH_REPOSITORY_ERRORS.INVALID_RECORD, 'create: record.id must be supplied by the caller.');
  }
  if (_store.has(record.id)) {
    return failure(IMPORT_BATCH_REPOSITORY_ERRORS.DUPLICATE_ID, `An import batch with id "${record.id}" already exists — use appendVersion().`);
  }
  if (record.version !== 1) {
    return failure(IMPORT_BATCH_REPOSITORY_ERRORS.INVALID_RECORD, 'create: a new import batch must start at version 1.');
  }
  if (!isImportBatchRecord(record)) {
    return failure(IMPORT_BATCH_REPOSITORY_ERRORS.INVALID_RECORD, 'create: record does not satisfy the ImportBatchRecord contract.');
  }
  _store.set(record.id, [Object.freeze({ ...record })]);
  persistRemote(record.id);
  return success(latestOf(record.id));
}

export function appendVersion(id, patch) {
  const versions = _store.get(id);
  if (!versions) return failure(IMPORT_BATCH_REPOSITORY_ERRORS.NOT_FOUND, `No import batch with id "${id}".`);
  const latest = versions[versions.length - 1];
  const merged = Object.freeze({ ...latest, ...patch, id, version: nextVersion(latest.version), updatedAt: new Date().toISOString() });
  if (!isImportBatchRecord(merged)) {
    return failure(IMPORT_BATCH_REPOSITORY_ERRORS.INVALID_RECORD, 'appendVersion: resulting record does not satisfy the ImportBatchRecord contract.');
  }
  _store.set(id, [...versions, merged]);
  persistRemote(id);
  return success(merged);
}

export function getHistory(id) {
  const versions = _store.get(id);
  return versions ? success([...versions]) : failure(IMPORT_BATCH_REPOSITORY_ERRORS.NOT_FOUND, `No import batch with id "${id}".`);
}

/** Test/teardown helper. Not used by any runtime path. */
export function resetImportBatchRepository() {
  _store.clear();
  clearTimeout(_hydrateTimer);
  _pendingRawSnapshot = undefined;
}
