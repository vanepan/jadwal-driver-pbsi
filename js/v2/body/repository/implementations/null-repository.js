/* ============================================================
   NULL-REPOSITORY.JS — Body Intelligence Entity Repository (V2, Phase 12.5.2)

   PURPOSE: the true no-op Repository — every method answers
   NO_BACKEND_CONFIGURED rather than claiming an empty result. Mirrors
   knowledge/repository/implementations/null-repository.js exactly. An
   empty list from a Null backend would be indistinguishable from "we
   checked and there are truly zero entities" — a fake success.

   DEPENDENCIES: repository/contracts/repository-contract.js.

   FUTURE EVOLUTION: this is the default active repository
   (repository-registry.js) until a real backend is explicitly selected.
   ============================================================ */

'use strict';

import { REPOSITORY_ERRORS, repositoryFailure } from '../contracts/repository-contract.js';

function noBackend(method) {
  return repositoryFailure(
    REPOSITORY_ERRORS.NO_BACKEND_CONFIGURED,
    `NullRepository.${method}: no repository backend is configured. Select one via repository-registry.setActiveRepository(id).`,
  );
}

export const NULL_REPOSITORY_ID = 'null';
export const NULL_REPOSITORY_VERSION = 'body-null-repository@1';

export const nullRepository = Object.freeze({
  id: NULL_REPOSITORY_ID,
  version: NULL_REPOSITORY_VERSION,
  getById: () => noBackend('getById'),
  getVersion: () => noBackend('getVersion'),
  list: () => noBackend('list'),
  create: () => noBackend('create'),
  appendVersion: () => noBackend('appendVersion'),
  getHistory: () => noBackend('getHistory'),
  getMetrics: () => noBackend('getMetrics'),
});

export default nullRepository;
