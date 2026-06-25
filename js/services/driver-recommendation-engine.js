/* ============================================================
   DRIVER-RECOMMENDATION-ENGINE.JS — Driver Recommendation Engine
   (v1.16.4.11-alpha.2)

   The FIRST operational intelligence layer of Dispatch Intelligence: given a
   transport request, it evaluates every eligible driver and returns a ranked
   recommendation — best driver + alternatives — with a fully transparent
   per-driver score breakdown. RECOMMENDATIONS ONLY: no auto-assignment, no
   automatic approval. A human still decides; this layer just ranks.

   It composes the layers built in the prior checkpoints:
     • Driver Capacity Engine   → utilization + 7-day load + status (configurable bands)
     • Capacity Trend Engine    → per-driver direction (diagnostic enrichment)
     • Dispatch Intelligence Store → the scoring WEIGHTS (no hardcoded weights)

   SCORING (each sub-score is 0–100, combined by the store weights, normalized):
     final = (availability·Wa + workload·Ww + recency·Wr + priority·Wp) / ΣW
       availability  100 available · 0 on a schedule conflict (hard blocker)
       workload      from capacity status band: LOW100 NORMAL80 HIGH40 OVERLOADED10
       recency       from 7-day load: 0→100 · 1–3→80 · 4–6→60 · 7+→20 (spread the work)
       priority      100 (foundation; seniority/cert/route specialization later)

   A conflicted driver is still SCORED and appears in diagnostics, but can never
   occupy the recommendation #1 slot: the ranking sorts available drivers ahead
   of conflicted ones, so the recommended driver is always conflict-free (or null
   when no eligible driver is free).

   PURE: no DOM, no Firebase, no `window`. The caller passes the eligible driver
   list + the operational assignment set; the engine computes and returns.
   ============================================================ */

'use strict';

import {
  calculateDriverCapacity,
  CAPACITY_STATUS,
} from './driver-capacity-engine.js';
import { getScoringWeights } from '../stores/dispatch-intelligence-store.js';
import { getCapacityTrend } from './capacity-trend-engine.js';

/** Workload sub-score per capacity status band (status comes from the
 *  CONFIGURABLE statusBands via the capacity engine, so re-tuning the bands
 *  re-tunes workload scoring automatically). */
export const WORKLOAD_SCORE_BY_STATUS = Object.freeze({
  [CAPACITY_STATUS.LOW]: 100,
  [CAPACITY_STATUS.NORMAL]: 80,
  [CAPACITY_STATUS.HIGH]: 40,
  [CAPACITY_STATUS.OVERLOADED]: 10,
});

/** Recency sub-score thresholds on assignmentsLast7Days (ceiling inclusive). */
export const RECENCY_BANDS = Object.freeze([
  { max: 0, score: 100 },
  { max: 3, score: 80 },
  { max: 6, score: 60 },
  { max: Infinity, score: 20 },
]);

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
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

/** Every normalized name a driver answers to (mirrors capacity-snapshot-service). */
function driverIdentities(driver) {
  const names = [driver.name, driver.normalizedName, ...(Array.isArray(driver.legacyNames) ? driver.legacyNames : [])];
  return [...new Set(names.map(normalizeName).filter(Boolean))];
}

/* ── Sub-scores (exported for direct testing) ────────────────────────── */

/**
 * Does any of this driver's assignments overlap the request's date/time window?
 * Cancelled assignments are ignored. A full-day assignment (or one with no/
 * unparseable times) conflicts with any request on the same date; likewise a
 * request with no times is treated as a full-day booking.
 * @returns {boolean}
 */
