/* ============================================================
   REPOSITORY-REGISTRY.JS — Body Intelligence Entity Repository (V2, Phase 12.5.2)

   PURPOSE: the single process-wide directory of Entity repository
   backends — mirrors knowledge/repository/repository-registry.js.
   Bootstraps NullRepository and the shared MemoryRepository instance,
   with NullRepository active by default.

   DEPENDENCIES: repository/contracts/repository-contract.js,
   implementations/{null,memory}-repository.js.

   NON-GOALS: does not decide which backend a real caller SHOULD use.
   Defaulting to 'null' (not 'memory') is deliberate — same reasoning as
   Knowledge's own registry: MemoryRepository is real, but silently
   defaulting to non-durable storage would let a caller believe data is
   being kept when it is not, the first time the process restarts.

   FUTURE EVOLUTION: a future Firebase-backed repository registers here
   alongside Null and Memory.
   ============================================================ */

'use strict';

import { isRepository } from './contracts/repository-contract.js';
import { nullRepository, NULL_REPOSITORY_ID } from './implementations/null-repository.js';
import { memoryRepository } from './implementations/memory-repository.js';

export const REPOSITORY_REGISTRY_ERRORS = Object.freeze({
  INVALID_REPOSITORY: 'INVALID_REPOSITORY',
  UNKNOWN_REPOSITORY: 'UNKNOWN_REPOSITORY',
});

const _repositories = new Map();
let _activeId = null;

export function registerRepository(repository) {
  if (!isRepository(repository)) {
    const err = new Error('registerRepository: repository must satisfy the Repository contract.');
    err.code = REPOSITORY_REGISTRY_ERRORS.INVALID_REPOSITORY;
    throw err;
  }
  _repositories.set(repository.id, repository);
  return repository;
}

export function getRepository(id) {
  return _repositories.get(id) || null;
}

export function listRepositories() {
  return Object.freeze([..._repositories.values()].map((r) => Object.freeze({
    id: r.id, version: r.version, active: r.id === _activeId,
  })));
}

export function setActiveRepository(id) {
  if (!_repositories.has(id)) {
    const err = new Error(`setActiveRepository: no repository registered under "${id}".`);
    err.code = REPOSITORY_REGISTRY_ERRORS.UNKNOWN_REPOSITORY;
    throw err;
  }
  _activeId = id;
  return _repositories.get(id);
}

export function getActiveRepository() {
  return _repositories.get(_activeId) || null;
}

export function getActiveRepositoryId() {
  return _activeId;
}

/** Test/teardown helper. Not used by any runtime path. */
export function resetRepositoryRegistry() {
  _repositories.clear();
  _activeId = null;
  bootstrap();
}

function bootstrap() {
  registerRepository(nullRepository);
  registerRepository(memoryRepository);
  setActiveRepository(NULL_REPOSITORY_ID);
}

bootstrap();
