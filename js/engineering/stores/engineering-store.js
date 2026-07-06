/* ============================================================
   ENGINEERING-STORE.JS — Engineering Operations Foundation
   (v1.20.0)

   The single in-memory home for Engineering module state: the assignments
   (keyed by id — each carries its OWN embedded timeline, so timeline is never
   duplicated at the top level), the notification log, the cached analytics
   snapshot, the active filters, and the UI session. Settings are owned by
   engineering-settings.js and read through a delegating getter here rather
   than copied, so there is exactly one source of truth for each concern.

   The listener pattern mirrors dispatch-intelligence-store / settings-store:
   getState + registerChangeListener + notify, plus hydrate helpers so a future
   Firebase read-through (engineering-provider) can bulk-load state, and a reset
   for tests. NO Firebase and NO listeners are created here.

   The store also owns the per-day assignment-number SEQUENCE so numbers are
   deterministic and gap-free; it is recomputed on hydration from the loaded
   assignment numbers to avoid collisions after a reload.

   PURE-ish: holds state and notifies listeners. No DOM, no `window`.
   ============================================================ */

'use strict';

import { dayISO, isPlainObject, num } from '../utils/engineering-utils.js';
import { normalizeAssignment } from '../models/engineering-assignment.js';
import { getEngineeringSettings } from '../settings/engineering-settings.js';

function freshState() {
  return {
    assignments: {},        // id → EngineeringAssignment (timeline embedded)
    notifications: [],      // chronological EngineeringNotification[]
    analytics: null,        // cached analytics snapshot (engineering-analytics)
    filters: {},            // active list filters (status/category/priority/…)
    session: {},            // ephemeral UI session (selected id, view, …)
    sequenceByDay: {},      // yyyymmdd → highest assignment-number sequence used
  };
}

let state = freshState();
let onChangeCallbacks = [];

function notify() {
  for (const cb of onChangeCallbacks) {
    try { cb(state); } catch (err) { console.warn('[EngineeringStore] listener threw', err); }
  }
}

/** Current state (live reference — treat as read-only; mutate via the setters). */
export function getEngineeringState() {
  return state;
}

/** Subscribe to any state change. Returns an unsubscribe function. */
export function registerEngineeringChangeListener(callback) {
  if (typeof callback !== 'function') return () => {};
  onChangeCallbacks.push(callback);
  return () => { onChangeCallbacks = onChangeCallbacks.filter((cb) => cb !== callback); };
}

/* ── Assignments ─────────────────────────────────────────────────────── */

/**
 * Insert or replace an assignment (by id). Records its per-day number sequence
 * so future numbers do not collide. Returns the stored assignment.
 */
export function upsertAssignment(assignment) {
  if (!assignment || !assignment.id) return assignment;
  state.assignments = { ...state.assignments, [assignment.id]: assignment };
  trackSequence(assignment.assignmentNumber);
  notify();
  return assignment;
}

/** Read one assignment by id; null when absent. */
export function getAssignment(id) {
  return state.assignments[id] || null;
}

/** That assignment's embedded timeline (empty array when absent). */
export function getAssignmentTimeline(id) {
  const a = state.assignments[id];
  return a && Array.isArray(a.timeline) ? a.timeline : [];
}

/**
 * List assignments, optionally filtered. Filter keys: status, category,
 * priority, building, source (each an exact match; arrays match any-of).
 * @param {Object} [filter]
 * @returns {Array<Object>}
 */
export function listAssignments(filter) {
  const all = Object.values(state.assignments);
  const f = isPlainObject(filter) ? filter : null;
  if (!f) return all;
  const matches = (value, cond) => (Array.isArray(cond) ? cond.includes(value) : value === cond);
  return all.filter((a) => Object.entries(f).every(([k, cond]) => cond == null || matches(a[k], cond)));
}

