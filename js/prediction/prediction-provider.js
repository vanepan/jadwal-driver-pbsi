/* ============================================================
   PREDICTION-PROVIDER.JS — Hybrid Prediction Architecture (v1.19.3)

   The PROVIDER ABSTRACTION between the Prediction Service and whatever actually
   produces a PredictionModel. Before this sprint the service imported the
   Prediction Engine directly:

       Prediction Service → Prediction Engine

   Now it depends ONLY on this abstraction:

       Prediction Service
             │
             ▼
       Prediction Provider  (registry + contract)
             │
        ┌────┴─────┐
        ▼          ▼
     Rule       Python
    Provider    Provider (future)

   A provider is anything that can turn platform input into a PredictionModel.
   The Rule Provider wraps the existing JavaScript engine (default, always
   available). The Python Provider is a stub that locks the interface so a real
   ML service (REST / Cloud Run / Cloud Functions / local Python) can slot in
   later WITHOUT touching the service, any dashboard, or any business logic.

   ── WHY THE SERVICE DEPENDS ON THIS, NOT ON AN ENGINE ────────────────────────
   The Prediction Service owns VALIDATE → CERTIFY → DESCRIBE and is the single
   certification gate (v1.19.2). It must not care HOW a model was produced — only
   that it received one shaped like a PredictionModel. So providers own exactly
   ONE step — BUILD — and return the RAW model. Certification stays with the
   service, uniformly, for every provider. That is the whole point: swapping the
   rule engine for a Python model changes nothing downstream.

   ── PROVIDER CONTRACT ────────────────────────────────────────────────────────
   Every provider is a frozen object:
       { id, version, kind, description, predict(input, config) }
   and predict() returns a ProviderResult (never throws to the service):
       { ok, model, error, providerId, engineVersion }
     • ok:true  ⇒ model is a raw PredictionModel, error:null
     • ok:false ⇒ model:null, error:{ code, message } (e.g. NOT_IMPLEMENTED)
   No provider is allowed to return a differently-shaped model. All providers
   emit the SAME PredictionModel contract; only the mechanism differs.

   ── PURITY ───────────────────────────────────────────────────────────────────
   This module and the built-in providers are PURE (no DOM/Firebase/browser/
   randomness/timers). A future Python provider will be I/O-bound (network), but
   it still must conform to the ProviderResult contract and never throw.
   ============================================================ */

'use strict';

// The ONLY place in the prediction layer allowed to reference the engine module.
// We re-export the shared classification contract the service needs so the
// service imports it from the PROVIDER LAYER — never from the engine directly.
import { PREDICTION_SCHEMA, confidenceBand } from '../engines/prediction-engine.js';
import { ruleProvider } from './rule-provider.js';
import { pythonProvider } from './python-provider.js';

export { PREDICTION_SCHEMA, confidenceBand };

/* ── identity ───────────────────────────────────────────────────────────────── */

export const PROVIDER_SCHEMA = 'prediction-provider@1';

/** The default active provider id — MUST always be the Rule Provider. */
export const DEFAULT_PROVIDER_ID = 'rule';

/** Closed set of provider error codes (a provider result carries one of these). */
export const PROVIDER_ERRORS = Object.freeze({
  BUILD_FAILED: 'BUILD_FAILED',       // the underlying builder threw
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED', // provider is a stub / not wired up
});

/** Registry error codes (thrown for programmer errors — never during predict). */
export const REGISTRY_ERRORS = Object.freeze({
  INVALID_PROVIDER: 'INVALID_PROVIDER',
  UNKNOWN_PROVIDER: 'UNKNOWN_PROVIDER',
});

/** The contract, as data, so tests and future providers have one source of truth. */
export const PROVIDER_CONTRACT = Object.freeze({
  schema: PROVIDER_SCHEMA,
  provider: Object.freeze(['id', 'version', 'kind', 'description', 'predict']),
  result: Object.freeze(['ok', 'model', 'error', 'providerId', 'engineVersion']),
  errorCodes: PROVIDER_ERRORS,
});

