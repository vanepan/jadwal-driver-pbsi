/* ============================================================
   ENGINEERING-ANALYTICS-EXPORT.JS — Engineering Analytics export (v1.20.2)

   PDF + Excel export for the Engineering Analytics section of the global
   Analytics module. Like the Dispatch Analytics export, it REUSES the platform's
   existing export libraries — the pdfmake backend (js/docs/pdf-exporter.js) and
   xlsx-js-style — so NO new exporter type is introduced. It only PROJECTS the
   Engineering analytics provider snapshot into a docDefinition / workbook.

   The builders (buildEngineeringAnalyticsDocDefinition / *Sheets) are PURE and
   node-testable. The window.* hooks read the snapshot the section publishes
   (window._lastEngineeringAnalyticsSnapshot), mirroring the sibling exports.
   ============================================================ */

'use strict';

import { getExporter } from '../../docs/pdf-exporter.js';
import { CATEGORY_SEED, STATUS } from '../../engineering/config/engineering-config.js';

const CAT_LABEL = Object.fromEntries(CATEGORY_SEED.map((c) => [c.id, c.label]));
const catLabel = (id) => CAT_LABEL[id] || id;
const hours = (ms) => Math.round(((Number(ms) || 0) / 3600000) * 10) / 10;
function safeFilename(base) {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `${base}-${stamp}`;
}

/* ── xlsx-js-style lazy loader (mirrors the sibling exporters) ─────────────── */
const XLSX_SRC = 'https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js';
let _xlsxPromise = null;
function loadXLSX() {
  if (typeof window !== 'undefined' && window.XLSX && window.XLSX.utils) return Promise.resolve(window.XLSX);
  if (_xlsxPromise) return _xlsxPromise;
  _xlsxPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = XLSX_SRC; s.async = true;
    s.onload = () => (window.XLSX ? resolve(window.XLSX) : reject(new Error('XLSX global missing after load')));
    s.onerror = () => reject(new Error(`Failed to load ${XLSX_SRC}`));
    document.head.appendChild(s);
  });
  return _xlsxPromise;
}

/* ── projections (pure) ───────────────────────────────────────────────────── */
function kpiRows(s) {
  const overdue = s.overdueAssignments ? s.overdueAssignments.count : 0;
  const avgH = s.averageCompletionTime ? hours(s.averageCompletionTime.averageMs) : 0;
  const waiting = (s.statusDistribution && s.statusDistribution[STATUS.WAITING_VERIFICATION]) || 0;
  return [
    ['Total Penugasan', s.totalAssignments || 0],
    ['Task Selesai', s.completedAssignments || 0],
    ['Overdue', overdue],
    ['Rata Penyelesaian (jam)', avgH],
    ['Antrean Verifikasi', waiting],
  ];
}
function categoryRows(s) {
  const d = s.categoryDistribution || {};
  return Object.keys(d).map((k) => [catLabel(k), d[k]]).sort((a, b) => b[1] - a[1]);
}
function buildingRows(s) {
  const d = s.buildingDistribution || {};
  return Object.keys(d).map((k) => [k || '—', d[k]]).sort((a, b) => b[1] - a[1]);
}
function workloadRows(s) {
  return (s.engineeringWorkload || []).map((w) => [w.name || w.workerId, hours(w.workingMs)])
    .filter((r) => r[1] > 0).sort((a, b) => b[1] - a[1]);
}

/* ── pdfmake docDefinition (pure) ─────────────────────────────────────────── */
export function buildEngineeringAnalyticsDocDefinition(snapshot, meta = {}) {
  const s = snapshot || {};
  const table = (headers, rows) => ({
    table: { headerRows: 1, widths: ['*', 'auto'], body: [headers.map((h) => ({ text: h, bold: true })), ...rows.map((r) => r.map((c) => String(c)))] },
    layout: 'lightHorizontalLines', margin: [0, 4, 0, 14],
  });
  return {
    pageMargins: [40, 48, 40, 48],
    content: [
      { text: 'Engineering Analytics', fontSize: 18, bold: true, margin: [0, 0, 0, 2] },
      { text: `Bidang Sarana dan Prasarana — ${meta.periodLabel || 'Semua riwayat'}`, fontSize: 10, color: '#666', margin: [0, 0, 0, 12] },
      { text: 'Ringkasan', fontSize: 13, bold: true, margin: [0, 0, 0, 4] },
      table(['Metrik', 'Nilai'], kpiRows(s)),
      { text: 'Task per Kategori', fontSize: 13, bold: true, margin: [0, 0, 0, 4] },
      table(['Kategori', 'Jumlah'], categoryRows(s)),
      { text: 'Task per Gedung', fontSize: 13, bold: true, margin: [0, 0, 0, 4] },
      table(['Gedung', 'Jumlah'], buildingRows(s)),
      { text: 'Beban Engineering (jam)', fontSize: 13, bold: true, margin: [0, 0, 0, 4] },
      table(['Teknisi', 'Jam'], workloadRows(s)),
    ],
    footer: (page, count) => ({ text: `${meta.generatedBy || ''}  ·  Halaman ${page} / ${count}`, fontSize: 8, color: '#999', margin: [40, 0] }),
    defaultStyle: { fontSize: 10 },
  };
}

/* ── xlsx sheets (pure) ───────────────────────────────────────────────────── */
export function buildEngineeringAnalyticsSheets(snapshot) {
  const s = snapshot || {};
  return [
    { name: 'Ringkasan', aoa: [['Metrik', 'Nilai'], ...kpiRows(s)] },
    { name: 'Kategori', aoa: [['Kategori', 'Jumlah'], ...categoryRows(s)] },
    { name: 'Gedung', aoa: [['Gedung', 'Jumlah'], ...buildingRows(s)] },
    { name: 'Beban', aoa: [['Teknisi', 'Jam'], ...workloadRows(s)] },
  ];
}

/* ── blob wrappers (browser only) ─────────────────────────────────────────── */
export async function exportEngineeringAnalyticsPdf(snapshot, meta = {}) {
  const blob = await getExporter('pdfmake').exportToPdf(buildEngineeringAnalyticsDocDefinition(snapshot, meta));
  return { blob, filename: `${safeFilename('engineering-analytics')}.pdf` };
}
export async function exportEngineeringAnalyticsExcel(snapshot, meta = {}) {
  const XLSX = await loadXLSX();
  const wb = XLSX.utils.book_new();
  for (const sheet of buildEngineeringAnalyticsSheets(snapshot)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheet.aoa), sheet.name.slice(0, 31));
  }
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return { blob: new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename: `${safeFilename('engineering-analytics')}.xlsx` };
}

/* ── window hooks (read the snapshot the section publishes) ────────────────── */
if (typeof window !== 'undefined') {
  window.exportEngineeringAnalyticsPdf = (meta = {}) => {
    const s = window._lastEngineeringAnalyticsSnapshot;
    if (!s) throw new Error('Buka tab Engineering Analytics dulu agar data tersedia.');
    return exportEngineeringAnalyticsPdf(s, { ...(window._engineeringAnalyticsMeta || {}), ...meta });
  };
  window.exportEngineeringAnalyticsExcel = (meta = {}) => {
    const s = window._lastEngineeringAnalyticsSnapshot;
    if (!s) throw new Error('Buka tab Engineering Analytics dulu agar data tersedia.');
    return exportEngineeringAnalyticsExcel(s, { ...(window._engineeringAnalyticsMeta || {}), ...meta });
  };
}
