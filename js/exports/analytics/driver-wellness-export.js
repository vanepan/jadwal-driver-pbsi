/* ============================================================
   DRIVER-WELLNESS-EXPORT.JS — Driver Wellness Intelligence (v1.17.6)

   PDF + Excel export for the Driver Wellness dashboard. REUSES the platform
   export libraries — the pdfmake backend (js/docs/pdf-exporter.js) and
   xlsx-js-style (same loader as the other analytics exporters) — so no new
   exporter TYPE is introduced. It only PROJECTS the wellness model into a
   pdfmake docDefinition and an XLSX workbook; it computes nothing.

   The builders (buildDriverWellnessDocDefinition / buildDriverWellnessSheets)
   are PURE and node-testable. The *Blob functions wrap them with the lazy
   loaders; the window.* hooks read window._lastDriverWellnessModel (mirroring
   the Dispatch Analytics export hooks).
   ============================================================ */

'use strict';

import { getExporter } from '../../docs/pdf-exporter.js';

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

function na(v) { return v == null ? 'N/A' : String(Math.round(Number(v) || 0)); }
function fmtTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mo = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'][d.getMonth()];
  return `${dd} ${mo} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function safeFilename(base) { return `${base}-${new Date().toISOString().slice(0, 10)}`; }

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
 * Build the pdfmake docDefinition for the Driver Wellness report.
 * @param {Object} model output of computeDriverWellnessModel
 * @param {Object} [meta] { periodLabel, generatedBy, appVersion }
 * @returns {Object} pdfmake docDefinition
 */
export function buildDriverWellnessDocDefinition(model, meta = {}) {
  const m = model || {};
  const s = m.summary || {};
  const content = [];

  content.push({ text: 'Driver Wellness Intelligence', style: 'h1' });
  content.push({
    text: [
      meta.periodLabel ? `${meta.periodLabel} · ` : '',
      `${s.driverCount || 0} driver · jendela ${m.windowDays || 0} hari · `,
      `Dibuat ${fmtTime(m.generatedAt || new Date().toISOString())}`,
      meta.generatedBy ? ` · oleh ${meta.generatedBy}` : '',
    ].join(''),
    style: 'meta', margin: [0, 2, 0, 4],
  });

  // Feature 6 — Executive summary
  content.push(sectionHeader('Ringkasan Eksekutif'));
  content.push(simpleTable(['Metrik', 'Nilai'], [
    ['Rata-rata Skor Kesehatan', na(s.averageHealth)],
    ['Driver Sehat (≥70)', String(s.healthyDrivers || 0)],
    ['Perlu Perhatian', String(s.needsAttention || 0)],
    ['Kelelahan Tinggi', String(s.highFatigue || 0)],
    ['Risiko Burnout', String(s.burnoutRisk || 0)],
    ['Rata-rata Pemulihan', na(s.averageRecovery)],
    ['Rata-rata Capacity Health', na(s.averageCapacityHealth)],
  ], ['*', 120]));

  // Feature 11 — distributions
  const dist = (rows) => (rows || []).map((r) => [`${r.label}`, String(r.count)]);
  content.push(sectionHeader('Distribusi Kesehatan'));
  content.push(simpleTable(['Band', 'Jumlah'], dist(m.distributions && m.distributions.health), ['*', 80]));
  content.push(sectionHeader('Distribusi Kelelahan / Burnout'));
  content.push(simpleTable(['Kategori', 'Kelelahan', 'Burnout'],
    mergeRiskRows(m.distributions), ['*', 90, 90]));

  // Per-driver
  content.push(sectionHeader('Wellness per Driver'));
  content.push(simpleTable(
    ['Driver', 'Kesehatan', 'Kelelahan', 'Burnout', 'Cap.Health', 'Pemulihan', 'Jam'],
    (m.drivers || []).map((d) => [
      d.driverName, `${d.health.score} ${d.health.label}`, d.fatigue.label, d.burnout.label,
      String(d.capacityHealth.score), String(d.recovery.score), String(d.workingTime.hours),
    ]),
    ['*', 70, 50, 50, 45, 50, 35],
  ));

  // Feature 12 — trend
  content.push(sectionHeader('Tren Historis'));
  content.push(simpleTable(
    ['Rentang', 'Rata-rata Kesehatan', 'Rata-rata Pemulihan', 'Kelelahan Tinggi', 'Risiko Burnout'],
    (m.trend && m.trend.windows || []).map((w) => [w.label, na(w.averageHealth), na(w.averageRecovery), String(w.highFatigue), String(w.burnoutRisk)]),
    ['*', 90, 90, 70, 70],
  ));

  return {
    pageSize: 'A4',
    pageMargins: [34, 36, 34, 40],
    info: { title: 'Driver Wellness Intelligence' },
    content,
    styles: {
      h1: { fontSize: 16, bold: true, color: ACCENT },
      h2: { fontSize: 11, bold: true, color: '#222' },
      meta: { fontSize: 8, color: '#666' },
      th: { fontSize: 8, bold: true, color: '#444', fillColor: '#f4f4f6' },
      td: { fontSize: 8, color: '#222' },
    },
    defaultStyle: { fontSize: 9 },
    footer: (current, total) => ({ text: `Driver Wellness Intelligence · ${meta.appVersion || ''} · ${current}/${total}`, style: 'meta', alignment: 'center', margin: [0, 8, 0, 0] }),
  };
}

/** Align fatigue + burnout distribution rows by category position for the PDF. */
function mergeRiskRows(distributions) {
  const fat = (distributions && distributions.fatigue) || [];
  const burn = (distributions && distributions.burnout) || [];
  const max = Math.max(fat.length, burn.length);
  const rows = [];
  for (let i = 0; i < max; i++) {
    const f = fat[i]; const b = burn[i];
    rows.push([
      (f && f.label) || (b && b.label) || '—',
      f ? `${f.label}: ${f.count}` : '—',
      b ? `${b.label}: ${b.count}` : '—',
    ]);
  }
  return rows;
}

/* ── Excel workbook (pure sheet builder) ───────────────────────────────────── */

/**
 * Build the Driver Wellness workbook as an array of { name, aoa } sheets. Pure
 * (no XLSX dependency) so it is node-testable.
 * @param {Object} model
 * @returns {Array<{name:string, aoa:Array<Array<string|number>>}>}
 */
export function buildDriverWellnessSheets(model) {
  const m = model || {};
  const s = m.summary || {};
  const sheets = [];

  sheets.push({ name: 'Ringkasan', aoa: [
    ['Driver Wellness Intelligence'],
    ['Jumlah Driver', s.driverCount || 0],
    ['Jendela (hari)', m.windowDays || 0],
    ['Rata-rata Skor Kesehatan', s.averageHealth || 0],
    ['Driver Sehat (≥70)', s.healthyDrivers || 0],
    ['Perlu Perhatian', s.needsAttention || 0],
    ['Kelelahan Tinggi', s.highFatigue || 0],
    ['Risiko Burnout', s.burnoutRisk || 0],
    ['Rata-rata Pemulihan', s.averageRecovery || 0],
    ['Rata-rata Capacity Health', s.averageCapacityHealth || 0],
  ] });

  sheets.push({ name: 'Driver', aoa: [
    ['Driver', 'Skor Kesehatan', 'Band', 'Kelelahan', 'Indeks Kelelahan', 'Burnout', 'Indeks Burnout', 'Capacity Health', 'Utilisasi (%)', 'Pemulihan', 'Hari Beruntun', 'Jam Kerja', 'Tugas 30h'],
    ...(m.drivers || []).map((d) => [
      d.driverName, d.health.score, d.health.label, d.fatigue.label, d.fatigue.index,
      d.burnout.label, d.burnout.index, d.capacityHealth.score, d.capacityHealth.utilization,
      d.recovery.score, d.recovery.maxStreak, d.workingTime.hours, d.workingTime.last30,
    ]),
  ] });

  // One row per driver × component (Explainability — Feature 10/2).
  const compHeader = ['Driver', 'Komponen', 'Skor', 'Bobot (%)', 'Kontribusi'];
  const compRows = [];
  for (const d of (m.drivers || [])) {
    const byKey = new Map(d.explainability.map((c) => [c.key, c]));
    for (const c of d.components) {
      const ex = byKey.get(c.key);
      compRows.push([d.driverName, c.label, c.available ? c.score : 'N/A', ex ? ex.weightPct : '', ex ? ex.points : '']);
    }
  }
  sheets.push({ name: 'Komponen', aoa: [compHeader, ...compRows] });

  sheets.push({ name: 'Distribusi', aoa: [
    ['Kesehatan', 'Jumlah'],
    ...((m.distributions && m.distributions.health) || []).map((r) => [r.label, r.count]),
    [],
    ['Kelelahan', 'Jumlah'],
    ...((m.distributions && m.distributions.fatigue) || []).map((r) => [r.label, r.count]),
    [],
    ['Burnout', 'Jumlah'],
    ...((m.distributions && m.distributions.burnout) || []).map((r) => [r.label, r.count]),
    [],
    ['Capacity Health', 'Jumlah'],
    ...((m.distributions && m.distributions.capacity) || []).map((r) => [r.label, r.count]),
  ] });

  sheets.push({ name: 'Tren', aoa: [
    ['Rentang', 'Rata-rata Kesehatan', 'Rata-rata Pemulihan', 'Rata-rata Capacity Health', 'Kelelahan Tinggi', 'Risiko Burnout', 'Driver Sehat'],
    ...((m.trend && m.trend.windows) || []).map((w) => [w.label, w.averageHealth, w.averageRecovery, w.averageCapacityHealth, w.highFatigue, w.burnoutRisk, w.healthyDrivers]),
  ] });

  return sheets;
}

/* ── Blob wrappers (browser only) ──────────────────────────────────────────── */

export async function exportDriverWellnessPdf(model, meta = {}) {
  const docDef = buildDriverWellnessDocDefinition(model, meta);
  const blob = await getExporter('pdfmake').exportToPdf(docDef);
  return { blob, filename: `${safeFilename('driver-wellness')}.pdf` };
}

export async function exportDriverWellnessExcel(model, meta = {}) {
  const XLSX = await loadXLSX();
  const wb = XLSX.utils.book_new();
  for (const sheet of buildDriverWellnessSheets(model)) {
    const ws = XLSX.utils.aoa_to_sheet(sheet.aoa);
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31));
  }
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  return { blob, filename: `${safeFilename('driver-wellness')}.xlsx` };
}

/* ── window hooks (read the model the dashboard publishes) ──────────────────── */

if (typeof window !== 'undefined') {
  window.exportDriverWellnessPdf = (meta = {}) => {
    const m = window._lastDriverWellnessModel;
    if (!m) throw new Error('Buka tab Driver Wellness dulu agar model tersedia.');
    return exportDriverWellnessPdf(m, { ...(window._driverWellnessMeta || {}), ...meta });
  };
  window.exportDriverWellnessExcel = (meta = {}) => {
    const m = window._lastDriverWellnessModel;
    if (!m) throw new Error('Buka tab Driver Wellness dulu agar model tersedia.');
    return exportDriverWellnessExcel(m, { ...(window._driverWellnessMeta || {}), ...meta });
  };
}
