/* ============================================================
   DRIVER-CAPACITY-ENGINE.JS — Dispatch Intelligence Foundation
   (v1.16.4.11-alpha.1)

   The first milestone of Dispatch Intelligence: a pure, reusable
   capacity-measurement layer derived ENTIRELY from the assignment
   records Driver Operations already produces. It answers one question
   per driver — "how loaded is this driver, and how much room is left?"
   — and exposes it as a normalized 0–100 utilization plus a four-band
   status (LOW / NORMAL / HIGH / OVERLOADED).

   WHY a dedicated engine (not folded into analytics-engine):
     This layer is consumed by future Dispatch Intelligence milestones
     (Driver Recommendation, Vehicle Recommendation, Dispatch Scoring,
     Auto-Assignment Suggestions). Keeping it pure — no DOM, no Firebase,
     no `window`, no side effects — means every one of those can import it
     server-side, in a worker, or in a node test harness without dragging
     in the operational app. It mirrors the engine convention already set
     by js/analytics/engines/workload-engine.js.

   CAPACITY MODEL — a fixed monthly reference (NOT cohort-relative):
     Unlike the Workload Score (which normalizes against the busiest
     driver in the period), capacity is measured against a FIXED monthly
     reference of 50 assignments/month. Capacity must answer "is THIS
     driver near their own ceiling?" — an absolute question — so a fixed
     reference is correct here (a quiet month must not make everyone read
     as "available"). Utilization is therefore directly comparable across
     periods and drivers.

   SCOPE: capacity measurement ONLY. NOT payroll, overtime, tariff, HR
   appraisal, or auto-assignment. This release is foundation: it computes
   and exposes capacity; it does not act on it.
   ============================================================ */

'use strict';

import { getDispatchConfig, DEFAULT_MONTHLY_CAPACITY } from '../config/dispatch-intelligence-config.js';

/** Re-exported from the config module — the single home for capacity literals.
 *  The engine reads the LIVE config (getDispatchConfig) on every call, so a
 *  runtime setDispatchConfig() flows through without touching call sites. */
export { DEFAULT_MONTHLY_CAPACITY };

/** The active monthly-capacity reference (live config). */
function configCapacity() { return getDispatchConfig().monthlyCapacity; }

/** Rolling windows (in days) the engine reports counts for. */
export const CAPACITY_WINDOWS = Object.freeze({ recent: 7, month: 30 });

/** Capacity status bands keyed by inclusive utilization-% ceiling.
 *    0–40   LOW         — plenty of room
 *   41–75   NORMAL      — healthy load
 *   76–90   HIGH        — approaching ceiling
 *   91–100  OVERLOADED  — at / over capacity
 *  Exported so UI and downstream scoring share one definition. */
export const CAPACITY_STATUS = Object.freeze({
  LOW: 'LOW',
  NORMAL: 'NORMAL',
  HIGH: 'HIGH',
  OVERLOADED: 'OVERLOADED',
});

/** Default ordered band table (ceiling inclusive), derived from the config
 *  default. The first band whose `max` the utilization does not exceed wins;
 *  anything above the last ceiling is OVERLOADED. Exposed for reference — the
 *  live thresholds come from the configurable statusBands (see bandsTable). */
export const CAPACITY_STATUS_BANDS = Object.freeze(
  bandsTable(getDispatchConfig().statusBands),
);

/** Convert a configurable statusBands map { LOW:[min,max], … } into the ordered
 *  ceiling table the status lookup uses (sorted by upper bound ascending). The
 *  ranges are contiguous integers (0–40, 41–75, …) covering 0–100, so the upper
 *  bound is a sufficient ceiling. */
function bandsTable(statusBands) {
  return Object.entries(statusBands || {})
    .map(([status, range]) => ({ status, max: num(Array.isArray(range) ? range[1] : range) }))
    .sort((a, b) => a.max - b.max);
}

/** Assignment statuses that do NOT represent consumed capacity. A cancelled
 *  trip never happened, so it is excluded from every count. */
