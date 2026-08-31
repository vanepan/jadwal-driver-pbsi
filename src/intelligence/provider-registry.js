/* ============================================================
   PROVIDER-REGISTRY.JS — Sarpras Intelligence Foundation (V2, Phase 0)

   PURPOSE: a single process-wide directory of AI providers plus the one
   active selection — byte-for-byte the pattern proven by
   js/prediction/prediction-provider.js's registry. The Intelligence layer
   reads getActiveProvider() on every request, so switching providers is
   instant and global with no downstream change.

   RESPONSIBILITY: register / get / list / setActive / getActive /
   getActiveId / reset, against the provider contract
   (contracts/provider-contract.js).

   DEPENDENCIES: intelligence/contracts/provider-contract.js,
   intelligence/providers/null-provider.js.

   NON-GOALS: does not call generate(), does not know about models,
   endpoints, or credentials. Holds no state beyond the provider objects
   and the active id.

   FUTURE EVOLUTION: a server-backed provider is added with
   registerProvider() at platform bootstrap and selected with
   setActiveProvider(); the Null Provider remains registered as the safe
   fallback and the reset target.
   ============================================================ */

'use strict';

import { isIntelligenceProvider, REGISTRY_ERRORS } from './contracts/provider-contract.js';
import { nullProvider, NULL_PROVIDER_ID } from './providers/null-provider.js';

/** The default active provider id — always the inert Null Provider until a
 *  real one is deliberately registered and activated. */
export const DEFAULT_PROVIDER_ID = NULL_PROVIDER_ID;

const _registry = new Map();
let _activeId = null;

/**
 * registerProvider(provider) → the registered provider. Idempotent per id.
 * If nothing is active yet, the first registered becomes active.
 * Throws INVALID_PROVIDER for a malformed provider (a programmer error).
 */
export function registerProvider(provider) {
  if (!isIntelligenceProvider(provider)) {
    const err = new Error('registerProvider: provider must be { id, version, generate() }.');
    err.code = REGISTRY_ERRORS.INVALID_PROVIDER;
    throw err;
  }
  _registry.set(provider.id, provider);
  if (_activeId === null) _activeId = provider.id;
  return provider;
}

/** getProvider(id) → the provider, or null. */
export function getProvider(id) {
  return _registry.get(id) || null;
}

/** listProviders() → frozen summary of every registered provider (no generate fn). */
export function listProviders() {
  return Object.freeze([..._registry.values()].map((p) => Object.freeze({
    id: p.id,
    version: p.version,
    kind: p.kind || null,
    description: p.description || null,
    active: p.id === _activeId,
  })));
}

/**
 * setActiveProvider(id) → the now-active provider.
 * Throws UNKNOWN_PROVIDER if `id` was never registered (a programmer error).
 */
export function setActiveProvider(id) {
  if (!_registry.has(id)) {
    const err = new Error(`setActiveProvider: no provider registered under "${id}".`);
    err.code = REGISTRY_ERRORS.UNKNOWN_PROVIDER;
    throw err;
  }
  _activeId = id;
  return _registry.get(id);
}

/** getActiveProvider() → the currently active provider (Null Provider by default). */
export function getActiveProvider() {
  return _registry.get(_activeId) || null;
}

/** The id of the active provider (or null before bootstrap — never in practice). */
export function getActiveProviderId() {
  return _activeId;
}

/**
 * resetRegistry() → restore the built-in Null Provider as the only
 * registered provider, active. Test/teardown helper; no runtime caller.
 */
export function resetRegistry() {
  _registry.clear();
  _activeId = null;
  registerProvider(nullProvider);
  setActiveProvider(DEFAULT_PROVIDER_ID);
}

/* ── bootstrap: the Null Provider is registered and active ──────────────── */
registerProvider(nullProvider);
setActiveProvider(DEFAULT_PROVIDER_ID);
