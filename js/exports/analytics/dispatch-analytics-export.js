/* ============================================================
   DISPATCH-ANALYTICS-EXPORT.JS — Dispatch Intelligence Analytics (v1.17.0)

   PDF + Excel export for the Dispatch Intelligence Analytics dashboard. It
   REUSES the platform's existing export libraries — the pdfmake backend from
   js/docs/pdf-exporter.js (same as the document engine) and xlsx-js-style (same
   loader the Petty Cash workbook exporter uses) — so no new exporter TYPE is
   introduced. It only PROJECTS the analytics model into a pdfmake docDefinition
   and an XLSX workbook; it computes nothing.

   The document BUILDERS (buildDispatchAnalyticsDocDefinition /
   buildDispatchAnalyticsSheets) are PURE and node-testable (no DOM, no network).
   The *Blob functions wrap them with the lazy library loaders; the window.* hooks
   read the model the dashboard publishes (window._lastDispatchAnalyticsModel),
   mirroring the existing analytics export hooks.
   ============================================================ */

'use strict';

import { getExporter } from '../../docs/pdf-exporter.js';
// v1.17.1 — the Dispatch Analytics report can APPEND a Recommendation Accuracy
// section. The accuracy projection lives in its own module (one source of truth);
// these builders only splice it in when an accuracy model is supplied. Existing
// callers (no accuracy model) get byte-identical output — no regression.
import {
  buildRecommendationAccuracyContent,
  buildRecommendationAccuracySheets,
} from './recommendation-accuracy-export.js';

/* ── xlsx-js-style lazy loader (mirrors nor-excel-exporter) ───────────────── */

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
  const stamp = new Date().toISOString().slice(0, 10);
  return `${base}-${stamp}`;
}

/* ── PDF docDefinition (pure) ─────────────────────────────────────────────── */

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
 * Build the pdfmake docDefinition for the Dispatch Analytics report.
 * @param {Object} model  output of computeDispatchAnalyticsModel
 * @param {Object} [meta] { periodLabel, generatedBy, appVersion }
 * @returns {Object} pdfmake docDefinition
 */
