/* ============================================================
   DISPATCH-INTELLIGENCE-STORE.JS — Dispatch Intelligence Foundation
   (v1.16.4.11-alpha.1)

   The single in-memory home for everything the Dispatch Intelligence
   subsystem produces: capacity snapshots (this release) plus the seats
   reserved for the milestones that follow — driver/vehicle recommendations,
   dispatch override logs, and the scoring weights the Dispatch Scoring
   Engine will read.

   WHY in-memory (no Firebase) this release:
     Capacity is DERIVED state — it is recomputed from the live assignment
     records by capacity-snapshot-service, so it never needs to be the source
     of truth and must not introduce a new persisted collection (the spec's
     "do not duplicate assignment storage" rule). Persisting recommendation /
     override history is a later-milestone concern; the shape is reserved here
     now so adding a Firebase-backed write path later is additive, not a
     refactor. The listener pattern mirrors settings-store / drivers-store so
     a future persistence layer drops in without changing consumers.

   PURE-ish: no DOM, no `window`. It holds state and notifies listeners.
   ============================================================ */

'use strict';

import { getDispatchConfig } from '../config/dispatch-intelligence-config.js';
import {
  computeOverrideStats,
  computeDriverAccuracy,
  computeVehicleAccuracy,
} from '../services/override-workflow-service.js';

/** Default Dispatch Scoring weights (sum = 100). Reserved for the Dispatch
 *  Scoring Engine milestone; nothing consumes them yet this release. Exposed
 *  as the canonical default so a future settings override merges onto it. */
export const DEFAULT_SCORING_WEIGHTS = Object.freeze({
  availability: 40,
  workload: 30,
  recency: 20,
  priority: 10,
});

/** Default Vehicle Scoring weights (sum = 100). Consumed by the Vehicle
 *  Recommendation Engine; the engine normalizes by ΣW so any positive set keeps
 *  the final score in 0–100. Exposed as the canonical default so a future
 *  settings override merges onto it (mirrors DEFAULT_SCORING_WEIGHTS). */
export const DEFAULT_VEHICLE_SCORING_WEIGHTS = Object.freeze({
  availability: 40,
  capacityFit: 30,
  utilization: 20,
  health: 10,
});

/** Default Dispatch Scoring weights (sum = 100). Consumed by the Dispatch
 *  Scoring Engine to fuse the driver + vehicle recommendation scores into one
 *  dispatch score; the engine normalizes by ΣW so any positive set keeps the
 *  final score in 0–100. Exposed as the canonical default so a future settings
 *  override merges onto it (mirrors the driver/vehicle weight defaults). */
export const DEFAULT_DISPATCH_SCORING_WEIGHTS = Object.freeze({
  driver: 60,
  vehicle: 40,
});

function freshState() {
  return {
    capacitySnapshots: {},        // key → CapacitySnapshot (e.g. 'latest' or an ISO/date key)
    capacityHistory: [],          // chronological CapacitySnapshot[] (oldest → newest), retention-pruned
    recommendations: {},          // reserved: Driver Recommendation Engine output history
    vehicleRecommendations: {},   // key → VehicleRecommendation (e.g. 'latest' or a request key)
    dispatchRecommendations: {},  // key → DispatchRecommendation (driver+vehicle fusion)
    requestRecommendations: {},   // key → RequestRecommendation package (Request Auto-Fill Intelligence)
    overrideLogs: [],             // chronological admin decision records (Admin Override Workflow)
    scoringWeights: { ...DEFAULT_SCORING_WEIGHTS },
    vehicleScoringWeights: { ...DEFAULT_VEHICLE_SCORING_WEIGHTS },
    dispatchScoringWeights: { ...DEFAULT_DISPATCH_SCORING_WEIGHTS },
  };
}

let state = freshState();
let onChangeCallbacks = [];

function notify() {
  for (const cb of onChangeCallbacks) {
    try { cb(state); } catch (err) { console.warn('[DispatchIntelligenceStore] listener threw', err); }
  }
}

/** Current state (live reference — treat as read-only; mutate via the setters). */
export function getDispatchState() {
  return state;
}

/** Subscribe to any state change. Returns an unsubscribe function. */
export function registerDispatchChangeListener(callback) {
  if (typeof callback !== 'function') return () => {};
  onChangeCallbacks.push(callback);
  return () => { onChangeCallbacks = onChangeCallbacks.filter((cb) => cb !== callback); };
}

/* ── Capacity snapshots ─────────────────────────────────────────────── */

/** Store a snapshot under `key` (default 'latest'). Returns the snapshot. */
export function setCapacitySnapshot(snapshot, key = 'latest') {
  state.capacitySnapshots = { ...state.capacitySnapshots, [key]: snapshot };
  notify();
  return snapshot;
}

