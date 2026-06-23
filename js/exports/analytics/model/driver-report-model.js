/* ============================================================
   DRIVER-REPORT-MODEL.JS — AnalyticsModel → DriverReportModel

   The client-side projection for the Driver Analytics Export
   (IMPLEMENTATION_ARCHITECTURE §5/§7). It reads the EXISTING
   AnalyticsModel (computeAnalyticsModel output) and the existing
   Insight Engine — it does NOT compute analytics or create an
   engine. Output is plain, serializable data sent to the render
   Cloud Function.

   Field mapping (AnalyticsModel → DriverReportModel):
     hero.value          ← kpis.compRate                  (Tingkat Selesai)
     kpis[Penugasan]     ← kpis.total
     kpis[Pengemudi …]   ← kpis.driversWithTrips
     kpis[Jarak …]       ← kpis.totalKm
     kpis[Rata-rata …]   ← kpis.avgKmPerTrip
     kpis[Dibatalkan]    ← kpis.cancelled
     distribution.rows   ← charts.driverWorkload (count) + render.driverOdoList (km)
     distribution.note   ← kpis.total / kpis.driversWithTrips (avg load)
     highlights          ← selectDriverHighlights (reuses generateInsights)
     contributors        ← selectDriverContributors (selector over render)
   ============================================================ */

'use strict';

import { formatInt, formatDecimal1, pctOf, formatKmLabel } from '../format/numbers.js';
import { longDateID, shortDateID } from '../format/dates.js';
import { selectDriverHighlights } from '../insights/driver-highlights.js';
import { selectDriverContributors } from '../insights/driver-contributors.js';

/**
 * Build the Driver report projection.
 * @param {import('../../../analytics/analytics-types.js').AnalyticsModel} model
 * @param {{ periodLabel?:string, generatedBy?:string, appVersion?:string,
 *           filters?:{driver?:string,vehicle?:string,bidang?:string} }} [meta]
 * @returns {import('./report-types.js').DriverReportModel}
 */
