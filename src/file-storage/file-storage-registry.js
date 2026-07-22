/* ============================================================
   FILE-STORAGE-REGISTRY.JS — File Storage Foundation (V2.1 -> V2.1.2)

   PURPOSE: the dedup ledger — one StoredFileRecord per unique sha256,
   mirroring knowledge/datasets/registry/dataset-registry.js's exact shape
   (register/get/has/list, idempotent per key, Map-backed). This is what
   makes "never upload identical files twice" real: file-storage-engine.js
   checks this registry BEFORE ever calling the Storage upload primitive.

   V2.1.2 — persisted the SAME way import-session-repository.js is (see
   that file's header for the full reasoning: lazy Firebase import so
   test scripts never touch it, debounced rehydration so a large batch's
   writes don't each trigger an O(N) full-ledger rebuild). The ledger
   surviving refresh/restart is what makes "never store identical files
   twice" hold ACROSS sessions, not just within one browser tab's
   lifetime — the actual point of Part H's "orphan protection".

   RESPONSIBILITY: register/get/has/list StoredFileRecords, plus
   linkSession() to record a reuse, plus initFileStorageSync().

   DEPENDENCIES: contracts/file-storage-contract.js (isStoredFileRecord),
   js/firebase.js (lazy, see above).
   ============================================================ */

'use strict';

import { isStoredFileRecord } from './contracts/file-storage-contract.js';

export const FILE_STORAGE_REGISTRY_ERRORS = Object.freeze({
  INVALID_RECORD: 'INVALID_RECORD',
  NOT_FOUND: 'NOT_FOUND',
});

/** @type {Map<string, object>} sha256 -> StoredFileRecord */
const _files = new Map();

/* ── V2.1.2 RTDB persistence (lazy, opt-in only — see header) ────────── */

const RTDB_PATH = 'v2_sarpras/file_storage';
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
  _changeListeners.forEach((cb) => { try { cb(); } catch (e) { console.error('[file-storage-registry] listener error', e); } });
}

function applyRemoteSnapshot(raw) {
  _files.clear();
  if (raw) {
    for (const [sha256, record] of Object.entries(raw)) {
      if (record && typeof record === 'object') _files.set(sha256, record);
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

export async function initFileStorageSync() {
  if (_syncStarted) return;
  _syncStarted = true;
  const { subscribeNode, storeFirebaseData, readNode } = await import('../../js/firebase.js');
  _remoteWrite = storeFirebaseData;
  const initial = await readNode(RTDB_PATH);
  if (initial.status === 'ok') applyRemoteSnapshot(initial.value);
  subscribeNode(RTDB_PATH, (snapshot) => {
    scheduleHydrate(snapshot.exists() ? snapshot.val() : null);
  }, { onError: (err) => console.error('[file-storage-registry] RTDB sync error:', err) });
}

function persistRemote(sha256) {
  if (!_remoteWrite) return;
  const record = _files.get(sha256);
  if (!record) return;
  _remoteWrite(`${RTDB_PATH}/${sha256}`, record).catch((err) => {
    console.error(`[file-storage-registry] RTDB write failed for "${sha256}":`, err);
  });
}

export function registerStoredFile(record) {
  if (!isStoredFileRecord(record)) {
    const err = new Error('registerStoredFile: record must satisfy the StoredFileRecord contract.');
    err.code = FILE_STORAGE_REGISTRY_ERRORS.INVALID_RECORD;
    throw err;
  }
  _files.set(record.sha256, record);
  persistRemote(record.sha256);
  return record;
}

export function getStoredFileBySha256(sha256) {
  return _files.get(sha256) || null;
}

export function hasStoredFile(sha256) {
  return _files.has(sha256);
}

export function listStoredFiles() {
  return Object.freeze([..._files.values()]);
}

/** Records that `importSessionId` referenced an already-stored file —
 *  never triggers a re-upload, just keeps the reuse trail honest. */
export function linkSessionToStoredFile(sha256, importSessionId) {
  const record = _files.get(sha256);
  if (!record) return null;
  if (record.linkedSessionIds.includes(importSessionId)) return record;
  const updated = Object.freeze({ ...record, linkedSessionIds: Object.freeze([...record.linkedSessionIds, importSessionId]) });
  _files.set(sha256, updated);
  persistRemote(sha256);
  return updated;
}

/** Test/teardown helper. Not used by any runtime path. */
export function resetFileStorageRegistry() {
  _files.clear();
  clearTimeout(_hydrateTimer);
  _pendingRawSnapshot = undefined;
}

/* ── V2.1.2 Part H — Storage Hardening ────────────────────────────── */

/**
 * "Every Storage Object must always belong to exactly one Import
 * Session" — a StoredFileRecord is orphaned if NONE of its
 * linkedSessionIds resolve to a real, still-existing session. Honestly
 * reports zero today (nothing in this milestone ever deletes a session),
 * but the real check exists rather than being assumed away.
 * @param {(id: string) => boolean} sessionExists - a real existence check, e.g. `(id) => getImportSession(id).ok`
 * @returns {import('./contracts/file-storage-contract.js').StoredFileRecord[]}
 */
export function findOrphanedStorageFiles(sessionExists) {
  return listStoredFiles().filter((record) => !record.linkedSessionIds.some((id) => sessionExists(id)));
}

/**
 * Confirms a session's own storagePath/sha256 actually resolve to a real
 * ledger entry — a real referential-integrity check, not assumed.
 * @param {{sha256: string|null, storagePath: string|null}} session
 * @returns {{ok: boolean, reason: string|null}}
 */
export function validateSessionStorageIntegrity(session) {
  if (!session.sha256 && !session.storagePath) return { ok: true, reason: null }; // never uploaded — nothing to validate
  if (!session.sha256) return { ok: false, reason: 'storagePath set without a sha256 reference.' };
  const record = getStoredFileBySha256(session.sha256);
  if (!record) return { ok: false, reason: `No StoredFileRecord found for sha256 "${session.sha256}".` };
  if (session.storagePath && record.storagePath !== session.storagePath) {
    return { ok: false, reason: `Session storagePath "${session.storagePath}" does not match the ledger's "${record.storagePath}".` };
  }
  return { ok: true, reason: null };
}
