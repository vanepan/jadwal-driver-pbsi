/* ============================================================
   ANALYTICS-REPORT.JS (template) — chart-first Analytics PDF

   The second official implementation of the Document Design System
   (docs/DOCUMENT_DESIGN_SYSTEM.md) and the redesign of the analytics
   export: an executive, presentation-friendly report that prioritises
   KPI cards and charts over tables.

   Inherits the standard PBSI header, footer, branding, and visual
   language; defines an analytics-specific body. Charts are drawn as
   deterministic vector primitives (pdfmake canvas: rect for bars,
   filled polygons for pie slices) — no rasterised images, identical
   output on Desktop / Android / iPhone / PWA.

   Sections:
     1 Executive Summary (KPI)   2 Filter Snapshot
     3 Driver Analytics (bar)    4 Vehicle Analytics (pie≤6 / bar)
     5 Bidang Analytics (pie)    6 Completion Quality (KPI)
     7 Data Quality & Alias Resolution (secondary)

   View model is snapshotted in js/app.js (refreshAnalyticsDisplay +
   exportAnalyticsReport) so the PDF matches the screen exactly.
   ============================================================ */

'use strict';

import { register } from '../template-registry.js';
import {
  headerRule, tableLayout,
  A4_MARGINS, CONTENT_W, TOKENS,
} from '../doc-theme.js';
import { APP_VERSION } from '../../config.js';
import { PBSI_LOGO_DATA_URI } from './reimbursement-logo.js';

/* Standard PBSI mark size — same width/elevation philosophy as the approved
   reimbursement header (source 180×197 → width 31 ≈ 34pt tall). */
const LOGO_W = 31;

/* Restrained, grayscale-safe palette. PBSI Red leads (largest series/slice);
   the rest are muted neutrals. Ordering carries meaning even without color. */
const PALETTE = ['#A8292F', '#5A6B7B', '#7C8A74', '#C9A66B', '#8E7A8C', '#6B8E8A', '#9A958C'];

const TOP_BARS  = 8;    // bar charts: cap to the most significant items
const PIE_MAX   = 6;    // pie charts: ≤6 slices, remainder folded into "Lainnya"
const BAR_TRACK = 330;  // fixed bar-track width (pt) so bars are proportional