export function buildDriverReportModel(model, meta = {}) {
  const k = (model && model.kpis) || {};
  const r = (model && model.render) || {};
  const charts = (model && model.charts) || {};
  // v1.16.4.8 — Driver Workload Intelligence (diagnostics, parity-locked out of render).
  const wl = (model && model.diagnostics && model.diagnostics.workload) || {};
  const wlDrivers = Array.isArray(wl.drivers) ? wl.drivers : [];
  const wlWeights = wl.weights || { hours: 0.45, distance: 0.30, assignments: 0.25 };
  const generatedAt = (model && model.metadata && model.metadata.generatedAt) || Date.now();

  const filters = meta.filters || {};
  const fDriver  = filters.driver  || 'Semua Pengemudi';
  const fVehicle = filters.vehicle || 'Semua Kendaraan';
  const fBidang  = filters.bidang  || 'Semua Bidang';

  const metaOut = {
    org: 'Bidang Sarana dan Prasarana',
    orgSub: 'PBSI — Persatuan Bulu Tangkis Seluruh Indonesia',
    title: 'Laporan Analitik Pengemudi',
    periodLabel: meta.periodLabel || '',
    dateLabel: longDateID(generatedAt),
    filterLine: `Filter: ${fDriver} · ${fVehicle} · ${fBidang}`,
    versionLine: `v${meta.appVersion || '—'} · ${meta.generatedBy || '—'} · ${shortDateID(generatedAt)}`,
    contributorsLabel: 'Kontributor Utama',
  };

  // ── Hero ─────────────────────────────────────────────────────
  const hero = {
    value: formatInt(k.compRate || 0),
    unit: '%',
    label: 'Tingkat Selesai',
  };

  // ── KPI grid (6 cells — adds Jam Kerja Aktual for v1.16.4.8) ──
  // Dashboard = PDF: the same actual-working-hours figure the Driver Analytics
  // working-time group shows. Workload Score (per driver) is surfaced in the
  // distribution strip below, mirroring the dashboard's headline ranking.
  const kpis = [
    { value: formatInt(k.total || 0),            label: 'Penugasan' },
    { value: formatInt(k.driversWithTrips || 0), label: 'Pengemudi Aktif' },
    { value: formatInt(k.totalKm || 0),          unit: 'km', label: 'Jarak Tempuh' },
    { value: formatInt(k.avgKmPerTrip || 0),     unit: 'km', label: 'Rata-rata per Trip' },
    { value: formatDecimal1(k.totalActualHours || 0), unit: 'jam', label: 'Jam Kerja Aktual' },
    { value: formatInt(k.cancelled || 0),        label: 'Dibatalkan' },
  ];

  const total = k.total || 0;
  const wHrsPct = Math.round((wlWeights.hours || 0) * 100);
  const wDstPct = Math.round((wlWeights.distance || 0) * 100);
  const wAsgPct = Math.round((wlWeights.assignments || 0) * 100);

  // ── Distribution (Distribusi Beban Kerja) ────────────────────
  // v1.16.4.8: the strip now carries the normalized WORKLOAD SCORE per driver
  // (bar fill = score 0–100; the .dp column shows the score; the secondary
  // column shows distance), ordered by score — the SAME ranking the dashboard
  // leads with. Falls back to the legacy assignment-count distribution when no
  // workload data exists (older models / no completed work), so the PDF is
  // backward compatible.
  let distribution;
  if (wlDrivers.length > 0) {
    const rows = wlDrivers.map(d => ({
      name: d.name,
      fillPct: Math.max(0, Math.min(100, Math.round(d.score || 0))),
      shareLabel: String(Math.round(d.score || 0)),
      secondaryLabel: formatKmLabel(d.distance || 0),
    }));
    const avg = wl.averageScore != null ? wl.averageScore : 0;
    const top = wl.palingAktif;
    distribution = {
      label: 'Distribusi Beban Kerja (Skor 0–100)',
      rows,
      note: `Skor = Jam ${wHrsPct}% · Jarak ${wDstPct}% · Assignment ${wAsgPct}% (relatif driver tersibuk). `
        + `Rata-rata skor ${avg}`
        + (top ? ` · Paling aktif: ${top.name} (${top.score})` : '')
        + (k.weekendAssignments ? ` · ${formatInt(k.weekendAssignments)} assignment weekend` : '') + '.',
    };
  } else {
    // Legacy fallback — assignment-count bars (pre-v1.16.4.8 behavior).
    const workload = Array.isArray(charts.driverWorkload) && charts.driverWorkload.length
      ? charts.driverWorkload
      : (Array.isArray(r.driversWithTrips) ? r.driversWithTrips : []); // [{displayName,count}]
    const maxCount = workload.length ? (workload[0].count || 0) : 0;
    const kmByName = new Map(
      (Array.isArray(r.driverOdoList) ? r.driverOdoList : []).map(d => [String(d.name).toLowerCase(), d.km])
    );
    const rows = workload.map(d => ({
      name: d.displayName,
      fillPct: maxCount > 0 ? Math.round((d.count / maxCount) * 100) : 0,
      shareLabel: pctOf(d.count, total),
      secondaryLabel: formatKmLabel(kmByName.get(String(d.displayName).toLowerCase()) || 0),
    }));
    const driversWithTrips = k.driversWithTrips || workload.length;
    distribution = {
      label: 'Distribusi Beban',
      rows,
      note: driversWithTrips > 0
        ? `Rata-rata beban: ${formatDecimal1(total / driversWithTrips)} penugasan per pengemudi`
        : '',
    };
  }

  // ── Highlights + Contributors (reuse engine outputs) ─────────
  const highlights = selectDriverHighlights(model);
  const { contributors } = selectDriverContributors(model);

  return { meta: metaOut, hero, kpis, distribution, highlights, contributors };
}
