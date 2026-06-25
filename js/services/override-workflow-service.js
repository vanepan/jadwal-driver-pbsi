/* ============================================================
   OVERRIDE-WORKFLOW-SERVICE.JS — Admin Override Workflow
   (v1.16.4.11-beta.1)

   The Human Decision Layer of Dispatch Intelligence. The engines (Driver,
   Vehicle, Dispatch) PROPOSE; the admin DECIDES. This service captures that
   final decision as an override record and classifies how it compares to the
   recommendation — so the platform can learn how often its recommendations are
   accepted and how accurate each driver/vehicle suggestion is.

   THIS RELEASE RECORDS OUTCOMES ONLY. It does NOT create assignments, does not
   touch the request workflow, and writes nothing to Firebase — it produces the
   record + analytics; the store holds them in memory (mirrors the rest of the
   Dispatch Intelligence subsystem).

   CLASSIFICATION (recommended vs selected driver/vehicle):
     same driver  + same vehicle   → ACCEPTED
     diff driver  + same vehicle   → DRIVER_OVERRIDE
     same driver  + diff vehicle   → VEHICLE_OVERRIDE
     diff driver  + diff vehicle   → FULL_OVERRIDE
   `overridden` is simply (outcome !== ACCEPTED).

   PURE: no DOM, no Firebase, no `window`, no store import (so the store can
   import these pure helpers without a cycle). Every function operates on the
   data passed in.
   ============================================================ */

'use strict';

/** The four decision outcomes (recommended vs selected dispatch). */
export const OVERRIDE_OUTCOME = Object.freeze({
  ACCEPTED: 'ACCEPTED',
  DRIVER_OVERRIDE: 'DRIVER_OVERRIDE',
  VEHICLE_OVERRIDE: 'VEHICLE_OVERRIDE',
  FULL_OVERRIDE: 'FULL_OVERRIDE',
});

/** Normalize an id for comparison (null/undefined/'' all read as "unset"). */
function idEq(a, b) {
  const na = a == null ? '' : String(a);
  const nb = b == null ? '' : String(b);
  return na === nb;
}

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function rate(part, whole) { return whole > 0 ? Math.round((part / whole) * 100) : 0; }

/**
 * Classify a decision by comparing the recommended driver/vehicle with the
 * driver/vehicle the admin actually selected.
 * @returns {'ACCEPTED'|'DRIVER_OVERRIDE'|'VEHICLE_OVERRIDE'|'FULL_OVERRIDE'}
 */
export function classifyOutcome(recommendedDriverId, recommendedVehicleId, selectedDriverId, selectedVehicleId) {
  const driverSame = idEq(recommendedDriverId, selectedDriverId);
  const vehicleSame = idEq(recommendedVehicleId, selectedVehicleId);
  if (driverSame && vehicleSame) return OVERRIDE_OUTCOME.ACCEPTED;
  if (!driverSame && vehicleSame) return OVERRIDE_OUTCOME.DRIVER_OVERRIDE;
  if (driverSame && !vehicleSame) return OVERRIDE_OUTCOME.VEHICLE_OVERRIDE;
  return OVERRIDE_OUTCOME.FULL_OVERRIDE;
}

/**
 * Build a complete, classified override record from the admin's decision.
 * The `outcome` + `overridden` flag are derived from the id comparison; an
 * explicit `timestamp` may be supplied (else ISO "now").
 *
 * @param {Object} input
 * @param {string} input.recommendationId        the dispatch recommendation this decides
 * @param {string} input.recommendedDriverId
 * @param {string} input.recommendedVehicleId
 * @param {string} input.selectedDriverId        defaults to the recommended driver (ACCEPTED)
 * @param {string} input.selectedVehicleId       defaults to the recommended vehicle (ACCEPTED)
 * @param {number} [input.dispatchScore]         the score of the SELECTED dispatch
 * @param {string} [input.reason]                free-text justification (override audit)
 * @param {string} [input.approvedBy]            the deciding admin
 * @param {string|Date} [input.timestamp]        decision time (default: now)
 * @returns {{
 *   recommendationId:string, recommendedDriverId:string, recommendedVehicleId:string,
 *   selectedDriverId:string, selectedVehicleId:string, dispatchScore:number,
 *   outcome:string, overridden:boolean, reason:string, approvedBy:string, timestamp:string
 * }}
 */
