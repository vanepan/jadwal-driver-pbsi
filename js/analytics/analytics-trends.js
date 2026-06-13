/* ============================================================
   ANALYTICS-TRENDS.JS — Trend Engine (Sprint 6)

   Answers "what changed?" by comparing the current AnalyticsModel to a
   PREVIOUS-period AnalyticsModel (produced by the same engine over the
   equal-length prior window). It performs NO new KPI calculations — it
   only diffs values the engine already computed.

   Pure function: (currentModel, previousModel) → trends map. No DOM, no
   Firebase, no Date/random → deterministic.

   Per-metric trend shape:
   {
     current, previous,
     delta,            // current - previous
     percentChange,    // round(delta / previous * 100) | null when previous == 0
     direction,        // 'up' | 'down' | 'neutral'   (movement)
     tone,             // 'positive' | 'negative' | 'neutral'  (goodness, for color)
   }
   ============================================================ */

'use strict';

/**
 * @param {number} current
 * @param {number} previous
 * @param {boolean|null} goodWhenUp - true: higher is better; false: lower is
 *   better; null: directionless/informational (tone stays neutral).
 */
function trendFor(current, previous, goodWhenUp) {
  const c = Number(current) || 0;
  const p = Number(previous) || 0;
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
 * Build the trends map by diffing current vs previous model KPIs.
 * Only metrics already present in the model are used (Total Assignments,
 * Completion Rate, Open Rate, Cancellation Rate). Cancellation rate is a ratio
 * of existing counts (cancelled / total) — not a new KPI, only a comparison.
 *
 * @param {import('./analytics-types.js').AnalyticsModel} current
 * @param {import('./analytics-types.js').AnalyticsModel} previous
 * @returns {Object} trends map (empty object when inputs are missing)
 */
export function generateTrends(current, previous) {
  if (!current || !previous) return {};
  const c = current.kpis || {};
  const p = previous.kpis || {};

  const cTotal = c.total || 0;
  const pTotal = p.total || 0;
  // Cancellation rate is over ALL assignments (operational + cancelled).
  // Prefer the canonical kpis.cancellationRate (v1.10.8); fall back to deriving
  // it for older models that predate the KPI.
  const cCancDenom = c.grandTotal || (cTotal + (c.cancelled || 0));
  const pCancDenom = p.grandTotal || (pTotal + (p.cancelled || 0));
  const cCancRate = c.cancellationRate != null
    ? c.cancellationRate
    : (cCancDenom > 0 ? Math.round(((c.cancelled || 0) / cCancDenom) * 100) : 0);
  const pCancRate = p.cancellationRate != null
    ? p.cancellationRate
    : (pCancDenom > 0 ? Math.round(((p.cancelled || 0) / pCancDenom) * 100) : 0);

  return {
    totalAssignments: trendFor(cTotal, pTotal, null),          // informational
    completionRate:   trendFor(c.compRate || 0, p.compRate || 0, true),  // higher better
    openRate:         trendFor(c.openRate || 0, p.openRate || 0, false), // lower better
    cancellationRate: trendFor(cCancRate, pCancRate, false),             // lower better
  };
}
