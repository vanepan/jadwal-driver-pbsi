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
  hydrateAssignments, hydrateNotifications, getEngineeringState,
  setAnalytics, getAssignmentTimeline, getSettings,
} from '../stores/engineering-store.js';
import { buildEngineeringAnalytics } from '../analytics/engineering-analytics.js';

/** The RTDB layout this provider reads/writes THROUGH (single source of paths). */
export const ENGINEERING_ROOT = 'engineering';
export const ENGINEERING_PATHS = Object.freeze({
  assignments: `${ENGINEERING_ROOT}/assignments`,
  notifications: `${ENGINEERING_ROOT}/notifications`,
  settings: `${ENGINEERING_ROOT}/settings`,
});

/** True when the injected adapter can actually read data. */
function adapterReady(adapter) {
  return !!(adapter
    && typeof adapter.isConfigured === 'function' && adapter.isConfigured()
    && typeof adapter.fetchData === 'function');
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
  const assignments = Object.values(getEngineeringState().assignments);
  const snapshot = buildEngineeringAnalytics(assignments, options);
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
  const [a, n] = await Promise.all([loadAssignments(adapter), loadNotifications(adapter)]);
  const analytics = loadAnalytics(options);
  return { assignments: a.count, notifications: n.count, analytics };
}
