/* ============================================================
   REPOSITORY-REGISTRY.JS — Recognition Foundation Repository (Phase 12.7.1)

   PURPOSE: the single process-wide directory of Recognition Record
   repository backends — mirrors body/repository/repository-registry.js.
   Bootstraps NullRepository and the shared MemoryRepository instance,
   with NullRepository active by default (same "defaulting to non-durable
   storage would let a caller believe data is being kept when it is not"
   reasoning body's own registry states).

   DEPENDENCIES: repository/contracts/repository-contract.js,
   implementations/{null,memory}-repository.js.

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