const NON_CAPACITY_STATUSES = new Set(['cancelled']);

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/** Local-day ISO (yyyy-mm-dd), timezone-safe — mirrors drivers-store.todayISO. */
function dayISO(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

/** The operational date of an assignment: `date` (single/first day) falling
 *  back to `startDate` — the exact accessor analytics-engine uses. */
function assignmentDay(a) {
  return (a && (a.date || a.startDate)) ? String(a.date || a.startDate).slice(0, 10) : '';
}

/** Whole local days between two yyyy-mm-dd strings (a − b). Positive when
 *  `a` is later. Returns null if either is unparseable. */
function dayDiff(aISO, bISO) {
  if (!aISO || !bISO) return null;
  const a = Date.parse(`${aISO}T00:00:00`);
  const b = Date.parse(`${bISO}T00:00:00`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((a - b) / 86400000);
}

/**
 * Utilization % against the monthly reference.
 *   utilizationPercent = (assignmentsLast30Days / monthlyCapacity) × 100, capped 100.
 * @param {number} assignmentsLast30Days
 * @param {number} [monthlyCapacity]  defaults to the live config capacity
 * @returns {number} integer 0–100
 */
export function calculateUtilization(assignmentsLast30Days, monthlyCapacity = configCapacity()) {
  const cap = num(monthlyCapacity) > 0 ? num(monthlyCapacity) : configCapacity();
  return clamp(Math.round((num(assignmentsLast30Days) / cap) * 100), 0, 100);
}

/**
 * Remaining bookable slots this month.
 *   availableSlots = monthlyCapacity − assignmentsLast30Days, floored at 0.
 *
 * Per the spec the public signature derives slots from utilizationPercent.
 * For integer assignment counts this is exactly equivalent to
 * `monthlyCapacity − assignmentsLast30Days` (utilization = count / cap × 100,
 * so cap × (1 − utilization/100) = cap − count), and it naturally floors at 0
 * once utilization caps at 100 (an over-capacity driver has 0 slots).
 * @param {number} utilizationPercent 0–100
 * @param {number} [monthlyCapacity]  defaults to the live config capacity
 * @returns {number} integer ≥ 0
 */
export function calculateAvailableSlots(utilizationPercent, monthlyCapacity = configCapacity()) {
  const cap = num(monthlyCapacity) > 0 ? num(monthlyCapacity) : configCapacity();
  const used = clamp(num(utilizationPercent), 0, 100) / 100;
  return Math.max(0, Math.round(cap * (1 - used)));
}

/**
 * Map a utilization % onto its capacity status band.
 * @param {number} utilizationPercent 0–100
 * @param {Object} [statusBands]  configurable bands map (defaults to live config)
 * @returns {'LOW'|'NORMAL'|'HIGH'|'OVERLOADED'}
 */
export function calculateStatus(utilizationPercent, statusBands = getDispatchConfig().statusBands) {
  const u = clamp(num(utilizationPercent), 0, 100);
  const band = bandsTable(statusBands).find((b) => u <= b.max);
  return band ? band.status : CAPACITY_STATUS.OVERLOADED;
}

/**
 * @typedef {Object} DriverCapacity
 * @property {string} driverId
 * @property {number} totalAssignments       all-time non-cancelled count for this driver
 * @property {number} assignmentsLast7Days    non-cancelled in the trailing 7 days
 * @property {number} assignmentsLast30Days   non-cancelled in the trailing 30 days
 * @property {number} utilizationPercent      0–100 (last-30 / monthlyCapacity)
 * @property {number} availableSlots          remaining bookable slots this month (≥0)
 * @property {'LOW'|'NORMAL'|'HIGH'|'OVERLOADED'} status
 * @property {number} monthlyCapacity         the reference used (transparency; additive)
 */

/**
 * Compute one driver's capacity from their assignment history.
 *
 * `assignments` may be the driver's own list (already filtered) OR the full
 * operational set — by default the engine keeps only records whose driver
 * identity matches `driverId` (comparing `a.driverId` then `a.driver`, plus
 * any `options.aliases` such as a driver's legacy names). Pass
 * `options.preFiltered = true` to skip matching when the caller has already
 * narrowed the list. Cancelled assignments are always excluded.
 *
 * @param {string} driverId
 * @param {Array<Object>} assignments  operational assignment records
 * @param {Object} [options]
 * @param {number}  [options.monthlyCapacity=50]
 * @param {Date|string} [options.now]        "today" reference (default: real now)
 * @param {string[]} [options.aliases]       extra identities that also match this driver
 * @param {boolean} [options.preFiltered]    treat `assignments` as already this driver's
 * @returns {DriverCapacity}
 */
export function calculateDriverCapacity(driverId, assignments, options = {}) {
  const monthlyCapacity = num(options.monthlyCapacity) > 0 ? num(options.monthlyCapacity) : configCapacity();
  const today = dayISO(options.now || new Date());
  const aliases = Array.isArray(options.aliases) ? options.aliases : [];
  const identities = new Set([driverId, ...aliases].filter(Boolean).map((s) => String(s)));

  const list = Array.isArray(assignments) ? assignments : [];
  const mine = options.preFiltered
    ? list
    : list.filter((a) => a && (identities.has(String(a.driverId)) || identities.has(String(a.driver))));

  let totalAssignments = 0;
  let assignmentsLast7Days = 0;
  let assignmentsLast30Days = 0;

  for (const a of mine) {
    if (a && NON_CAPACITY_STATUSES.has(a.status)) continue; // cancelled never counts
    totalAssignments++;
    const ageDays = dayDiff(today, assignmentDay(a)); // ≥0 = past/today, <0 = future
    if (ageDays === null || ageDays < 0) continue;     // future bookings: total only
    if (ageDays < CAPACITY_WINDOWS.month) assignmentsLast30Days++;
    if (ageDays < CAPACITY_WINDOWS.recent) assignmentsLast7Days++;
  }

  const utilizationPercent = calculateUtilization(assignmentsLast30Days, monthlyCapacity);
  const availableSlots = calculateAvailableSlots(utilizationPercent, monthlyCapacity);
  const status = calculateStatus(utilizationPercent);

  return {
    driverId: driverId != null ? String(driverId) : '',
    totalAssignments,
    assignmentsLast7Days,
    assignmentsLast30Days,
    utilizationPercent,
    availableSlots,
    status,
    monthlyCapacity,
  };
}
