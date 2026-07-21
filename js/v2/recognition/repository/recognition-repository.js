/* ============================================================
   RECOGNITION-REPOSITORY.JS — Recognition Foundation (Phase 12.7.1)

   PURPOSE: the single facade every Recognition module calls through, so
   callers never need to know which backend is active. Delegates every
   method to whichever Repository is currently active in
   repository-registry.js (NullRepository by default). Mirrors
   body/repository/entity-repository.js.

   ══════════════════════════════════════════════════════════════════════
   THE REPOSITORY BOUNDARY, DECLARED (same tiering discipline every prior
   domain in this platform declares from day one).

   ── PUBLIC (safe for anyone) ─────────────────────────────────────────
     getById · getVersion · list · getHistory · getMetrics
       Reads. Every consumer goes through services/recognition-service.js
       anyway, so "who reads Recognition records?" has one answer.

   ── UNSAFE (one legitimate caller, enforced by test) ─────────────────
     create · appendVersion
       These WRITE Recognition records. Their ONLY legitimate caller is
       services/recognition-service.js (the domain owner) — enforced by
       scripts/recognition-ownership-check.mjs, the same enforcement
       pattern scripts/body-ownership-check.mjs already establishes.

     setActiveRepository
       Swaps the persistence backend process-wide. A bootstrap concern,
       re-exported by recognition-service.js as `setRecognitionBackend` so
       no other module needs to import this file at all.
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
