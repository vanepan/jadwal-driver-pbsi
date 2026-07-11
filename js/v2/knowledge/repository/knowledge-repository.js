/* ============================================================
   KNOWLEDGE-REPOSITORY.JS — Knowledge Repository Foundation (V2, Phase 5)

   PURPOSE: the single public facade every other Knowledge module calls
   through, so callers never need to know which backend is active. Delegates
   every method to whichever Repository is currently active in
   repository-registry.js (NullRepository by default — see that registry's
   header for why Memory is not the default).

   RESPONSIBILITY: pure delegation. No storage logic of its own — that
   moved to implementations/{null,memory}-repository.js in this phase.

   DEPENDENCIES: knowledge/repository/repository-registry.js.

   NON-GOALS: does not choose a backend. Does not fall back to a different
   repository if the active one fails — a caller wanting Memory instead of
   Null must call `setActiveRepository('memory')` explicitly (re-exported
   here for convenience).

   FUTURE EVOLUTION: unchanged as a real Firebase-backed repository is
   added — it registers in repository-registry.js and is selected the same
   way MemoryRepository is today.
   ============================================================ */

'use strict';

import { getActiveRepository, setActiveRepository, getActiveRepositoryId, listRepositories } from './repository-registry.js';
import { repositoryFailure, REPOSITORY_ERRORS } from './contracts/repository-contract.js';

function active(method, ...args) {
  const repo = getActiveRepository();
  if (!repo) return repositoryFailure(REPOSITORY_ERRORS.NO_BACKEND_CONFIGURED, `No active repository (method: ${method}).`);
  return repo[method](...args);
}

export const getById = (id, opts) => active('getById', id, opts);
export const getVersion = (id, version) => active('getVersion', id, version);
export const list = (filter) => active('list', filter);
export const search = (query) => active('search', query);
export const create = (item) => active('create', item);
export const appendVersion = (id, patch) => active('appendVersion', id, patch);
export const getHistory = (id) => active('getHistory', id);
export const rollback = (id, toVersion, reviewDecision) => active('rollback', id, toVersion, reviewDecision);
export const getDependencies = (id) => active('getDependencies', id);
export const getMetrics = () => active('getMetrics');
export const getPendingReview = () => active('getPendingReview');

export { setActiveRepository, getActiveRepositoryId, listRepositories };