function build(vm) {
  const d = vm || {};
  const driverCounts  = d.driverCounts  || [];
  const vehicleCounts = d.vehicleCounts || [];
  const bidang        = d.bidang        || [];
  const openRate = d.total > 0 ? Math.round(((d.openAsg || 0) / d.total) * 100) : 0;
  // Cancellation figures (v1.10.8) — rate over ALL assignments (operational + cancelled).
  const cancelled    = d.cancelled ?? 0;
  const grandTotal   = (d.total ?? 0) + cancelled;
  const cancRate     = grandTotal > 0 ? Math.round((cancelled / grandTotal) * 100) : 0;

  /* Section 4 chart selection: ≤6 vehicles → pie (composition reads well),
     >6 → bar (comparison across many items). */
  const vehicleByPie = vehicleCounts.length > 0 && vehicleCounts.length <= 6;

  return {
    pageSize: 'A4',
    pageOrientation: 'portrait',
    pageMargins: A4_MARGINS,
    info: { title: 'Analytics Summary Report', author: 'Sarpras Operations' },
    defaultStyle: { fontSize: 8.5, color: TOKENS.color.ink, lineHeight: 1.2 },
    styles: {
      secLabel: { fontSize: 9, bold: true, color: TOKENS.color.ink, margin: [0, 9, 0, 1] },
      th:       { fontSize: 7, bold: true, color: TOKENS.color.dim, fillColor: TOKENS.color.fill },
    },

    footer: (currentPage, pageCount) => ({
      margin: [48, 8, 48, 0],
      columns: [
        { width: '*', stack: [
          { text: 'Analytics Summary Report', fontSize: 6.5, color: TOKENS.color.faint },
          { text: `PBSI Operations Platform v${d.appVersion || APP_VERSION}`,
            fontSize: 6.5, color: TOKENS.color.faint, margin: [0, 1, 0, 0] },
        ] },
        { width: 'auto', text: `Hal. ${currentPage} / ${pageCount}`,
          fontSize: 6.5, color: TOKENS.color.faint, alignment: 'right' },
      ],
    }),

    content: [
      _header(d),
      headerRule(),

      { text: 'ANALYTICS SUMMARY REPORT', fontSize: 14, bold: true,
        alignment: 'center', characterSpacing: 0.5 },
      { text: 'Operational Analytics Report',
        fontSize: 8.5, color: TOKENS.color.dim, alignment: 'center', margin: [0, 2, 0, 2] },

      _section('1. Executive Summary', 'Indikator kinerja utama — pandangan eksekutif pertama.', [
        _kpiCards([
          { value: `${d.compRate ?? 0}%`, label: 'Completion Rate', accent: true },
          { value: d.total ?? 0,            label: 'Total Assignments' },
          { value: driverCounts.length,     label: 'Driver Bertugas' },
          { value: vehicleCounts.length,    label: 'Kendaraan Digunakan' },
        ]),
      ]),

      _section('2. Filter Snapshot', 'Cakupan data laporan ini.', [
        _filterSnapshot(d.filters || {}),
      ]),

      _section('3. Driver Analytics', 'Perbandingan beban kerja antar driver.', [
        _caption([
          ['Paling aktif',  d.mostActiveDriver  ? `${d.mostActiveDriver.name} (${d.mostActiveDriver.count})`   : '—'],
          ['Paling sedikit', d.leastActiveDriver ? `${d.leastActiveDriver.name} (${d.leastActiveDriver.count})` : '—'],
        ]),
        _barChart(driverCounts.map(x => ({ name: x.name, value: x.count }))),
      ]),

      _section('4. Vehicle Analytics',
        vehicleByPie ? 'Komposisi pemanfaatan kendaraan.' : 'Perbandingan pemanfaatan kendaraan.', [
        _caption([
          ['Paling sering', d.mostUsedVehicle ? `${d.mostUsedVehicle.name} (${d.mostUsedVehicle.count})` : '—'],
          ['Idle', (d.idleVehicles && d.idleVehicles.length)
            ? `${d.idleVehicles.length} unit — ${d.idleVehicles.slice(0, 8).join(', ')}${d.idleVehicles.length > 8 ? ', …' : ''}`
            : 'Tidak ada'],
        ]),
        vehicleByPie
          ? _pieChart(vehicleCounts.map(x => ({ name: x.name, value: x.count })))
          : _barChart(vehicleCounts.map(x => ({ name: x.name, value: x.count }))),
      ]),

      _section('5. Bidang Analytics', 'Komposisi permintaan operasional per bidang.', [
        _caption([
          ['Paling aktif', bidang[0] ? `${bidang[0].name} (${bidang[0].reqCount} permintaan)` : '—'],
        ]),
        _bidangPie(bidang),
      ]),

      _section('6. Completion Quality', 'Penyelesaian vs. penugasan terbuka & dibatalkan.', [
        _kpiCards([
          { value: `${d.compRate ?? 0}%`, label: 'Completion Rate', accent: true },
          { value: `${openRate}%`,         label: 'Open Rate' },
          { value: d.completed ?? 0,        label: 'Completed Assignments' },
          { value: d.openAsg ?? 0,          label: 'Open Assignments' },
        ]),
        _kpiCards([
          { value: cancelled,        label: 'Cancelled Assignments' },
          { value: `${cancRate}%`,   label: 'Cancellation Rate' },
        ]),
      ]),

      ..._dataQualitySection(d.dataQuality),
    ],
  };
}

/* Group a section's heading + goal + body into one unbreakable block, so a
   heading never orphans at a page bottom and a chart never splits across pages. */
function _section(title, goalText, body) {
  const stack = [{ text: title, style: 'secLabel' }];
  if (goalText) stack.push(_goal(goalText));
  (body || []).forEach(n => { if (n) stack.push(n); });
  return { stack, unbreakable: true, margin: [0, 0, 0, 2] };
}

/* ── Header: org (left) · PBSI logo (center) · analytics meta (right) ── */
function _header(d) {
  const meta = [
    _metaLine('Generated At: ', d.generatedAt),
    _metaLine('Generated By: ', d.generatedBy),
    _metaLine('Filter Period: ', d.filters?.dateRange),
    _metaLine('Report Type: ', 'Analytics Summary'),
  ];
  return {
    columns: [
      { width: '*', stack: [
        { text: 'Bidang Sarana dan Prasarana', bold: true, fontSize: 11 },
        { text: 'PBSI — Persatuan Bulu Tangkis Seluruh Indonesia',
          fontSize: 7.5, color: TOKENS.color.dim, margin: [0, 1, 0, 0] },
      ] },
      { image: PBSI_LOGO_DATA_URI, width: LOGO_W, margin: [0, -4, 0, 0] },
      { width: '*', stack: meta },
    ],
    columnGap: 10,
    margin: [0, 0, 0, 4],
  };
}

