/* ============================================================
   RECOMMENDATION-ACCURACY-EXPORT.JS — Recommendation Accuracy Engine (v1.17.1)

   PDF + Excel export for the Recommendation Accuracy model. It REUSES the same
   platform export libraries as the Dispatch Analytics export — the pdfmake
   backend (js/docs/pdf-exporter.js) and xlsx-js-style — so no new exporter TYPE
   is introduced. It only PROJECTS the accuracy model into a pdfmake
   docDefinition + an XLSX workbook; it computes nothing.

   The document BUILDERS (buildRecommendationAccuracyDocDefinition /
   buildRecommendationAccuracySheets) are PURE and node-testable. The section
   helpers (buildRecommendationAccuracyContent / buildRecommendationAccuracySheets)
   are also imported by dispatch-analytics-export.js so the Dispatch Analytics
   report can APPEND a Recommendation Accuracy section into the SAME PDF/Excel —
   one source of truth for the accuracy projection.

   No CSV. Operational Analytics export untouched. Registered through the existing
   Export Registry (recommendation-accuracy-pdf / -excel).
   ============================================================ */

'use strict';

import { getExporter } from '../../docs/pdf-exporter.js';

/* ── xlsx-js-style lazy loader (mirrors dispatch-analytics-export) ─────────── */

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

/* ── formatting helpers (pure) ────────────────────────────────────────────── */

