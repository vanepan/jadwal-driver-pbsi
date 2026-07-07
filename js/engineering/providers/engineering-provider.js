/* ============================================================
   ENGINEERING-PROVIDER.JS — Engineering Operations Foundation
   (v1.20.0)

   The centralized data provider for Engineering: the seam between the store
   and a data source. This sprint it defines the INTERFACES only — it does NOT
   create Firebase listeners and imports no Firebase module. It reads through a
   tiny injected adapter { isConfigured, fetchData }, exactly as the Dispatch
   Intelligence persistence layer does, so the next sprint can drop the real
   Firebase functions in without changing a single consumer.

   Responsibilities (all read-through, one-shot loads — NO live subscriptions):
     loadAssignments   → store.hydrateAssignments
     loadTimeline      → an assignment's embedded timeline (from the store)
     loadNotifications → store.hydrateNotifications
     loadAnalytics     → compute from the store's assignments + cache it
     loadSettings      → the live engineering settings (delegated)
     loadAll           → assignments + notifications in one pass, then analytics

   FAILURE STRATEGY: every adapter touch is guarded. With no/undconfigured
   adapter, loads resolve to empty (the app runs on in-memory state) and never
   throw — foundation code must never block the app.

   No DOM, no Firebase, no `window`.
   ============================================================ */

'use strict';

import {
  hydrateAssignments, hydrateNotifications, hydrateWorkReports, getEngineeringState,
  setAnalytics, getAssignmentTimeline, getSettings,
} from '../stores/engineering-store.js';
import { buildEngineeringAnalytics } from '../analytics/engineering-analytics.js';

/** The RTDB layout this provider reads/writes THROUGH (single source of paths). */
export const ENGINEERING_ROOT = 'engineering';
export const ENGINEERING_PATHS = Object.freeze({
  assignments: `${ENGINEERING_ROOT}/assignments`,
  workReports: `${ENGINEERING_ROOT}/workReports`,
  notifications: `${ENGINEERING_ROOT}/notifications`,
  settings: `${ENGINEERING_ROOT}/settings`,
});

/** True when the injected adapter can actually read data.
    Accepts BOTH the new adapter interface (initialize/fetchData/…) and the
    legacy { isConfigured, fetchData } shape used by older callers/tests. */
function adapterReady(adapter) {
  if (!adapter || typeof adapter.fetchData !== 'function') return false;
  if (typeof adapter.isConfigured === 'function') return !!adapter.isConfigured();
  return true;   // new-interface adapters are ready once constructed
}

/** Guarded fetch — resolves to null on any failure/misconfiguration. */
async function safeFetch(adapter, path) {
  if (!adapterReady(adapter)) return null;
  try {
    return (await adapter.fetchData(path)) ?? null;
  } catch (err) {
    console.warn('[EngineeringProvider] fetch failed:', path, err && err.message ? err.message : err);
    return null;
  }
}

/**
 * Load assignments from the source into the store. No-op-safe: with no adapter
 * the store is left as-is and an empty result is reported.
 * @param {{isConfigured:Function, fetchData:Function}} [adapter]
 * @returns {Promise<{loaded:boolean, count:number}>}
 */
export async function loadAssignments(adapter) {
  const node = await safeFetch(adapter, ENGINEERING_PATHS.assignments);
  if (node == null) return { loaded: false, count: Object.keys(getEngineeringState().assignments).length };
  hydrateAssignments(node);
  return { loaded: true, count: Object.keys(getEngineeringState().assignments).length };
}

/** Load work reports from the source into the store. No-op-safe. */
export async function loadWorkReports(adapter) {
  const node = await safeFetch(adapter, ENGINEERING_PATHS.workReports);
  if (node == null) return { loaded: false, count: Object.keys(getEngineeringState().workReports).length };
  hydrateWorkReports(node);
  return { loaded: true, count: Object.keys(getEngineeringState().workReports).length };
}

/** Load the notification log from the source into the store. */
export async function loadNotifications(adapter) {
  const node = await safeFetch(adapter, ENGINEERING_PATHS.notifications);
  if (node == null) return { loaded: false, count: getEngineeringState().notifications.length };
  hydrateNotifications(node);
  return { loaded: true, count: getEngineeringState().notifications.length };
}

/**
 * The timeline for one assignment. Timeline is embedded per assignment (never a
 * separate node), so this reads straight from the store.
 * @param {string} assignmentId
 * @returns {Array<Object>}
 */
export function loadTimeline(assignmentId) {
  return getAssignmentTimeline(assignmentId);
}

/** The live settings (owned by engineering-settings; delegated, not duplicated). */
export function loadSettings() {
  return getSettings();
}

/**
 * Compute analytics from the store's current assignments and cache the snapshot.
 * @param {Object} [options]  passed to buildEngineeringAnalytics (now, thresholds)
 * @returns {Object} the analytics snapshot
 */
export function loadAnalytics(options = {}) {
  const st = getEngineeringState();
  const assignments = Object.values(st.assignments);
  const workReports = Object.values(st.workReports);
  const snapshot = buildEngineeringAnalytics(assignments, { ...options, workReports });
  setAnalytics(snapshot);
  return snapshot;
}