export function createOverrideRecord(input = {}) {
  const recommendedDriverId = input.recommendedDriverId != null ? String(input.recommendedDriverId) : '';
  const recommendedVehicleId = input.recommendedVehicleId != null ? String(input.recommendedVehicleId) : '';
  // An unspecified selection means the admin took the recommendation as-is.
  const selectedDriverId = input.selectedDriverId != null ? String(input.selectedDriverId) : recommendedDriverId;
  const selectedVehicleId = input.selectedVehicleId != null ? String(input.selectedVehicleId) : recommendedVehicleId;

  const outcome = classifyOutcome(recommendedDriverId, recommendedVehicleId, selectedDriverId, selectedVehicleId);
  const ts = input.timestamp ? new Date(input.timestamp) : new Date();

  return {
    recommendationId: input.recommendationId != null ? String(input.recommendationId) : '',
    recommendedDriverId,
    recommendedVehicleId,
    selectedDriverId,
    selectedVehicleId,
    dispatchScore: num(input.dispatchScore),
    outcome,
    overridden: outcome !== OVERRIDE_OUTCOME.ACCEPTED,
    reason: input.reason != null ? String(input.reason) : '',
    approvedBy: input.approvedBy != null ? String(input.approvedBy) : '',
    timestamp: Number.isNaN(ts.getTime()) ? new Date().toISOString() : ts.toISOString(),
  };
}

/**
 * Aggregate acceptance statistics over a set of override records.
 * @param {Array<Object>} logs
 * @returns {{ total:number, accepted:number, overridden:number, acceptanceRate:number }}
 */
export function computeOverrideStats(logs = []) {
  const list = Array.isArray(logs) ? logs : [];
  const total = list.length;
  const accepted = list.filter((l) => l && l.outcome === OVERRIDE_OUTCOME.ACCEPTED).length;
  const overridden = total - accepted;
  return { total, accepted, overridden, acceptanceRate: rate(accepted, total) };
}

/**
 * Per-driver recommendation accuracy: of the times this driver was RECOMMENDED,
 * how often was the driver actually KEPT (selected). Vehicle changes don't count
 * against the driver.
 * @param {Array<Object>} logs
 * @param {string} driverId
 * @returns {{ driverId:string, recommended:number, accepted:number, accuracy:number }}
 */
export function computeDriverAccuracy(logs = [], driverId) {
  const list = Array.isArray(logs) ? logs : [];
  const id = String(driverId);
  let recommended = 0;
  let accepted = 0;
  for (const l of list) {
    if (!l || !idEq(l.recommendedDriverId, id)) continue;
    recommended++;
    if (idEq(l.selectedDriverId, id)) accepted++;
  }
  return { driverId: id, recommended, accepted, accuracy: rate(accepted, recommended) };
}

/**
 * Per-vehicle recommendation accuracy: of the times this vehicle was RECOMMENDED,
 * how often was it actually KEPT. Driver changes don't count against the vehicle.
 * @param {Array<Object>} logs
 * @param {string} vehicleId
 * @returns {{ vehicleId:string, recommended:number, accepted:number, accuracy:number }}
 */
export function computeVehicleAccuracy(logs = [], vehicleId) {
  const list = Array.isArray(logs) ? logs : [];
  const id = String(vehicleId);
  let recommended = 0;
  let accepted = 0;
  for (const l of list) {
    if (!l || !idEq(l.recommendedVehicleId, id)) continue;
    recommended++;
    if (idEq(l.selectedVehicleId, id)) accepted++;
  }
  return { vehicleId: id, recommended, accepted, accuracy: rate(accepted, recommended) };
}

/** Accuracy for every recommended driver, sorted by descending recommend count
 *  then driverId (deterministic). Convenience over computeDriverAccuracy. */
export function computeAllDriverAccuracy(logs = []) {
  const ids = [...new Set((Array.isArray(logs) ? logs : [])
    .map((l) => (l && l.recommendedDriverId != null ? String(l.recommendedDriverId) : ''))
    .filter(Boolean))];
  return ids.map((id) => computeDriverAccuracy(logs, id))
    .sort((a, b) => (b.recommended - a.recommended) || a.driverId.localeCompare(b.driverId, 'id'));
}

/** Accuracy for every recommended vehicle, sorted by descending recommend count
 *  then vehicleId (deterministic). Convenience over computeVehicleAccuracy. */
export function computeAllVehicleAccuracy(logs = []) {
  const ids = [...new Set((Array.isArray(logs) ? logs : [])
    .map((l) => (l && l.recommendedVehicleId != null ? String(l.recommendedVehicleId) : ''))
    .filter(Boolean))];
  return ids.map((id) => computeVehicleAccuracy(logs, id))
    .sort((a, b) => (b.recommended - a.recommended) || a.vehicleId.localeCompare(b.vehicleId, 'id'));
}
