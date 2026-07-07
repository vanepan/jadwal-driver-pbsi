/* ============================================================
   SEED-MANAGER.JS — Engineering Development Seed Manager (v1.20.3 RC1)

   The ONLY way Engineering ever receives demo data. Three explicit developer
   operations, each a no-op unless a Development adapter (one exposing the
   `__dev_loadSeed` hook) is supplied:

     loadDemoData(adapter)   — populate storage with the demo seed, then sync
                               the store from storage (the real fetch path).
     resetDemoData(adapter)  — clear storage, then reload a fresh seed.
     clearAllData(adapter)   — empty storage AND the in-memory store.

   The gate here is STRUCTURAL, not environmental: only the DevSeedAdapter has
   `__dev_loadSeed`, and the provider-registry only ever resolves that adapter
   in Development. Staging/production resolve `null`, so these operations cannot
   populate anything. The UI adds a second, environmental gate (isDevelopment)
   so the controls never even render outside Development.

   PURE w.r.t. production: imports no dev fixture directly (the seed lives in the
   adapter). No DOM, no `window`.
   ============================================================ */

'use strict';

import { loadAll } from './engineering-provider.js';
import { resetEngineeringStore } from '../stores/engineering-store.js';

/** True when `adapter` is a Development adapter that can be seeded. */
export function isSeedManagerAvailable(adapter) {
  return !!adapter && typeof adapter.__dev_loadSeed === 'function';
}

/**
 * Populate storage with the demo seed and sync the store from it.
 * @returns {Promise<{ok:boolean, count:number}>}
 */
export async function loadDemoData(adapter, options = {}) {
  if (!isSeedManagerAvailable(adapter)) return { ok: false, count: 0 };
  const count = adapter.__dev_loadSeed(options.now);
  await loadAll(adapter, { now: options.now });   // fetch storage → store (real path)
  return { ok: true, count };
}

/**
 * Clear storage then reload a fresh demo seed.
 * @returns {Promise<{ok:boolean, count:number}>}
 */
export async function resetDemoData(adapter, options = {}) {
  if (!isSeedManagerAvailable(adapter)) return { ok: false, count: 0 };
  adapter.__dev_clear();
  return loadDemoData(adapter, options);
}

/**
 * Empty both storage and the in-memory store → clean empty state.
 * @returns {Promise<{ok:boolean}>}
 */
export async function clearAllData(adapter) {
  if (adapter && typeof adapter.__dev_clear === 'function') adapter.__dev_clear();
  resetEngineeringStore();
  return { ok: true };
}
