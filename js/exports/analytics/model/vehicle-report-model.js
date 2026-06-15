/* ============================================================
   VEHICLE-REPORT-MODEL.JS — AnalyticsModel → VehicleReportModel

   The client-side projection for the Vehicle Analytics Export
   (IMPLEMENTATION_ARCHITECTURE §5/§7). Reads the EXISTING
   AnalyticsModel + Insight Engine — it does NOT compute analytics
   or create an engine. Output is plain, serializable data sent to
   the render Cloud Function and consumed by the SAME server
   components as the Driver report (reuse).

   Field mapping (AnalyticsModel → VehicleReportModel):
     hero.value          ← kpis.totalKm                    (Jarak Tempuh)
     kpis[Penugasan]     ← kpis.total
     kpis[Armada Aktif]  ← kpis.vehiclesWithTrips
     kpis[Terbesar/Unit] ← render.vehicleOdoList[0].km     (max single-unit km)
     kpis[Rata-rata …]   ← kpis.avgKmPerTrip
     kpis[Armada Idle]   ← render.inactiveVehicles.length
     distribution.rows   ← charts.vehicleUtil (count) + render.vehicleOdoList (km)
     distribution.note   ← render.odoTripCount / kpis.total
     highlights          ← selectVehicleHighlights (reuses generateInsights)
     contributors        ← selectVehicleContributors (selector over render)

   The footer filter line is VEHICLE-FIRST (matching the approved
   Vehicle-tab prototype), unlike the driver-first line.
   ============================================================ */

'use strict';

import { formatInt, pctOf, formatKmLabel } from '../format/numbers.js';
import { longDateID, shortDateID } from '../format/dates.js';
import { selectVehicleHighlights } from '../insights/vehicle-highlights.js';
import { selectVehicleContributors } from '../insights/vehicle-contributors.js';

/**
 * Build the Vehicle report projection.
 * @param {import('../../../analytics/analytics-types.js').AnalyticsModel} model
 * @param {{ periodLabel?:string, generatedBy?:string, appVersion?:string,
 *           filters?:{driver?:string,vehicle?:string,bidang?:string} }} [meta]
 * @returns {import('./report-types.js').VehicleReportModel}
 */
export function buildVehicleReportModel(model, meta = {}) {
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
    title: 'Laporan Analitik Armada',
    periodLabel: meta.periodLabel || '',
    dateLabel: longDateID(generatedAt),
    // Vehicle-first filter order (matches the approved Vehicle tab).
    filterLine: `Filter: ${fVehicle} · ${fDriver} · ${fBidang}`,
    versionLine: `v${meta.appVersion || '—'} · ${meta.generatedBy || '—'} · ${shortDateID(generatedAt)}`,
    contributorsLabel: 'Kontributor Utama',
  };

  // ── Hero — total distance ─────────────────────────────────────
  const hero = { value: formatInt(k.totalKm || 0), unit: 'km', label: 'Jarak Tempuh' };

  // ── KPI grid (5 cells, matching the approved Vehicle layout) ──
  const odo = Array.isArray(r.vehicleOdoList) ? r.vehicleOdoList : []; // desc by km
  const topUnitKm = odo.length ? (odo[0].km || 0) : 0;
  const idleCount = Array.isArray(r.inactiveVehicles) ? r.inactiveVehicles.length : 0;

  const kpis = [
    { value: formatInt(k.total || 0),             label: 'Penugasan' },
    { value: formatInt(k.vehiclesWithTrips || 0), label: 'Armada Aktif' },
    { value: formatInt(topUnitKm),                unit: 'km', label: 'Terbesar per Unit' },
    { value: formatInt(k.avgKmPerTrip || 0),      unit: 'km', label: 'Rata-rata per Trip' },
    { value: formatInt(idleCount),                label: 'Armada Idle' },
  ];

  // ── Distribution (Utilisasi Armada) ──────────────────────────
  // Bars carry WORKLOAD (assignment count, fill = count/maxCount);
  // share is count/total; the secondary column shows distance.
  const util = (Array.isArray(charts.vehicleUtil) && charts.vehicleUtil.length)
    ? charts.vehicleUtil
    : (Array.isArray(r.vehiclesWithTrips) ? r.vehiclesWithTrips : []); // [{displayName,count}] desc
  const maxCount = util.length ? (util[0].count || 0) : 0;
  const total = k.total || 0;
  const kmByName = new Map(odo.map((v) => [String(v.name).toLowerCase(), v.km]));

  const rows = util.map((v) => ({
    name: v.displayName,
    fillPct: maxCount > 0 ? Math.round((v.count / maxCount) * 100) : 0,
    shareLabel: pctOf(v.count, total),
    secondaryLabel: formatKmLabel(kmByName.get(String(v.displayName).toLowerCase()) || 0),
  }));

  const odoTripCount = r.odoTripCount || 0;
  const distribution = {
    label: 'Utilisasi Armada',
    rows,
    note: total > 0 ? `Data odometer tersedia: ${formatInt(odoTripCount)} dari ${formatInt(total)} trip` : '',
  };

  // ── Highlights + Contributors (reuse engine outputs) ─────────
  const highlights = selectVehicleHighlights(model);
  const { contributors } = selectVehicleContributors(model);

  return { meta: metaOut, hero, kpis, distribution, highlights, contributors };
}
