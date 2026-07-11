/* ============================================================
   NULL-REPOSITORY.JS — Knowledge Repository Foundation (V2, Phase 5)

   PURPOSE: the true no-op Repository — every method answers
   NO_BACKEND_CONFIGURED rather than claiming an empty result. Mirrors
   js/engineering/providers/provider-registry.js's "no registered factory →
   null → the provider reports no storage" philosophy, applied per-call.

   RESPONSIBILITY: satisfy the Repository contract
   (contracts/repository-contract.js) without ever fabricating data. An
   empty list from a Null backend would be indistinguishable from "we
   checked and there are truly zero items" — which would be a fake
   success. NullRepository refuses to make that claim.

   DEPENDENCIES: contracts/repository-contract.js.

   NON-GOALS: stores nothing, computes nothing.

   FUTURE EVOLUTION: this is the default active repository
   (repository-registry.js) until a real backend is explicitly selected —
   it should never need to change.
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
export const NULL_REPOSITORY_VERSION = 'null-repository@1';

export const nullRepository = Object.freeze({
  id: NULL_REPOSITORY_ID,
  version: NULL_REPOSITORY_VERSION,
  getById: () => noBackend('getById'),
  getVersion: () => noBackend('getVersion'),
  list: () => noBackend('list'),
  search: () => noBackend('search'),
  create: () => noBackend('create'),
  appendVersion: () => noBackend('appendVersion'),
  getHistory: () => noBackend('getHistory'),
  rollback: () => noBackend('rollback'),
  getDependencies: () => noBackend('getDependencies'),
  getMetrics: () => noBackend('getMetrics'),
  getPendingReview: () => noBackend('getPendingReview'),
});

export default nullRepository;
