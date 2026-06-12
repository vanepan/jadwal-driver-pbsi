/* ============================================================
   ANALYTICS-RECOMMENDATIONS.JS — Recommendation Engine (Sprint 5)

   Answers "what should we do?" using DETERMINISTIC operational rules
   over existing analytics findings. No AI, no LLM, no prediction, no
   machine learning. Every recommendation is advisory and traceable to
   a source metric/insight.

   Pure function: (AnalyticsModel) → Recommendation[]. No DOM, no HTML,
   no Firebase, no Date/random → deterministic.

   Recommendation contract:
   {
     type: 'action' | 'warning' | 'optimization',
     title: string,
     description: string,
     source: string,    // metric/insight this recommendation is based on
     priority: number,  // 1 = operational risk, 2 = optimization, 3 = informational
   }

   Recommendations are advisory only — they change no analytics values.
   ============================================================ */

'use strict';

/** @type {Readonly<{RISK:1, OPTIMIZATION:2, INFO:3}>} */
export const RECOMMENDATION_PRIORITY = Object.freeze({ RISK: 1, OPTIMIZATION: 2, INFO: 3 });

/**
 * Derive deterministic, traceable, actionable recommendations from an
 * AnalyticsModel. Driven by existing metrics (the same values the Insight
 * Engine interprets) — performs no new calculations.
 * @param {import('./analytics-types.js').AnalyticsModel} model
 * @returns {import('./analytics-types.js').Recommendation[]}
 */
export function generateRecommendations(model) {
  const k = (model && model.kpis) || {};
  const r = (model && model.render) || {};
  const d = (model && model.diagnostics) || {};

  const total = k.total || 0;
  if (total === 0) return []; // no activity → no advice

  const out = [];
  const push = (type, priority, title, description, source) =>
    out.push({ type, priority, title, description, source });

  // ── Operational risks (priority 1) ─────────────────────────────
  if (k.compRate < 50) {
    push('warning', RECOMMENDATION_PRIORITY.RISK,
      'Tinjau penyebab penyelesaian rendah',
      `Tingkat penyelesaian hanya ${k.compRate}% (${k.completed}/${k.total}). Telusuri penugasan yang tertahan dan hambatan operasionalnya.`,
      'Completion Rate');
  }
  if (k.openRate > 50) {
    push('action', RECOMMENDATION_PRIORITY.RISK,
      'Tinjau backlog penjadwalan',
      `${k.openRate}% penugasan masih terbuka (${k.openAsg}/${k.total}). Tinjau dan jadwalkan ulang penugasan yang tertunda.`,
      'Open Rate');
  }
  if (k.cancelled > 0) {
    const pct = Math.round((k.cancelled / total) * 100);
    if (pct >= 20) {
      push('action', RECOMMENDATION_PRIORITY.RISK,
        'Tinjau alur persetujuan penugasan',
        `Sekitar ${pct}% penugasan dibatalkan/lainnya (${k.cancelled}). Tinjau alur persetujuan dan penyebab pembatalan.`,
        'Cancelled Assignments');
    }
  }

  // ── Optimization opportunities (priority 2) ────────────────────
  if (k.wlOverCount > 0) {
    push('optimization', RECOMMENDATION_PRIORITY.OPTIMIZATION,
      'Seimbangkan distribusi beban driver',
      `${k.wlOverCount} driver menangani beban di atas rata-rata${k.wlUnderCount > 0 ? ` dan ${k.wlUnderCount} di bawah rata-rata` : ''}. Pertimbangkan realokasi penugasan agar lebih merata.`,
      'Driver Workload Distribution');
  }
  const idleVehicles = Array.isArray(r.inactiveVehicles) ? r.inactiveVehicles.length : 0;
  if (idleVehicles > 0) {
    push('optimization', RECOMMENDATION_PRIORITY.OPTIMIZATION,
      'Tinjau utilisasi armada',
      `${idleVehicles} kendaraan tidak digunakan pada periode ini. Pertimbangkan rotasi penggunaan atau evaluasi kebutuhan armada.`,
      'Inactive Resources');
  }
  const idleDrivers = Array.isArray(r.inactiveDrivers) ? r.inactiveDrivers.length : 0;
  if (idleDrivers > 0) {
    push('optimization', RECOMMENDATION_PRIORITY.OPTIMIZATION,
      'Tinjau alokasi driver',
      `${idleDrivers} driver aktif tanpa penugasan. Pertimbangkan distribusi tugas yang lebih merata.`,
      'Inactive Resources');
  }

  // ── Informational improvements (priority 3) ────────────────────
  if ((d.dqUnresolvedCount || 0) > 0) {
    push('action', RECOMMENDATION_PRIORITY.INFO,
      'Tinjau normalisasi data tujuan/entitas',
      `${d.dqUnresolvedCount} potensi duplikasi belum diselesaikan. Gunakan Data Quality Resolution Center untuk menggabungkan alias dan menjaga akurasi analytics.`,
      'Data Quality');
  }

  // Deterministic ordering: priority asc, then stable insertion order.
  return out
    .map((it, i) => ({ ...it, _i: i }))
    .sort((a, b) => (a.priority - b.priority) || (a._i - b._i))
    .map(({ _i, ...it }) => it);
}