function _metaLine(label, value) {
  return {
    text: [{ text: label, color: TOKENS.color.dim }, { text: value || '—', bold: true }],
    fontSize: 7.5, alignment: 'right', margin: [0, 0, 0, 1],
  };
}

/* ── KPI cards row (executive headline numbers) ─────────────── */
function _kpiCards(cards) {
  const cell = (c) => ({
    table: { widths: ['*'], body: [
      [{ text: String(c.value), fontSize: 20, bold: true, alignment: 'center',
         color: c.accent ? TOKENS.color.accent : TOKENS.color.ink, margin: [0, 5, 0, 0] }],
      [{ text: c.label, fontSize: 7.5, color: TOKENS.color.dim, alignment: 'center', margin: [0, 1, 0, 5] }],
    ] },
    layout: CARD_LAYOUT,
  });
  return { columns: cards.map(cell), columnGap: 7, margin: [0, 3, 0, 2] };
}

/* ── Filter snapshot (4 inline label/value cells) ───────────── */
function _filterSnapshot(f) {
  const cell = (lbl, val) => ({
    stack: [
      { text: lbl, fontSize: 7, color: TOKENS.color.dim },
      { text: val || '—', fontSize: 8.5, bold: true, margin: [0, 1, 0, 0] },
    ],
  });
  return {
    table: { widths: ['*', '*', '*', '*'], body: [[
      cell('Rentang Tanggal', f.dateRange),
      cell('Driver', f.driver),
      cell('Kendaraan', f.vehicle),
      cell('Bidang', f.bidang),
    ]] },
    layout: CARD_LAYOUT,
    margin: [0, 3, 0, 2],
  };
}

/* ── Horizontal bar chart (name · proportional bar · value) ─── */
function _barChart(items) {
  const data = (items || []).filter(i => i.value > 0).sort((a, b) => b.value - a.value).slice(0, TOP_BARS);
  if (!data.length) return _empty('Tidak ada data untuk ditampilkan.');
  const max = data[0].value;
  const body = data.map((it, idx) => {
    const w = Math.max(2, Math.round((it.value / max) * BAR_TRACK));
    const color = idx === 0 ? TOKENS.color.accent : PALETTE[(idx % (PALETTE.length - 1)) + 1];
    return [
      { text: _trunc(it.name, 20), fontSize: 8, margin: [0, 2, 0, 0] },
      { canvas: [{ type: 'rect', x: 0, y: 2, w, h: 8, r: 2, color }] },
      { text: String(it.value), fontSize: 8, bold: true, alignment: 'right', margin: [0, 2, 0, 0] },
    ];
  });
  return {
    table: { widths: [112, BAR_TRACK, 26], body },
    layout: PLAIN_LAYOUT,
    margin: [0, 2, 0, 4],
  };
}

/* ── Pie chart (filled vector wedges) + legend ──────────────── */
function _pieChart(items) {
  let data = (items || []).filter(i => i.value > 0).sort((a, b) => b.value - a.value);
  if (!data.length) return _empty('Tidak ada data untuk ditampilkan.');
  if (data.length > PIE_MAX) {
    const head = data.slice(0, PIE_MAX);
    const rest = data.slice(PIE_MAX).reduce((s, i) => s + i.value, 0);
    data = rest > 0 ? [...head, { name: 'Lainnya', value: rest }] : head;
  }
  const total = data.reduce((s, i) => s + i.value, 0);
  const R = 52, cx = R, cy = R;
  const wedges = [];
  let ang = 0;
  data.forEach((s, idx) => {
    const a0 = ang, a1 = ang + (s.value / total) * 2 * Math.PI;
    ang = a1;
    const pts = [{ x: cx, y: cy }];
    const steps = Math.max(2, Math.ceil((a1 - a0) / (Math.PI / 18)));
    for (let k = 0; k <= steps; k++) {
      const t = a0 + ((a1 - a0) * k) / steps;
      pts.push({ x: cx + R * Math.sin(t), y: cy - R * Math.cos(t) });
    }
    wedges.push({ type: 'polyline', closePath: true, color: PALETTE[idx % PALETTE.length],
                  lineColor: '#FFFFFF', lineWidth: 1, points: pts });
  });
  const legend = data.map((s, idx) => ({
    columns: [
      { width: 12, canvas: [{ type: 'rect', x: 0, y: 1, w: 8, h: 8, r: 1.5, color: PALETTE[idx % PALETTE.length] }] },
      { width: '*', text: [
        { text: _trunc(s.name, 22), bold: true },
        { text: `  ${Math.round((s.value / total) * 100)}%  (${s.value})`, color: TOKENS.color.dim },
      ], fontSize: 8 },
    ],
    margin: [0, 0, 0, 4],
  }));
  return {
    columns: [
      { width: 2 * R + 4, canvas: wedges },
      { width: '*', stack: legend, margin: [10, 6, 0, 0] },
    ],
    columnGap: 8,
    margin: [0, 2, 0, 4],
  };
}

