/* ============================================================
   ENTITY-REPOSITORY.JS — Body Intelligence (V2, Phase 12.5.2)

   PURPOSE: the single facade every other Body module calls through, so
   callers never need to know which backend is active. Delegates every
   method to whichever Repository is currently active in
   repository-registry.js (NullRepository by default). Mirrors
   knowledge/repository/knowledge-repository.js.

   ══════════════════════════════════════════════════════════════════════
   THE REPOSITORY BOUNDARY, DECLARED (same tiering discipline every prior
   domain in this platform declares from day one — see
   learning/repository/learning-repository.js's header for the precedent
   this follows).

   ── PUBLIC (safe for anyone) ─────────────────────────────────────────
     getById · getVersion · list · getHistory · getMetrics
       Reads. Every consumer goes through services/entity-service.js
       anyway, so "who reads Body entities?" has one answer.

   ── UNSAFE (one legitimate caller, enforced by test) ─────────────────
     create · appendVersion
       These WRITE Body entities. Their ONLY legitimate caller is
       services/entity-service.js (the domain owner) — enforced by
       scripts/body-ownership-check.mjs, the same enforcement pattern
       scripts/knowledge-ownership-check.mjs and
       scripts/learning-ownership-check.mjs already establish.

     setActiveRepository
       Swaps the persistence backend process-wide. A bootstrap concern,
       re-exported by entity-service.js as `setBodyBackend` so no other
       module needs to import this file at all.
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
export const getVersion = (id, version) => active('getVersion', id, version);
export const list = (filter) => active('list', filter);
export const create = (item) => active('create', item);
export const appendVersion = (id, patch) => active('appendVersion', id, patch);
export const getHistory = (id) => active('getHistory', id);
export const getMetrics = () => active('getMetrics');

export { setActiveRepository, getActiveRepositoryId, listRepositories };
