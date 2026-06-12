/* ============================================================
   ANALYTICS-INSIGHTS.JS — Insight Engine (Sprint 4)

   Answers "what happened?" by INTERPRETING existing AnalyticsModel
   outputs into executive-friendly findings. It performs NO new
   calculations — every insight is derived from values the Analytics
   Engine already computed, and every insight names the source metric
   so it is traceable and explainable.

   Pure function: (AnalyticsModel) → Insight[]. No DOM, no HTML, no
   Firebase, no Date/random → deterministic.

   Insight contract:
   {
     type: 'info' | 'success' | 'warning',
     title: string,
     description: string,
     source: string,    // the metric this insight is derived from
     priority: number,  // 1 = critical, 2 = important, 3 = general
   }

   Out of scope (later sprints): recommendations, AI, anomaly detection.
   ============================================================ */

'use strict';

/** @type {Readonly<{CRITICAL:1, IMPORTANT:2, GENERAL:3}>} */
export const INSIGHT_PRIORITY = Object.freeze({ CRITICAL: 1, IMPORTANT: 2, GENERAL: 3 });

/**
 * Derive deterministic, traceable insights from an AnalyticsModel.
 * @param {import('./analytics-types.js').AnalyticsModel} model
 * @returns {import('./analytics-types.js').Insight[]}
 */
export function generateInsights(model) {
  const k = (model && model.kpis) || {};
  const r = (model && model.render) || {};
  const d = (model && model.diagnostics) || {};

  const total = k.total || 0;
  // Nothing to interpret when there is no activity in the period.
  if (total === 0) return [];

  const out = [];
  const push = (type, priority, title, description, source) =>
    out.push({ type, priority, title, description, source });

  // ── Completion rate (always reported) ──────────────────────────
  if (k.compRate >= 80) {
    push('success', INSIGHT_PRIORITY.GENERAL,
      `Tingkat penyelesaian tinggi (${k.compRate}%)`,
      `${k.completed} dari ${k.total} penugasan selesai pada periode ini.`,
      'Completion Rate');
  } else if (k.compRate < 50) {
    push('warning', INSIGHT_PRIORITY.CRITICAL,
      `Tingkat penyelesaian rendah (${k.compRate}%)`,
      `Hanya ${k.completed} dari ${k.total} penugasan yang selesai pada periode ini.`,
      'Completion Rate');
  } else {
    push('info', INSIGHT_PRIORITY.GENERAL,
      `Tingkat penyelesaian ${k.compRate}%`,
      `${k.completed} dari ${k.total} penugasan selesai pada periode ini.`,
      'Completion Rate');
  }

  // ── Open backlog ───────────────────────────────────────────────
  if (k.openRate > 50) {
    push('warning', INSIGHT_PRIORITY.CRITICAL,
      `Backlog tinggi: ${k.openRate}% penugasan masih terbuka`,
      `${k.openAsg} dari ${k.total} penugasan masih berlangsung atau dijadwalkan.`,
      'Open Rate');
  }

  // ── Cancelled / other ──────────────────────────────────────────
  if (k.cancelled > 0) {
    const pct = Math.round((k.cancelled / total) * 100);
    const heavy = pct >= 20;
    push(heavy ? 'warning' : 'info', heavy ? INSIGHT_PRIORITY.IMPORTANT : INSIGHT_PRIORITY.GENERAL,
      `${k.cancelled} penugasan dibatalkan / lainnya`,
      `Sekitar ${pct}% dari total penugasan tidak berstatus aktif maupun selesai.`,
      'Cancelled Assignments');
  }

  // ── Driver workload distribution ───────────────────────────────
  if (k.wlOverCount > 0) {
    push('warning', INSIGHT_PRIORITY.IMPORTANT,
      `${k.wlOverCount} driver melebihi beban rata-rata`,
      `Distribusi penugasan tidak merata: ${k.wlOverCount} driver di atas rata-rata${k.wlUnderCount > 0 ? `, ${k.wlUnderCount} di bawah rata-rata` : ''}.`,
      'Driver Workload Distribution');
  } else if (k.wlBalancedCount > 0 && (k.driversWithTrips || 0) > 1) {
    push('success', INSIGHT_PRIORITY.GENERAL,
      'Beban driver relatif seimbang',
      `${k.wlBalancedCount} driver bertugas dengan distribusi beban yang seimbang pada periode ini.`,
      'Driver Workload Distribution');
  }

  // ── Idle resources ─────────────────────────────────────────────
  const idleDrivers = Array.isArray(r.inactiveDrivers) ? r.inactiveDrivers.length : 0;
  if (idleDrivers > 0) {
    push('info', INSIGHT_PRIORITY.IMPORTANT,
      `${idleDrivers} driver tanpa penugasan`,
      `${idleDrivers} driver aktif tidak menerima penugasan pada periode ini.`,
      'Inactive Resources');
  }
  const idleVehicles = Array.isArray(r.inactiveVehicles) ? r.inactiveVehicles.length : 0;
  if (idleVehicles > 0) {
    push('info', INSIGHT_PRIORITY.IMPORTANT,
      `${idleVehicles} kendaraan tidak digunakan`,
      `${idleVehicles} kendaraan aktif tidak digunakan pada periode ini.`,
      'Inactive Resources');
  }

  // ── Data quality (interpretation of existing DQ output) ────────
  if ((d.dqUnresolvedCount || 0) > 0) {
    push('warning', INSIGHT_PRIORITY.IMPORTANT,
      `${d.dqUnresolvedCount} potensi duplikasi data`,
      `Terdeteksi ${d.dqUnresolvedCount} pasang nilai mirip yang belum diselesaikan — lihat Data Quality Resolution Center.`,
      'Data Quality');
  }

  // ── Entity concentration (interpretive, general) ───────────────
  if (r.mostActiveDrv) {
    push('info', INSIGHT_PRIORITY.GENERAL,
      `Beban tertinggi pada ${r.mostActiveDrv.displayName}`,
      `${r.mostActiveDrv.displayName} menangani ${r.mostActiveDrv.count} penugasan — terbanyak pada periode ini.`,
      'Driver Workload');
  }
  if (r.mostUsedVeh) {
    push('info', INSIGHT_PRIORITY.GENERAL,
      `Kendaraan paling sering digunakan: ${r.mostUsedVeh.displayName}`,
      `${r.mostUsedVeh.displayName} digunakan untuk ${r.mostUsedVeh.count} penugasan pada periode ini.`,
      'Vehicle Utilization');
  }
  if (Array.isArray(r.destSorted) && r.destSorted[0]) {
    push('info', INSIGHT_PRIORITY.GENERAL,
      `Tujuan tersering: ${r.destSorted[0][0]}`,
      `${r.destSorted[0][0]} menjadi tujuan ${r.destSorted[0][1]} kali pada periode ini.`,
      'Destination Analytics');
  }
  if (r.mostActiveBidang) {
    push('info', INSIGHT_PRIORITY.GENERAL,
      `Permintaan terbanyak dari ${r.mostActiveBidang.name}`,
      `${r.mostActiveBidang.name} mengajukan ${r.mostActiveBidang.reqCount} permintaan pada periode ini.`,
      'Bidang Demand');
  }

  // Deterministic ordering: priority asc, then stable insertion order.
  return out
    .map((it, i) => ({ ...it, _i: i }))
    .sort((a, b) => (a.priority - b.priority) || (a._i - b._i))
    .map(({ _i, ...it }) => it);
}