function pct(n) { return `${Math.round(Number(n) || 0)}%`; }
function signed(n) { const v = Math.round(Number(n) || 0); return `${v > 0 ? '+' : ''}${v}`; }
function stars(n) {
  const s = Math.max(0, Math.min(5, Math.round(Number(n) || 0)));
  return '★'.repeat(s) + '☆'.repeat(5 - s);
}
function fmtTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mo = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'][d.getMonth()];
  return `${dd} ${mo} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function safeFilename(base) {
  return `${base}-${new Date().toISOString().slice(0, 10)}`;
}

/* ── pdfmake helpers (pure) ───────────────────────────────────────────────── */

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
 * The Recommendation Accuracy section blocks (pure pdfmake content). Reused by
 * the standalone report AND appended into the Dispatch Analytics report.
 * @param {Object} model output of computeRecommendationAccuracyModel
 * @returns {Array<Object>} pdfmake content nodes
 */
export function buildRecommendationAccuracyContent(model) {
  const m = model || {};
  const k = m.kpi || {};
  const conf = k.avgConfidence || {};
  const pp = k.previousPeriod || { delta: {} };
  const content = [];

  // Feature 1 — Overall KPI
  content.push(sectionHeader('Akurasi Rekomendasi — Ringkasan'));
  content.push(simpleTable(
    ['Metrik', 'Nilai', 'Δ vs Periode Lalu'],
    [
      ['Akurasi Rekomendasi', pct(k.recommendationAccuracy), signed((pp.delta || {}).recommendationAccuracy) + '%'],
      ['Tingkat Penerimaan', pct(k.acceptanceRate), signed((pp.delta || {}).acceptanceRate) + '%'],
      ['Tingkat Override', pct(k.overrideRate), signed((pp.delta || {}).overrideRate) + '%'],
      ['Override Driver', pct(k.driverOverrideRate), '—'],
      ['Override Kendaraan', pct(k.vehicleOverrideRate), '—'],
      ['Override Penuh', pct(k.fullOverrideRate), '—'],
      ['Rata-rata Skor Dispatch', String(k.avgDispatchScore != null ? k.avgDispatchScore : 0), signed((pp.delta || {}).avgDispatchScore)],
      ['Rata-rata Confidence', `${stars(conf.stars)} ${conf.label || ''}`, '—'],
    ],
    ['*', 90, 90],
  ));

  // Feature 2 — Driver accuracy
  content.push(sectionHeader('Akurasi Rekomendasi Driver'));
  content.push(simpleTable(
    ['#', 'Driver', 'Rek.', 'Terima', 'Override', 'Akurasi', 'Skor', 'Selisih'],
    ((m.driverAccuracy && m.driverAccuracy.rows) || []).map((r) =>
      [String(r.ranking), r.name, String(r.recommendations), String(r.accepted), String(r.overridden), pct(r.accuracyPct), String(r.avgDispatchScore), String(r.avgOverrideDifference)]),
    [18, '*', 35, 40, 45, 45, 35, 40],
  ));

  // Feature 3 — Vehicle accuracy
  content.push(sectionHeader('Akurasi Rekomendasi Kendaraan'));
  content.push(simpleTable(
    ['#', 'Kendaraan', 'Rek.', 'Terima', 'Override', 'Akurasi', 'Skor', 'Selisih'],
    ((m.vehicleAccuracy && m.vehicleAccuracy.rows) || []).map((r) =>
      [String(r.ranking), r.name, String(r.recommendations), String(r.accepted), String(r.overridden), pct(r.accuracyPct), String(r.avgDispatchScore), String(r.avgOverrideDifference)]),
    [18, '*', 35, 40, 45, 45, 35, 40],
  ));

  // Feature 4 — Confidence calibration
  content.push(sectionHeader('Kalibrasi Confidence'));
  content.push(simpleTable(
    ['Band', 'Dibuat', 'Diterima', 'Override', 'Penerimaan', 'Rata Skor'],
    ((m.calibration && m.calibration.buckets) || []).map((b) =>
      [`${stars(b.stars)} ${b.label}`, String(b.generated), String(b.accepted), String(b.overridden), pct(b.acceptancePct), String(b.avgDispatchScore)]),
    ['*', 50, 55, 55, 65, 55],
  ));

  // Feature 5 — Override severity
  const sev = m.severity || {};
  content.push(sectionHeader('Tingkat Keparahan Override'));
  content.push(simpleTable(
    ['Kategori', 'Jumlah', 'Porsi'],
    (sev.categories || []).map((c) => [c.label, String(c.count), pct(c.percentage)]),
    ['*', 70, 70],
  ));

  // Feature 6 — Reason analytics
  content.push(sectionHeader('Analitik Alasan Override'));
  content.push(simpleTable(
    ['Kategori Alasan', 'Jumlah', 'Porsi'],
    ((m.reasonAnalytics && m.reasonAnalytics.categories) || []).map((c) => [c.label, String(c.count), pct(c.percentage)]),
    ['*', 70, 70],
  ));

  // Feature 7 + 8 — False high confidence + Unexpected acceptance
  const fhc = m.falseHighConfidence || {};
  const ua = m.unexpectedAcceptance || {};
  content.push(sectionHeader('Confidence vs Keputusan'));
  content.push(simpleTable(
    ['Indikator', 'Total', 'Terkait', 'Persentase'],
    [
      ['False High Confidence (★★★★★ di-override)', String(fhc.total || 0), String(fhc.overridden || 0), pct(fhc.falseHighConfidencePct)],
      ['Penerimaan Tak Terduga (≤3★ diterima)', String(ua.totalLowConfidence || 0), String(ua.accepted || 0), pct(ua.acceptancePct)],
    ],
    ['*', 50, 55, 70],
  ));

  // Feature 10 — Executive insights
  content.push(sectionHeader('Insight Eksekutif'));
  const insights = (m.insights || []);
  content.push(insights.length
    ? { ul: insights.map((i) => `${i.title} — ${i.description}`), style: 'td', margin: [0, 2, 0, 0] }
    : { text: 'Belum cukup data untuk menyusun insight.', style: 'td' });

  return content;
}

/**
 * Build the standalone Recommendation Accuracy pdfmake docDefinition.
 * @param {Object} model
 * @param {Object} [meta] { periodLabel, generatedBy, appVersion }
 * @returns {Object} pdfmake docDefinition
 */
export function buildRecommendationAccuracyDocDefinition(model, meta = {}) {
  const m = model || {};
  const content = [];
  content.push({ text: 'Recommendation Accuracy', style: 'h1' });
  content.push({
    text: [
      meta.periodLabel ? `${meta.periodLabel} · ` : '',
      `${(m.totals && m.totals.decisions) || 0} keputusan · `,
      `Dibuat ${fmtTime((m.generatedAt) || new Date().toISOString())}`,
      meta.generatedBy ? ` · oleh ${meta.generatedBy}` : '',
    ].join(''),
    style: 'meta', margin: [0, 2, 0, 4],
  });
  content.push(...buildRecommendationAccuracyContent(m));

  return {
    pageSize: 'A4',
    pageMargins: [34, 36, 34, 40],
    info: { title: 'Recommendation Accuracy' },
    content,
    styles: {
      h1: { fontSize: 16, bold: true, color: ACCENT },
      h2: { fontSize: 11, bold: true, color: '#222' },
      meta: { fontSize: 8, color: '#666' },
      th: { fontSize: 8, bold: true, color: '#444', fillColor: '#f4f4f6' },
      td: { fontSize: 8, color: '#222' },
    },
    defaultStyle: { fontSize: 9 },
    footer: (current, total) => ({ text: `Recommendation Accuracy · ${meta.appVersion || ''} · ${current}/${total}`, style: 'meta', alignment: 'center', margin: [0, 8, 0, 0] }),
  };
}

/* ── Excel workbook (pure sheet builder) ──────────────────────────────────── */

/**
 * Build the Recommendation Accuracy workbook as { name, aoa } sheets. Pure.
 * @param {Object} model
 * @returns {Array<{name:string, aoa:Array<Array<string|number>>}>}
 */
export function buildRecommendationAccuracySheets(model) {
  const m = model || {};
  const k = m.kpi || {};
  const conf = k.avgConfidence || {};
  const pp = k.previousPeriod || { delta: {} };
  const sev = m.severity || {};
  const fhc = m.falseHighConfidence || {};
  const ua = m.unexpectedAcceptance || {};
  const sheets = [];

  sheets.push({ name: 'Ringkasan Akurasi', aoa: [
    ['Recommendation Accuracy Engine'],
    ['Total Keputusan', (m.totals && m.totals.decisions) || 0],
    ['Akurasi Rekomendasi (%)', Math.round(k.recommendationAccuracy || 0)],
    ['Tingkat Penerimaan (%)', Math.round(k.acceptanceRate || 0)],
    ['Tingkat Override (%)', Math.round(k.overrideRate || 0)],
    ['Override Driver (%)', Math.round(k.driverOverrideRate || 0)],
    ['Override Kendaraan (%)', Math.round(k.vehicleOverrideRate || 0)],
    ['Override Penuh (%)', Math.round(k.fullOverrideRate || 0)],
    ['Rata-rata Skor Dispatch', k.avgDispatchScore || 0],
    ['Rata-rata Confidence (★)', conf.stars || 0],
    [],
    ['Δ Akurasi vs Periode Lalu', Math.round((pp.delta || {}).recommendationAccuracy || 0)],
    ['Δ Penerimaan vs Periode Lalu', Math.round((pp.delta || {}).acceptanceRate || 0)],
    ['Δ Override vs Periode Lalu', Math.round((pp.delta || {}).overrideRate || 0)],
  ] });

  sheets.push({ name: 'Driver Akurasi', aoa: [
    ['#', 'Driver', 'Rekomendasi', 'Diterima', 'Override', 'Akurasi (%)', 'Penerimaan (%)', 'Skor', 'Confidence (★)', 'Selisih Override'],
    ...((m.driverAccuracy && m.driverAccuracy.rows) || []).map((r) =>
      [r.ranking, r.name, r.recommendations, r.accepted, r.overridden, r.accuracyPct, r.acceptancePct, r.avgDispatchScore, r.avgConfidenceStars, r.avgOverrideDifference]),
  ] });

  sheets.push({ name: 'Kendaraan Akurasi', aoa: [
    ['#', 'Kendaraan', 'Rekomendasi', 'Diterima', 'Override', 'Akurasi (%)', 'Penerimaan (%)', 'Skor', 'Confidence (★)', 'Selisih Override'],
    ...((m.vehicleAccuracy && m.vehicleAccuracy.rows) || []).map((r) =>
      [r.ranking, r.name, r.recommendations, r.accepted, r.overridden, r.accuracyPct, r.acceptancePct, r.avgDispatchScore, r.avgConfidenceStars, r.avgOverrideDifference]),
  ] });

  sheets.push({ name: 'Kalibrasi', aoa: [
    ['Band', 'Bintang', 'Dibuat', 'Diterima', 'Override', 'Penerimaan (%)', 'Rata Skor'],
    ...((m.calibration && m.calibration.buckets) || []).map((b) =>
      [b.label, b.stars, b.generated, b.accepted, b.overridden, b.acceptancePct, b.avgDispatchScore]),
  ] });

  sheets.push({ name: 'Severity & Alasan', aoa: [
    ['Keparahan Override', 'Jumlah', 'Porsi (%)'],
    ...(sev.categories || []).map((c) => [c.label, c.count, c.percentage]),
    [],
    ['Rata Selisih Driver', sev.avgDriverDifference || 0],
    ['Rata Selisih Kendaraan', sev.avgVehicleDifference || 0],
    ['Rata Selisih Gabungan', sev.avgCombinedDifference || 0],
    [],
    ['Kategori Alasan', 'Jumlah', 'Porsi (%)'],
    ...((m.reasonAnalytics && m.reasonAnalytics.categories) || []).map((c) => [c.label, c.count, c.percentage]),
  ] });

  sheets.push({ name: 'Confidence vs Keputusan', aoa: [
    ['Indikator', 'Total', 'Terkait', 'Persentase (%)'],
    ['False High Confidence', fhc.total || 0, fhc.overridden || 0, fhc.falseHighConfidencePct || 0],
    ['Penerimaan Tak Terduga', ua.totalLowConfidence || 0, ua.accepted || 0, ua.acceptancePct || 0],
    [],
    ['False High Confidence — Kasus Terburuk'],
    ['Request', 'Skor Rek.', 'Skor Pilihan', 'Selisih', 'Driver', 'Kendaraan', 'Alasan'],
    ...((fhc.worstCases) || []).map((c) => [c.requestId, c.recommendedScore, c.selectedScore, c.drop, c.driverName, c.vehicleName, c.reason]),
  ] });

  sheets.push({ name: 'Insight', aoa: [
    ['Prioritas', 'Judul', 'Deskripsi', 'Sumber'],
    ...((m.insights) || []).map((i) => [i.priority, i.title, i.description, i.source]),
  ] });

  return sheets;
}

/* ── Blob wrappers (browser only) ─────────────────────────────────────────── */

export async function exportRecommendationAccuracyPdf(model, meta = {}) {
  const docDef = buildRecommendationAccuracyDocDefinition(model, meta);
  const blob = await getExporter('pdfmake').exportToPdf(docDef);
  return { blob, filename: `${safeFilename('recommendation-accuracy')}.pdf` };
}

export async function exportRecommendationAccuracyExcel(model, meta = {}) {
  const XLSX = await loadXLSX();
  const wb = XLSX.utils.book_new();
  for (const sheet of buildRecommendationAccuracySheets(model)) {
    const ws = XLSX.utils.aoa_to_sheet(sheet.aoa);
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31));
  }
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  return { blob, filename: `${safeFilename('recommendation-accuracy')}.xlsx` };
}

/* ── window hooks (read the model the dashboard publishes) ─────────────────── */

if (typeof window !== 'undefined') {
  window.exportRecommendationAccuracyPdf = (meta = {}) => {
    const m = window._lastRecommendationAccuracyModel;
    if (!m) throw new Error('Buka tab Dispatch Analytics dulu agar model akurasi tersedia.');
    return exportRecommendationAccuracyPdf(m, { ...(window._recommendationAccuracyMeta || {}), ...meta });
  };
  window.exportRecommendationAccuracyExcel = (meta = {}) => {
    const m = window._lastRecommendationAccuracyModel;
    if (!m) throw new Error('Buka tab Dispatch Analytics dulu agar model akurasi tersedia.');
    return exportRecommendationAccuracyExcel(m, { ...(window._recommendationAccuracyMeta || {}), ...meta });
  };
}
