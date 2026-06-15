/* ============================================================
   DRIVER-HIGHLIGHTS.JS — Zone-D highlights for the Driver report

   REUSES the existing Insight Engine (js/analytics/analytics-insights.js).
   It does NOT compute new analytics. It:
     1. runs generateInsights(model) — the deterministic, traceable
        findings the engine already produces,
     2. keeps only DRIVER-scope sources,
     3. remaps each to the approved category vocabulary + tone, and
     4. appends a "Jarak" highlight projected from values the engine
        ALREADY computed (render.driverOdoList / kpis.totalKm) — a
        selection, not a calculation (IMPLEMENTATION_ARCHITECTURE §6.3).

   Output: Highlight[] = { category, tone, statement, context }
     tone: 'good' | 'attention' | 'neutral'  → .hcat.g / .hcat.r / —
   ============================================================ */

'use strict';

import { generateInsights } from '../../../analytics/analytics-insights.js';
import { formatInt } from '../format/numbers.js';

/* Insight.source → Zone-D category (only driver-relevant sources). */
const SOURCE_CATEGORY = {
  'Completion Rate':              'Efisiensi',
  'Driver Workload Distribution': 'Distribusi',
  'Driver Workload':              'Distribusi',
  'Inactive Resources':           'Distribusi',
  'Cancelled Assignments':        'Pembatalan',
};

/* Insight.type → highlight tone (drives the category colour). */
const TYPE_TONE = { success: 'good', warning: 'attention', info: 'neutral' };

/* Stable display order of categories (mirrors the approved prototype:
   Efisiensi → Distribusi → Jarak → …). */
const CATEGORY_ORDER = ['Efisiensi', 'Distribusi', 'Jarak', 'Pembatalan'];

/**
 * Build the Driver report highlights from an AnalyticsModel.
 * @param {import('../../../analytics/analytics-types.js').AnalyticsModel} model
 * @returns {Array<{category:string, tone:string, statement:string, context:string}>}
 */
export function selectDriverHighlights(model) {
  const out = [];
  const seen = new Set();

  // 1–3. Reuse engine insights, filtered + remapped, one per category.
  for (const ins of generateInsights(model)) {
    const category = SOURCE_CATEGORY[ins.source];
    if (!category || seen.has(category)) continue; // keep highest-priority per category (insights are pre-sorted)
    seen.add(category);
    out.push({
      category,
      tone: TYPE_TONE[ins.type] || 'neutral',
      statement: ins.title,
      context: ins.description || '',
    });
  }

  // 4. "Jarak" highlight — projected from already-computed odometer values.
  const r = (model && model.render) || {};
  const k = (model && model.kpis) || {};
  const odo = Array.isArray(r.driverOdoList) ? r.driverOdoList : [];
  if (!seen.has('Jarak') && odo.length > 0 && (k.totalKm || 0) > 0) {
    const top = odo[0];
    const pct = Math.round((top.km / k.totalKm) * 100);
    out.push({
      category: 'Jarak',
      tone: 'neutral',
      statement: `${top.name} mencatat ${formatInt(top.km)} km — ${pct}% dari total jarak tempuh armada.`,
      context: 'Selisih jarak antar pengemudi mencerminkan distribusi rute yang tidak merata.',
    });
  }

  // Stable, prototype-like ordering.
  return out.sort((a, b) => {
    const ia = CATEGORY_ORDER.indexOf(a.category);
    const ib = CATEGORY_ORDER.indexOf(b.category);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
}