export function buildDispatchAnalyticsDocDefinition(model, meta = {}, accuracyModel = null) {
  const m = model || {};
  const k = m.kpi || {};
  const conf = k.avgConfidence || {};
  const content = [];

  content.push({ text: 'Dispatch Intelligence Analytics', style: 'h1' });
  content.push({
    text: [
      meta.periodLabel ? `${meta.periodLabel} · ` : '',
      `${(m.totals && m.totals.decisions) || 0} keputusan · `,
      `Dibuat ${fmtTime((m.generatedAt) || new Date().toISOString())}`,
      meta.generatedBy ? ` · oleh ${meta.generatedBy}` : '',
    ].join(''),
    style: 'meta', margin: [0, 2, 0, 4],
  });

  // §1 KPI
  content.push(sectionHeader('Ringkasan Eksekutif'));
  content.push(simpleTable(
    ['Metrik', 'Nilai'],
    [
      ['Akurasi Dispatch', pct(k.dispatchAccuracy)],
      ['Tingkat Override', pct(k.overrideRate)],
      ['Penerimaan Rekomendasi', pct(k.recommendationAcceptance)],
      ['Rata-rata Skor Dispatch', String(k.avgDispatchScore != null ? k.avgDispatchScore : 0)],
      ['Rata-rata Confidence', `${stars(conf.stars)} ${conf.label || ''} (${conf.stars || 0}★)`],
    ],
    ['*', 120],
  ));

  // §2 Confidence distribution
  content.push(sectionHeader('Distribusi Confidence'));
  content.push(simpleTable(
    ['Band', 'Jumlah', 'Porsi', 'Penerimaan'],
    (m.confidenceDistribution || []).map((r) => [`${stars(r.stars)} ${r.label}`, String(r.count), pct(r.percentage), pct(r.acceptanceRate)]),
    ['*', 60, 60, 70],
  ));

  // §3 Driver intelligence
  content.push(sectionHeader('Intelijen Driver'));
  content.push(simpleTable(
    ['Driver', 'Rek.', 'Terima', 'Override', 'Skor', 'Kapasitas', 'Anti-Konflik'],
    ((m.driverIntelligence && m.driverIntelligence.rows) || []).map((r) =>
      [r.driverName, String(r.recommended), pct(r.acceptance), pct(r.overrideRate), String(r.avgScore), pct(r.capacityUtilization), pct(r.conflictAvoidance)]),
    ['*', 35, 45, 50, 40, 55, 60],
  ));

  // §4 Vehicle intelligence
  content.push(sectionHeader('Intelijen Kendaraan'));
  content.push(simpleTable(
    ['Kendaraan', 'Rek.', 'Terima', 'Override', 'Skor', 'Utilisasi', 'Idle'],
    ((m.vehicleIntelligence && m.vehicleIntelligence.rows) || []).map((r) =>
      [r.vehicleName, String(r.recommended), pct(r.acceptance), pct(r.overrideRate), String(r.avgScore), pct(r.utilization), pct(r.idle)]),
    ['*', 35, 45, 50, 40, 55, 45],
  ));

  // §5 Override analytics
  const b = (m.overrideAnalytics && m.overrideAnalytics.reasonBreakdown) || {};
  content.push(sectionHeader('Analitik Override'));
  content.push(simpleTable(
    ['Hasil', 'Jumlah'],
    [['Diterima', String(b.accepted || 0)], ['Override Driver', String(b.driver || 0)], ['Override Kendaraan', String(b.vehicle || 0)], ['Override Keduanya', String(b.full || 0)]],
    ['*', 80],
  ));

  // §6 Bidang intelligence
  content.push(sectionHeader('Intelijen Bidang'));
  content.push(simpleTable(
    ['Bidang', 'Request', 'Terima', 'Override', 'Skor', 'Confidence', 'Tujuan Teratas', 'Konflik'],
    (m.bidangIntelligence || []).map((r) =>
      [r.bidang, String(r.requests), pct(r.acceptanceRate), pct(r.overrideRate), String(r.avgScore), stars(r.avgConfidenceStars), r.topDestination || '—', pct(r.conflictRate)]),
    ['*', 45, 45, 50, 35, 60, '*', 45],
  ));

  // §7 Recommendation quality
  content.push(sectionHeader('Kualitas Rekomendasi'));
  content.push(simpleTable(
    ['Hasil', 'Jumlah', 'Porsi'],
    ((m.recommendationQuality && m.recommendationQuality.funnel) || []).map((f) => [f.label, String(f.count), pct(f.percentage)]),
    ['*', 70, 70],
  ));

  // §9 Explainability
  content.push(sectionHeader('Explainability — Alasan Teratas'));
  content.push(simpleTable(
    ['Alasan Rekomendasi', 'Jumlah'],
    ((m.explainability && m.explainability.topReasons) || []).map((r) => [r.text, `${r.count}×`]),
    ['*', 60],
  ));
  content.push(simpleTable(
    ['Alasan Override Admin', 'Jumlah'],
    ((m.explainability && m.explainability.adminOverrideReasons) || []).map((r) => [r.text, `${r.count}×`]),
    ['*', 60],
  ));

  // v1.17.1 — Recommendation Accuracy section (only when supplied; additive).
  if (accuracyModel) {
    content.push({ text: '', pageBreak: 'after' });
    content.push({ text: 'Recommendation Accuracy Engine', style: 'h1', margin: [0, 0, 0, 4] });
    content.push(...buildRecommendationAccuracyContent(accuracyModel));
  }

  return {
    pageSize: 'A4',
    pageMargins: [34, 36, 34, 40],
    info: { title: 'Dispatch Intelligence Analytics' },
    content,
    styles: {
      h1: { fontSize: 16, bold: true, color: ACCENT },
      h2: { fontSize: 11, bold: true, color: '#222' },
      meta: { fontSize: 8, color: '#666' },
      th: { fontSize: 8, bold: true, color: '#444', fillColor: '#f4f4f6' },
      td: { fontSize: 8, color: '#222' },
    },
    defaultStyle: { fontSize: 9 },
    footer: (current, total) => ({ text: `Dispatch Intelligence Analytics · ${meta.appVersion || ''} · ${current}/${total}`, style: 'meta', alignment: 'center', margin: [0, 8, 0, 0] }),
  };
}

