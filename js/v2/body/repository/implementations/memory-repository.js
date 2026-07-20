/* ============================================================
   MEMORY-REPOSITORY.JS — Body Intelligence Entity Repository (V2, Phase 12.5.2)

   PURPOSE: a REAL, correct, non-durable reference implementation of the
   Entity Repository contract — an in-memory Map, mirroring
   knowledge/repository/implementations/memory-repository.js. Enforces
   append-only versioning (identity-contract.js's `nextVersion`) and Entity
   structural validity (isEntity()) — there is no lifecycle transition to
   validate, unlike Knowledge's Memory repository, because Entity has no
   lifecycle graph (see contracts/entity-state-contract.js's header).

   RESPONSIBILITY: implement every Repository method with real Map-backed
   storage. `create()` always version 1; `appendVersion()` always
   version+1 — never an in-place overwrite.

   DEPENDENCIES: repository/contracts/repository-contract.js,
   contracts/{entity,identity}-contract.js.

   NON-GOALS: does not persist across process restarts. Does not enforce
   any state-transition rule — an Entity's `observedState` may legally
   differ from one version to the next in any direction; that is the
   entire point of an observed, ungated projection.

   FUTURE EVOLUTION: a Firebase-backed repository would need to satisfy
   the exact same contract; this file is the reference it can be checked
   against.
   ============================================================ */

'use strict';

import { REPOSITORY_ERRORS, repositorySuccess, repositoryFailure } from '../contracts/repository-contract.js';
import { isEntity } from '../../contracts/entity-contract.js';
import { nextVersion } from '../../contracts/identity-contract.js';

export const MEMORY_REPOSITORY_ID = 'memory';
export const MEMORY_REPOSITORY_VERSION = 'body-memory-repository@1';

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
    return latest ? repositorySuccess(latest) : repositoryFailure(REPOSITORY_ERRORS.NOT_FOUND, `No entity with id "${id}".`);
  }

  function getVersion(id, version) {
    const versions = store.get(id);
    if (!versions) return repositoryFailure(REPOSITORY_ERRORS.NOT_FOUND, `No entity with id "${id}".`);
    const match = versions.find((v) => v.version === version);
    return match ? repositorySuccess(match) : repositoryFailure(REPOSITORY_ERRORS.NOT_FOUND, `No version ${version} of "${id}".`);
  }

  function list(filter = {}) {
    let items = allLatest();
    if (filter.entityType) items = items.filter((e) => e.entityType === filter.entityType);
    if (filter.observedState) items = items.filter((e) => e.observedState === filter.observedState);
    if (filter.visibility) items = items.filter((e) => e.visibility === filter.visibility);
    return repositorySuccess(items);
  }

  function create(item) {
    if (!item || typeof item.id !== 'string' || !item.id) {
      return repositoryFailure(REPOSITORY_ERRORS.INVALID_ITEM, 'create: item.id must be supplied by the caller.');
    }
    if (store.has(item.id)) {
      return repositoryFailure(REPOSITORY_ERRORS.DUPLICATE_ID, `An entity with id "${item.id}" already exists — use appendVersion().`);
    }
    if (item.version !== 1) {
      return repositoryFailure(REPOSITORY_ERRORS.INVALID_ITEM, 'create: a new entity must start at version 1.');
    }
    if (!isEntity(item)) {
      return repositoryFailure(REPOSITORY_ERRORS.INVALID_ITEM, 'create: item does not satisfy the Entity contract.');
    }
    store.set(item.id, [Object.freeze({ ...item })]);
    return repositorySuccess(latestOf(item.id));
  }

  function appendVersion(id, patch) {
    const versions = store.get(id);
    if (!versions) return repositoryFailure(REPOSITORY_ERRORS.NOT_FOUND, `No entity with id "${id}".`);
    const latest = versions[versions.length - 1];
    const merged = Object.freeze({
      ...latest,
      ...patch,
      id,
      version: nextVersion(latest.version),
      versionCount: latest.versionCount + 1,
      updatedAt: new Date().toISOString(),
    });
    if (!isEntity(merged)) {
      return repositoryFailure(REPOSITORY_ERRORS.INVALID_ITEM, 'appendVersion: resulting entity does not satisfy the Entity contract.');
    }
    store.set(id, [...versions, merged]);
    return repositorySuccess(merged);
  }

  function getHistory(id) {
    const versions = store.get(id);
    return versions ? repositorySuccess([...versions]) : repositoryFailure(REPOSITORY_ERRORS.NOT_FOUND, `No entity with id "${id}".`);
  }

  function getMetrics() {
    const items = allLatest();
    const byEntityType = {};
    const byObservedState = {};
    for (const e of items) {
      byEntityType[e.entityType] = (byEntityType[e.entityType] || 0) + 1;
      byObservedState[e.observedState] = (byObservedState[e.observedState] || 0) + 1;
    }
    return repositorySuccess({ totalEntities: items.length, byEntityType, byObservedState });
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
