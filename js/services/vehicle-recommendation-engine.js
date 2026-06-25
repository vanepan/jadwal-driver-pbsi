/* ============================================================
   VEHICLE-RECOMMENDATION-ENGINE.JS — Vehicle Recommendation Engine
   (v1.16.4.11-alpha.3)

   The vehicle-side twin of the Driver Recommendation Engine: given a transport
   request, it evaluates every eligible vehicle and returns a ranked
   recommendation — best vehicle + alternatives — with a fully transparent
   per-vehicle score breakdown. RECOMMENDATIONS ONLY: no auto-assignment, no
   dispatch fusion, no workflow changes. A human still decides; this layer ranks.

   It composes the layers built in the prior checkpoints:
     • Vehicle Capacity Engine     → utilization + status (configurable bands)
     • Dispatch Intelligence Store  → the vehicle scoring WEIGHTS (no hardcoded)

   SCORING (each sub-score is 0–100, combined by the store weights, normalized):
     final = (availability·Wa + capacityFit·Wcf + utilization·Wu + health·Wh) / ΣW
       availability  100 available · 0 on a schedule conflict (hard blocker)
       capacityFit   prefer the SMALLEST vehicle that comfortably fits the party
                     (occupancy-ratio banded); 0 + overCapacity flag if too small
       utilization   from the capacity status band: LOW100 NORMAL80 HIGH40 OVER10
                     (lower utilization preferred — reuses the configurable bands)
       health        vehicle.healthScore (0–100), default 100 when undefined

   A conflicted OR over-capacity vehicle is still SCORED and appears in
   diagnostics, but can never occupy the recommendation #1 slot: the ranking
   sorts available, in-capacity vehicles ahead of the rest, so the recommended
   vehicle is always conflict-free and large enough (or null when none qualify).

   PURE: no DOM, no Firebase, no `window`. The caller passes the eligible vehicle
   list + the operational assignment set; the engine computes and returns.
   ============================================================ */

'use strict';

import {
  calculateVehicleCapacity,
  vehicleIdentities,
  calculateStatus,
  CAPACITY_STATUS,
} from './vehicle-capacity-engine.js';
import { getDispatchConfig } from '../config/dispatch-intelligence-config.js';
import { getVehicleScoringWeights } from '../stores/dispatch-intelligence-store.js';

/** Utilization sub-score per capacity status band. The thresholds themselves
 *  live in the CONFIGURABLE statusBands (consumed via calculateStatus), so
 *  re-tuning the bands re-tunes utilization scoring — no duplicate thresholds.
 *  Lower utilization → higher score (spread vehicle wear). */
export const UTILIZATION_SCORE_BY_STATUS = Object.freeze({
  [CAPACITY_STATUS.LOW]: 100,
  [CAPACITY_STATUS.NORMAL]: 80,
  [CAPACITY_STATUS.HIGH]: 40,
  [CAPACITY_STATUS.OVERLOADED]: 10,
});

/** Capacity-fit bands on the occupancy ratio (passengers / capacity), ordered
 *  by descending floor. Prefers the SMALLEST vehicle that comfortably fits the
 *  party: a near-full vehicle scores best, a near-empty one (an oversized van
 *  for two people) scores worst. A distinct concept from utilization, so it is
 *  the one home for these thresholds. */
export const CAPACITY_FIT_BANDS = Object.freeze([
  { min: 0.90, score: 100 },
  { min: 0.75, score: 90 },
  { min: 0.60, score: 80 },
  { min: 0.40, score: 60 },
  { min: 0.20, score: 40 },
  { min: 0, score: 20 },
]);

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function normalizeName(value) { return String(value || '').trim().toLowerCase(); }

/** Minutes since midnight for "HH:MM" (or null when unparseable). */
function timeToMinutes(t) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t || ''));
  if (!m) return null;
  return (Number(m[1]) * 60) + Number(m[2]);
}

/** The operational date of an assignment (`date` → `startDate`). */
function assignmentDay(a) {
  return (a && (a.date || a.startDate)) ? String(a.date || a.startDate).slice(0, 10) : '';
}

/* ── Sub-scores (exported for direct testing) ────────────────────────── */

/**
 * Does any of this vehicle's assignments overlap the request's date/time window?
 * Cancelled assignments are ignored. A full-day assignment (or one with no/
 * unparseable times) conflicts with any request on the same date; likewise a
 * request with no times is treated as a full-day booking. Mirrors the driver
 * engine's hasScheduleConflict and assignments.checkVehicleConflict.
 * @param {Array<Object>} vehicleAssignments  this vehicle's assignment records
 * @param {Object} request                    { date, startTime, endTime }
 * @returns {boolean}
 */
