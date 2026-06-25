/* ============================================================
   CAPACITY-TREND-ENGINE.JS — Dispatch Intelligence Hardening
   (v1.16.4.11-alpha.1.1)

   Turns a SEQUENCE of capacity snapshots into direction: how each driver's
   utilization moved between the previous snapshot and the latest one, and how
   the fleet moved overall. The Capacity Snapshot Service answers "where are we
   now?"; this engine answers "which way are we heading?".

   TREND RULE (per driver and for the fleet average):
     delta = current − previous
     delta >  5  → UP        (load rising meaningfully)
     delta < -5  → DOWN      (load easing meaningfully)
     otherwise   → STABLE    (±5 is noise, not a trend)
   The ±5 deadband keeps a one- or two-assignment wobble (each assignment is
   2 utilization points at the default 50-capacity) from reading as a trend.

   PURE comparison core (buildDriverTrends / generateFleetTrend accept explicit
   snapshots) + thin store-backed convenience wrappers (getCapacityTrend /
   getFleetTrend read the latest two from the history). No DOM, no Firebase.
   ============================================================ */

'use strict';

import { CAPACITY_STATUS } from './driver-capacity-engine.js';
import { getLatestSnapshot, getPreviousSnapshot } from '../stores/dispatch-intelligence-store.js';

export const TREND = Object.freeze({ UP: 'UP', DOWN: 'DOWN', STABLE: 'STABLE' });

/** ±5 deadband: a move within ±DELTA_THRESHOLD is STABLE, not a trend. */
export const DELTA_THRESHOLD = 5;

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

/** Classify a utilization delta into a trend direction. */
export function classifyTrend(delta) {
  const d = num(delta);
  if (d > DELTA_THRESHOLD) return TREND.UP;
  if (d < -DELTA_THRESHOLD) return TREND.DOWN;
  return TREND.STABLE;
}

/** Index a snapshot's driver rows by driverId for O(1) pairing. */
function indexByDriver(snapshot) {
  const map = new Map();
  const rows = snapshot && Array.isArray(snapshot.drivers) ? snapshot.drivers : [];
  for (const r of rows) map.set(r.driverId, r);
  return map;
}

/**
 * @typedef {Object} DriverTrend
 * @property {string} driverId
 * @property {string} driverName
 * @property {number} previousUtilization   0 when the driver is new this snapshot
 * @property {number} currentUtilization
 * @property {number} delta                  current − previous
 * @property {'UP'|'DOWN'|'STABLE'} trend
 * @property {'LOW'|'NORMAL'|'HIGH'|'OVERLOADED'} status  current status
 */

/**
 * Per-driver trend between two snapshots. Drivers are matched by driverId; a
 * driver present only in `current` is treated as rising from 0, one present
 * only in `previous` (no longer active) is omitted (no current load to trend).
 * @param {Object} previous  earlier CapacitySnapshot (may be null)
 * @param {Object} current   later CapacitySnapshot
 * @returns {DriverTrend[]} sorted by |delta| desc (biggest movers first)
 */
export function buildDriverTrends(previous, current) {
  const prevMap = indexByDriver(previous);
  const currRows = current && Array.isArray(current.drivers) ? current.drivers : [];

  const trends = currRows.map((row) => {
    const prev = prevMap.get(row.driverId);
    const previousUtilization = prev ? num(prev.utilizationPercent) : 0;
    const currentUtilization = num(row.utilizationPercent);
    const delta = currentUtilization - previousUtilization;
    return {
      driverId: row.driverId,
      driverName: row.driverName || row.driverId,
      previousUtilization,
      currentUtilization,
      delta,
      trend: classifyTrend(delta),
      status: row.status || CAPACITY_STATUS.LOW,
    };
  });

  trends.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)
    || String(a.driverName).localeCompare(String(b.driverName), 'id'));
  return trends;
}

/**
 * @typedef {Object} FleetTrend
 * @property {number} averageUtilization   current fleet average (0–100)
 * @property {number} previousAverageUtilization
 * @property {number} delta                current − previous average
 * @property {'UP'|'DOWN'|'STABLE'} trend
 * @property {number} overloadedDrivers
 * @property {number} highDrivers
 * @property {number} normalDrivers
 * @property {number} lowDrivers
 */

function averageUtil(snapshot) {
  const rows = snapshot && Array.isArray(snapshot.drivers) ? snapshot.drivers : [];
  if (!rows.length) return 0;
  return Math.round(rows.reduce((s, r) => s + num(r.utilizationPercent), 0) / rows.length);
}

function statusCounts(snapshot) {
  const rows = snapshot && Array.isArray(snapshot.drivers) ? snapshot.drivers : [];
  const c = { overloadedDrivers: 0, highDrivers: 0, normalDrivers: 0, lowDrivers: 0 };
  for (const r of rows) {
    if (r.status === CAPACITY_STATUS.OVERLOADED) c.overloadedDrivers++;
    else if (r.status === CAPACITY_STATUS.HIGH) c.highDrivers++;
    else if (r.status === CAPACITY_STATUS.NORMAL) c.normalDrivers++;
    else c.lowDrivers++;
  }
  return c;
}

/**
 * Fleet-level trend summary between two snapshots. When called with no args it
 * reads the latest two snapshots from the store history.
 * @param {Object} [previous]  earlier snapshot (defaults to store previous)
 * @param {Object} [current]   later snapshot   (defaults to store latest)
 * @returns {FleetTrend}
 */
export function generateFleetTrend(previous = getPreviousSnapshot(), current = getLatestSnapshot()) {
  const averageUtilization = averageUtil(current);
  const previousAverageUtilization = averageUtil(previous);
  const delta = averageUtilization - previousAverageUtilization;
  return {
    averageUtilization,
    previousAverageUtilization,
    delta,
    trend: classifyTrend(delta),
    ...statusCounts(current),
  };
}

/**
 * Convenience: the full trend report (per-driver + fleet) for the latest two
 * snapshots in the store. Returns empty trends when there is no current snapshot.
 * @returns {{ generatedAt:(string|null), drivers:DriverTrend[], fleet:FleetTrend }}
 */
export function getCapacityTrend() {
  const previous = getPreviousSnapshot();
  const current = getLatestSnapshot();
  return {
    generatedAt: current ? current.generatedAt : null,
    drivers: buildDriverTrends(previous, current),
    fleet: generateFleetTrend(previous, current),
  };
}
