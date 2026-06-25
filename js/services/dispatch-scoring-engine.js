/* ============================================================
   DISPATCH-SCORING-ENGINE.JS — Dispatch Scoring Engine
   (v1.16.4.11-alpha.4)

   The fusion layer of Dispatch Intelligence: it runs the Driver Recommendation
   Engine and the Vehicle Recommendation Engine for a single transport request,
   pairs their top candidates, and returns one ranked DISPATCH package — the best
   driver+vehicle combination plus alternatives, each with a transparent score
   breakdown and validity diagnostics. RECOMMENDATIONS ONLY: no auto-assignment,
   no workflow changes, no UI wiring. A human still decides; this layer ranks.

   It composes the prior checkpoints WITHOUT re-implementing any of their scoring:
     • Driver Recommendation Engine  → per-driver score + conflict flag
     • Vehicle Recommendation Engine → per-vehicle score + conflict/over-capacity
     • Dispatch Intelligence Store    → the dispatch fusion WEIGHTS (no hardcoded)

   COMBINATION STRATEGY: take the TOP 3 ranked drivers × TOP 3 ranked vehicles
   (≤ 9 combinations), score each, and rank. A combination is INVALID if the
   driver conflicts, the vehicle conflicts, or the vehicle is over-capacity —
   invalid combinations remain visible in diagnostics but can never be #1.

   DISPATCH SCORE:
     dispatch = (driverScore·Wd + vehicleScore·Wv) / (Wd + Wv)
   Weights come from getDispatchScoringWeights() (default driver 60 / vehicle 40);
   normalizing by ΣW keeps the score 0–100 for any positive weight set.

   PURE: no DOM, no Firebase, no `window`. The caller passes the eligible driver
   + vehicle lists and the operational assignment set; the engine returns.
   ============================================================ */

'use strict';

import { recommendDrivers } from './driver-recommendation-engine.js';
import { recommendVehicle } from './vehicle-recommendation-engine.js';
import { getDispatchScoringWeights } from '../stores/dispatch-intelligence-store.js';

/** Invalidity reason codes surfaced in a candidate's `reasons[]`. */
export const DISPATCH_INVALID_REASON = Object.freeze({
  DRIVER_CONFLICT: 'driver_conflict',
  VEHICLE_CONFLICT: 'vehicle_conflict',
  VEHICLE_OVER_CAPACITY: 'vehicle_over_capacity',
});

/** How many ranked candidates per side feed the combination grid (3 × 3 = 9). */
export const DISPATCH_TOP_N = 3;

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/**
 * Fuse a driver score and a vehicle score into a normalized dispatch score.
 * Exported for direct testing of the weight math.
 * @param {number} driverScore   0–100
 * @param {number} vehicleScore  0–100
 * @param {{driver:number,vehicle:number}} weights
 * @returns {number} integer 0–100
 */
export function scoreDispatch(driverScore, vehicleScore, weights) {
  const Wd = num(weights && weights.driver);
  const Wv = num(weights && weights.vehicle);
  const total = Wd + Wv;
  if (total <= 0) return 0;
  const raw = num(driverScore) * Wd + num(vehicleScore) * Wv;
  return clamp(Math.round(raw / total), 0, 100);
}

/** Build the validity verdict + reason codes for a driver×vehicle pairing. */
function evaluateValidity(driverDiag, vehicleDiag) {
  const reasons = [];
  if (driverDiag.conflict) reasons.push(DISPATCH_INVALID_REASON.DRIVER_CONFLICT);
  if (vehicleDiag.conflict) reasons.push(DISPATCH_INVALID_REASON.VEHICLE_CONFLICT);
  if (vehicleDiag.overCapacity) reasons.push(DISPATCH_INVALID_REASON.VEHICLE_OVER_CAPACITY);
  return { valid: reasons.length === 0, reasons };
}

/**
 * @typedef {Object} DispatchDiagnostic
 * @property {string} driverId
 * @property {string} driverName
 * @property {string} vehicleId
 * @property {string} vehicleName
 * @property {number} dispatchScore   0–100 fused score
 * @property {number} driverScore     0–100 (from the Driver Recommendation Engine)
 * @property {number} vehicleScore    0–100 (from the Vehicle Recommendation Engine)
 * @property {number} rank            1-based (valid combinations first)
 * @property {boolean} valid
 * @property {string[]} reasons       invalidity reason codes (empty when valid)
 */

