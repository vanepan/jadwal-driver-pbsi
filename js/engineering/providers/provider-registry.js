/* ============================================================
   PROVIDER-REGISTRY.JS — Engineering data-source registry (v1.20.3 RC1)

   The single seam that maps a runtime environment → a data-source adapter,
   so Engineering startup NEVER references a concrete adapter directly:

     registerAdapter(env, factory)   — declare which adapter powers an env
     resolveAdapter(env)             — build the adapter for the active env
                                       (null when no storage is configured yet)

   This is how DevSeedAdapter / FirebaseAdapter / MockAdapter get swapped
   without touching the store, engines or UI. An environment with no registered
   factory resolves to `null` — the provider then reports "no storage", the
   store stays empty, and the UI renders its empty state. There is deliberately
   no default/fallback adapter: nothing populates Engineering implicitly.

   PURE: plain registry. No DOM, no Firebase, no `window`, no side effects.
   ============================================================ */

'use strict';

/** @type {Map<string, () => object>} env → adapter factory */
const _factories = new Map();

/**
 * Register the adapter factory for an environment. Idempotent per env
 * (re-registering replaces the previous factory).
 * @param {string} env  'development' | 'staging' | 'production'
 * @param {() => object} factory  returns a fresh adapter instance
 */
export function registerAdapter(env, factory) {
  if (typeof env !== 'string' || !env) throw new Error('registerAdapter: env must be a non-empty string');
  if (typeof factory !== 'function') throw new Error('registerAdapter: factory must be a function');
  _factories.set(env, factory);
}

/** Whether an adapter factory is registered for `env`. */
export function hasAdapter(env) {
  return _factories.has(env);
}

/**
 * Resolve (build) the adapter for `env`, or null when none is registered.
 * Null is a first-class result: "no storage configured" → empty store.
 * @param {string} env
 * @returns {object|null}
 */
export function resolveAdapter(env) {
  const factory = _factories.get(env);
  if (!factory) return null;
  try {
    return factory() || null;
  } catch (err) {
    console.warn('[ProviderRegistry] adapter factory threw for env:', env, err && err.message ? err.message : err);
    return null;
  }
}

/** Test/teardown helper — forget all registered factories. */
export function clearAdapters() {
  _factories.clear();
}
