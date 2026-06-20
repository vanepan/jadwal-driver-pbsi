/* ============================================================
   TREND-ENGINE.JS — Reusable trend / growth / projection math
   (v1.15.0 — Analytics Expansion Foundation)

   ARCHITECTURE RULE: analytics calculations live in engines, never in
   UI components. These pure functions are reusable by Analytics Driver,
   Analytics Petty Cash, Analytics Executive, and every future report
   (PDF, Telegram digest, weekly/monthly).

   Pure: no DOM, no Firebase, no `window`, no Date/random side effects.
   All inputs are explicit; the same inputs always produce the same output.
   ============================================================ */

'use strict';

/** Safe number coercion (null/undefined/NaN → 0). */
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

/**
 * Period-over-period trend between two scalar values.
 * `goodWhenUp`: true = higher is better; false = lower is better;
 * null = directionless/informational (tone stays neutral).
 *
 * @param {number} current
 * @param {number} previous
 * @param {boolean|null} [goodWhenUp=null]
 * @returns {{current:number, previous:number, delta:number,
 *   percentChange:number|null, direction:'up'|'down'|'neutral',
 *   tone:'positive'|'negative'|'neutral'}}
 */
export function calculateTrend(current, previous, goodWhenUp = null) {
  const c = num(current);
  const p = num(previous);
  const delta = c - p;
  const direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'neutral';
  const percentChange = p !== 0 ? Math.round((delta / p) * 100) : null;
  let tone = 'neutral';
  if (direction !== 'neutral' && goodWhenUp !== null) {
    const good = goodWhenUp ? direction === 'up' : direction === 'down';
    tone = good ? 'positive' : 'negative';
  }
  return { current: c, previous: p, delta, percentChange, direction, tone };
}

/**
 * Simple growth rate (percentage) of `current` over `previous`.
 * Returns null when there is no baseline (previous == 0) so callers never
 * fabricate a "∞%" comparison.
 * @param {number} current
 * @param {number} previous
 * @returns {number|null}
 */
export function calculateGrowth(current, previous) {
  const c = num(current);
  const p = num(previous);
  if (p === 0) return null;
  return Math.round(((c - p) / p) * 100);
}

/**
 * Annualized projection from spend-to-date over elapsed days.
 * Formula (spec P2 ANNUALIZED VIEW): (currentSpend / elapsedDays) × 365.
 *
 * @param {number} currentSpend  - actual spend accumulated so far (YTD/period)
 * @param {number} elapsedDays   - days elapsed in the measured window (>0)
 * @param {number} [horizonDays=365] - projection horizon (year by default)
 * @returns {{actual:number, perDay:number, projected:number,
 *   elapsedDays:number, horizonDays:number}}
 */
export function annualizedProjection(currentSpend, elapsedDays, horizonDays = 365) {
  const actual = num(currentSpend);
  const days = Math.max(0, num(elapsedDays));
  const horizon = Math.max(1, num(horizonDays));
  const perDay = days > 0 ? actual / days : 0;
  const projected = Math.round(perDay * horizon);
  return { actual, perDay, projected, elapsedDays: days, horizonDays: horizon };
}

/**
 * Build a numeric series trend from a chronological array of points
 * (oldest → newest). Reusable for sparkline / trend-chart summaries.
 * Compares the LAST point to the FIRST so callers get a one-glance verdict.
 *
 * @param {Array<{label?:string, value:number}>|number[]} series
 * @param {boolean|null} [goodWhenUp=null]
 * @returns {{points:Array<{label:string,value:number}>, total:number,
 *   average:number, min:number, max:number, first:number, last:number,
 *   trend:ReturnType<typeof calculateTrend>}}
 */
export function summarizeSeries(series, goodWhenUp = null) {
  const points = (Array.isArray(series) ? series : []).map((p, i) =>
    typeof p === 'number'
      ? { label: String(i), value: num(p) }
      : { label: String(p && p.label != null ? p.label : i), value: num(p && p.value) });
  const values = points.map(p => p.value);
  const total = values.reduce((s, v) => s + v, 0);
  const first = values.length ? values[0] : 0;
  const last = values.length ? values[values.length - 1] : 0;
  return {
    points,
    total,
    average: values.length ? total / values.length : 0,
    min: values.length ? Math.min(...values) : 0,
    max: values.length ? Math.max(...values) : 0,
    first,
    last,
    trend: calculateTrend(last, first, goodWhenUp),
  };
}