export function hasVehicleConflict(vehicleAssignments, request) {
  const reqDate = String(request && request.date ? request.date : '').slice(0, 10);
  if (!reqDate) return false;
  const reqStart = timeToMinutes(request.startTime);
  const reqEnd = timeToMinutes(request.endTime);
  const reqAllDay = reqStart == null || reqEnd == null || reqStart >= reqEnd;

  for (const a of (Array.isArray(vehicleAssignments) ? vehicleAssignments : [])) {
    if (!a || a.status === 'cancelled') continue;
    if (assignmentDay(a) !== reqDate) continue;
    if (a.fullDay || reqAllDay) return true;
    const aStart = timeToMinutes(a.startTime);
    const aEnd = timeToMinutes(a.endTime);
    if (aStart == null || aEnd == null || aStart >= aEnd) return true; // all-day-ish assignment
    if (aStart < reqEnd && reqStart < aEnd) return true;               // window overlap
  }
  return false;
}

/** Availability sub-score: 100 when free, 0 on a conflict. */
export function availabilityScore(conflict) {
  return conflict ? 0 : 100;
}

/**
 * Capacity-fit sub-score from passengers vs vehicle capacity.
 *   occupancyRatio = passengers / capacity
 * Higher occupancy (smaller suitable vehicle) scores higher; a vehicle too
 * small for the party scores 0. When `passengers` is unspecified (no party size
 * to fit), capacity is not a discriminator → neutral 100.
 *
 * @param {number} passengers
 * @param {number} capacity
 * @returns {{ score:number, occupancyRatio:number, overCapacity:boolean }}
 */
export function calculateCapacityFitScore(passengers, capacity) {
  const pax = num(passengers);
  const cap = num(capacity);
  if (pax <= 0) return { score: 100, occupancyRatio: 0, overCapacity: false };
  if (cap <= 0 || pax > cap) {
    return { score: 0, occupancyRatio: cap > 0 ? pax / cap : Infinity, overCapacity: true };
  }
  const ratio = pax / cap;
  const band = CAPACITY_FIT_BANDS.find((b) => ratio >= b.min) || CAPACITY_FIT_BANDS[CAPACITY_FIT_BANDS.length - 1];
  return { score: band.score, occupancyRatio: ratio, overCapacity: false };
}

/**
 * Utilization sub-score: map the vehicle's utilization onto its CONFIGURABLE
 * capacity status band, then onto the band score (LOW100/NORMAL80/HIGH40/OVER10).
 * Lower utilization is preferred. Reuses the configurable bands — no duplicate
 * thresholds.
 * @param {number} utilizationPercent 0–100
 * @param {Object} [statusBands]  configurable bands (defaults to live config)
 * @returns {number}
 */
export function calculateUtilizationScore(utilizationPercent, statusBands = getDispatchConfig().statusBands) {
  const status = calculateStatus(utilizationPercent, statusBands);
  return UTILIZATION_SCORE_BY_STATUS[status] != null
    ? UTILIZATION_SCORE_BY_STATUS[status]
    : UTILIZATION_SCORE_BY_STATUS[CAPACITY_STATUS.NORMAL];
}

/**
 * Health sub-score: consume vehicle.healthScore (0–100), default 100 when
 * undefined. No maintenance/inspection logic — only consumes the existing value.
 * @param {Object|number} vehicleOrScore  a vehicle record or a raw healthScore
 * @returns {number} 0–100
 */
export function calculateHealthScore(vehicleOrScore) {
  const raw = (vehicleOrScore != null && typeof vehicleOrScore === 'object')
    ? vehicleOrScore.healthScore
    : vehicleOrScore;
  if (raw == null || !Number.isFinite(Number(raw))) return 100;
  return clamp(Math.round(num(raw)), 0, 100);
}

/** Weighted, normalized final score from the four sub-scores + store weights. */
function combineScore(breakdown, weights) {
  const W = {
    availability: num(weights.availability),
    capacityFit: num(weights.capacityFit),
    utilization: num(weights.utilization),
    health: num(weights.health),
  };
  const total = W.availability + W.capacityFit + W.utilization + W.health;
  if (total <= 0) return 0;
  const raw = breakdown.availability * W.availability
    + breakdown.capacityFit * W.capacityFit
    + breakdown.utilization * W.utilization
    + breakdown.health * W.health;
  return clamp(Math.round(raw / total), 0, 100);
}