/**
 * Produce a ranked dispatch recommendation package for one request.
 *
 * @param {Object} input
 * @param {Object} input.request       { date, startTime, endTime, passengers?, destination? }
 * @param {Array<Object>} input.drivers    eligible driver records ({ id, name, … })
 * @param {Array<Object>} input.vehicles   eligible vehicle records ({ vehicleId, name, capacity, healthScore? })
 * @param {Array<Object>} input.assignments the operational assignment set
 * @param {Object} [options]
 * @param {Date|string} [options.now]        capacity "today" reference (forwarded to both engines)
 * @param {number} [options.monthlyCapacity] forwarded to both capacity engines
 * @param {Object} [options.weights]         override the store dispatch weights (testing)
 * @param {number} [options.topN]            candidates per side (default 3 → ≤ 9 combos)
 * @param {(driver:Object)=>boolean} [options.isEligibleDriver]
 * @param {(vehicle:Object)=>boolean} [options.isEligibleVehicle]
 * @returns {{
 *   generatedAt:string,
 *   request:Object,
 *   weights:{driver:number,vehicle:number},
 *   recommendedDispatch:({driverId:string,vehicleId:string,dispatchScore:number,rank:number}|null),
 *   alternatives:Array<{driverId:string,vehicleId:string,dispatchScore:number,rank:number}>,
 *   diagnostics:DispatchDiagnostic[],
 *   driverRecommendation:Object,
 *   vehicleRecommendation:Object
 * }}
 */
export function recommendDispatch(input = {}, options = {}) {
  const { request = {}, drivers = [], vehicles = [], assignments = [] } = input;
  const now = options.now || new Date();
  const weights = options.weights || getDispatchScoringWeights();
  const topN = Number(options.topN) > 0 ? Math.floor(Number(options.topN)) : DISPATCH_TOP_N;

  // Reuse the two recommendation engines verbatim (single source of scoring).
  const driverRecommendation = recommendDrivers(request, drivers, assignments, {
    now, monthlyCapacity: options.monthlyCapacity, isEligible: options.isEligibleDriver,
  });
  const vehicleRecommendation = recommendVehicle(request, vehicles, assignments, {
    now, monthlyCapacity: options.monthlyCapacity, isEligible: options.isEligibleVehicle,
  });

  // Their diagnostics are already rank-ordered; take the best N of each.
  const topDrivers = driverRecommendation.diagnostics.slice(0, topN);
  const topVehicles = vehicleRecommendation.diagnostics.slice(0, topN);

  // Cross-product → ≤ topN² candidates, each fused + validity-checked.
  const candidates = [];
  for (const dd of topDrivers) {
    for (const vd of topVehicles) {
      const { valid, reasons } = evaluateValidity(dd, vd);
      candidates.push({
        driverId: dd.driverId,
        driverName: dd.driverName,
        vehicleId: vd.vehicleId,
        vehicleName: vd.vehicleName,
        dispatchScore: scoreDispatch(dd.score, vd.score, weights),
        driverScore: dd.score,
        vehicleScore: vd.score,
        valid,
        reasons,
      });
    }
  }

  // Rank: valid combinations first (an invalid one can never be #1), then
  // dispatch score desc; tiebreak by driver score, vehicle score, then
  // alphabetical driver, alphabetical vehicle (fully deterministic).
  candidates.sort((a, b) =>
    (Number(b.valid) - Number(a.valid))
    || (b.dispatchScore - a.dispatchScore)
    || (b.driverScore - a.driverScore)
    || (b.vehicleScore - a.vehicleScore)
    || String(a.driverName).localeCompare(String(b.driverName), 'id')
    || String(a.vehicleName).localeCompare(String(b.vehicleName), 'id'));

  const ranked = candidates.map((c, i) => ({ ...c, rank: i + 1 }));
  const slim = (c) => ({ driverId: c.driverId, vehicleId: c.vehicleId, dispatchScore: c.dispatchScore, rank: c.rank });

  const top = ranked[0];
  const recommendedDispatch = top && top.valid ? slim(top) : null;
  const alternatives = (recommendedDispatch ? ranked.slice(1) : ranked).map(slim);

  return {
    generatedAt: new Date(now).toISOString(),
    request,
    weights: { driver: num(weights.driver), vehicle: num(weights.vehicle) },
    recommendedDispatch,
    alternatives,
    diagnostics: ranked,
    driverRecommendation,
    vehicleRecommendation,
  };
}
