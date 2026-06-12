/* ============================================================
   ANALYTICS-PERIOD.JS — Period comparison foundation (Sprint 6)

   Deterministically derives the PREVIOUS equal-length window for a given
   analytics date range, so the Trend Engine can answer "what changed?" by
   comparing two adjacent, non-overlapping periods.

   It produces the two parameters the Analytics Engine needs to compute the
   previous-period model:
     • prevNow   — an injected clock (ctx.now) shifted back by one period, so
                   the engine's own cutoff math reproduces the previous window's
                   lower bound exactly (mirrors analytics-engine.js cutoff logic).
     • windowEnd — the previous window's inclusive UPPER bound (ctx.windowEnd),
                   which the engine applies additively to stop current-period
                   records from leaking into the previous window.

   ── Assumptions / contract ────────────────────────────────────────────────
   The engine's current window for an N-day range is [now-(N-1) .. now]
   (lower-bounded only). The previous equivalent window is therefore
   [now-(2N-1) .. now-N], length N, immediately preceding and adjacent to it:

     range   N    current window            previous window
     today   1    {now}                     {now-1}
     7d      7    [now-6  .. now]            [now-13 .. now-7]
     30d     30   [now-29 .. now]            [now-59 .. now-30]
     90d     90   [now-89 .. now]            [now-179 .. now-90]

   Setting prevNow = now - N gives the engine cutoff = prevNow - (N-1) =
   now-(2N-1) (the previous lower bound); windowEnd = date(now - N) is the
   previous upper bound. 'all' (and any unknown range) has no fixed length, so
   no comparison is available.

   Pure: (dateRange, now) → descriptor. No DOM, no Firebase, no side effects.
   All date math is UTC ISO, matching the engine, so it is reproducible.
   ============================================================ */

'use strict';

/** Period length in days, keyed by the engine's date-range identifiers. */
const PERIOD_DAYS = Object.freeze({ today: 1, '7d': 7, '30d': 30, '90d': 90 });

/**
 * Derive the previous-period engine parameters for a date range.
 * @param {'today'|'7d'|'30d'|'90d'|'all'|string} dateRange
 * @param {Date|string|number} [now] - reference clock (defaults to real time)
 * @returns {{available:false}|{available:true, prevNow:string, windowEnd:string, days:number}}
 */
export function derivePreviousPeriod(dateRange, now = new Date()) {
  const days = PERIOD_DAYS[dateRange];
  // 'all' / unknown → no fixed-length previous period to compare against.
  if (!days) return { available: false };

  const prev = new Date(now);
  prev.setDate(prev.getDate() - days);
  const prevNow = prev.toISOString();          // injected ctx.now for previous model
  const windowEnd = prevNow.split('T')[0];     // inclusive upper bound (YYYY-MM-DD)
  return { available: true, prevNow, windowEnd, days };
}
