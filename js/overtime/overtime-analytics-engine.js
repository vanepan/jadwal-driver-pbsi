/* ============================================================
   OVERTIME-ANALYTICS-ENGINE.JS — pure summary math (Sprint 7)

   Every function here operates on precomputed daily/monthly summary
   objects (or arrays of them) — NEVER on the raw overtimeRecords list.
   This is the module's enforcement point for the Sprint 7 spec's
   "Dashboard tidak boleh melakukan full scan transaction. Gunakan
   summary." rule: overtime-service.js's getDashboardAnalytics() reads
   the store's daily/monthly summary maps once and hands them here.

   `buildSummaryFromRecords()` is the one exception — a full rebuild
   used only by the admin "Recalculate Summaries" utility and by
   Sprint 9's edit/delete reconciliation cross-check, never by the
   Dashboard's render path.

   PURE: no DOM, no Firebase, no Date.now() side effects beyond what's
   explicitly passed in. Mirrors overtime-rate-engine.js's purity
   contract.
   ============================================================ */

'use strict';

import { summarizeSeries, annualizedProjection } from '../analytics/engines/trend-engine.js';

const WEEKDAY_LABELS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

/* ── Summary shape + reconciliation primitives ───────────────────── */

export function emptySummary() {
  return { totalRecords: 0, totalAmount: 0, byUnit: {}, byEmployee: {}, updatedAt: null };
}

function bumpOrDelete(map, key, deltaCount, deltaAmount) {
  const next = { ...map };
  const prev = next[key] || { count: 0, amount: 0 };
  const count = prev.count + deltaCount;
  const amount = prev.amount + deltaAmount;
  if (count <= 0) delete next[key]; else next[key] = { count, amount };
  return next;
}

/** Fold one record INTO a summary (create path). */
export function addRecordToSummary(summary, record) {
  const s = summary
    ? { ...summary, byUnit: { ...summary.byUnit }, byEmployee: { ...(summary.byEmployee || {}) } }
    : emptySummary();
  const amount = (record && record.rateAmount) || 0;
  s.totalRecords += 1;
  s.totalAmount += amount;
  s.byUnit = bumpOrDelete(s.byUnit, record.unitId, 1, amount);
  s.byEmployee = bumpOrDelete(s.byEmployee, record.employeeId, 1, amount);
  s.updatedAt = Date.now();
  return s;
}

/** Remove one record's contribution FROM a summary (edit/delete path). */
export function subtractRecordFromSummary(summary, record) {
  const s = summary
    ? { ...summary, byUnit: { ...summary.byUnit }, byEmployee: { ...(summary.byEmployee || {}) } }
    : emptySummary();
  const amount = (record && record.rateAmount) || 0;
  s.totalRecords = Math.max(0, s.totalRecords - 1);
  s.totalAmount -= amount;
  s.byUnit = bumpOrDelete(s.byUnit, record.unitId, -1, -amount);
  s.byEmployee = bumpOrDelete(s.byEmployee, record.employeeId, -1, -amount);
  s.updatedAt = Date.now();
  return s;
}

/** Full rebuild from a list of records — ground truth used by the
    "Recalculate Summaries" utility and the Sprint 9 reconciliation
    cross-check. Must always equal folding addRecordToSummary over the
    same records in any order (order-independent by construction). */
export function buildSummaryFromRecords(records) {
  return (records || []).reduce((s, r) => addRecordToSummary(s, r), emptySummary());
}

/** Adds multiple already-computed summaries together (e.g. several days'
    dailySummary objects into one week total, or several months' into one
    year total) — summary-to-summary, unlike addRecordToSummary which folds
    a single raw record in. Used by the Report Builder (Sprint 8) for
    week/year period snapshots where no precomputed node exists. */
export function mergeSummaries(summaries) {
  return (summaries || []).filter(Boolean).reduce((acc, s) => {
    const out = { ...acc, byUnit: { ...acc.byUnit }, byEmployee: { ...acc.byEmployee } };
    out.totalRecords += s.totalRecords || 0;
    out.totalAmount += s.totalAmount || 0;
    Object.entries(s.byUnit || {}).forEach(([k, v]) => {
      const b = out.byUnit[k] || { count: 0, amount: 0 };
      out.byUnit[k] = { count: b.count + v.count, amount: b.amount + v.amount };
    });
    Object.entries(s.byEmployee || {}).forEach(([k, v]) => {
      const b = out.byEmployee[k] || { count: 0, amount: 0 };
      out.byEmployee[k] = { count: b.count + v.count, amount: b.amount + v.amount };
    });
    out.updatedAt = Date.now();
    return out;
  }, emptySummary());
}

