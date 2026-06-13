/* ============================================================
   ANALYTICS-CANCELLATION.JS — Cancellation Intelligence Foundation
   (v1.10.8 — Analytics Cancellation Intelligence)

   Reusable, deterministic aggregation functions + data model for the
   newly introduced `cancelled` assignment status. This is the FOUNDATION
   layer the spec asks for — it establishes the data structures future
   Operational Intelligence dashboards will consume:

     Cancellation by Bidang
     Cancellation by Driver
     Cancellation by Vehicle
     Cancellation by Destination
     Cancellation by Reason
     Cancellation Trend (monthly / weekly)

   Pure functions: (cancelledList, options) → CancellationModel. No DOM,
   no Firebase, no Date/random → deterministic and unit-testable.

   IMPORTANT: cancelled assignments NEVER count as completed work or as
   operational utilization. This module only ever receives the already
   separated cancelled set, so it cannot inflate operational metrics.
   ============================================================ */

'use strict';

/** Sort a Map<string,{count}> into a descending array of {name,count}. */
function _sortedCounts(map) {
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => (b.count - a.count) || a.name.localeCompare(b.name));
}

/** ISO-8601 week key (YYYY-Www) for a YYYY-MM-DD date string. Empty when invalid. */
function _isoWeekKey(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return '';
  // Copy date, shift to Thursday of the same ISO week (ISO weeks are Mon–Sun).
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = (dt.getUTCDay() + 6) % 7;      // 0 = Monday
  dt.setUTCDate(dt.getUTCDate() - day + 3);  // Thursday decides the year
  const firstThursday = new Date(Date.UTC(dt.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(
    ((dt - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7
  );
  return `${dt.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Month key (YYYY-MM) for a YYYY-MM-DD date string. Empty when invalid. */
function _monthKey(dateStr) {
  if (!dateStr || typeof dateStr !== 'string' || dateStr.length < 7) return '';
  return dateStr.slice(0, 7);
}

/**
 * Aggregate a list of cancelled assignments into the reusable cancellation model.
 *
 * @param {Array<Object>} cancelledList - assignments already filtered to status === 'cancelled'
 * @param {Object} [opts]
 * @param {(a:Object)=>string|null} [opts.resolveBidang] - maps an assignment to its
 *        canonical bidang name (alias-resolved). Defaults to assignment.createdBy.
 * @param {number} [opts.operationalTotal=0] - completed + in-progress + scheduled count,
 *        used to derive grandTotal and the cancellation rate.
 * @param {number} [opts.completed=0] - completed count, for completion-vs-cancellation rate.
 * @returns {{
 *   count:number, rate:number, completionVsCancellationRate:number, grandTotal:number,
 *   byBidang:Array, byDriver:Array, byVehicle:Array, byDestination:Array, byReason:Array,
 *   byMonth:Array, byWeek:Array, topBidang:Object|null
 * }}
 */
export function buildCancellationModel(cancelledList = [], opts = {}) {
  const list = Array.isArray(cancelledList) ? cancelledList : [];
  const resolveBidang = typeof opts.resolveBidang === 'function'
    ? opts.resolveBidang
    : (a) => (a && a.createdBy) || null;
  const operationalTotal = Number(opts.operationalTotal) || 0;
  const completed = Number(opts.completed) || 0;

  const count = list.length;
  const grandTotal = operationalTotal + count;
  const rate = grandTotal > 0 ? Math.round((count / grandTotal) * 100) : 0;
  const completionVsCancellationRate = (completed + count) > 0
    ? Math.round((completed / (completed + count)) * 100)
    : 0;

  const bidang = new Map();
  const driver = new Map();
  const vehicle = new Map();
  const dest = new Map();
  const reason = new Map();
  const month = new Map();
  const week = new Map();
  // Preserve a human label for reasons (keyed case-insensitively).
  const reasonLabel = new Map();

  const bump = (map, key) => { if (key) map.set(key, (map.get(key) || 0) + 1); };

  for (const a of list) {
    if (!a) continue;
    bump(bidang, (resolveBidang(a) || '').trim());
    bump(driver, (a.driver || '').trim());
    bump(vehicle, (a.vehicle || '').trim());
    bump(dest, (a.destination || '').trim());

    const rawReason = (a.cancellationReason || '').trim();
    if (rawReason) {
      const rk = rawReason.toLowerCase();
      reason.set(rk, (reason.get(rk) || 0) + 1);
      if (!reasonLabel.has(rk)) reasonLabel.set(rk, rawReason);
    }

    // Trend buckets keyed on the assignment's operational date (falls back to
    // the cancellation timestamp's date portion when the date is missing).
    const dateStr = a.date || (typeof a.cancelledAt === 'string' ? a.cancelledAt.slice(0, 10) : '');
    bump(month, _monthKey(dateStr));
    bump(week, _isoWeekKey(dateStr));
  }

  const byReason = [...reason.entries()]
    .map(([k, c]) => ({ name: reasonLabel.get(k) || k, count: c }))
    .sort((a, b) => (b.count - a.count) || a.name.localeCompare(b.name));

  // Trend buckets are returned in chronological order (ascending key).
  const chrono = (map) => [...map.entries()]
    .map(([period, count]) => ({ period, count }))
    .sort((a, b) => a.period.localeCompare(b.period));

  const byBidang = _sortedCounts(bidang);

  return {
    count,
    rate,                            // cancelled / (operational + cancelled)
    completionVsCancellationRate,    // completed / (completed + cancelled)
    grandTotal,
    byBidang,
    byDriver:      _sortedCounts(driver),
    byVehicle:     _sortedCounts(vehicle),
    byDestination: _sortedCounts(dest),
    byReason,
    byMonth: chrono(month),
    byWeek:  chrono(week),
    topBidang: byBidang[0] || null,
  };
}

/** Shape-stable empty cancellation model (for fallbacks / empty periods). */
export function emptyCancellationModel() {
  return {
    count: 0, rate: 0, completionVsCancellationRate: 0, grandTotal: 0,
    byBidang: [], byDriver: [], byVehicle: [], byDestination: [], byReason: [],
    byMonth: [], byWeek: [], topBidang: null,
  };
}