/** Read a snapshot by key (default 'latest'); null when absent. */
export function getCapacitySnapshot(key = 'latest') {
  return state.capacitySnapshots[key] || null;
}

/* ── Historical snapshots (v1.16.4.11-alpha.1.1) ─────────────────────── */

/** Epoch ms of a snapshot's generatedAt; 0 when missing/unparseable. */
function snapshotTime(s) {
  const t = s && s.generatedAt ? Date.parse(s.generatedAt) : NaN;
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Append a snapshot to the chronological history, then prune anything older
 * than `snapshotRetentionDays` (config) relative to the NEWEST snapshot's time
 * — so a fresh save deterministically rolls off stale history. The newest
 * snapshot is also mirrored to capacitySnapshots['latest'].
 *
 * @param {Object} snapshot  a CapacitySnapshot ({ generatedAt, drivers, … })
 * @param {Object} [options]
 * @param {number} [options.retentionDays]  override config retention (testing)
 * @returns {Object} the saved snapshot
 */
export function saveSnapshot(snapshot, options = {}) {
  if (!snapshot) return snapshot;
  const retentionDays = Number(options.retentionDays) > 0
    ? Number(options.retentionDays)
    : getDispatchConfig().snapshotRetentionDays;

  const history = [...state.capacityHistory, snapshot]
    .sort((a, b) => snapshotTime(a) - snapshotTime(b));

  const newest = snapshotTime(history[history.length - 1]);
  const cutoff = newest - retentionDays * 86400000;
  const pruned = history.filter((s) => snapshotTime(s) >= cutoff);

  state.capacityHistory = pruned;
  state.capacitySnapshots = { ...state.capacitySnapshots, latest: pruned[pruned.length - 1] };
  notify();
  return snapshot;
}

/** The full chronological snapshot history (oldest → newest). */
export function getSnapshotHistory() {
  return state.capacityHistory;
}

/** The most recent snapshot in history (by generatedAt); null when empty. */
export function getLatestSnapshot() {
  const h = state.capacityHistory;
  return h.length ? h[h.length - 1] : null;
}

/** The snapshot immediately before the latest (for trend comparison); null when <2. */
export function getPreviousSnapshot() {
  const h = state.capacityHistory;
  return h.length >= 2 ? h[h.length - 2] : null;
}

/* ── Scoring weights (reserved for Dispatch Scoring milestone) ───────── */

export function getScoringWeights() {
  return { ...state.scoringWeights };
}

/** Merge a partial weight override onto the current weights. Non-numeric or
 *  negative values are ignored; weights are NOT auto-normalized (the scoring
 *  engine will decide whether to normalize), keeping this a pure store op. */
export function setScoringWeights(partial) {
  const next = { ...state.scoringWeights };
  for (const [k, v] of Object.entries(partial || {})) {
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) next[k] = n;
  }
  state.scoringWeights = next;
  notify();
  return { ...next };
}

/* ── Vehicle recommendations (Vehicle Recommendation Engine) ─────────── */

/** Store a vehicle recommendation under `key` (default 'latest'). Returns it.
 *  Recommendations are DERIVED state (recomputed from live assignments by the
 *  engine), so this is an in-memory cache of the most recent run — not a new
 *  persisted source of truth. */
export function saveVehicleRecommendation(recommendation, key = 'latest') {
  state.vehicleRecommendations = { ...state.vehicleRecommendations, [key]: recommendation };
  notify();
  return recommendation;
}

/** Read a stored vehicle recommendation by key (default 'latest'); null absent. */
export function getLatestVehicleRecommendation(key = 'latest') {
  return state.vehicleRecommendations[key] || null;
}

/** Current vehicle scoring weights (copy — mutate via setVehicleScoringWeights). */
export function getVehicleScoringWeights() {
  return { ...state.vehicleScoringWeights };
}

/** Merge a partial weight override onto the current vehicle weights. Non-numeric
 *  or negative values are ignored; weights are NOT auto-normalized (the engine
 *  normalizes by ΣW), keeping this a pure store op (mirrors setScoringWeights). */
export function setVehicleScoringWeights(partial) {
  const next = { ...state.vehicleScoringWeights };
  for (const [k, v] of Object.entries(partial || {})) {
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) next[k] = n;
  }
  state.vehicleScoringWeights = next;
  notify();
  return { ...next };
}

/* ── Dispatch recommendations (Dispatch Scoring Engine) ──────────────── */

/** Store a dispatch recommendation under `key` (default 'latest'). Returns it.
 *  Like the driver/vehicle recommendations this is DERIVED state (recomputed
 *  from live assignments by the engine) — an in-memory cache of the most recent
 *  run, not a new persisted source of truth. */
