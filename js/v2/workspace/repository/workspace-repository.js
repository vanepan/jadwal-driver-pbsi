/* ============================================================
   WORKSPACE-REPOSITORY.JS — Live Word Workspace (V2, Phase 12.8.2)

   PURPOSE: the single facade every other Workspace module calls through,
   so callers never need to know which backend is active. Delegates every
   method to whichever Repository is currently active in
   repository-registry.js (NullRepository by default). Mirrors
   body/repository/entity-repository.js.

   ══════════════════════════════════════════════════════════════════════
   THE REPOSITORY BOUNDARY, DECLARED (same discipline every domain in
   this platform declares from day one).

   ── PUBLIC (safe for anyone) ─────────────────────────────────────────
     getById · list · getHistory · getMetrics

   ── UNSAFE (one legitimate caller, enforced by test) ─────────────────
     create · appendVersion
       Their ONLY legitimate caller is services/workspace-service.js (the
       domain owner) — enforced by scripts/workspace-ownership-check.mjs.

     setActiveRepository
       A bootstrap concern, re-exported by workspace-service.js as
       `setWorkspaceBackend` so no other module needs to import this file
       at all.
   ══════════════════════════════════════════════════════════════════════

   DEPENDENCIES: repository/repository-registry.js.
   ============================================================ */

'use strict';

import { getActiveRepository, setActiveRepository, getActiveRepositoryId, listRepositories } from './repository-registry.js';
import { repositoryFailure, REPOSITORY_ERRORS } from './contracts/repository-contract.js';

function active(method, ...args) {
  const repo = getActiveRepository();
  if (!repo) return repositoryFailure(REPOSITORY_ERRORS.NO_BACKEND_CONFIGURED, `No active repository (method: ${method}).`);
  return repo[method](...args);
}

export const getById = (id) => active('getById', id);
export const list = (filter) => active('list', filter);
export const create = (item) => active('create', item);
export const appendVersion = (id, patch) => active('appendVersion', id, patch);
export const getHistory = (id) => active('getHistory', id);
export const getMetrics = () => active('getMetrics');

export { setActiveRepository, getActiveRepositoryId, listRepositories };
