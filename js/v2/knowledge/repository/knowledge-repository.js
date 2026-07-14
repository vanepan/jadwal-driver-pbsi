/* ============================================================
   KNOWLEDGE-REPOSITORY.JS — Knowledge Repository Foundation (V2, Phase 5 / 9.1)

   PURPOSE: the single public facade every other Knowledge module calls
   through, so callers never need to know which backend is active. Delegates
   every method to whichever Repository is currently active in
   repository-registry.js (NullRepository by default — see that registry's
   header for why Memory is not the default).

   RESPONSIBILITY: pure delegation, PLUS (Phase 9.1) Repository Events — a
   process-wide listener registry mirroring V1's own established
   `registerChangeListener()`/notify pattern
   (js/petty-cash/petty-cash-store.js), notified after every successful
   `create`/`appendVersion`/`rollback`, regardless of which backend
   performed the write. Living here (the facade), not in
   implementations/*.js, means a future Firebase-backed repository gets
   Repository Events for free — no backend re-implements this.

   DEPENDENCIES: knowledge/repository/repository-registry.js,
   knowledge/repository/contracts/event-contract.js.

   NON-GOALS: does not choose a backend. Does not fall back to a different
   repository if the active one fails — a caller wanting Memory instead of
   Null must call `setActiveRepository('memory')` explicitly (re-exported
   here for convenience). Listeners are best-effort/synchronous, exactly
   like petty-cash-store.js's `notify()` — a throwing listener is not
   caught here, same as that precedent.

   FUTURE EVOLUTION: unchanged as a real Firebase-backed repository is
   added — it registers in repository-registry.js and is selected the same
   way MemoryRepository is today.
   ============================================================ */

'use strict';

import { getActiveRepository, setActiveRepository, getActiveRepositoryId, listRepositories } from './repository-registry.js';
import { repositoryFailure, REPOSITORY_ERRORS } from './contracts/repository-contract.js';
import { REPOSITORY_EVENT_TYPE, makeRepositoryEvent } from './contracts/event-contract.js';

/* ══════════════════════════════════════════════════════════════════════
   PHASE 3, PART 9 — THE REPOSITORY BOUNDARY, DECLARED.

   This module's exports are NOT all equal. They fall into three tiers, and the
   difference matters enough to write down, because nothing in the language
   expresses it: every export below looks identical to an autocomplete.

   ── PUBLIC (safe for anyone) ─────────────────────────────────────────
     registerRepositoryListener / unregisterRepositoryListener
       Event subscription. Mutates nothing.

   ── INTERNAL (one legitimate caller: services/knowledge-service.js) ──
     getById · getVersion · list · search · getHistory · getMetrics ·
     getPendingReview · getDependencies
       Reads. Harmless in isolation — a stray read corrupts nothing — but every
       consumer now goes through the Knowledge Service anyway, so that "who
       reads knowledge?" has one answer and future caching, filtering or
       access-control has exactly one place to live.

   ── UNSAFE (one legitimate caller, enforced by test) ─────────────────
     create · appendVersion · rollback
       These WRITE organizational knowledge. Called directly, they bypass:
         · the human gate  (nothing stops `create({lifecycleState:'approved'})`)
         · the mutability rule (Approved knowledge silently rewritten in place)
         · the lifecycle graph (appendVersion honours it; create does not)
       Their ONLY legitimate callers are services/knowledge-service.js (the
       domain owner) and lifecycle/lifecycle-engine.js (the transition mechanism
       the owner delegates to). Enforced by scripts/knowledge-ownership-check.mjs.

     setActiveRepository
       Swaps the persistence backend process-wide. A bootstrap concern, called
       once from the platform mount. Re-exported by the Knowledge Service as
       `setKnowledgeBackend` so no other module needs to import this file at all.

   ── WHY THESE ARE NOT PRIVATE (yet) ──────────────────────────────────
   Privatising them means a module-boundary refactor across four repositories
   and the 20+ check scripts that import their reset*() teardown helpers. The
   Phase 2.6 audit found that NO module outside the owner actually calls them —
   the doors are unlocked, but nobody walks through. So the real risk is a
   FUTURE developer, and a failing test names the rule far more loudly than a
   private field would. Encapsulation is worth doing; it is worth doing as its
   own phase, with its own verification, rather than smuggled into this one.

   Deferred deliberately. Not forgotten. See the Phase 3 report's "technical
   debt intentionally deferred".
   ══════════════════════════════════════════════════════════════════════ */

function active(method, ...args) {
  const repo = getActiveRepository();
  if (!repo) return repositoryFailure(REPOSITORY_ERRORS.NO_BACKEND_CONFIGURED, `No active repository (method: ${method}).`);
  return repo[method](...args);
}

/** @type {Function[]} */
const _listeners = [];

export function registerRepositoryListener(cb) {
  if (typeof cb === 'function') _listeners.push(cb);
}

export function unregisterRepositoryListener(cb) {
  const i = _listeners.indexOf(cb);
  if (i !== -1) _listeners.splice(i, 1);
}

function notify(type, item) {
  const event = makeRepositoryEvent(type, { id: item.id, version: item.version, lifecycleState: item.lifecycleState });
  for (const cb of _listeners) cb(event);
}

export const getById = (id, opts) => active('getById', id, opts);
export const getVersion = (id, version) => active('getVersion', id, version);
export const list = (filter) => active('list', filter);
export const search = (query) => active('search', query);

export function create(item) {
  const result = active('create', item);
  if (result.ok) notify(REPOSITORY_EVENT_TYPE.CREATED, result.data);
  return result;
}

export function appendVersion(id, patch) {
  const result = active('appendVersion', id, patch);
  if (result.ok) notify(REPOSITORY_EVENT_TYPE.VERSION_APPENDED, result.data);
  return result;
}

export const getHistory = (id) => active('getHistory', id);

export function rollback(id, toVersion, reviewDecision) {
  const result = active('rollback', id, toVersion, reviewDecision);
  if (result.ok) notify(REPOSITORY_EVENT_TYPE.ROLLED_BACK, result.data);
  return result;
}

export const getDependencies = (id) => active('getDependencies', id);
export const getMetrics = () => active('getMetrics');
export const getPendingReview = () => active('getPendingReview');

export { setActiveRepository, getActiveRepositoryId, listRepositories };