export function saveDispatchRecommendation(recommendation, key = 'latest') {
  state.dispatchRecommendations = { ...state.dispatchRecommendations, [key]: recommendation };
  notify();
  return recommendation;
}

/** Read a stored dispatch recommendation by key (default 'latest'); null absent. */
export function getLatestDispatchRecommendation(key = 'latest') {
  return state.dispatchRecommendations[key] || null;
}

/** Current dispatch scoring weights (copy — mutate via setDispatchScoringWeights). */
export function getDispatchScoringWeights() {
  return { ...state.dispatchScoringWeights };
}

/** Merge a partial weight override onto the current dispatch weights. Non-numeric
 *  or negative values are ignored; weights are NOT auto-normalized (the engine
 *  normalizes by ΣW), keeping this a pure store op (mirrors the other setters). */
export function setDispatchScoringWeights(partial) {
  const next = { ...state.dispatchScoringWeights };
  for (const [k, v] of Object.entries(partial || {})) {
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) next[k] = n;
  }
  state.dispatchScoringWeights = next;
  notify();
  return { ...next };
}

/* ── Request recommendations (Request Auto-Fill Intelligence) ────────── */

/** Cache a request recommendation package under `key` (default 'latest').
 *  DERIVED state (recomputed from the live request + assignments by the
 *  service) — an in-memory cache of the most recent run, not a persisted
 *  source of truth and never written back to the request. Returns the package. */
export function saveRequestRecommendation(recommendation, key = 'latest') {
  state.requestRecommendations = { ...state.requestRecommendations, [key]: recommendation };
  notify();
  return recommendation;
}

/** Read a cached request recommendation by key (default 'latest'); null absent. */
export function getRequestRecommendation(key = 'latest') {
  return state.requestRecommendations[key] || null;
}

/* ── Override logs (Admin Override Workflow) ─────────────────────────── */

/** Append an admin decision record (from createOverrideRecord) to the override
 *  log. Records are kept chronologically (append order). Returns the saved
 *  record. This is the audit trail the engines' recommendations are measured
 *  against — it records OUTCOMES only and creates no assignment. */
export function saveOverrideLog(record) {
  if (!record) return record;
  state.overrideLogs = [...state.overrideLogs, record];
  notify();
  return record;
}

/** The full chronological override log (copy — treat as read-only). */
export function getOverrideLogs() {
  return [...state.overrideLogs];
}

/** Acceptance statistics over the whole override log
 *  ({ total, accepted, overridden, acceptanceRate }). */
export function getOverrideStats() {
  return computeOverrideStats(state.overrideLogs);
}

/** Recommendation accuracy for one driver
 *  ({ driverId, recommended, accepted, accuracy }). */
export function getDriverAccuracy(driverId) {
  return computeDriverAccuracy(state.overrideLogs, driverId);
}

/** Recommendation accuracy for one vehicle
 *  ({ vehicleId, recommended, accepted, accuracy }). */
export function getVehicleAccuracy(vehicleId) {
  return computeVehicleAccuracy(state.overrideLogs, vehicleId);
}

/* ── Hydration (Dispatch Intelligence Persistence Layer, rc.1) ─────────
   Bulk-load persisted state from RTDB into the store on startup. Additive —
   existing setters/getters are unchanged. Each helper is defensive (filters
   malformed entries) so a partial / corrupt / missing node loads safely. */

/** Replace the override log with a persisted array (filters non-objects). */
export function hydrateOverrideLogs(logs) {
  state.overrideLogs = (Array.isArray(logs) ? logs : [])
    .filter((l) => l && typeof l === 'object');
  notify();
  return state.overrideLogs;
}

/** Replace the request-recommendation cache with a persisted map (object only). */
export function hydrateRequestRecommendations(map) {
  state.requestRecommendations = (map && typeof map === 'object' && !Array.isArray(map))
    ? { ...map }
    : {};
  notify();
  return state.requestRecommendations;
}

/** Replace the capacity history with a persisted array (oldest → newest) and
 *  mirror the newest to capacitySnapshots.latest (matches saveSnapshot). */
export function hydrateCapacityHistory(history) {
  const arr = (Array.isArray(history) ? history : [])
    .filter((s) => s && typeof s === 'object')
    .sort((a, b) => snapshotTime(a) - snapshotTime(b));
  state.capacityHistory = arr;
  state.capacitySnapshots = {
    ...state.capacitySnapshots,
    latest: arr.length ? arr[arr.length - 1] : (state.capacitySnapshots.latest || null),
  };
  notify();
  return state.capacityHistory;
}

/** Reset the store to defaults (test/teardown helper). */
export function resetDispatchIntelligence() {
  state = freshState();
  notify();
}
