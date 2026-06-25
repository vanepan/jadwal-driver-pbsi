/* ============================================================
   CAPACITY-SCHEDULER.JS — Dispatch Intelligence Hardening
   (v1.16.4.11-alpha.1.1)

   The orchestration seam that turns the live operational data into a stored,
   historical capacity snapshot: it asks the Snapshot Service to build a
   snapshot and hands it to the Store (which applies retention). It is the ONE
   place a future timer / cron / page-load hook will call — foundation only, so
   it sets up NO timers and attaches to NO UI this release.

   REUSABLE BY DESIGN: the scheduler does not fetch data itself. The caller
   passes the current drivers + assignments arrays (from drivers-store / the
   operational state), keeping the scheduler pure of Firebase/DOM and trivially
   testable. A future caller can wire it to a real interval without changing
   this module.

   runSnapshot()       → always generate + save a snapshot.
   runDailySnapshot()  → generate + save at most ONCE per local day (idempotent),
                         so a daily hook that fires repeatedly never duplicates.
   ============================================================ */

'use strict';

import { generateCapacitySnapshot } from './capacity-snapshot-service.js';
import { saveSnapshot, getSnapshotHistory } from '../stores/dispatch-intelligence-store.js';

/** Local-day ISO (yyyy-mm-dd) of a date/ISO string, timezone-safe. */
function dayISO(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

/**
 * Generate a system-wide capacity snapshot from the supplied operational data
 * and persist it to the store history (retention applied there).
 *
 * @param {Array<Object>} drivers      driver records
 * @param {Array<Object>} assignments  the operational assignment set
 * @param {Object} [options]           forwarded to generateCapacitySnapshot
 *                                     (monthlyCapacity, now, includeInactive)
 *                                     + saveSnapshot (retentionDays)
 * @returns {Object} the generated snapshot
 */
export function runSnapshot(drivers, assignments, options = {}) {
  const snapshot = generateCapacitySnapshot(drivers, assignments, options);
  saveSnapshot(snapshot, options);
  return snapshot;
}

/**
 * Generate + save a snapshot at most once per local day. If a snapshot already
 * exists in history for today's date, it is a no-op and returns the existing
 * one. Makes a "run daily" hook safe to fire more than once a day.
 *
 * @param {Array<Object>} drivers
 * @param {Array<Object>} assignments
 * @param {Object} [options]   + options.now sets "today" (default: real now)
 * @returns {{ created:boolean, snapshot:Object }}
 */
export function runDailySnapshot(drivers, assignments, options = {}) {
  const today = dayISO(options.now || new Date());
  const existing = getSnapshotHistory().find((s) => dayISO(s.generatedAt) === today);
  if (existing) return { created: false, snapshot: existing };
  const snapshot = runSnapshot(drivers, assignments, options);
  return { created: true, snapshot };
}
