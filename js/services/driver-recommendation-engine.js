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

   RECOVERY BUFFER (v1.25.x): availability is no longer "the previous assignment's
   planned end time has passed" — see evaluateAvailability(). A driver whose
   assignment is still status:'started' is hard-excluded (Step 1, never a
   fallback either); Availability Time = assignment end + the configured
   recoveryBufferMinutes (js/config/dispatch-intelligence-config.js — the ONLY
   place that value is defined); once completed, the ACTUAL end (completedAt)
   is used instead of the plan, so a delayed trip propagates to the next
   recommendation. When NO driver clears the buffer, the engine still picks
   the one with the earliest Availability Time rather than returning null —
   but flags it `bufferSatisfied:false` so no caller can present it as if the
   driver were genuinely, immediately free.

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
import { getDispatchConfig } from '../config/dispatch-intelligence-config.js';

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

/** Parse "YYYY-MM-DD" → local midnight Date, or null when unparseable. */
function parseLocalISODate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

/** A timestamp (epoch ms or ISO string) → minutes-of-day relative to
 *  `anchorISO`'s midnight. Same calendar day as the anchor → 0–1439; a later
 *  day adds 1440 per day spanned (so a next-day completion still compares
 *  correctly against same-day request times). Null when unparseable. */
function minutesRelativeToDate(ts, anchorISO) {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return null;
  const anchor = parseLocalISODate(anchorISO);
  const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayOffset = anchor ? Math.round((dayStart.getTime() - anchor.getTime()) / 86400000) : 0;
  return dayOffset * 1440 + d.getHours() * 60 + d.getMinutes();
}

/**
 * Buffer- and status-aware availability check for one driver against a
 * request (Recovery Buffer, v1.25.x). Unlike hasScheduleConflict (raw window
 * overlap on PLANNED times only — kept above, unchanged, for direct testing),
 * this is what recommendDrivers() actually uses to rank candidates:
 *
 *   - `running` — the driver has an assignment on the request date that is
 *     still status:'started'. A running assignment has NOT actually
 *     finished no matter what its planned endTime says, so the driver is
 *     hard-excluded — never recommended, not even as a fallback.
 *   - `conflict` — the request falls within `bufferMinutes` of ANY of the
 *     driver's same-date assignments, checked SYMMETRICALLY: too close
 *     after an assignment ends (request start < assignment end + buffer)
 *     OR too close before an assignment starts (assignment start < request
 *     end + buffer) — the rule doesn't care which one is "existing" vs
 *     "candidate" (also true whenever `running` is true, so existing
 *     conflict-only consumers keep working unchanged).
 *   - `availabilityMinutes` — the latest (assignment end + bufferMinutes)
 *     among the blocking assignments, i.e. when this driver would actually
 *     clear the buffer for this request; null when nothing blocks them.
 *
 * Delay propagation: once an assignment is status:'completed', its ACTUAL
 * end (`completedAt`) is used instead of the planned `endTime` whenever the
 * actual end is later — so a trip that ran over correctly pushes the
 * driver's next availability later, not the originally planned end time.
 *
 * @param {Array<Object>} driverAssignments
 * @param {Object} request  { date, startTime, endTime }
 * @param {number} [bufferMinutes]
 * @returns {{running:boolean, conflict:boolean, availabilityMinutes:(number|null)}}
 */
