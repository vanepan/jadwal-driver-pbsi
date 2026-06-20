/* ============================================================
   RANKING-ENGINE.JS — Reusable topN / bottomN / distribution
   (v1.15.0 — Analytics Expansion Foundation)

   Generic ranking over a list of records grouped by a key. Reused by:
   Spending Analytics (category/unit/bidang breakdown, top transactions),
   Analytics Driver, Analytics Executive, and future reports.

   Pure: no DOM, no Firebase, no side effects.
   ============================================================ */

'use strict';

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

/**
 * Aggregate records into ranked groups.
 * @template T
 * @param {T[]} records
 * @param {{ keyOf:(r:T)=>(string|null|undefined),
 *           valueOf?:(r:T)=>number,
 *           labelOf?:(key:string,r:T)=>string }} opts
 *   - keyOf:   group key per record (null/'' → skipped)
 *   - valueOf: numeric contribution per record (default 1 = count)
 *   - labelOf: display label for a key (default: the key)
 * @returns {Array<{key:string,label:string,value:number,count:number}>}
 *   sorted by value desc, then count desc, then label asc (stable, deterministic)
 */
export function aggregate(records, { keyOf, valueOf, labelOf } = {}) {
  const getKey = typeof keyOf === 'function' ? keyOf : (r) => r && r.key;
  const getVal = typeof valueOf === 'function' ? valueOf : () => 1;
  const getLabel = typeof labelOf === 'function' ? labelOf : (k) => k;
  const map = new Map();
  for (const r of (Array.isArray(records) ? records : [])) {
    const rawKey = getKey(r);
    if (rawKey == null) continue;
    const key = String(rawKey).trim();
    if (!key) continue;
    const entry = map.get(key) || { key, label: getLabel(key, r), value: 0, count: 0 };
    entry.value += num(getVal(r));
    entry.count += 1;
    map.set(key, entry);
  }
  return [...map.values()].sort(
    (a, b) => (b.value - a.value) || (b.count - a.count) || a.label.localeCompare(b.label));
}

/**
 * Top N ranked groups. Pass already-aggregated rows, or raw records + opts.
 * @param {Array} input  - aggregated rows OR raw records (with opts.keyOf)
 * @param {number} [n=5]
 * @param {Object} [opts] - aggregation options when `input` is raw records
 * @returns {Array<{key:string,label:string,value:number,count:number}>}
 */
export function topN(input, n = 5, opts = null) {
  const rows = opts ? aggregate(input, opts) : (Array.isArray(input) ? input.slice() : []);
  return rows.slice(0, Math.max(0, n));
}

/**
 * Bottom N ranked groups (lowest value first).
 * @param {Array} input
 * @param {number} [n=5]
 * @param {Object} [opts]
 * @returns {Array}
 */
export function bottomN(input, n = 5, opts = null) {
  const rows = opts ? aggregate(input, opts) : (Array.isArray(input) ? input.slice() : []);
  return rows.slice().reverse().slice(0, Math.max(0, n));
}

/**
 * Distribution: each group's share of the grand total, as a percentage.
 * Adds `pct` (0–100, rounded) and `share` (0–1) to every row, preserving
 * sort order. The leading row is the dominant contributor.
 * @param {Array} input - aggregated rows OR raw records (with opts)
 * @param {Object} [opts]
 * @returns {{total:number, rows:Array<{key:string,label:string,value:number,
 *   count:number,pct:number,share:number}>, top:Object|null}}
 */
export function distribution(input, opts = null) {
  const rows = opts ? aggregate(input, opts) : (Array.isArray(input) ? input.slice() : []);
  const total = rows.reduce((s, r) => s + num(r.value), 0);
  const withPct = rows.map(r => {
    const share = total > 0 ? num(r.value) / total : 0;
    return { ...r, share, pct: Math.round(share * 100) };
  });
  return { total, rows: withPct, top: withPct[0] || null };
}
