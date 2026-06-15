/* ============================================================
   COMPLETE-REPORT-MODEL.JS — AnalyticsModel → CompleteReportModel

   The client-side projection for the 5-page Complete Analytics Export
   (PHASE_E_READINESS). It REUSES the existing per-report projections
   and selectors wherever possible and adds only cross-report glue:

     • distribution rows (P2)  ← buildDriverReportModel / buildVehicleReportModel
     • bidang status   (P3)    ← buildBidangReportModel
     • exec highlights (P1)    ← selectCompleteHighlights (merges 3 selectors)
     • compact highlights (P2) ← selectDriver/VehicleHighlights
     • contributor groups (P4) ← selectContributorGroups (reuses contributor selectors)
     • health score    (P1)    ← deriveHealthScore
     • destinations    (P3)    ← render.destSorted + render._destFreq
     • cross-dimension pairing (P2) ← diagnostics.filteredAsg (driver+vehicle co-occurrence)
     • appendix        (P5)    ← kpis + diagnostics + meta

   It does NOT compute analytics or create an engine.
   ============================================================ */

'use strict';

import { formatInt } from '../format/numbers.js';
import { longDateID, shortDateID, timeID, periodRangeID } from '../format/dates.js';
import { deriveHealthScore } from '../insights/health-score.js';
import { selectCompleteHighlights } from '../insights/complete-highlights.js';
import { selectDriverHighlights } from '../insights/driver-highlights.js';
import { selectVehicleHighlights } from '../insights/vehicle-highlights.js';
import { selectBidangHighlights } from '../insights/bidang-highlights.js';
import { selectContributorGroups } from '../insights/contributor-groups.js';
import { buildDriverReportModel } from './driver-report-model.js';
import { buildVehicleReportModel } from './vehicle-report-model.js';
import { buildBidangReportModel } from './bidang-report-model.js';

const APPENDIX_NOTE =
  'Laporan ini mencerminkan kondisi data pada saat dibuat. Data yang dikecualikan melalui ' +
  'tata kelola tidak masuk dalam perhitungan ini. Seluruh angka bersifat final untuk periode ' +
  'yang dipilih. Laporan Analitik Lengkap diterbitkan oleh Sarpras Operations.';

