/* ============================================================
   CAPACITY-SNAPSHOT-SERVICE.JS — Dispatch Intelligence Foundation
   (v1.16.4.11-alpha.1)

   Aggregates the per-driver Driver Capacity Engine into ONE system-wide
   snapshot: every driver's utilization + status at a point in time, plus a
   fleet summary. This is the object the Dispatch Intelligence Store caches
   and the Driver Capacity Card renders from.

   RESOLUTION — name → driverId:
     Operational assignment records reference a driver by NAME (a.driver),
     not by id (see js/assignments.js). Drivers may also carry legacyNames /
     a normalizedName (js/drivers-store.js). This service therefore builds a
     normalized identity index from the supplied driver list so each driver's
     assignments are grouped correctly even across renamed/aliased records —
     reusing the EXISTING assignment data source, never duplicating storage.

   PURE: no DOM, no Firebase, no `window`. Callers pass in the live drivers
   and assignments arrays (from drivers-store / the operational state); the
   service computes and returns — it persists nothing itself. That keeps it
   node-testable and lets the store own caching.
   ============================================================ */

'use strict';

import {
  calculateDriverCapacity,
  CAPACITY_STATUS,
} from './driver-capacity-engine.js';
import { getDispatchConfig } from '../config/dispatch-intelligence-config.js';

function normalizeName(value) {
  return String(value || '').trim().toLowerCase();
}

/** Every name a driver answers to (display name + normalizedName + legacyNames),
 *  normalized and de-duped. Used to match assignment.driver back to the driver. */
function driverIdentities(driver) {
  const names = [driver.name, driver.normalizedName, ...(Array.isArray(driver.legacyNames) ? driver.legacyNames : [])];
  return [...new Set(names.map(normalizeName).filter(Boolean))];
}

/**
 * @typedef {Object} CapacitySnapshotDriver
 * @property {string} driverId
 * @property {string} driverName
 * @property {number} utilizationPercent
 * @property {'LOW'|'NORMAL'|'HIGH'|'OVERLOADED'} status
 * @property {number} totalAssignments
 * @property {number} assignmentsLast7Days
 * @property {number} assignmentsLast30Days
 * @property {number} availableSlots
 */

/**
 * @typedef {Object} CapacitySnapshot
 * @property {string} generatedAt              ISO timestamp
 * @property {number} monthlyCapacity          reference used for every driver
 * @property {CapacitySnapshotDriver[]} drivers  sorted by utilization desc
 * @property {{
 *   totalDrivers:number,
 *   averageUtilization:number,
 *   byStatus:{LOW:number,NORMAL:number,HIGH:number,OVERLOADED:number}
 * }} summary
 */

/**
 * Generate a system-wide capacity snapshot.
 *
 * @param {Array<Object>} drivers      driver records ({ id, name, legacyNames?, normalizedName? })
 * @param {Array<Object>} assignments  the operational assignment set (driver-by-name)
 * @param {Object} [options]
 * @param {number} [options.monthlyCapacity=50]
 * @param {Date|string} [options.now]                "today" reference
 * @param {boolean} [options.includeInactive=true]   include drivers with no work
 * @returns {CapacitySnapshot}
 */
export function generateCapacitySnapshot(drivers, assignments, options = {}) {
  const monthlyCapacity = Number(options.monthlyCapacity) > 0 ? Number(options.monthlyCapacity) : getDispatchConfig().monthlyCapacity;
  const now = options.now || new Date();
  const driverList = Array.isArray(drivers) ? drivers : [];
  const asgList = Array.isArray(assignments) ? assignments : [];

  // Bucket assignments by normalized driver name once (O(n)), then hand each
  // driver only their own slice to the engine (preFiltered) — avoids an
  // O(drivers × assignments) re-scan.
  const byName = new Map();
  for (const a of asgList) {
    const key = normalizeName(a && a.driver);
    if (!key) continue;
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(a);
  }

  const rows = driverList.map((driver) => {
    const mine = [];
    for (const id of driverIdentities(driver)) {
      const bucket = byName.get(id);
      if (bucket) mine.push(...bucket);
    }
    const cap = calculateDriverCapacity(driver.id, mine, { monthlyCapacity, now, preFiltered: true });
    return {
      driverId: driver.id,
      driverName: driver.name || driver.id,
      utilizationPercent: cap.utilizationPercent,
      status: cap.status,
      totalAssignments: cap.totalAssignments,
      assignmentsLast7Days: cap.assignmentsLast7Days,
      assignmentsLast30Days: cap.assignmentsLast30Days,
      availableSlots: cap.availableSlots,
    };
  });

  const visible = options.includeInactive === false
    ? rows.filter((r) => r.totalAssignments > 0)
    : rows;

  visible.sort((a, b) => (b.utilizationPercent - a.utilizationPercent)
    || String(a.driverName).localeCompare(String(b.driverName), 'id'));

  const byStatus = { [CAPACITY_STATUS.LOW]: 0, [CAPACITY_STATUS.NORMAL]: 0, [CAPACITY_STATUS.HIGH]: 0, [CAPACITY_STATUS.OVERLOADED]: 0 };
  for (const r of visible) byStatus[r.status] = (byStatus[r.status] || 0) + 1;

  const averageUtilization = visible.length
    ? Math.round(visible.reduce((s, r) => s + r.utilizationPercent, 0) / visible.length)
    : 0;

  return {
    generatedAt: new Date(now).toISOString(),
    monthlyCapacity,
    drivers: visible,
    summary: {
      totalDrivers: visible.length,
      averageUtilization,
      byStatus,
    },
  };
}