/**
 * Reconciles a summary node keyed by `oldKey`/`newKey` (a dateISO or a
 * yyyy-mm) when a record is EDITED and its date changes: subtracts the
 * record's old contribution and adds its new one. Handles the
 * key-unchanged case by composing subtract-then-add on the SAME base
 * object (not two independent fetches — fetching `oldKey` and `newKey`
 * separately when they're equal would silently drop the subtraction).
 * `getSummary(key)` is injected so this stays pure (Sprint 9's
 * `updateRecord` passes the store's getters; a test passes a plain
 * lookup). Returns only the key(s) that actually need writing.
 * @param {(key:string)=>Object|null} getSummary
 * @returns {{[key:string]: Object}}
 */
export function reconcileSummaryEdit(getSummary, oldKey, newKey, oldRecord, newRecord) {
  if (oldKey === newKey) {
    return { [oldKey]: addRecordToSummary(subtractRecordFromSummary(getSummary(oldKey), oldRecord), newRecord) };
  }
  return {
    [oldKey]: subtractRecordFromSummary(getSummary(oldKey), oldRecord),
    [newKey]: addRecordToSummary(getSummary(newKey), newRecord),
  };
}

/* ── Rankings ───────────────────────────────────────────────────── */

function rankBucketMap(bucketMap, idKey, entities) {
  const byId = new Map((entities || []).map(e => [e.id, e]));
  return Object.entries(bucketMap || {})
    .map(([id, v]) => ({ [idKey]: id, name: (byId.get(id) && byId.get(id).name) || id, count: v.count, amount: v.amount }))
    .sort((a, b) => b.amount - a.amount || b.count - a.count || a.name.localeCompare(b.name));
}

/** Per-unit ranking. `employees` (optional) additionally derives
    `employeeCount` — the DISTINCT headcount that contributed to the unit's
    total this period, separate from `count` (total entries, which can
    exceed headcount when an employee has multiple entries). */
export function topUnits(summary, units, employees, limit = 5) {
  const employeeUnit = new Map((employees || []).map(e => [e.id, e.unitId]));
  const unitEmployeeSets = new Map();
  Object.keys((summary && summary.byEmployee) || {}).forEach(empId => {
    const unitId = employeeUnit.get(empId);
    if (!unitId) return;
    if (!unitEmployeeSets.has(unitId)) unitEmployeeSets.set(unitId, new Set());
    unitEmployeeSets.get(unitId).add(empId);
  });
  return rankBucketMap(summary && summary.byUnit, 'unitId', units)
    .map(row => ({ ...row, employeeCount: unitEmployeeSets.has(row.unitId) ? unitEmployeeSets.get(row.unitId).size : 0 }))
    .slice(0, limit);
}

export function topEmployees(summary, employees, limit = 5) {
  return rankBucketMap(summary && summary.byEmployee, 'employeeId', employees).slice(0, limit);
}

/* ── Ranged sums over the daily-summary map ────────────────────────
   `dailySummaries` is always the store's full { [dateISO]: summary }
   map — a small, bounded structure (one entry per day that has ever
   had an entry), not the record list. */

export function sumDailySummariesInRange(dailySummaries, startISO, endISO) {
  let days = 0, amount = 0, records = 0;
  Object.entries(dailySummaries || {}).forEach(([dateISO, s]) => {
    if (dateISO < startISO || dateISO > endISO) return;
    if ((s.totalRecords || 0) > 0) days += 1;
    amount += s.totalAmount || 0;
    records += s.totalRecords || 0;
  });
  return { days, amount, records };
}

function pad2(n) { return String(n).padStart(2, '0'); }
function toISO(d) { return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }

/** Monday–Sunday range containing `dateISO`. */
export function weekRangeContaining(dateISO) {
  const d = new Date(`${dateISO}T00:00:00`);
  const day = d.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(d); monday.setDate(d.getDate() + mondayOffset);
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
  return { start: toISO(monday), end: toISO(sunday) };
}

export function monthRangeOf(yyyyMM) {
  const [y, m] = String(yyyyMM).split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  return { start: `${yyyyMM}-01`, end: `${yyyyMM}-${pad2(daysInMonth)}` };
}

export function yearRangeOf(yyyy) {
  return { start: `${yyyy}-01-01`, end: `${yyyy}-12-31` };
}

/* ── Trend series ───────────────────────────────────────────────── */

function bucketKeyFor(dateISO, granularity) {
  if (granularity === 'weekly') return weekRangeContaining(dateISO).start;
  if (granularity === 'monthly') return dateISO.slice(0, 7);
  if (granularity === 'yearly') return dateISO.slice(0, 4);
  return dateISO;
}

/** Buckets the daily-summary map into daily|weekly|monthly|yearly points
    (chronological) and hands the series to trend-engine's summarizeSeries
    for the trend verdict — trend MATH itself is never reimplemented here. */
