/* ============================================================
   IMPORT-SESSION-REPOSITORY.JS — Knowledge Acquisition Operational Readiness (V2.1 -> V2.1.2)

   PURPOSE: the version-safe Import Session store — a real, Map-backed,
   append-only store, mirroring organizational-memory/repository/
   archive-repository.js's exact proven shape (create() always version 1;
   appendVersion() always version+1, never an in-place overwrite;
   local success()/failure() envelope).

   V2.1.2 — PERSISTENT IMPORT SESSIONS: "frontend must never be the source
   of truth" is satisfied WITHOUT rewriting this file's synchronous public
   API (every existing caller across import-session-engine.js and
   dataset-import-center.js keeps working unchanged). The in-memory Map
   becomes a CACHE, not the source of truth: Firebase Realtime Database
   (v2_sarpras/import_sessions) is the real backend. `create`/
   `appendVersion` optimistically update the cache (as before) AND fire a
   background, surgical, single-node RTDB write (js/firebase.js's
   `storeFirebaseData` — reused unchanged, same "one node, never a full-
   collection overwrite" pattern `saveOneAssignment` already established).
   `initImportSessionSync()` is the ONE opt-in entry point (called once,
   from sarpras-intelligence-center.js's mount) that subscribes to remote
   changes and re-hydrates the cache — this is what actually restores
   state after a browser refresh/restart.

   LAZY FIREBASE IMPORT (same discipline file-storage-engine.js's own
   header already documents): `js/firebase.js` does a top-level
   `import ... from 'https://...'` that Node's default ESM loader cannot
   resolve, AND every existing caller of this file (25+ Node check
   scripts) must keep working with ZERO Firebase touch. So the RTDB
   primitives are dynamically `import()`-ed ONLY inside
   initImportSessionSync() — a script that never calls it (which is every
   test script today) never loads Firebase and never risks a production
   write, by construction.

   DEBOUNCED REHYDRATION: RTDB's `onValue` re-delivers the ENTIRE
   subscribed subtree on every single child write, not an incremental
   diff. A large batch (Part P: "prevent UI freezing... 5000 file
   batches") firing thousands of individual session writes would
   otherwise trigger thousands of full-collection cache rebuilds — real
   O(N^2)-shaped work. Debounced (250ms) instead: the writing tab's own
   UI already reflects its write immediately via the synchronous local
   cache update, so the debounced remote echo only matters for restoring
   state after a fresh page load or picking up another tab's writes —
   neither needs sub-250ms latency.

   RESPONSIBILITY: create/appendVersion/getById/getVersion/getHistory/list/
   resetImportSessionRepository/initImportSessionSync.

   DEPENDENCIES: knowledge/contracts/identity-contract.js (nextVersion,
   reused not reimplemented), ../contracts/import-session-contract.js
   (isImportSessionRecord, canTransitionImportSession), js/firebase.js
   (lazy, see above).
   ============================================================ */

'use strict';

import { nextVersion } from '../../../contracts/identity-contract.js';
import { isImportSessionRecord, canTransitionImportSession } from '../contracts/import-session-contract.js';

export const IMPORT_SESSION_REPOSITORY_ERRORS = Object.freeze({
  NOT_FOUND: 'NOT_FOUND',
  DUPLICATE_ID: 'DUPLICATE_ID',
  INVALID_RECORD: 'INVALID_RECORD',
  ILLEGAL_TRANSITION: 'ILLEGAL_TRANSITION',
});

function success(data) { return Object.freeze({ ok: true, data: data ?? null, error: null }); }
function failure(code, message) { return Object.freeze({ ok: false, data: null, error: Object.freeze({ code, message }) }); }

/** @type {Map<string, object[]>} id -> ordered version array, oldest first */
const _store = new Map();

/* ── V2.1.2 RTDB persistence (lazy, opt-in only) ──────────────────── */

const RTDB_PATH = 'v2_sarpras/import_sessions';
const HYDRATE_DEBOUNCE_MS = 250;

let _remoteWrite = null;       // (path, value) => Promise, set once sync is initialized
let _syncStarted = false;
let _hydrateTimer = null;
let _pendingRawSnapshot = undefined;

function applyRemoteSnapshot(raw) {
  _store.clear();
  if (!raw) return;
  for (const [id, versions] of Object.entries(raw)) {
    if (Array.isArray(versions) && versions.length) _store.set(id, versions);
  }
}

function scheduleHydrate(raw) {
  _pendingRawSnapshot = raw;
  clearTimeout(_hydrateTimer);
  _hydrateTimer = setTimeout(() => {
    applyRemoteSnapshot(_pendingRawSnapshot);
    _pendingRawSnapshot = undefined;
  }, HYDRATE_DEBOUNCE_MS);
}

/**
 * Opt-in: subscribes to the real RTDB backend and starts background-
 * writing every future create()/appendVersion(). Idempotent — safe to
 * call more than once. Never called by any test script (see header).
 */
