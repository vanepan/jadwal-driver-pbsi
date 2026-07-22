/* ============================================================
   MEMORY-REPOSITORY.JS — Live Word Workspace Repository (V2, Phase 12.8.2)

   PURPOSE: a REAL, correct, non-durable reference implementation of the
   Workspace Repository contract — an in-memory Map, mirroring
   body/repository/implementations/memory-repository.js. Enforces
   append-only versioning (identity-contract.js's `nextVersion`, reused —
   see identity-contract.js in this same folder tree) and Workspace
   structural validity (isWorkspace()).

   RESPONSIBILITY: implement every Repository method with real Map-backed
   storage. `create()` always version 1; `appendVersion()` always
   version+1 — never an in-place overwrite.

   DEPENDENCIES: ../contracts/repository-contract.js,
   ../../contracts/workspace-contract.js,
   knowledge/contracts/identity-contract.js (nextVersion — the same
   precedented pure-leaf reuse body/ and recognition/ already established).

   NON-GOALS: does not persist across process restarts. No lifecycle
   transition to validate — a Workspace has no review state of its own
   (see workspace-contract.js's header).
   ============================================================ */

'use strict';

import { REPOSITORY_ERRORS, repositorySuccess, repositoryFailure } from '../contracts/repository-contract.js';
import { isWorkspace } from '../../contracts/workspace-contract.js';
import { nextVersion } from '../../../knowledge/contracts/identity-contract.js';

export const MEMORY_REPOSITORY_ID = 'memory';
export const MEMORY_REPOSITORY_VERSION = 'workspace-memory-repository@1';

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
    return latest ? repositorySuccess(latest) : repositoryFailure(REPOSITORY_ERRORS.NOT_FOUND, `No workspace with id "${id}".`);
  }

  function list(filter = {}) {
    let items = allLatest();
    if (filter.documentId) items = items.filter((w) => w.documentId === filter.documentId);
    if (filter.domainType) items = items.filter((w) => w.domainType === filter.domainType);
    if (filter.ownerId) items = items.filter((w) => w.ownerId === filter.ownerId);
    return repositorySuccess(items);
  }

  function create(item) {
    if (!item || typeof item.workspaceId !== 'string' || !item.workspaceId) {
      return repositoryFailure(REPOSITORY_ERRORS.INVALID_ITEM, 'create: item.workspaceId must be supplied by the caller.');
    }
    if (store.has(item.workspaceId)) {
      return repositoryFailure(REPOSITORY_ERRORS.DUPLICATE_ID, `A workspace with id "${item.workspaceId}" already exists — use appendVersion().`);
    }
    if (item.version !== 1) {
      return repositoryFailure(REPOSITORY_ERRORS.INVALID_ITEM, 'create: a new workspace must start at version 1.');
    }
    if (!isWorkspace(item)) {
      return repositoryFailure(REPOSITORY_ERRORS.INVALID_ITEM, 'create: item does not satisfy the Workspace contract.');
    }
    store.set(item.workspaceId, [Object.freeze({ ...item })]);
    return repositorySuccess(latestOf(item.workspaceId));
  }

  function appendVersion(id, patch) {
    const versions = store.get(id);
    if (!versions) return repositoryFailure(REPOSITORY_ERRORS.NOT_FOUND, `No workspace with id "${id}".`);
    const latest = versions[versions.length - 1];
    const merged = Object.freeze({
      ...latest, ...patch, workspaceId: id, version: nextVersion(latest.version), updatedAt: new Date().toISOString(),
    });
    if (!isWorkspace(merged)) {
      return repositoryFailure(REPOSITORY_ERRORS.INVALID_ITEM, 'appendVersion: resulting workspace does not satisfy the Workspace contract.');
    }
    store.set(id, [...versions, merged]);
    return repositorySuccess(merged);
  }

  function getHistory(id) {
    const versions = store.get(id);
    return versions ? repositorySuccess([...versions]) : repositoryFailure(REPOSITORY_ERRORS.NOT_FOUND, `No workspace with id "${id}".`);
  }

  function getMetrics() {
    const items = allLatest();
    const byDomainType = {};
    for (const w of items) byDomainType[w.domainType] = (byDomainType[w.domainType] || 0) + 1;
    return repositorySuccess({ totalWorkspaces: items.length, byDomainType });
  }

  return Object.freeze({
    id: MEMORY_REPOSITORY_ID,
    version: MEMORY_REPOSITORY_VERSION,
    getById, list, create, appendVersion, getHistory, getMetrics,
  });
}

/** A shared process-wide instance for convenience. */
export const memoryRepository = createMemoryRepository();

export default memoryRepository;