/* Bidang pie prefers request distribution; falls back to assignment counts. */
function _bidangPie(bidang) {
  const rows = bidang || [];
  const reqTotal = rows.reduce((s, b) => s + (b.reqCount || 0), 0);
  const items = reqTotal > 0
    ? rows.map(b => ({ name: b.name, value: b.reqCount || 0 }))
    : rows.map(b => ({ name: b.name, value: b.asgCount || 0 }));
  return _pieChart(items);
}

/* ── Section 7: Data Quality & Alias Resolution (secondary) ─── */
function _dataQualitySection(dq) {
  if (!dq) return [];
  const body = [
    _kpiCards([
      { value: dq.aliasCount ?? 0,       label: 'Alias Terdaftar' },
      { value: dq.warningsResolved ?? 0, label: 'Warning Teratasi' },
      { value: dq.warningsOpen ?? 0,     label: 'Warning Terbuka', accent: (dq.warningsOpen || 0) > 0 },
    ]),
  ];
  if (dq.aliases && dq.aliases.length) {
    const head = [[
      { text: 'Tipe', style: 'th' },
      { text: 'Nilai Kanonik', style: 'th' },
      { text: 'Pemakaian', style: 'th', alignment: 'right' },
    ]];
    const rows = dq.aliases.slice(0, 8).map(a => ([
      { text: a.type || '—', fontSize: 8 },
      { text: _trunc(a.canonical || '—', 40), fontSize: 8 },
      { text: a.usageCount != null ? String(a.usageCount) : '—', fontSize: 8, alignment: 'right' },
    ]));
    body.push({ table: { widths: [70, '*', 60], body: [...head, ...rows] },
                layout: tableLayout(), margin: [0, 2, 0, 2] });
  }
  return [_section('7. Data Quality & Alias Resolution',
                   'Konsistensi penamaan entitas pada periode ini.', body)];
}

/* ── Shared builders ────────────────────────────────────────── */
function _goal(text) {
  return { text, fontSize: 7.5, italics: true, color: TOKENS.color.faint, margin: [0, 0, 0, 3] };
}

function _caption(pairs) {
  const parts = [];
  pairs.forEach(([label, value], i) => {
    if (i) parts.push({ text: '    ·    ', color: TOKENS.color.ghost });
    parts.push({ text: `${label}: `, color: TOKENS.color.dim });
    parts.push({ text: value, bold: true, color: TOKENS.color.ink });
  });
  return { text: parts, fontSize: 8, margin: [0, 0, 0, 3] };
}

function _empty(msg) {
  return { text: msg, italics: true, color: TOKENS.color.dim, fontSize: 8, margin: [0, 2, 0, 4] };
}

function _trunc(s, n) {
  s = String(s ?? '—');
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/* Bordered KPI/filter card. */
const CARD_LAYOUT = {
  hLineWidth: () => 1, vLineWidth: () => 1,
  hLineColor: () => TOKENS.color.line, vLineColor: () => TOKENS.color.line,
  paddingLeft: () => 8, paddingRight: () => 8, paddingTop: () => 4, paddingBottom: () => 4,
};

/* Borderless layout for chart rows (let the bars carry the structure). */
const PLAIN_LAYOUT = {
  hLineWidth: () => 0, vLineWidth: () => 0,
  paddingLeft: () => 0, paddingRight: () => 4, paddingTop: () => 2, paddingBottom: () => 2,
};

/* ── Self-register ──────────────────────────────────────────── */
register('analytics-report', {
  build,
  filename: (d) => {
    const safe = s => String(s || '').replace(/[^a-z0-9]/gi, '-').replace(/-+/g, '-').toLowerCase();
    const stamp = new Date().toISOString().slice(0, 10);
    return `Analytics-Summary-Report-${safe(d.filters?.dateRange) || 'periode'}-${stamp}.pdf`;
  },
  meta: { title: 'Analytics Summary Report', label: 'Analytics Summary Report' },
});