/** Remove an assignment by id. Returns whether it existed. */
export function removeAssignment(id) {
  if (!state.assignments[id]) return false;
  const next = { ...state.assignments };
  delete next[id];
  state.assignments = next;
  notify();
  return true;
}

/* ── Assignment-number sequence (per day) ────────────────────────────── */

/** Record a number's sequence into the per-day high-water map. */
function trackSequence(assignmentNumber) {
  const m = /-(\d{8})-(\d+)$/.exec(String(assignmentNumber || ''));
  if (!m) return;
  const [, day, seq] = m;
  const n = num(seq);
  if (n > (state.sequenceByDay[day] || 0)) {
    state.sequenceByDay = { ...state.sequenceByDay, [day]: n };
  }
}

/**
 * The next assignment-number sequence for a day (1-based, gap-free). Advances
 * the high-water mark so two creates in the same day never collide.
 * @param {Date|number|string} [now]
 * @returns {number}
 */
export function nextAssignmentSequence(now) {
  const day = dayISO(now).replace(/-/g, '');
  const next = (state.sequenceByDay[day] || 0) + 1;
  state.sequenceByDay = { ...state.sequenceByDay, [day]: next };
  return next;
}

/* ── Notifications ───────────────────────────────────────────────────── */

/** Append a notification to the log. Returns it. */
export function addNotification(notification) {
  if (!notification) return notification;
  state.notifications = [...state.notifications, notification];
  notify();
  return notification;
}

/** The full notification log (copy — read-only). */
export function getNotifications() {
  return [...state.notifications];
}

/* ── Analytics cache ─────────────────────────────────────────────────── */

/** Cache the latest analytics snapshot. */
export function setAnalytics(snapshot) {
  state.analytics = snapshot;
  notify();
  return snapshot;
}

/** The cached analytics snapshot; null when never computed. */
export function getAnalytics() {
  return state.analytics;
}

/* ── Settings (delegated — never duplicated) ─────────────────────────── */

/** The live engineering settings (owned by engineering-settings.js). */
export function getSettings() {
  return getEngineeringSettings();
}

/* ── Filters + session ───────────────────────────────────────────────── */

export function setFilters(filters) {
  state.filters = isPlainObject(filters) ? { ...filters } : {};
  notify();
  return state.filters;
}

export function getFilters() {
  return { ...state.filters };
}

export function setSession(patch) {
  state.session = { ...state.session, ...(isPlainObject(patch) ? patch : {}) };
  notify();
  return { ...state.session };
}

export function getSession() {
  return { ...state.session };
}

/* ── Hydration (read-through from a future persistence layer) ────────── */

/**
 * Replace the assignments map from a persisted node (array or keyed object).
 * Malformed entries are dropped by normalizeAssignment; the per-day sequence
 * map is recomputed so post-reload numbering never collides.
 * @param {Array|Object} node
 */
export function hydrateAssignments(node) {
  const list = Array.isArray(node)
    ? node
    : (isPlainObject(node) ? Object.values(node) : []);
  const map = {};
  const sequenceByDay = {};
  for (const raw of list) {
    const a = normalizeAssignment(raw);
    if (!a || !a.id) continue;
    map[a.id] = a;
    const m = /-(\d{8})-(\d+)$/.exec(String(a.assignmentNumber || ''));
    if (m) {
      const [, day, seq] = m;
      if (num(seq) > (sequenceByDay[day] || 0)) sequenceByDay[day] = num(seq);
    }
  }
  state.assignments = map;
  state.sequenceByDay = sequenceByDay;
  notify();
  return state.assignments;
}

/** Replace the notification log from a persisted node (filters non-objects). */
export function hydrateNotifications(node) {
  const list = Array.isArray(node)
    ? node
    : (isPlainObject(node) ? Object.values(node) : []);
  state.notifications = list.filter((n) => n && typeof n === 'object');
  notify();
  return state.notifications;
}

/** Reset the store to defaults (test/teardown helper). */
export function resetEngineeringStore() {
  state = freshState();
  notify();
}