export function buildTrendSeries(dailySummaries, granularity = 'daily') {
  const buckets = new Map();
  Object.entries(dailySummaries || {})
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([dateISO, s]) => {
      const key = bucketKeyFor(dateISO, granularity);
      const b = buckets.get(key) || { count: 0, amount: 0 };
      b.count += s.totalRecords || 0;
      b.amount += s.totalAmount || 0;
      buckets.set(key, b);
    });
  const points = [...buckets.entries()].map(([label, v]) => ({ label, value: v.amount, count: v.count }));
  return { granularity, points, summary: summarizeSeries(points) };
}

/* ── Heatmap ────────────────────────────────────────────────────── */

/** One cell per calendar day of `yyyyMM`, intensity normalized 0..1
    against that month's busiest day (for CSS-grid shading). */
export function buildHeatmapGrid(dailySummaries, yyyyMM) {
  const [y, m] = String(yyyyMM).split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const cells = [];
  let max = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${yyyyMM}-${pad2(day)}`;
    const s = (dailySummaries || {})[date];
    const amount = (s && s.totalAmount) || 0;
    const count = (s && s.totalRecords) || 0;
    if (amount > max) max = amount;
    cells.push({ date, day, count, amount });
  }
  return cells.map(c => ({ ...c, intensity: max > 0 ? c.amount / max : 0 }));
}

/* ── Budget analytics ───────────────────────────────────────────── */

/**
 * @param {number} monthlyAmount - this month's running total (from the
 *   monthly summary — never recomputed here)
 * @param {number} yearAmount    - year-to-date total (sum of this year's
 *   monthly summaries)
 * @param {number} target        - the monthly budget target (0 = unset)
 * @param {string} today         - yyyy-mm-dd, the "as of" date
 */
export function buildBudgetAnalytics({ monthlyAmount = 0, yearAmount = 0, target = 0, today }) {
  const running = monthlyAmount || 0;
  const remaining = (target || 0) - running;
  const utilization = target > 0 ? (running / target) * 100 : null;

  const d = new Date(`${today}T00:00:00`);
  const elapsedDaysInMonth = d.getDate();
  const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const avgPerDay = elapsedDaysInMonth > 0 ? running / elapsedDaysInMonth : 0;
  const eom = annualizedProjection(running, elapsedDaysInMonth, daysInMonth);

  const startOfYear = new Date(d.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((d - startOfYear) / 86400000) + 1;
  const isLeap = new Date(d.getFullYear(), 1, 29).getMonth() === 1;
  const daysInYear = isLeap ? 366 : 365;
  const eoy = annualizedProjection(yearAmount || 0, dayOfYear, daysInYear);

  return {
    target: target || 0,
    running,
    remaining,
    utilization,
    avgPerDay,
    projectedEOM: eom.projected,
    projectedEOY: eoy.projected,
  };
}

/* ── Executive cards ────────────────────────────────────────────── */

function dayOfWeekFromCells(cells) {
  const buckets = WEEKDAY_LABELS.map((label, dow) => ({ dow, label, count: 0, amount: 0 }));
  (cells || []).forEach(c => {
    const dow = new Date(`${c.date}T00:00:00`).getDay();
    buckets[dow].count += c.count;
    buckets[dow].amount += c.amount;
  });
  return buckets;
}

/** All fields scoped to the SAME month as `heatmapCells`/`monthlySummary`
    — consistent with the Dashboard's other "this month" rankings. */
export function buildExecutiveCards({ heatmapCells, monthlySummary, units, employees }) {
  const topUnit = topUnits(monthlySummary, units, employees, 1)[0] || null;
  const topEmployee = topEmployees(monthlySummary, employees, 1)[0] || null;

  const mostExpensiveDay = (heatmapCells || []).reduce((best, c) => (!best || c.amount > best.amount) ? c : best, null);
  const dowBuckets = dayOfWeekFromCells(heatmapCells);
  const mostFrequentDayOfWeek = dowBuckets.reduce((best, b) => (!best || b.count > best.count) ? b : best, null);

  const totalRecords = (monthlySummary && monthlySummary.totalRecords) || 0;
  const totalAmount = (monthlySummary && monthlySummary.totalAmount) || 0;
  const daysWithData = (heatmapCells || []).filter(c => c.count > 0).length;

  return {
    topUnit,
    topEmployee,
    mostExpensiveDay: mostExpensiveDay && mostExpensiveDay.amount > 0 ? mostExpensiveDay : null,
    mostFrequentDayOfWeek: mostFrequentDayOfWeek && mostFrequentDayOfWeek.count > 0 ? mostFrequentDayOfWeek : null,
    averageCost: totalRecords > 0 ? totalAmount / totalRecords : 0,
    averageEmployeePerDay: daysWithData > 0 ? totalRecords / daysWithData : 0,
  };
}
