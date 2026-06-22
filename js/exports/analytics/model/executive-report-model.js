/* ============================================================
   EXECUTIVE-REPORT-MODEL.JS — ExecutiveAnalyticsModel → executive report
   projection  (v1.15.0 — Analytics Expansion Foundation)

   Client-side projection for the Analytics Executive PDF. Reads the
   EXISTING executive model (computeExecutiveAnalytics output) and reshapes
   it for the server-side executive-report builder (health hero + KPI grid +
   highlights). No analytics computation here.
   ============================================================ */

'use strict';

import { formatInt } from '../format/numbers.js';
import { longDateID, shortDateID } from '../format/dates.js';

const CAT_LABEL = { efficiency: 'Efisiensi', warning: 'Peringatan', trend: 'Tren', nor: 'NOR', forecast: 'Proyeksi' };
const TONE_OF = { success: 'good', warning: 'attention', info: 'neutral' };

function rp(n) { return 'Rp ' + Number(Math.round(Number(n) || 0)).toLocaleString('id-ID'); }

/**
 * @param {Object} exec ExecutiveAnalyticsModel
 * @param {{ periodLabel?:string, generatedBy?:string, appVersion?:string }} [meta]
 * @returns {Object} ExecutiveReportModel
 */
export function buildExecutiveReportModel(exec = {}, meta = {}) {
  const s = exec.score || {};
  const d = exec.driverKpis || {};
  const p = exec.pettyKpis || {};
  const generatedAt = (exec.metadata && exec.metadata.generatedAt) || Date.now();

  const metaOut = {
    title: 'Laporan Eksekutif Operasional',
    periodLabel: meta.periodLabel || '',
    dateLabel: longDateID(generatedAt),
    kpisLabel: 'Indikator Eksekutif',
    highlightsLabel: 'Sorotan Eksekutif',
    filterLine: `Periode: ${meta.periodLabel || '—'}`,
    versionLine: `v${meta.appVersion || '—'} · ${meta.generatedBy || '—'} · ${shortDateID(generatedAt)}`,
  };

  const health = {
    score: s.value == null ? null : s.value,
    outOf: 100,
    badge: s.label || '—',
    label: 'Kesehatan Operasional',
  };

  const kpis = [
    { value: formatInt(d.totalTrip || 0), label: 'Total Trip' },
    { value: formatInt(d.driverUtilization || 0), unit: '%', label: 'Driver Utilization' },
    { value: formatInt(d.vehiclesWithTrips || 0), label: 'Kendaraan Aktif' },
    { value: rp(p.activeBalance || 0), label: 'Saldo Aktif' },
    { value: rp(p.consumedSpend || 0), label: 'Dana Terpakai' },
    { value: formatInt(p.realizationPct || 0), unit: '%', label: 'Realisasi' },
  ];

  const highlights = (exec.insights || []).slice(0, 6).map(i => ({
    category: CAT_LABEL[i.category] || 'Wawasan',
    tone: TONE_OF[i.type] || 'neutral',
    statement: i.title,
    context: i.description,
  }));

  return { meta: metaOut, health, kpis, highlights };
}
