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

  // ── KPI grid (5 cells, matching the approved Driver layout) ──
  const kpis = [
    { value: formatInt(k.total || 0),            label: 'Penugasan' },
    { value: formatInt(k.driversWithTrips || 0), label: 'Pengemudi Aktif' },
    { value: formatInt(k.totalKm || 0),          unit: 'km', label: 'Jarak Tempuh' },
    { value: formatInt(k.avgKmPerTrip || 0),     unit: 'km', label: 'Rata-rata per Trip' },
    { value: formatInt(k.cancelled || 0),        label: 'Dibatalkan' },
  ];

  // ── Distribution (Distribusi Beban) ──────────────────────────
  // Bars carry WORKLOAD (assignment count, fill = count/maxCount);
  // share is count/total; the secondary column shows distance.
  const workload = Array.isArray(charts.driverWorkload) && charts.driverWorkload.length
    ? charts.driverWorkload
    : (Array.isArray(r.driversWithTrips) ? r.driversWithTrips : []); // [{displayName,count}]
  const maxCount = workload.length ? (workload[0].count || 0) : 0;
  const total = k.total || 0;
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
  const distribution = {
    label: 'Distribusi Beban',
    rows,
    note: driversWithTrips > 0
      ? `Rata-rata beban: ${formatDecimal1(total / driversWithTrips)} penugasan per pengemudi`
      : '',
  };

  // ── Highlights + Contributors (reuse engine outputs) ─────────
  const highlights = selectDriverHighlights(model);
  const { contributors } = selectDriverContributors(model);

  return { meta: metaOut, hero, kpis, distribution, highlights, contributors };
}
