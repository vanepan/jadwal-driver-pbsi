/* ============================================================
   MEMORY-REPOSITORY.JS — Recognition Foundation Repository (Phase 12.7.1)

   PURPOSE: a REAL, correct, non-durable reference implementation of the
   Recognition Record Repository contract — an in-memory Map, mirroring
   body/repository/implementations/memory-repository.js (itself mirroring
   knowledge/repository/implementations/memory-repository.js). Enforces
   append-only versioning (identity-contract.js's `nextVersion`, reused —
   not reimplemented, the same precedented pure-leaf reuse body/ and
   organizational-memory/ already established) and RecognitionRecord
   structural validity (isRecognitionRecord()).

   RESPONSIBILITY: implement every Repository method with real Map-backed
   storage. `create()` always version 1; `appendVersion()` always
   version+1 — never an in-place overwrite.

   DEPENDENCIES: ../contracts/repository-contract.js,
   ../../contracts/recognition-record-contract.js,
   knowledge/contracts/identity-contract.js (nextVersion — reused).

   NON-GOALS: does not persist across process restarts. Does not enforce
   any lifecycle-transition rule — Recognition has no lifecycle/ directory
   (see recognition/repository/contracts/repository-contract.js's header).

   FUTURE EVOLUTION: a future Firebase-backed repository would need to
   satisfy the exact same contract; this file is the reference it can be
   checked against.
   ============================================================ */

'use strict';

import { REPOSITORY_ERRORS, repositorySuccess, repositoryFailure } from '../contracts/repository-contract.js';
import { isRecognitionRecord } from '../../contracts/recognition-record-contract.js';
import { nextVersion } from '../../../knowledge/contracts/identity-contract.js';

export const MEMORY_REPOSITORY_ID = 'memory';
export const MEMORY_REPOSITORY_VERSION = 'recognition-memory-repository@1';

/** Factory so tests/consumers can hold independent, isolated instances. */
export function createMemoryRepository() {
  /** @type {Map<string, object[]>} id -> ordered version array, oldest first */
  const store = new Map();

  function latestOf(id) {
    const versions = store.get(id);
    return versions && versions.length ? versions[versions.length - 1] : null;
  }

  function allLatest() {
    return [...store.values()].map((versions) => versions[versions.length - 1]);
  }

  function getById(id) {
    const latest = latestOf(id);
    return latest ? repositorySuccess(latest) : repositoryFailure(REPOSITORY_ERRORS.NOT_FOUND, `No recognition record with id "${id}".`);
  }

  function getVersion(id, version) {
    const versions = store.get(id);
    if (!versions) return repositoryFailure(REPOSITORY_ERRORS.NOT_FOUND, `No recognition record with id "${id}".`);
    const match = versions.find((v) => v.version === version);
    return match ? repositorySuccess(match) : repositoryFailure(REPOSITORY_ERRORS.NOT_FOUND, `No version ${version} of "${id}".`);
  }

  function list(filter = {}) {
    let items = allLatest();
    if (filter.recordType) items = items.filter((r) => r.recordType === filter.recordType);
    if (filter.domainType) items = items.filter((r) => r.scope && r.scope.domainType === filter.domainType);
    return repositorySuccess(items);
  }

  function create(item) {
    if (!item || typeof item.id !== 'string' || !item.id) {
      return repositoryFailure(REPOSITORY_ERRORS.INVALID_ITEM, 'create: item.id must be supplied by the caller.');
    }
    if (store.has(item.id)) {
      return repositoryFailure(REPOSITORY_ERRORS.DUPLICATE_ID, `A recognition record with id "${item.id}" already exists — use appendVersion().`);
    }
    if (item.version !== 1) {
      return repositoryFailure(REPOSITORY_ERRORS.INVALID_ITEM, 'create: a new recognition record must start at version 1.');
    }
    if (!isRecognitionRecord(item)) {
      return repositoryFailure(REPOSITORY_ERRORS.INVALID_ITEM, 'create: item does not satisfy the RecognitionRecord contract.');
    }
    store.set(item.id, [Object.freeze({ ...item })]);
    return repositorySuccess(latestOf(item.id));
  }

  function appendVersion(id, patch) {
    const versions = store.get(id);
    if (!versions) return repositoryFailure(REPOSITORY_ERRORS.NOT_FOUND, `No recognition record with id "${id}".`);
    const latest = versions[versions.length - 1];
    const merged = Object.freeze({
      ...latest, ...patch, id, version: nextVersion(latest.version), updatedAt: new Date().toISOString(),
    });
    if (!isRecognitionRecord(merged)) {
      return repositoryFailure(REPOSITORY_ERRORS.INVALID_ITEM, 'appendVersion: resulting record does not satisfy the RecognitionRecord contract.');
    }
    store.set(id, [...versions, merged]);
    return repositorySuccess(merged);
  }

  function getHistory(id) {
    const versions = store.get(id);
    return versions ? repositorySuccess([...versions]) : repositoryFailure(REPOSITORY_ERRORS.NOT_FOUND, `No recognition record with id "${id}".`);
  }

  function getMetrics() {
    const items = allLatest();
    const byRecordType = {};
    for (const r of items) byRecordType[r.recordType] = (byRecordType[r.recordType] || 0) + 1;
    return repositorySuccess({ totalRecords: items.length, byRecordType });
  }

  return Object.freeze({
    id: MEMORY_REPOSITORY_ID,
    version: MEMORY_REPOSITORY_VERSION,
    getById, getVersion, list, create, appendVersion, getHistory, getMetrics,
  });
}

/** A shared process-wide instance for convenience. */
export const memoryRepository = createMemoryRepository();

export default memoryRepository;