/**
 * @typedef {Object} VehicleRecommendationDiagnostic
 * @property {string} vehicleId
 * @property {string} vehicleName
 * @property {number} score                 0–100 weighted final score
 * @property {number} rank                  1-based position (available, in-capacity first)
 * @property {boolean} available
 * @property {boolean} conflict             scheduling conflict with the request
 * @property {boolean} overCapacity         party exceeds vehicle capacity
 * @property {{availability:number,capacityFit:number,utilization:number,health:number}} breakdown
 * @property {number} capacity
 * @property {number} occupancyRatio
 * @property {number} utilizationPercent
 * @property {'LOW'|'NORMAL'|'HIGH'|'OVERLOADED'} status
 * @property {number} healthScore
 */

/**
 * Evaluate all eligible vehicles for a transport request and rank them.
 *
 * @param {Object} request   { date, startTime, endTime, passengers?, destination? }
 * @param {Array<Object>} vehicles     eligible vehicle records ({ vehicleId, name, capacity, healthScore? })
 * @param {Array<Object>} assignments  the operational assignment set (vehicle-by-name)
 * @param {Object} [options]
 * @param {Date|string} [options.now]        capacity "today" reference (default real now)
 * @param {number} [options.monthlyCapacity] forwarded to the capacity engine
 * @param {Object} [options.weights]         override store weights (testing)
 * @param {(vehicle:Object)=>boolean} [options.isEligible]  extra eligibility filter
 * @returns {{
 *   generatedAt:string,
 *   request:Object,
 *   weights:Object,
 *   recommendedVehicle:({vehicleId:string,score:number,rank:number}|null),
 *   alternatives:Array<{vehicleId:string,score:number,rank:number}>,
 *   diagnostics:VehicleRecommendationDiagnostic[]
 * }}
 */
export function recommendVehicle(request = {}, vehicles = [], assignments = [], options = {}) {
  const now = options.now || new Date();
  const weights = options.weights || getVehicleScoringWeights();
  const candidates = (Array.isArray(vehicles) ? vehicles : [])
    .filter((v) => v && (typeof options.isEligible === 'function' ? options.isEligible(v) : true));

  // Bucket assignments by normalized vehicle name once (mirrors checkVehicleConflict).
  const byVehicle = new Map();
  for (const a of (Array.isArray(assignments) ? assignments : [])) {
    const key = normalizeName(a && a.vehicle);
    if (!key) continue;
    if (!byVehicle.has(key)) byVehicle.set(key, []);
    byVehicle.get(key).push(a);
  }

  const scored = candidates.map((vehicle) => {
    const identities = vehicleIdentities(vehicle);
    const mine = [];
    for (const id of identities) {
      const bucket = byVehicle.get(id);
      if (bucket) mine.push(...bucket);
    }

    const cap = calculateVehicleCapacity(vehicle.vehicleId, mine, {
      now, monthlyCapacity: options.monthlyCapacity, preFiltered: true,
    });
    const conflict = hasVehicleConflict(mine, request);
    const fit = calculateCapacityFitScore(request.passengers, vehicle.capacity);

    const breakdown = {
      availability: availabilityScore(conflict),
      capacityFit: fit.score,
      utilization: calculateUtilizationScore(cap.utilizationPercent),
      health: calculateHealthScore(vehicle),
    };

    return {
      vehicleId: vehicle.vehicleId,
      vehicleName: vehicle.name || vehicle.vehicleId,
      score: combineScore(breakdown, weights),
      available: !conflict,
      conflict,
      overCapacity: fit.overCapacity,
      breakdown,
      capacity: num(vehicle.capacity),
      occupancyRatio: Math.round(fit.occupancyRatio * 100) / 100,
      utilizationPercent: cap.utilizationPercent,
      status: cap.status,
      healthScore: breakdown.health,
    };
  });

  // Rank: available vehicles first, then non-over-capacity, then score desc.
  // A conflicted OR over-capacity vehicle can therefore never be #1. Tiebreak:
  // better capacity fit, then lower utilization, then name (deterministic).
  scored.sort((a, b) =>
    (Number(b.available) - Number(a.available))
    || (Number(!b.overCapacity) - Number(!a.overCapacity))
    || (b.score - a.score)
    || (b.breakdown.capacityFit - a.breakdown.capacityFit)
    || (a.utilizationPercent - b.utilizationPercent)
    || String(a.vehicleName).localeCompare(String(b.vehicleName), 'id'));

  const ranked = scored.map((d, i) => ({ ...d, rank: i + 1 }));
  const slim = (d) => ({ vehicleId: d.vehicleId, score: d.score, rank: d.rank });

  const top = ranked[0];
  const eligibleTop = top && top.available && !top.overCapacity;
  const recommendedVehicle = eligibleTop ? slim(top) : null;
  const alternatives = (recommendedVehicle ? ranked.slice(1) : ranked).map(slim);

  return {
    generatedAt: new Date(now).toISOString(),
    request,
    weights: { ...weights },
    recommendedVehicle,
    alternatives,
    diagnostics: ranked,
  };
}
