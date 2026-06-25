/* ============================================================
   DISPATCH-INTELLIGENCE-PERSISTENCE.JS — Dispatch Intelligence Persistence
   (v1.16.4.11-rc.1)

   Persists the Dispatch Intelligence subsystem's derived history to Firebase
   RTDB so it survives a reload: the admin override log, the request
   recommendation history, and the capacity snapshot history. Before this layer
   all of it lived in memory only — refreshing the page reset override stats,
   driver/vehicle accuracy, and capacity trends.

   RTDB layout (read/write THROUGH this layer only):
     dispatchIntelligence/
       overrideLogs/            (chronological admin decisions)
       requestRecommendations/  (per-request background recommendation history)
       capacityHistory/         (capacity snapshots, schema unchanged)

   SYNC MODEL:
     • Read-through  — hydrateDispatchIntelligence() on startup loads the three
                       nodes into the store via its hydrate helpers.
     • Write-through — initDispatchIntelligencePersistence() registers a single
                       store change listener; when a persisted node's reference
                       changes it is written to RTDB (whole-node set; the logs are
                       bounded + append-mostly). Wired AFTER hydration so the
                       just-loaded state is not redundantly written back.

   DEPENDENCY INJECTION: this service imports NO Firebase module (firebase.js
   pulls gstatic ESM URLs that can't load in a Node test). The caller passes a
   tiny adapter { isConfigured, fetchData, storeData }; app.js wires the real
   Firebase functions, tests pass an in-memory fake. This keeps the layer pure
   and fully testable.

   FAILURE STRATEGY: every Firebase touch is guarded. If Firebase is
   unavailable/unconfigured or a call throws, the layer logs a warning and the
   app keeps running on in-memory state — it NEVER blocks request creation,
   approval, assignment creation, or notifications.
   ============================================================ */

'use strict';

import {
  getDispatchState,
  registerDispatchChangeListener,
  hydrateOverrideLogs,
  hydrateRequestRecommendations,
  hydrateCapacityHistory,
} from '../stores/dispatch-intelligence-store.js';

/** Root + node paths (the single source of the RTDB layout). */
export const DISPATCH_INTELLIGENCE_ROOT = 'dispatchIntelligence';
export const DI_PATHS = Object.freeze({
  overrideLogs: `${DISPATCH_INTELLIGENCE_ROOT}/overrideLogs`,
  requestRecommendations: `${DISPATCH_INTELLIGENCE_ROOT}/requestRecommendations`,
  capacityHistory: `${DISPATCH_INTELLIGENCE_ROOT}/capacityHistory`,
});

/** Normalize an RTDB node to an array. RTDB may return a real array OR an
 *  object keyed by id/index (and may contain holes/null); both → clean array. */
function nodeToArray(node) {
  if (Array.isArray(node)) return node.filter((v) => v && typeof v === 'object');
  if (node && typeof node === 'object') return Object.values(node).filter((v) => v && typeof v === 'object');
  return [];
}

/** Normalize an RTDB node to a plain keyed object (recommendations map). */
function nodeToObject(node) {
  if (!node || typeof node !== 'object') return {};
  if (Array.isArray(node)) {
    // Defensive: an array-form recommendations node → re-key by requestId/index.
    const out = {};
    node.forEach((v, i) => { if (v && typeof v === 'object') out[v.requestId || i] = v; });
    return out;
  }
  return node;
}

function adapterReady(adapter) {
  return !!(adapter && typeof adapter.isConfigured === 'function' && adapter.isConfigured()
    && typeof adapter.fetchData === 'function' && typeof adapter.storeData === 'function');
}

/**
 * Read-through: load the three nodes from RTDB into the store on startup.
 * Backward compatible — missing/empty/partial nodes load as empty; corrupt
 * entries are filtered by the store hydrate helpers. Never throws.
 *
 * @param {{isConfigured:Function, fetchData:Function, storeData:Function}} adapter
 * @returns {Promise<{hydrated:boolean, reason?:string}>}
 */
export async function hydrateDispatchIntelligence(adapter) {
  if (!adapterReady(adapter)) {
    console.warn('[DI Persistence] Firebase unavailable — hydration skipped (memory only).');
    return { hydrated: false, reason: 'not-configured' };
  }
  try {
    const data = (await adapter.fetchData(DISPATCH_INTELLIGENCE_ROOT)) || {};
    hydrateOverrideLogs(nodeToArray(data.overrideLogs));
    hydrateRequestRecommendations(nodeToObject(data.requestRecommendations));
    hydrateCapacityHistory(nodeToArray(data.capacityHistory));
    return { hydrated: true };
  } catch (err) {
    console.warn('[DI Persistence] hydration failed — continuing on memory.', err);
    return { hydrated: false, reason: 'error' };
  }
}

let _adapter = null;
let _enabled = false;
let _last = { overrideLogs: null, requestRecommendations: null, capacityHistory: null };
let _unsubscribe = null;

/** Persist a single node, swallowing any failure (write-through, fire-and-forget). */
function writeNode(path, value) {
  const msg = (err) => (err && err.message ? err.message : err);
  try {
    const result = _adapter.storeData(path, value);
    if (result && typeof result.catch === 'function') {
      result.catch((err) => console.warn('[DI Persistence] write failed:', path, msg(err)));
    }
  } catch (err) {
    console.warn('[DI Persistence] write failed:', path, msg(err));
  }
}

/** Store change handler — persist only the nodes whose reference changed. */
function onStoreChange(state) {
  if (!_enabled || !_adapter) return;
  if (state.overrideLogs !== _last.overrideLogs) {
    _last.overrideLogs = state.overrideLogs;
    writeNode(DI_PATHS.overrideLogs, state.overrideLogs);
  }
  if (state.requestRecommendations !== _last.requestRecommendations) {
    _last.requestRecommendations = state.requestRecommendations;
    writeNode(DI_PATHS.requestRecommendations, state.requestRecommendations);
  }
  if (state.capacityHistory !== _last.capacityHistory) {
    _last.capacityHistory = state.capacityHistory;
    writeNode(DI_PATHS.capacityHistory, state.capacityHistory);
  }
}

/**
 * Write-through: register a store listener that mirrors persisted nodes to RTDB.
 * Call AFTER hydrateDispatchIntelligence() so the loaded baseline is captured
 * and not re-written. No-op (with a warning) when Firebase is unavailable —
 * the store keeps working in memory.
 *
 * @param {{isConfigured:Function, fetchData:Function, storeData:Function}} adapter
 * @returns {boolean} whether write-through was enabled
 */
export function initDispatchIntelligencePersistence(adapter) {
  if (!adapterReady(adapter)) {
    console.warn('[DI Persistence] Firebase unavailable — write-through disabled (memory only).');
    return false;
  }
  _adapter = adapter;
  _enabled = true;
  const s = getDispatchState();
  _last = {
    overrideLogs: s.overrideLogs,
    requestRecommendations: s.requestRecommendations,
    capacityHistory: s.capacityHistory,
  };
  _unsubscribe = registerDispatchChangeListener(onStoreChange);
  return true;
}

/** Tear down write-through (test/teardown helper). */
export function _resetDispatchIntelligencePersistence() {
  if (typeof _unsubscribe === 'function') _unsubscribe();
  _adapter = null;
  _enabled = false;
  _last = { overrideLogs: null, requestRecommendations: null, capacityHistory: null };
  _unsubscribe = null;
}