/* ── Excel workbook (pure sheet builder) ──────────────────────────────────── */

/**
 * Build the Dispatch Analytics workbook as an array of { name, aoa } sheets.
 * Pure (no XLSX dependency) so it is node-testable; the *ExcelBlob wrapper turns
 * these into a styled workbook.
 * @param {Object} model
 * @returns {Array<{name:string, aoa:Array<Array<string|number>>}>}
 */
export function buildDispatchAnalyticsSheets(model, accuracyModel = null) {
  const m = model || {};
  const k = m.kpi || {};
  const conf = k.avgConfidence || {};
  const b = (m.overrideAnalytics && m.overrideAnalytics.reasonBreakdown) || {};

  const sheets = [];
  sheets.push({ name: 'Ringkasan', aoa: [
    ['Dispatch Intelligence Analytics'],
    ['Total Keputusan', (m.totals && m.totals.decisions) || 0],
    ['Akurasi Dispatch (%)', Math.round(k.dispatchAccuracy || 0)],
    ['Tingkat Override (%)', Math.round(k.overrideRate || 0)],
    ['Penerimaan Rekomendasi (%)', Math.round(k.recommendationAcceptance || 0)],
    ['Rata-rata Skor Dispatch', k.avgDispatchScore || 0],
    ['Rata-rata Confidence (★)', conf.stars || 0],
    ['Band Confidence', conf.label || ''],
  ] });

  sheets.push({ name: 'Distribusi Confidence', aoa: [
    ['Band', 'Bintang', 'Jumlah', 'Porsi (%)', 'Penerimaan (%)'],
    ...(m.confidenceDistribution || []).map((r) => [r.label, r.stars, r.count, r.percentage, r.acceptanceRate]),
  ] });

  sheets.push({ name: 'Driver', aoa: [
    ['Driver', 'Rekomendasi', 'Diterima', 'Terima (%)', 'Override (%)', 'Skor', 'Kapasitas (%)', 'Anti-Konflik (%)', 'Terakhir'],
    ...((m.driverIntelligence && m.driverIntelligence.rows) || []).map((r) =>
      [r.driverName, r.recommended, r.accepted, r.acceptance, r.overrideRate, r.avgScore, r.capacityUtilization, r.conflictAvoidance, fmtTime(r.lastRecommendation)]),
  ] });

  sheets.push({ name: 'Kendaraan', aoa: [
    ['Kendaraan', 'Rekomendasi', 'Diterima', 'Terima (%)', 'Override (%)', 'Skor', 'Utilisasi (%)', 'Idle (%)', 'Anti-Konflik (%)'],
    ...((m.vehicleIntelligence && m.vehicleIntelligence.rows) || []).map((r) =>
      [r.vehicleName, r.recommended, r.accepted, r.acceptance, r.overrideRate, r.avgScore, r.utilization, r.idle, r.conflictAvoidance]),
  ] });

  sheets.push({ name: 'Bidang', aoa: [
    ['Bidang', 'Request', 'Diterima', 'Override', 'Terima (%)', 'Skor', 'Confidence (★)', 'Tujuan Teratas', 'Konflik (%)'],
    ...(m.bidangIntelligence || []).map((r) =>
      [r.bidang, r.requests, r.accepted, r.overridden, r.acceptanceRate, r.avgScore, r.avgConfidenceStars, r.topDestination || '', r.conflictRate]),
  ] });

  sheets.push({ name: 'Override & Kualitas', aoa: [
    ['Hasil', 'Jumlah', 'Porsi (%)'],
    ...((m.recommendationQuality && m.recommendationQuality.funnel) || []).map((f) => [f.label, f.count, f.percentage]),
    [],
    ['Ringkasan Override', 'Jumlah'],
    ['Diterima', b.accepted || 0],
    ['Override Driver', b.driver || 0],
    ['Override Kendaraan', b.vehicle || 0],
    ['Override Keduanya', b.full || 0],
  ] });

  sheets.push({ name: 'Linimasa', aoa: [
    ['Waktu', 'Hasil', 'Driver', 'Kendaraan', 'Skor', 'Bidang'],
    ...((m.timeline) || []).map((e) => [fmtTime(e.decidedAt), e.outcome, e.driverName, e.vehicleName, e.score, e.bidang || '']),
  ] });

  sheets.push({ name: 'Explainability', aoa: [
    ['Alasan Rekomendasi', 'Jumlah'],
    ...((m.explainability && m.explainability.topReasons) || []).map((r) => [r.text, r.count]),
    [],
    ['Alasan Override Admin', 'Jumlah'],
    ...((m.explainability && m.explainability.adminOverrideReasons) || []).map((r) => [r.text, r.count]),
  ] });

  // v1.17.1 — append the Recommendation Accuracy sheets (only when supplied).
  if (accuracyModel) sheets.push(...buildRecommendationAccuracySheets(accuracyModel));

  return sheets;
}