export async function initImportSessionSync() {
  if (_syncStarted) return;
  _syncStarted = true;
  const { subscribeNode, storeFirebaseData, readNode } = await import('../../../../../firebase.js');
  _remoteWrite = storeFirebaseData;
  // Immediate one-shot read so the FIRST render after a fresh page load
  // already reflects real state, not waiting out the debounce window.
  const initial = await readNode(RTDB_PATH);
  if (initial.status === 'ok') applyRemoteSnapshot(initial.value);
  subscribeNode(RTDB_PATH, (snapshot) => {
    scheduleHydrate(snapshot.exists() ? snapshot.val() : null);
  }, { onError: (err) => console.error('[import-session-repository] RTDB sync error:', err) });
}

function persistRemote(id) {
  if (!_remoteWrite) return;
  const versions = _store.get(id);
  if (!versions) return;
  _remoteWrite(`${RTDB_PATH}/${id}`, versions).catch((err) => {
    console.error(`[import-session-repository] RTDB write failed for "${id}":`, err);
  });
}

function latestOf(id) {
  const versions = _store.get(id);
  return versions && versions.length ? versions[versions.length - 1] : null;
}

function allLatest() {
  return [..._store.values()].map((versions) => versions[versions.length - 1]);
}

export function getById(id) {
  const latest = latestOf(id);
  return latest ? success(latest) : failure(IMPORT_SESSION_REPOSITORY_ERRORS.NOT_FOUND, `No import session with id "${id}".`);
}

export function getVersion(id, version) {
  const versions = _store.get(id);
  if (!versions) return failure(IMPORT_SESSION_REPOSITORY_ERRORS.NOT_FOUND, `No import session with id "${id}".`);
  const match = versions.find((v) => v.version === version);
  return match ? success(match) : failure(IMPORT_SESSION_REPOSITORY_ERRORS.NOT_FOUND, `No version ${version} of "${id}".`);
}

export function list(filter = {}) {
  let items = allLatest();
  if (filter.domainType) items = items.filter((i) => i.domainType === filter.domainType);
  if (filter.state) items = items.filter((i) => i.state === filter.state);
  if (filter.datasetType) items = items.filter((i) => i.datasetType === filter.datasetType);
  return success(items);
}

export function create(record) {
  if (!record || typeof record.id !== 'string' || !record.id) {
    return failure(IMPORT_SESSION_REPOSITORY_ERRORS.INVALID_RECORD, 'create: record.id must be supplied by the caller.');
  }
  if (_store.has(record.id)) {
    return failure(IMPORT_SESSION_REPOSITORY_ERRORS.DUPLICATE_ID, `An import session with id "${record.id}" already exists — use appendVersion().`);
  }
  if (record.version !== 1) {
    return failure(IMPORT_SESSION_REPOSITORY_ERRORS.INVALID_RECORD, 'create: a new import session must start at version 1.');
  }
  if (!isImportSessionRecord(record)) {
    return failure(IMPORT_SESSION_REPOSITORY_ERRORS.INVALID_RECORD, 'create: record does not satisfy the ImportSessionRecord contract.');
  }
  _store.set(record.id, [Object.freeze({ ...record })]);
  persistRemote(record.id);
  return success(latestOf(record.id));
}

/** If `patch.state` is present, enforces canTransitionImportSession(latest.state, patch.state)
 *  before writing — no caller may silently skip a state, mirroring
 *  memory-repository.js's own append-only + legality-checked shape. */
export function appendVersion(id, patch) {
  const versions = _store.get(id);
  if (!versions) return failure(IMPORT_SESSION_REPOSITORY_ERRORS.NOT_FOUND, `No import session with id "${id}".`);
  const latest = versions[versions.length - 1];
  if (patch && typeof patch.state === 'string' && patch.state !== latest.state
    && !canTransitionImportSession(latest.state, patch.state)) {
    return failure(IMPORT_SESSION_REPOSITORY_ERRORS.ILLEGAL_TRANSITION, `Cannot transition import session "${id}" from "${latest.state}" to "${patch.state}".`);
  }
  const merged = Object.freeze({ ...latest, ...patch, id, version: nextVersion(latest.version), updatedAt: new Date().toISOString() });
  if (!isImportSessionRecord(merged)) {
    return failure(IMPORT_SESSION_REPOSITORY_ERRORS.INVALID_RECORD, 'appendVersion: resulting record does not satisfy the ImportSessionRecord contract.');
  }
  _store.set(id, [...versions, merged]);
  persistRemote(id);
  return success(merged);
}

export function getHistory(id) {
  const versions = _store.get(id);
  return versions ? success([...versions]) : failure(IMPORT_SESSION_REPOSITORY_ERRORS.NOT_FOUND, `No import session with id "${id}".`);
}

/** Test/teardown helper. Not used by any runtime path. Clears the cache
 *  only — deliberately does NOT reset sync state (_syncStarted/
 *  _remoteWrite), since no test script ever calls initImportSessionSync()
 *  in the first place; resetting mid-sync would just orphan the live
 *  subscription. */
export function resetImportSessionRepository() {
  _store.clear();
  clearTimeout(_hydrateTimer);
  _pendingRawSnapshot = undefined;
}