/** Dominant driver–vehicle pairing from the engine's filtered assignments. */
function _dominantPair(model) {
  const asg = (model.diagnostics && model.diagnostics.filteredAsg) || [];
  const counts = new Map();
  for (const a of asg) {
    if (!a || !a.driver || !a.vehicle) continue;
    const key = `${a.driver}|||${a.vehicle}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  let best = null;
  for (const [key, n] of counts) {
    if (!best || n > best.n) best = { key, n };
  }
  if (!best) return null;
  const [driver, vehicle] = best.key.split('|||');
  return { driver, vehicle, count: best.n };
}

/**
 * Build the Complete report projection.
 * @param {import('../../../analytics/analytics-types.js').AnalyticsModel} model
 * @param {{ periodLabel?:string, dateRangeKey?:string, generatedBy?:string, appVersion?:string,
 *           filters?:{driver?:string,vehicle?:string,bidang?:string},
 *           bidangKm?:Object.<string,number> }} [meta]
 * @returns {import('./report-types.js').CompleteReportModel}
 */
export function buildCompleteReportModel(model, meta = {}) {
  const k = (model && model.kpis) || {};
  const r = (model && model.render) || {};
  const diag = (model && model.diagnostics) || {};
  const generatedAt = (model && model.metadata && model.metadata.generatedAt) || Date.now();
  const bidangKm = meta.bidangKm || {};

  const filters = meta.filters || {};
  const fDriver = filters.driver || 'Semua Pengemudi';
  const fVehicle = filters.vehicle || 'Semua Kendaraan';
  const fBidang = filters.bidang || 'Semua Bidang';

  const total = k.total || 0;
  const totalKm = k.totalKm || 0;
  const driversWithTrips = k.driversWithTrips || 0;
  const vehiclesWithTrips = k.vehiclesWithTrips || 0;

  const metaOut = {
    org: 'Bidang Sarana dan Prasarana',
    orgSub: 'PBSI — Persatuan Bulu Tangkis Seluruh Indonesia',
    periodLabel: meta.periodLabel || '',
    dateLabel: longDateID(generatedAt),
    versionLine: `v${meta.appVersion || '—'} · ${meta.generatedBy || '—'} · ${shortDateID(generatedAt)}`,
    filterLineDefault: `Filter: ${fDriver} · ${fVehicle} · ${fBidang}`,
    filterLineBidang: `Filter: ${fBidang} · ${fDriver} · ${fVehicle}`,
  };

  // ── P1 — Ringkasan Eksekutif ────────────────────────────────
  const healthScore = deriveHealthScore(model);
  const execKpis = [
    { value: formatInt(k.compRate || 0), unit: '%', label: 'Tingkat Selesai' },
    { value: formatInt(total), label: 'Penugasan' },
    { value: formatInt(driversWithTrips), label: 'Pengemudi Aktif' },
    { value: formatInt(vehiclesWithTrips), label: 'Armada Aktif' },
    { value: formatInt(totalKm), unit: 'km', label: 'Jarak Tempuh' },
    { value: formatInt(healthScore.criticalWarnings), label: 'Peringatan Kritis' },
  ];
  const execHighlights = selectCompleteHighlights(model, bidangKm);
  const hasComparison = model.trends && Object.keys(model.trends).length > 0;
  const baselineNote = hasComparison
    ? ''
    : 'Baseline periode perdana. Perbandingan tersedia mulai laporan berikutnya.';

  // ── P2 — Pengemudi & Armada (reuse driver/vehicle projections) ─
  const driverRows = buildDriverReportModel(model, meta).distribution.rows;
  const vehicleRows = buildVehicleReportModel(model, meta).distribution.rows;
  const pair = _dominantPair(model);
  const twoColumn = {
    left: {
      heading: 'Pengemudi',
      summary: `${formatInt(driversWithTrips)} aktif · ${formatInt(total)} penugasan · ${formatInt(totalKm)} km total`,
      rows: driverRows,
      highlights: selectDriverHighlights(model).slice(0, 3),
    },
    right: {
      heading: 'Armada',
      summary: `${formatInt(vehiclesWithTrips)} aktif · ${formatInt(total)} penugasan · ${formatInt(totalKm)} km total`,
      rows: vehicleRows,
      highlights: selectVehicleHighlights(model).slice(0, 3),
    },
    crossDimension: {
      label: 'Koneksi Lintas Dimensi',
      text: pair
        ? `${pair.driver}–${pair.vehicle} merupakan pasangan pengemudi–kendaraan yang paling dominan pada periode ini.`
        : '',
    },
  };

  // ── P3 — Permintaan & Operasi ───────────────────────────────
  const bidangStatus = buildBidangReportModel(model, meta).bidangStatus;
  const destSorted = Array.isArray(r.destSorted) ? r.destSorted : []; // [[name,count],…]
  const uniqueDest = (r._destFreq instanceof Map)
    ? r._destFreq.size
    : (r._destFreq && typeof r._destFreq === 'object' ? Object.keys(r._destFreq).length : destSorted.length);
  const destinations = {
    label: 'Destinasi Utama',
    subtitle: uniqueDest > 0 ? `— ${formatInt(uniqueDest)} tujuan unik periode ini` : '',
    items: destSorted.slice(0, 5).map(([name, count]) => ({ name, freqLabel: `${formatInt(count)} trip` })),
  };
  const operationsHighlights = [];
  const pem = selectBidangHighlights(model, bidangKm).find((h) => h.category === 'Pemenuhan');
  if (pem) operationsHighlights.push({ ...pem, context: '' });
  if (destSorted[0]) {
    const [dName, dCount] = destSorted[0];
    const pct = total > 0 ? Math.round((dCount / total) * 100) : 0;
    operationsHighlights.push({
      category: 'Permintaan', tone: 'neutral',
      statement: `${dName}: ${formatInt(dCount)} dari ${formatInt(total)} trip (${pct}%) — destinasi paling dominan dalam periode ini.`,
      context: '',
    });
  }

  // ── P4 — Kontributor Utama ──────────────────────────────────
  const contributorGroups = selectContributorGroups(model, bidangKm);

  // ── P5 — Lampiran ───────────────────────────────────────────
  const odoTripCount = k.odoTripCount || 0;
  const odoPct = total > 0 ? Math.round((odoTripCount / total) * 100) : 0;
  const aliasCount = Array.isArray(diag.allAliases) ? diag.allAliases.length : 0;
  const dismissedCount = Array.isArray(diag.allDismissed) ? diag.allDismissed.length : 0;
  const appendix = {
    entries: [
      { key: 'Periode Laporan', value: meta.periodLabel || '', sub: periodRangeID(meta.dateRangeKey, generatedAt) },
      { key: 'Rekam Teranalisis', value: `${formatInt(k.completed || 0)} penugasan selesai`, sub: `${formatInt(k.cancelled || 0)} penugasan dibatalkan` },
      { key: 'Filter Pengemudi', value: fDriver },
      { key: 'Cakupan Odometer', value: `${formatInt(odoTripCount)} dari ${formatInt(total)} trip (${odoPct}%)`, sub: `${formatInt(Math.max(0, total - odoTripCount))} trip tanpa rekam jarak` },
      { key: 'Filter Kendaraan', value: fVehicle },
      { key: 'Alias Aktif', value: `${formatInt(aliasCount)} alias terdaftar` },
      { key: 'Filter Bidang', value: fBidang },
      { key: 'Peringatan Diabaikan', value: formatInt(dismissedCount) },
      { key: 'Dibuat Oleh', value: meta.generatedBy || '—' },
      { key: 'Versi Aplikasi', value: `v${meta.appVersion || '—'}` },
      { key: 'Dibuat Pada', value: `${longDateID(generatedAt)}, ${timeID(generatedAt)}` },
      { key: 'Perbandingan Periode', value: hasComparison ? 'Tersedia' : 'Tidak tersedia — baseline perdana', muted: !hasComparison },
    ],
    note: APPENDIX_NOTE,
  };

  return {
    meta: metaOut,
    healthScore, execKpis, execHighlights, baselineNote,
    twoColumn,
    bidangStatus, destinations, operationsHighlights,
    contributorGroups,
    appendix,
  };
}