/* ── Blob wrappers (browser only) ─────────────────────────────────────────── */

/**
 * Build the PDF blob for the Dispatch Analytics report.
 * @returns {Promise<{blob:Blob, filename:string}>}
 */
export async function exportDispatchAnalyticsPdf(model, meta = {}, accuracyModel = null) {
  const docDef = buildDispatchAnalyticsDocDefinition(model, meta, accuracyModel);
  const blob = await getExporter('pdfmake').exportToPdf(docDef);
  return { blob, filename: `${safeFilename('dispatch-analytics')}.pdf` };
}

/**
 * Build the Excel (.xlsx) blob for the Dispatch Analytics report.
 * @returns {Promise<{blob:Blob, filename:string}>}
 */
export async function exportDispatchAnalyticsExcel(model, meta = {}, accuracyModel = null) {
  const XLSX = await loadXLSX();
  const wb = XLSX.utils.book_new();
  for (const sheet of buildDispatchAnalyticsSheets(model, accuracyModel)) {
    const ws = XLSX.utils.aoa_to_sheet(sheet.aoa);
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31));
  }
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  return { blob, filename: `${safeFilename('dispatch-analytics')}.xlsx` };
}

/* ── window hooks (read the model the dashboard publishes) ─────────────────── */

if (typeof window !== 'undefined') {
  window.exportDispatchAnalyticsPdf = (meta = {}) => {
    const m = window._lastDispatchAnalyticsModel;
    if (!m) throw new Error('Buka tab Dispatch Analytics dulu agar model tersedia.');
    // v1.17.1 — bundle the Recommendation Accuracy section when its model is live.
    return exportDispatchAnalyticsPdf(m, { ...(window._dispatchAnalyticsMeta || {}), ...meta }, window._lastRecommendationAccuracyModel || null);
  };
  window.exportDispatchAnalyticsExcel = (meta = {}) => {
    const m = window._lastDispatchAnalyticsModel;
    if (!m) throw new Error('Buka tab Dispatch Analytics dulu agar model tersedia.');
    return exportDispatchAnalyticsExcel(m, { ...(window._dispatchAnalyticsMeta || {}), ...meta }, window._lastRecommendationAccuracyModel || null);
  };
}
