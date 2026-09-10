'use strict';

/* ============================================================
   VEHICLE-ODOMETER-RECONCILIATION.JS — a SAFETY NET, not the primary path.

   The PRIMARY, authoritative vehicle-odometer sync is the server trigger
   functions/src/events/onAssignmentOdometerSync.js — it advances
   vehicles/{id}.odometer on every completed assignment, for every completer,
   monotonically. This module exists ONLY to heal vehicles whose odometer went
   stale BEFORE that trigger was deployed (or during any outage).

   Usage contract (see js/app.js):
     • admin / adminEquivalent session ONLY (the /vehicles write it drives is
       admin-gated by RTDB rules — see database.rules.json);
     • run ONCE per session (a module-level guard in app.js), NEVER on render;
     • MONOTONIC — proposes only upward corrections; never lowers a vehicle
       odometer, even if a completed trip's endOdometer is below the current
       stored value.

   This file is PURE: no DOM, no Firebase, no `window`. It only computes WHAT
   should change; the caller performs the writes + the audit entries.
   ============================================================ */

const toNum = (v) => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const lc = (v) => String(v == null ? '' : v).trim().toLowerCase();
const isCompleted = (a) => a && (a.status === 'completed' || a.status === 'selesai');

/**
 * @typedef {Object} OdoReconRow
 * @property {string} vehicleId
 * @property {string} name
 * @property {number|null} current    stored vehicles/{id}.odometer as a number, or null when unset
 * @property {number} trueOdo         max completed endOdometer for that vehicle (the proposed value)
 * @property {number|null} delta      trueOdo − current, or null when current is unset
 */

/**
 * Compute the set of vehicles whose stored odometer is materially BELOW the
 * highest odometer any of their completed assignments actually reached.
 *
 * `trueOdo(vehicle) = max( current vehicle.odometer , max completed endOdometer for that vehicle )`
 * — but a row is only emitted when that max exceeds `current` by at least
 * `minDeltaKm`, so an already-current vehicle is a no-op. Never emits a row
 * whose proposed value is ≤ the current stored value (never lowers).
 *
 * Vehicle ↔ assignment linkage is by NAME (assignments store `vehicle` as a
 * display name), case-insensitive + whitespace-trimmed. Archived vehicles are
 * skipped.
 *
 * @param {Array<{id:string, name?:string, odometer?:string|number, archived?:boolean}>} vehicles
 * @param {Array<{vehicle?:string, status?:string, endOdometer?:string|number}>} assignments
 * @param {{minDeltaKm?:number}} [opts]  minDeltaKm default 1 — 1 km IS material for an odometer
 * @returns {OdoReconRow[]}  most-stale first
 */
export function computeVehicleOdometerReconciliation(vehicles, assignments, { minDeltaKm = 1 } = {}) {
  const maxEndByName = new Map(); // lc(vehicle name) → max completed endOdometer
  for (const a of Array.isArray(assignments) ? assignments : []) {
    if (!isCompleted(a)) continue;
    const end = toNum(a.endOdometer);
    const key = lc(a.vehicle);
    if (end == null || end <= 0 || !key) continue;
    if (!maxEndByName.has(key) || end > maxEndByName.get(key)) maxEndByName.set(key, end);
  }

  const out = [];
  for (const v of Array.isArray(vehicles) ? vehicles : []) {
    if (!v || v.archived === true || !v.id) continue;
    const maxEnd = maxEndByName.get(lc(v.name));
    if (maxEnd == null) continue;
    const current = toNum(v.odometer);
    const base = current == null ? Number.NEGATIVE_INFINITY : current;
    if (maxEnd - base >= minDeltaKm) {
      out.push({
        vehicleId: v.id,
        name: v.name,
        current,
        trueOdo: maxEnd,
        delta: current == null ? null : maxEnd - current,
      });
    }
  }
  out.sort((x, y) => (y.delta ?? Infinity) - (x.delta ?? Infinity));
  return out;
}