export function hasScheduleConflict(driverAssignments, request) {
  const reqDate = String(request && request.date ? request.date : '').slice(0, 10);
  if (!reqDate) return false;
  const reqStart = timeToMinutes(request.startTime);
  const reqEnd = timeToMinutes(request.endTime);
  const reqAllDay = reqStart == null || reqEnd == null || reqStart >= reqEnd;

  for (const a of (Array.isArray(driverAssignments) ? driverAssignments : [])) {
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

/** Workload sub-score from a capacity status (defaults to NORMAL if unknown). */
export function workloadScore(status) {
  return WORKLOAD_SCORE_BY_STATUS[status] != null
    ? WORKLOAD_SCORE_BY_STATUS[status]
    : WORKLOAD_SCORE_BY_STATUS[CAPACITY_STATUS.NORMAL];
}

/** Recency sub-score from the trailing-7-day assignment count. */
export function recencyScore(assignmentsLast7Days) {
  const n = num(assignmentsLast7Days);
  return (RECENCY_BANDS.find((b) => n <= b.max) || RECENCY_BANDS[RECENCY_BANDS.length - 1]).score;
}

/** Priority sub-score. Foundation: constant 100 (seniority/cert/route later). */
export function priorityScore(/* driver, request */) {
  return 100;
}

/** Weighted, normalized final score from the four sub-scores + store weights. */
function combineScore(breakdown, weights) {
  const W = {
    availability: num(weights.availability),
    workload: num(weights.workload),
    recency: num(weights.recency),
    priority: num(weights.priority),
  };
  const total = W.availability + W.workload + W.recency + W.priority;
  if (total <= 0) return 0;
  const raw = breakdown.availability * W.availability
    + breakdown.workload * W.workload
    + breakdown.recency * W.recency
    + breakdown.priority * W.priority;
  return Math.round(raw / total);
}

/**
 * @typedef {Object} RecommendationDiagnostic
 * @property {string} driverId
 * @property {string} driverName
 * @property {number} score                 0–100 weighted final score
 * @property {number} rank                  1-based position (available drivers first)
 * @property {boolean} available
 * @property {boolean} conflict             scheduling conflict with the request
 * @property {{availability:number,workload:number,recency:number,priority:number}} breakdown
 * @property {number} utilizationPercent
 * @property {number} assignmentsLast7Days
 * @property {'LOW'|'NORMAL'|'HIGH'|'OVERLOADED'} status
 * @property {('UP'|'DOWN'|'STABLE'|null)} trend   from the capacity trend engine (diagnostic)
 */

/**
 * Evaluate all eligible drivers for a transport request and rank them.
 *
 * @param {Object} request   { date, startTime, endTime, passengers?, destination? }
 * @param {Array<Object>} drivers      eligible driver records ({ id, name, legacyNames? })
 * @param {Array<Object>} assignments  the operational assignment set (driver-by-name)
 * @param {Object} [options]
 * @param {Date|string} [options.now]        capacity "today" reference (default real now)
 * @param {number} [options.monthlyCapacity] forwarded to the capacity engine
 * @param {Object} [options.weights]         override store weights (testing)
 * @param {(driver:Object)=>boolean} [options.isEligible]  extra eligibility filter
 * @returns {{
 *   generatedAt:string,
 *   request:Object,
 *   weights:Object,
 *   recommendedDriver:({driverId:string,score:number,rank:number}|null),
 *   alternatives:Array<{driverId:string,score:number,rank:number}>,
 *   diagnostics:RecommendationDiagnostic[]
 * }}
 */
export function recommendDrivers(request = {}, drivers = [], assignments = [], options = {}) {
  const now = options.now || new Date();
  const weights = options.weights || getScoringWeights();
  const candidates = (Array.isArray(drivers) ? drivers : [])
    .filter((d) => d && (typeof options.isEligible === 'function' ? options.isEligible(d) : true));

  // Bucket assignments by normalized driver name once (mirrors snapshot service).
  const byName = new Map();
  for (const a of (Array.isArray(assignments) ? assignments : [])) {
    const key = normalizeName(a && a.driver);
    if (!key) continue;
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(a);
  }

  // Per-driver trend (diagnostic enrichment) from the store's snapshot history.
  const trendById = new Map();
  for (const t of (getCapacityTrend().drivers || [])) trendById.set(t.driverId, t.trend);

  const scored = candidates.map((driver) => {
    const mine = [];
    for (const id of driverIdentities(driver)) {
      const bucket = byName.get(id);
      if (bucket) mine.push(...bucket);
    }

    const cap = calculateDriverCapacity(driver.id, mine, {
      now, monthlyCapacity: options.monthlyCapacity, preFiltered: true,
    });
    const conflict = hasScheduleConflict(mine, request);

    const breakdown = {
      availability: availabilityScore(conflict),
      workload: workloadScore(cap.status),
      recency: recencyScore(cap.assignmentsLast7Days),
      priority: priorityScore(driver, request),
    };

    return {
      driverId: driver.id,
      driverName: driver.name || driver.id,
      score: combineScore(breakdown, weights),
      available: !conflict,
      conflict,
      breakdown,
      utilizationPercent: cap.utilizationPercent,
      assignmentsLast7Days: cap.assignmentsLast7Days,
      status: cap.status,
      trend: trendById.has(driver.id) ? trendById.get(driver.id) : null,
    };
  });

  // Rank: available drivers ALWAYS above conflicted ones (a conflict can never be
  // #1), then score desc, then prefer the less-recently-tasked / less-loaded
  // driver (spread the work), then name for determinism.
  scored.sort((a, b) =>
    (Number(b.available) - Number(a.available))
    || (b.score - a.score)
    || (a.assignmentsLast7Days - b.assignmentsLast7Days)
    || (a.utilizationPercent - b.utilizationPercent)
    || String(a.driverName).localeCompare(String(b.driverName), 'id'));

  const ranked = scored.map((d, i) => ({ ...d, rank: i + 1 }));
  const slim = (d) => ({ driverId: d.driverId, score: d.score, rank: d.rank });

  const top = ranked[0];
  const recommendedDriver = top && top.available ? slim(top) : null;
  const alternatives = (recommendedDriver ? ranked.slice(1) : ranked).map(slim);

  return {
    generatedAt: new Date(now).toISOString(),
    request,
    weights: { ...weights },
    recommendedDriver,
    alternatives,
    diagnostics: ranked,
  };
}