/* ── ProviderResult builders (shared by every provider so results are uniform) ── */

/**
 * A successful BUILD. `model` is a RAW PredictionModel — NOT certified. The
 * Prediction Service validates + certifies it; providers never certify.
 */
export function providerSuccess(model, { providerId, engineVersion } = {}) {
  return Object.freeze({
    ok: true,
    model: model ?? null,
    error: null,
    providerId: providerId ?? null,
    engineVersion: engineVersion ?? null,
  });
}

/** A predictable BUILD failure. Providers return this instead of throwing. */
export function providerFailure(code, message, { providerId, engineVersion } = {}) {
  return Object.freeze({
    ok: false,
    model: null,
    error: Object.freeze({ code, message }),
    providerId: providerId ?? null,
    engineVersion: engineVersion ?? null,
  });
}

/** Structural check that an object satisfies the provider contract. */
export function isProvider(p) {
  return !!p
    && typeof p === 'object'
    && typeof p.id === 'string' && p.id.length > 0
    && typeof p.version === 'string' && p.version.length > 0
    && typeof p.predict === 'function';
}

/* ════════════════════════════════════════════════════════════════════════════
   THE REGISTRY — a single process-wide directory of providers plus the one
   active selection. Kept deliberately tiny and synchronous; it holds NO state
   beyond the provider objects and the active id.
   ════════════════════════════════════════════════════════════════════════════ */

const registry = new Map();
let activeId = null;

/**
 * registerProvider(provider) → the registered provider.
 * Idempotent per id (re-registering the same id replaces it). If no provider is
 * active yet, the first registered becomes active (bootstrap sets 'rule').
 * Throws INVALID_PROVIDER for a malformed provider (a programmer error).
 */
export function registerProvider(provider) {
  if (!isProvider(provider)) {
    const err = new Error('registerProvider: provider must be { id, version, predict() }.');
    err.code = REGISTRY_ERRORS.INVALID_PROVIDER;
    throw err;
  }
  registry.set(provider.id, provider);
  if (activeId === null) activeId = provider.id;
  return provider;
}

/** getProvider(id) → the provider, or null if none is registered under `id`. */
export function getProvider(id) {
  return registry.get(id) || null;
}

/** listProviders() → a frozen summary of every registered provider (no predict fn). */
export function listProviders() {
  return Object.freeze([...registry.values()].map((p) => Object.freeze({
    id: p.id,
    version: p.version,
    kind: p.kind || null,
    description: p.description || null,
    active: p.id === activeId,
  })));
}

/**
 * setActiveProvider(id) → the now-active provider.
 * Throws UNKNOWN_PROVIDER if `id` was never registered (a programmer error, not
 * a runtime prediction failure). The Prediction Service reads the active
 * provider on every request, so switching is instant and global.
 */
export function setActiveProvider(id) {
  if (!registry.has(id)) {
    const err = new Error(`setActiveProvider: no provider registered under "${id}".`);
    err.code = REGISTRY_ERRORS.UNKNOWN_PROVIDER;
    throw err;
  }
  activeId = id;
  return registry.get(id);
}

/** getActiveProvider() → the currently active provider (RuleProvider by default). */
export function getActiveProvider() {
  return registry.get(activeId) || null;
}

/** The id of the active provider (or null before bootstrap — never in practice). */
export function getActiveProviderId() {
  return activeId;
}

/**
 * resetRegistry() → restore the built-in providers with RuleProvider active.
 * Exists ONLY for tests, so a suite that switches the active provider can put
 * the global back exactly as bootstrapped. Not used by any runtime path.
 */
export function resetRegistry() {
  registry.clear();
  activeId = null;
  registerProvider(ruleProvider);
  registerProvider(pythonProvider);
  setActiveProvider(DEFAULT_PROVIDER_ID);
}

/* ── bootstrap: register the built-ins, RuleProvider is the default active ────── */

registerProvider(ruleProvider);
registerProvider(pythonProvider);
setActiveProvider(DEFAULT_PROVIDER_ID);
