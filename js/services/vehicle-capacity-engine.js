/* ============================================================
   VEHICLE-CAPACITY-ENGINE.JS — Dispatch Intelligence
   (v1.16.4.11-alpha.3)

   The vehicle-side twin of driver-capacity-engine: a pure, reusable
   capacity-measurement layer derived ENTIRELY from the assignment records
   Driver Operations already produces. It answers one question per vehicle —
   "how heavily is this vehicle used, and how much room is left?" — and exposes
   it as a normalized 0–100 utilization plus the same four-band status
   (LOW / NORMAL / HIGH / OVERLOADED) the driver engine uses.

   REUSE, NOT DUPLICATION:
     The utilization math, the configurable monthly-capacity reference, and the
     CONFIGURABLE status bands all live in driver-capacity-engine /
     dispatch-intelligence-config. This module imports those primitives
     (calculateUtilization, calculateAvailableSlots, calculateStatus,
     CAPACITY_STATUS, CAPACITY_WINDOWS) rather than re-declaring any threshold,
     so re-tuning the bands re-tunes vehicle capacity automatically and there is
     exactly ONE definition of "what 76% means". The only vehicle-specific
     concern here is identity resolution: assignments reference a vehicle by the
     `vehicle` name string (mirrors assignments.checkVehicleConflict), not by id.

   PURE: no DOM, no Firebase, no `window`. The caller passes the vehicle's
   assignment set (or the full operational set + the vehicle's identities) and
   the engine computes and returns.
   ============================================================ */

'use strict';

import {
  calculateUtilization,
  calculateAvailableSlots,
  calculateStatus,
  CAPACITY_STATUS,
  CAPACITY_WINDOWS,
  DEFAULT_MONTHLY_CAPACITY,
} from './driver-capacity-engine.js';
import { getDispatchConfig } from '../config/dispatch-intelligence-config.js';

/** Re-export the shared capacity vocabulary so vehicle consumers import from one
 *  place without reaching past this module into the driver engine. */
export {
  CAPACITY_STATUS,
  CAPACITY_WINDOWS,
  DEFAULT_MONTHLY_CAPACITY,
  calculateUtilization,
  calculateAvailableSlots,
  calculateStatus,
};

/** The active monthly-capacity reference (live config). */
function configCapacity() { return getDispatchConfig().monthlyCapacity; }

/** Assignment statuses that do NOT represent consumed capacity (cancelled). */
const NON_CAPACITY_STATUSES = new Set(['cancelled']);

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function normalizeName(value) { return String(value || '').trim().toLowerCase(); }

/** Local-day ISO (yyyy-mm-dd), timezone-safe — mirrors driver-capacity-engine. */
function dayISO(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

/** The operational date of an assignment: `date` falling back to `startDate`. */
function assignmentDay(a) {
  return (a && (a.date || a.startDate)) ? String(a.date || a.startDate).slice(0, 10) : '';
}

/** Whole local days between two yyyy-mm-dd strings (a − b); null if unparseable. */
function dayDiff(aISO, bISO) {
  if (!aISO || !bISO) return null;
  const a = Date.parse(`${aISO}T00:00:00`);
  const b = Date.parse(`${bISO}T00:00:00`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((a - b) / 86400000);
}

/** Every normalized name a vehicle answers to (name + id + any legacy names). */
export function vehicleIdentities(vehicle) {
  if (!vehicle) return [];
  const names = [
    vehicle.name,
    vehicle.vehicleId,
    vehicle.normalizedName,
    ...(Array.isArray(vehicle.legacyNames) ? vehicle.legacyNames : []),
    ...(Array.isArray(vehicle.aliases) ? vehicle.aliases : []),
  ];
  return [...new Set(names.map(normalizeName).filter(Boolean))];
}

/**
 * @typedef {Object} VehicleCapacity
 * @property {string} vehicleId
 * @property {number} totalTrips              all-time non-cancelled trip count for this vehicle
 * @property {number} assignmentsLast7Days     non-cancelled in the trailing 7 days
 * @property {number} assignmentsLast30Days    non-cancelled in the trailing 30 days
 * @property {number} utilizationPercent       0–100 (last-30 / monthlyCapacity)
 * @property {number} availableSlots           remaining bookable slots this month (≥0)
 * @property {'LOW'|'NORMAL'|'HIGH'|'OVERLOADED'} status
 * @property {number} monthlyCapacity          the reference used (transparency; additive)
 */

/**
 * Compute one vehicle's capacity from its assignment history.
 *
 * `assignments` may be the vehicle's own list (already filtered) OR the full
 * operational set — by default the engine keeps only records whose `vehicle`
 * matches one of the vehicle's identities (name / id / aliases). Pass
 * `options.preFiltered = true` to skip matching when the caller already
 * narrowed the list. Cancelled assignments are always excluded.
 *
 * @param {string} vehicleId
 * @param {Array<Object>} assignments  operational assignment records
 * @param {Object} [options]
 * @param {number}  [options.monthlyCapacity=50]
 * @param {Date|string} [options.now]        "today" reference (default: real now)
 * @param {string[]} [options.identities]    normalized names this vehicle answers to
 * @param {boolean} [options.preFiltered]    treat `assignments` as already this vehicle's
 * @returns {VehicleCapacity}
 */
export function calculateVehicleCapacity(vehicleId, assignments, options = {}) {
  const monthlyCapacity = num(options.monthlyCapacity) > 0 ? num(options.monthlyCapacity) : configCapacity();
  const today = dayISO(options.now || new Date());
  const identities = new Set(
    (Array.isArray(options.identities) && options.identities.length
      ? options.identities
      : [vehicleId]
    ).filter(Boolean).map(normalizeName),
  );

  const list = Array.isArray(assignments) ? assignments : [];
  const mine = options.preFiltered
    ? list
    : list.filter((a) => a && identities.has(normalizeName(a.vehicle)));

  let totalTrips = 0;
  let assignmentsLast7Days = 0;
  let assignmentsLast30Days = 0;

  for (const a of mine) {
    if (a && NON_CAPACITY_STATUSES.has(a.status)) continue; // cancelled never counts
    totalTrips++;
    const ageDays = dayDiff(today, assignmentDay(a)); // ≥0 = past/today, <0 = future
    if (ageDays === null || ageDays < 0) continue;     // future bookings: total only
    if (ageDays < CAPACITY_WINDOWS.month) assignmentsLast30Days++;
    if (ageDays < CAPACITY_WINDOWS.recent) assignmentsLast7Days++;
  }

  const utilizationPercent = calculateUtilization(assignmentsLast30Days, monthlyCapacity);
  const availableSlots = calculateAvailableSlots(utilizationPercent, monthlyCapacity);
  const status = calculateStatus(utilizationPercent);

  return {
    vehicleId: vehicleId != null ? String(vehicleId) : '',
    totalTrips,
    assignmentsLast7Days,
    assignmentsLast30Days,
    utilizationPercent,
    availableSlots,
    status,
    monthlyCapacity,
  };
}
