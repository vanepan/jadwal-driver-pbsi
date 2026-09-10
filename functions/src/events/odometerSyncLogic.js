'use strict';

/* ============================================================
   events/odometerSyncLogic.js — PURE decision helpers for the vehicle-
   odometer sync trigger (onAssignmentOdometerSync.js).

   No `db`, no Admin SDK, no firebase-functions import — so this is unit-
   testable in plain Node (functions/scripts/vehicle-odometer-sync-check.js).
   The trigger handler wires these to the real /vehicles transaction.
   ============================================================ */

const lc = (v) => String(v == null ? '' : v).trim().toLowerCase();
const toNum = (v) => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Given the before/after snapshots of an /assignments/{id} write, decide
 * whether a vehicle-odometer sync should run. Syncs only on a COMPLETED
 * assignment with a usable numeric endOdometer and a non-empty vehicle;
 * skips an unchanged resave (churn guard) and skips when endOdometer is
 * below a present startOdometer (a backward reading is itself corrupt).
 *
 * @param {object|null} before
 * @param {object|null} after
 * @returns {{sync:false, reason:string} | {sync:true, vehicleName:string, endOdometer:number}}
 */
function shouldSyncOdometer(before, after) {
  if (!after || after.status !== 'completed') return { sync: false, reason: 'not_completed' };

  const end = toNum(after.endOdometer);
  if (end == null || end <= 0) return { sync: false, reason: 'no_end_odometer' };

  const start = toNum(after.startOdometer);
  if (start != null && end < start) return { sync: false, reason: 'end_below_start' };

  const vehicleName = String(after.vehicle == null ? '' : after.vehicle).trim();
  if (!vehicleName) return { sync: false, reason: 'no_vehicle' };

  if (before && before.status === 'completed'
      && toNum(before.endOdometer) === end
      && lc(before.vehicle) === lc(after.vehicle)) {
    return { sync: false, reason: 'unchanged' };
  }

  return { sync: true, vehicleName, endOdometer: end };
}

/**
 * Resolve an assignment's `vehicle` NAME to a `/vehicles` key. FAIL-CLOSED:
 * exact (trimmed) name first, then a case-insensitive match for a harmless
 * casing/whitespace difference; anything ambiguous (>1) or absent returns
 * { ok:false } and is NOT written. Archived vehicle records are ignored.
 *
 * @param {string} vehicleName
 * @param {Object<string, {name?:string, archived?:boolean}>} vehiclesMap  raw /vehicles node
 * @returns {{ok:true, vehicleId:string, normalized?:boolean} | {ok:false, reason:string, candidates?:string[]}}
 */
function resolveVehicleForSync(vehicleName, vehiclesMap) {
  const name = String(vehicleName == null ? '' : vehicleName).trim();
  if (!name) return { ok: false, reason: 'empty_name' };

  const entries = Object.entries(vehiclesMap || {}).filter(([, v]) => v && v.archived !== true);

  const exact = entries.filter(([, v]) => String(v.name == null ? '' : v.name).trim() === name);
  if (exact.length === 1) return { ok: true, vehicleId: exact[0][0] };
  if (exact.length > 1) return { ok: false, reason: 'ambiguous_exact', candidates: exact.map(([k]) => k) };

  const target = lc(name);
  const ci = entries.filter(([, v]) => lc(v.name) === target);
  if (ci.length === 1) return { ok: true, vehicleId: ci[0][0], normalized: true };
  if (ci.length > 1) return { ok: false, reason: 'ambiguous_ci', candidates: ci.map(([k]) => k) };

  return { ok: false, reason: 'not_found' };
}

/**
 * The monotonic decision for the /vehicles/{id}/odometer transaction: given
 * the current stored value (any type) and the new end reading, return the
 * string to write, or `undefined` to abort (no-op) when the vehicle is
 * already at/above it. Monotonic + idempotent.
 */
function nextOdometerValue(currentRaw, endOdometer) {
  const c = Number(currentRaw);
  const cur = Number.isFinite(c) ? c : Number.NEGATIVE_INFINITY;
  return endOdometer > cur ? String(endOdometer) : undefined;
}

module.exports = { shouldSyncOdometer, resolveVehicleForSync, nextOdometerValue };