/**
 * One-shot bootstrap: load assignments + notifications from the source, then
 * (re)compute analytics from the loaded state. Never throws.
 * @param {{isConfigured:Function, fetchData:Function}} [adapter]
 * @param {Object} [options]  analytics options
 * @returns {Promise<{assignments:number, notifications:number, analytics:Object}>}
 */
export async function loadAll(adapter, options = {}) {
  const [a, w, n] = await Promise.all([
    loadAssignments(adapter), loadWorkReports(adapter), loadNotifications(adapter),
  ]);
  const analytics = loadAnalytics(options);
  return { assignments: a.count, workReports: w.count, notifications: n.count, analytics };
}

/* ── Adapter lifecycle + write-through (architecture prep for Firebase) ──────
   These give the store a single, guarded seam to a real backend WITHOUT
   implementing one. Every call is a safe no-op when the adapter is null or does
   not implement the method, so the app runs on in-memory state until a
   FirebaseAdapter is registered. No consumer changes when that lands. */

/**
 * Initialize the adapter (open connections / verify storage). Returns a
 * readiness descriptor; never throws.
 * @param {object} [adapter]
 * @returns {Promise<{ready:boolean, storageExists?:boolean, empty?:boolean}>}
 */
export async function initializeProvider(adapter) {
  if (adapter && typeof adapter.initialize === 'function') {
    try {
      const r = await adapter.initialize();
      return { ready: true, ...(r && typeof r === 'object' ? r : {}) };
    } catch (err) {
      console.warn('[EngineeringProvider] initialize failed:', err && err.message ? err.message : err);
      return { ready: false };
    }
  }
  // No initialize() → readiness falls back to whether reads are possible.
  const ready = adapterReady(adapter);
  return { ready, storageExists: ready };
}

/** Persist a new assignment through the adapter (no-op when unsupported). */
export async function saveAssignmentThrough(adapter, assignment) {
  if (adapter && typeof adapter.saveAssignment === 'function') {
    try { return await adapter.saveAssignment(assignment); }
    catch (err) { console.warn('[EngineeringProvider] saveAssignment failed:', err && err.message ? err.message : err); }
  }
  return assignment;
}

/** Persist an updated assignment through the adapter (no-op when unsupported). */
export async function updateAssignmentThrough(adapter, assignment) {
  if (adapter && typeof adapter.updateAssignment === 'function') {
    try { return await adapter.updateAssignment(assignment); }
    catch (err) { console.warn('[EngineeringProvider] updateAssignment failed:', err && err.message ? err.message : err); }
  }
  return assignment;
}

/** Delete an assignment through the adapter (no-op when unsupported). */
export async function deleteAssignmentThrough(adapter, id) {
  if (adapter && typeof adapter.deleteAssignment === 'function') {
    try { return await adapter.deleteAssignment(id); }
    catch (err) { console.warn('[EngineeringProvider] deleteAssignment failed:', err && err.message ? err.message : err); }
  }
  return false;
}

/** Persist a work report through the adapter (no-op when unsupported). */
export async function saveWorkReportThrough(adapter, report) {
  if (adapter && typeof adapter.saveWorkReport === 'function') {
    try { return await adapter.saveWorkReport(report); }
    catch (err) { console.warn('[EngineeringProvider] saveWorkReport failed:', err && err.message ? err.message : err); }
  }
  return report;
}

/** Delete a work report through the adapter (no-op when unsupported). */
export async function deleteWorkReportThrough(adapter, id) {
  if (adapter && typeof adapter.deleteWorkReport === 'function') {
    try { return await adapter.deleteWorkReport(id); }
    catch (err) { console.warn('[EngineeringProvider] deleteWorkReport failed:', err && err.message ? err.message : err); }
  }
  return false;
}

/**
 * Persist an ownership-sensitive change ATOMICALLY through the adapter's
 * transaction. `transform(currentRaw)` is applied on top of the latest committed
 * value at the source, so concurrent writers never lose each other's updates.
 * Returns { committed, value } — value is the authoritative post-write record.
 * No-op-safe: with no transacting adapter, returns { committed:false, value:null }
 * and the caller falls back to its optimistic store update.
 * @param {object} [adapter]
 * @param {string} id
 * @param {(currentRaw:*) => *} transform
 * @returns {Promise<{committed:boolean, value:*}>}
 */
export async function transactAssignmentThrough(adapter, id, transform) {
  if (adapter && typeof adapter.transactAssignment === 'function') {
    try { return await adapter.transactAssignment(id, transform); }
    catch (err) { console.warn('[EngineeringProvider] transactAssignment failed:', err && err.message ? err.message : err); }
  }
  return { committed: false, value: null };
}

/** Subscribe to live storage changes. Returns an unsubscribe function (no-op safe). */
export function subscribeProvider(adapter, callback) {
  if (adapter && typeof adapter.subscribe === 'function') {
    try { return adapter.subscribe(callback) || (() => {}); }
    catch (err) { console.warn('[EngineeringProvider] subscribe failed:', err && err.message ? err.message : err); }
  }
  return () => {};
}

/** Dispose the adapter (close subscriptions/connections). Never throws. */
export function disposeProvider(adapter) {
  if (adapter && typeof adapter.dispose === 'function') {
    try { adapter.dispose(); }
    catch (err) { console.warn('[EngineeringProvider] dispose failed:', err && err.message ? err.message : err); }
  }
}
