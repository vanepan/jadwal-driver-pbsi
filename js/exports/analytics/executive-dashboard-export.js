/* ============================================================
   EXECUTIVE-DASHBOARD-EXPORT.JS — Executive Analytics Report (v1.18.8)

   PDF + Excel export for the Executive Analytics Dashboard — the printable
   EXECUTIVE REPORT. Unlike the module dashboards, this is a cross-domain
   briefing. It REUSES the platform export libraries (the pdfmake backend in
   js/docs/pdf-exporter.js + xlsx-js-style — same loader as every analytics
   exporter), so NO new exporter type is introduced.

   It also REUSES the dashboard's OWN projection helpers (pick / verdict /
   buildHighlights from executive-dashboard.js) so the report shows the SAME
   derived values as the screen — one source of truth, no duplicated logic and
   no new calculation. Every figure ultimately comes from an existing engine
   output aggregated in the model:
     Analytics Driver · Dispatch Analytics · Recommendation Accuracy ·
     Driver Wellness · Vehicle Analytics · Petty Cash Analytics.

   The builders (buildExecutiveReportDocDefinition / buildExecutiveReportSheets)
   are PURE and node-testable. The *Blob functions wrap them with the lazy
   loaders; the window.* hooks read window._lastExecutiveDashboardModel
   (mirroring the sibling analytics export hooks).
   ============================================================ */

'use strict';

import { getExporter } from '../../docs/pdf-exporter.js';
import { pick, verdict, buildHighlights } from '../../components/executive-dashboard.js';

/* ── xlsx-js-style lazy loader (mirrors the other analytics exporters) ─────── */

const XLSX_SRC = 'https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js';
let _xlsxPromise = null;
function _loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}
function loadXLSX() {
  if (typeof window !== 'undefined' && window.XLSX && window.XLSX.utils) return Promise.resolve(window.XLSX);
  if (_xlsxPromise) return _xlsxPromise;
  _xlsxPromise = _loadScript(XLSX_SRC).then(() => {
    if (!window.XLSX) throw new Error('XLSX global missing after load');
    return window.XLSX;
  });
  return _xlsxPromise;
}