export function evaluateAvailability(driverAssignments, request, bufferMinutes = 0) {
  const reqDate = String(request && request.date ? request.date : '').slice(0, 10);
  if (!reqDate) return { running: false, conflict: false, availabilityMinutes: null };
  const reqStart = timeToMinutes(request.startTime);
  const reqEnd = timeToMinutes(request.endTime);
  const reqAllDay = reqStart == null || reqEnd == null || reqStart >= reqEnd;
  const buffer = Number.isFinite(Number(bufferMinutes)) ? Number(bufferMinutes) : 0;

  let running = false;
  let conflict = false;
  let availabilityMinutes = null;

  for (const a of (Array.isArray(driverAssignments) ? driverAssignments : [])) {
    if (!a || a.status === 'cancelled') continue;
    if (assignmentDay(a) !== reqDate) continue;

    if (a.status === 'started') { running = true; continue; } // Step 1 — never actually finished.

    const aStart = timeToMinutes(a.startTime);
    let aEnd = timeToMinutes(a.endTime);
    if (a.status === 'completed' && a.completedAt) {
      const actualEnd = minutesRelativeToDate(a.completedAt, reqDate);
      if (actualEnd != null && (aEnd == null || actualEnd > aEnd)) aEnd = actualEnd; // delay propagation
    }

    const allDayish = a.fullDay || reqAllDay || aStart == null || aEnd == null || aStart >= aEnd;
    if (allDayish) {
      conflict = true;
      availabilityMinutes = Infinity;
      continue;
    }

    // Symmetric buffer: widen the assignment's window by `buffer` on BOTH
    // sides before testing overlap against the request's raw window. This
    // rejects equally whether the assignment ends too close before the
    // request starts, OR the assignment starts too close after the request
    // ends — the buffer must not depend on which one is "existing" vs
    // "candidate" (production bug: only the post-end side was buffered).
    const bufferedStart = aStart - buffer;
    const bufferedEnd = aEnd + buffer;
    if (bufferedStart < reqEnd && reqStart < bufferedEnd) {
      conflict = true;
      if (availabilityMinutes == null || bufferedEnd > availabilityMinutes) availabilityMinutes = bufferedEnd;
    }
  }

  return {
    running,
    conflict: running || conflict,
    availabilityMinutes: Number.isFinite(availabilityMinutes) ? availabilityMinutes : null,
  };
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
 * @param {number} [options.recoveryBufferMinutes] override the configured Recovery Buffer (testing)
 * @param {Object} [options.weights]         override store weights (testing)
 * @param {(driver:Object)=>boolean} [options.isEligible]  extra eligibility filter
 * @returns {{
 *   generatedAt:string,
 *   request:Object,
 *   weights:Object,
 *   recommendedDriver:({driverId:string,score:number,rank:number,bufferSatisfied:boolean,availabilityMinutes:(number|null)}|null),
 *   alternatives:Array<{driverId:string,score:number,rank:number,bufferSatisfied:boolean,availabilityMinutes:(number|null)}>,
 *   diagnostics:RecommendationDiagnostic[]
 * }}
 */
export function recommendDrivers(request = {}, drivers = [], assignments = [], options = {}) {
  const now = options.now || new Date();
  const weights = options.weights || getScoringWeights();
  const bufferMinutes = Number.isFinite(Number(options.recoveryBufferMinutes))
    ? Number(options.recoveryBufferMinutes)
    : getDispatchConfig().recoveryBufferMinutes;
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
    // Recovery Buffer (v1.25.x): running drivers are hard-excluded (Step 1) and
    // the buffer widens each finished assignment's busy window (Step 2) — see
    // evaluateAvailability() for the full rule set + delay propagation.
    const { running, conflict, availabilityMinutes } = evaluateAvailability(mine, request, bufferMinutes);

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
      running,
      availabilityMinutes,
      breakdown,
      utilizationPercent: cap.utilizationPercent,
      assignmentsLast7Days: cap.assignmentsLast7Days,
      status: cap.status,
      trend: trendById.has(driver.id) ? trendById.get(driver.id) : null,
    };
  });

  // Rank: a currently-Running driver can NEVER be picked (Step 1) so they always
  // sink to the bottom, even below a buffer-conflicted-but-finished driver.
  // Among the rest: available (buffer satisfied) beats buffer-conflicted (Step 3
  // vs Step 4). Two available drivers are ordered by score/recency/utilization
  // as before; two buffer-conflicted drivers are ordered by Availability Time
  // (earliest first — Step 4's "earliest Availability Time" tiebreak), then
  // score, then name for determinism.
  scored.sort((a, b) => {
    if (a.running !== b.running) return a.running ? 1 : -1;
    if (a.available !== b.available) return Number(b.available) - Number(a.available);
    if (a.available) {
      return (b.score - a.score)
        || (a.assignmentsLast7Days - b.assignmentsLast7Days)
        || (a.utilizationPercent - b.utilizationPercent)
        || String(a.driverName).localeCompare(String(b.driverName), 'id');
    }
    const aTime = a.availabilityMinutes == null ? Infinity : a.availabilityMinutes;
    const bTime = b.availabilityMinutes == null ? Infinity : b.availabilityMinutes;
    if (aTime !== bTime) return aTime - bTime;
    return (b.score - a.score) || String(a.driverName).localeCompare(String(b.driverName), 'id');
  });

  const ranked = scored.map((d, i) => ({ ...d, rank: i + 1 }));
  const slim = (d) => ({
    driverId: d.driverId, score: d.score, rank: d.rank,
    // Step 4 — a non-running driver can still be selected when NO ONE clears
    // the buffer; bufferSatisfied:false is how the caller is told never to
    // present this pick as if the driver were genuinely, immediately free.
    bufferSatisfied: d.available, availabilityMinutes: d.availabilityMinutes,
  });

  // A Running driver is never selectable (Step 1) — if the top-ranked entry is
  // still Running, every candidate is Running and there is truly no one to
  // offer (recommendedDriver stays null; never fabricate). Otherwise the top
  // entry is either genuinely available (Step 3) or the least-bad buffer
  // fallback (Step 4) — either way it's the pick.
  const top = ranked[0];
  const recommendedDriver = (top && !top.running) ? slim(top) : null;
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