/* ── formatting helpers (pure) ─────────────────────────────────────────────── */

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function round(v) { return Math.round(num(v)); }
function pct(v) { return v == null ? 'N/A' : `${round(v)}%`; }
function scoreTxt(v) { return v == null ? 'N/A' : String(round(v)); }
function rpCompact(v) {
  const n = num(v);
  if (n === 0) return 'Rp 0';
  const abs = Math.abs(n);
  if (abs >= 1e9) return `Rp ${(n / 1e9).toFixed(abs >= 1e10 ? 0 : 1)} M`;
  if (abs >= 1e6) return `Rp ${(n / 1e6).toFixed(abs >= 1e7 ? 0 : 1)} Jt`;
  if (abs >= 1e3) return `Rp ${Math.round(n / 1e3)} Rb`;
  return `Rp ${Math.round(n)}`;
}
function fmtTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mo = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'][d.getMonth()];
  return `${dd} ${mo} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function safeFilename(base) { return `${base}-${new Date().toISOString().slice(0, 10)}`; }

const STATUS_MSG = {
  good: 'Seluruh indikator operasional berada dalam kondisi yang sehat hari ini.',
  warn: 'Sebagian besar operasional berjalan baik; beberapa area memerlukan perhatian.',
  danger: 'Beberapa area operasional memerlukan tindak lanjut segera.',
};
const HIGHLIGHT_TONE = { ok: 'Baik', info: 'Info', warn: 'Perhatian', danger: 'Kritis' };

/* ── shared projection → the report's six executive KPI rows (pure) ────────── */

function kpiRows(d) {
  const total = num(d.wellness.driverCount);
  const acceptance = d.recKpi.acceptanceRate != null ? d.recKpi.acceptanceRate : d.dispatchKpi.recommendationAcceptance;
  return [
    ['Driver Siap Bertugas', total ? `${num(d.wellness.healthyDrivers)} / ${total}` : '—'],
    ['Penerimaan Rekomendasi', acceptance == null ? '—' : pct(acceptance)],
    ['Kendaraan Aktif', num(d.fleet.totalAssets) ? `${num(d.fleet.active)} / ${num(d.fleet.totalAssets)}` : (num(d.fleet.active) || '—')],
    ['Kendaraan Dalam Perawatan', String(num(d.fleet.maintenance))],
    ['Dana Petty Cash', d.hasPetty ? rpCompact(d.pettyKpis.consumedSpend || d.pettyKpis.actualBurnYtd) : '—'],
    ['Skor Operasional', d.score && d.score.value != null ? `${scoreTxt(d.score.value)}${d.score.label ? ` · ${d.score.label}` : ''}` : '—'],
  ];
}

/* ── shared projection → per-module summaries (pure, engine outputs only) ──── */

function moduleSummaries(d) {
  const dk = d.driverKpis || {};
  const driverScore = (d.exec && d.exec.scoreBreakdown && d.exec.scoreBreakdown.driverScore != null) ? d.exec.scoreBreakdown.driverScore : null;
  const ph = d.pettyHealth;
  return [
    { key: 'driver', title: 'Analytics Driver', rows: [
      ['Total Trip', String(num(dk.totalTrip))],
      ['Driver Aktif', String(num(dk.activeDrivers))],
      ['Utilisasi Driver', pct(dk.driverUtilization)],
      ['Tingkat Penyelesaian', pct(dk.compRate)],
      ['Skor Operasional Driver', scoreTxt(driverScore)],
    ] },
    { key: 'dispatch', title: 'Dispatch Analytics', rows: num(d.dispatchKpi.sampleSize) > 0 ? [
      ['Akurasi Dispatch', pct(d.dispatchKpi.dispatchAccuracy)],
      ['Tingkat Override', pct(d.dispatchKpi.overrideRate)],
      ['Penerimaan Rekomendasi', pct(d.dispatchKpi.recommendationAcceptance)],
      ['Rata-rata Skor Dispatch', scoreTxt(d.dispatchKpi.avgDispatchScore)],
      ['Jumlah Keputusan', String(num(d.dispatchKpi.sampleSize))],
    ] : [['Status', 'Belum ada riwayat keputusan dispatch']] },
    { key: 'recommendation', title: 'Recommendation Accuracy', rows: d.recKpi.acceptanceRate != null ? [
      ['Akurasi Rekomendasi', pct(d.recKpi.recommendationAccuracy != null ? d.recKpi.recommendationAccuracy : d.recKpi.acceptanceRate)],
      ['Penerimaan', pct(d.recKpi.acceptanceRate)],
      ['Tingkat Override', pct(d.recKpi.overrideRate)],
      ['Rata-rata Skor', scoreTxt(d.recKpi.avgDispatchScore)],
      ['Jumlah Rekomendasi', String(num(d.recKpi.sampleSize))],
    ] : [['Status', 'Belum ada rekomendasi untuk dinilai']] },
    { key: 'wellness', title: 'Driver Wellness', rows: num(d.wellness.driverCount) > 0 ? [
      ['Driver Dipantau', String(num(d.wellness.driverCount))],
      ['Siap Bertugas', String(num(d.wellness.healthyDrivers))],
      ['Kelelahan Tinggi', String(num(d.wellness.highFatigue))],
      ['Risiko Burnout', String(num(d.wellness.burnoutRisk))],
      ['Rata-rata Skor Kesehatan', scoreTxt(d.wellness.averageHealth)],
    ] : [['Status', 'Belum ada data kesehatan driver']] },
    { key: 'vehicle', title: 'Vehicle Analytics', rows: num(d.fleet.totalAssets) > 0 ? [
      ['Total Aset', String(num(d.fleet.totalAssets))],
      ['Aktif', String(num(d.fleet.active))],
      ['Dalam Perawatan', String(num(d.fleet.maintenance))],
      ['Pajak Jatuh Tempo', String(num(d.fleet.taxDueSoon))],
      ['STNK Kedaluwarsa', String(num(d.fleet.expiredStnk))],
      ['Rata-rata Kesehatan Armada', scoreTxt(d.fleet.healthAvg)],
    ] : [['Status', 'Belum ada data armada']] },
    { key: 'petty', title: 'Petty Cash Analytics', rows: d.hasPetty ? [
      ['Saldo Aktif', rpCompact(d.pettyKpis.activeBalance)],
      ['Dana Digunakan YTD', rpCompact(d.pettyKpis.actualBurnYtd)],
      ['Jumlah Realisasi NOR', String(num(d.pettyKpis.realizedCount))],
      ['Skor Kesehatan Petty Cash', ph && ph.score != null ? `${scoreTxt(ph.score)}${ph.levelLabel ? ` · ${ph.levelLabel}` : ''}` : 'N/A'],
    ] : [['Status', 'Belum cukup data petty cash periode ini']] },
  ];
}

/* ── PDF docDefinition (pure) ──────────────────────────────────────────────── */

const ACCENT = '#A8292F';
function sectionHeader(text) { return { text, style: 'h2', margin: [0, 14, 0, 6] }; }
function simpleTable(headers, rows, widths) {
  return {
    table: {
      headerRows: 1,
      widths: widths || headers.map(() => '*'),
      body: [
        headers.map((h) => ({ text: h, style: 'th' })),
        ...(rows.length ? rows : [headers.map(() => ({ text: '—', style: 'td' }))]).map((r) => r.map((c) => (typeof c === 'object' ? c : { text: String(c), style: 'td' }))),
      ],
    },
    layout: {
      hLineWidth: (i) => (i === 1 ? 1 : 0.5),
      hLineColor: () => '#d9d9de',
      vLineWidth: () => 0,
      paddingTop: () => 4, paddingBottom: () => 4,
    },
  };
}

/**
 * Build the pdfmake docDefinition for the Executive Analytics Report.
 * @param {Object} model aggregate model { generatedAt, exec, dispatch, recommendation, wellness, fleet, petty }
 * @param {Object} [meta] { periodLabel, generatedBy, appVersion }
 * @returns {Object} pdfmake docDefinition
 */
export function buildExecutiveReportDocDefinition(model, meta = {}) {
  const m = model || {};
  const d = pick(m);
  const v = verdict(d);
  const content = [];

  content.push({ text: 'Executive Analytics', style: 'h1' });
  content.push({
    text: [
      meta.periodLabel ? `${meta.periodLabel} · ` : '',
      `Dibuat ${fmtTime(m.generatedAt || new Date().toISOString())}`,
      meta.generatedBy ? ` · oleh ${meta.generatedBy}` : '',
    ].join(''),
    style: 'meta', margin: [0, 2, 0, 4],
  });

  // Executive Summary
  content.push(sectionHeader('Ringkasan Eksekutif'));
  content.push(simpleTable(['Indikator', 'Nilai'], [
    ['Skor Operasional', d.score && d.score.value != null ? scoreTxt(d.score.value) : '—'],
    ['Driver Siap Bertugas', num(d.wellness.driverCount) ? `${num(d.wellness.healthyDrivers)} / ${num(d.wellness.driverCount)}` : '—'],
    ['Kendaraan Aktif', num(d.fleet.totalAssets) ? `${num(d.fleet.active)} / ${num(d.fleet.totalAssets)}` : '—'],
  ], ['*', 140]));

  // Operational Status (one verdict + one sentence)
  content.push(sectionHeader('Status Operasional Hari Ini'));
  content.push({ text: v.level || '—', style: 'verdict' });
  content.push({ text: STATUS_MSG[v.tone] || '', style: 'td', margin: [0, 2, 0, 2] });

  // Executive KPIs
  content.push(sectionHeader('Indikator Utama'));
  content.push(simpleTable(['KPI', 'Nilai'], kpiRows(d), ['*', 140]));

  // Highlights
  content.push(sectionHeader('Sorotan Hari Ini'));
  const hl = buildHighlights(d);
  content.push(simpleTable(['Status', 'Sorotan', 'Rincian'],
    hl.map((h) => [HIGHLIGHT_TONE[h.tone] || '—', h.label, h.detail || '—']),
    [60, '*', '*']));

  // Module summaries
  content.push(sectionHeader('Ringkasan per Modul'));
  for (const mod of moduleSummaries(d)) {
    content.push({ text: mod.title, style: 'h3', margin: [0, 8, 0, 4] });
    content.push(simpleTable(['Metrik', 'Nilai'], mod.rows, ['*', 140]));
  }

  return {
    pageSize: 'A4',
    pageMargins: [34, 36, 34, 40],
    info: { title: 'Executive Analytics' },
    content,
    styles: {
      h1: { fontSize: 16, bold: true, color: ACCENT },
      h2: { fontSize: 11, bold: true, color: '#222' },
      h3: { fontSize: 10, bold: true, color: '#444' },
      verdict: { fontSize: 13, bold: true, color: ACCENT },
      meta: { fontSize: 8, color: '#666' },
      th: { fontSize: 8, bold: true, color: '#444', fillColor: '#f4f4f6' },
      td: { fontSize: 8, color: '#222' },
    },
    defaultStyle: { fontSize: 9 },
    footer: (current, total) => ({ text: `Executive Analytics · ${meta.appVersion || ''} · ${current}/${total}`, style: 'meta', alignment: 'center', margin: [0, 8, 0, 0] }),
  };
}

/* ── Excel workbook (pure sheet builder — one worksheet per module summary) ── */

/**
 * Build the Executive Report workbook as an array of { name, aoa } sheets. Pure
 * (no XLSX dependency) so it is node-testable. One lead summary sheet + one
 * worksheet per module summary.
 * @param {Object} model aggregate model
 * @returns {Array<{name:string, aoa:Array<Array<string|number>>}>}
 */
export function buildExecutiveReportSheets(model) {
  const m = model || {};
  const d = pick(m);
  const v = verdict(d);
  const sheets = [];

  sheets.push({ name: 'Ringkasan Eksekutif', aoa: [
    ['Executive Analytics'],
    ['Dibuat', fmtTime(m.generatedAt || new Date().toISOString())],
    [],
    ['Status Operasional', v.level || '—'],
    ['Keterangan', STATUS_MSG[v.tone] || ''],
    [],
    ['Indikator Utama', 'Nilai'],
    ...kpiRows(d),
    [],
    ['Sorotan Hari Ini', 'Rincian', 'Status'],
    ...buildHighlights(d).map((h) => [h.label, h.detail || '—', HIGHLIGHT_TONE[h.tone] || '—']),
  ] });

  for (const mod of moduleSummaries(d)) {
    sheets.push({ name: mod.title, aoa: [[mod.title], ['Metrik', 'Nilai'], ...mod.rows] });
  }

  return sheets;
}

/* ── Blob wrappers (browser only) ──────────────────────────────────────────── */

export async function exportExecutiveReportPdf(model, meta = {}) {
  const docDef = buildExecutiveReportDocDefinition(model, meta);
  const blob = await getExporter('pdfmake').exportToPdf(docDef);
  return { blob, filename: `${safeFilename('executive-analytics')}.pdf` };
}

export async function exportExecutiveReportExcel(model, meta = {}) {
  const XLSX = await loadXLSX();
  const wb = XLSX.utils.book_new();
  for (const sheet of buildExecutiveReportSheets(model)) {
    const ws = XLSX.utils.aoa_to_sheet(sheet.aoa);
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31));
  }
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  return { blob, filename: `${safeFilename('executive-analytics')}.xlsx` };
}

/* ── window hooks (read the model the dashboard publishes) ──────────────────── */

if (typeof window !== 'undefined') {
  window.exportExecutiveDashboardPdf = (meta = {}) => {
    const m = window._lastExecutiveDashboardModel;
    if (!m) throw new Error('Buka tab Executive Analytics dulu agar model tersedia.');
    return exportExecutiveReportPdf(m, { ...(window._executiveDashboardMeta || {}), ...meta });
  };
  window.exportExecutiveDashboardExcel = (meta = {}) => {
    const m = window._lastExecutiveDashboardModel;
    if (!m) throw new Error('Buka tab Executive Analytics dulu agar model tersedia.');
    return exportExecutiveReportExcel(m, { ...(window._executiveDashboardMeta || {}), ...meta });
  };
}
