/* ============================================================
   ANALYTICS-SUMMARY.JS (template) — second production document

   Executive Analytics Summary report. Pure presentation: receives a
   prepared view model (snapshotted from the live analytics compute
   in app.js, so the PDF matches exactly what is on screen) and
   returns a pdfmake DocumentDefinition.

   No charts, no images, no canvas — text + tables only, A4 portrait,
   deterministic across all platforms via the Document Engine.

   Sections:
     1 Operational Summary   2 Driver Analytics   3 Vehicle Analytics
     4 Bidang Analytics      5 Filter Snapshot    6 Report Metadata
   ============================================================ */

'use strict';

import { register } from '../template-registry.js';
import {
  docHeader, headerRule, docFooter, tableLayout,
  A4_MARGINS, CONTENT_W, TOKENS,
} from '../doc-theme.js';

const TOP_N = 5;   // executive summary: cap long lists, note the remainder

function build(vm) {
  const d = vm || {};

  return {
    pageSize: 'A4',
    pageOrientation: 'portrait',
    pageMargins: A4_MARGINS,
    info: { title: 'Laporan Analytics Operasional', author: 'Sarpras Operations' },
    defaultStyle: { fontSize: 8.5, color: TOKENS.color.ink, lineHeight: 1.2 },
    styles: {
      secLabel: { fontSize: 8, bold: true, color: TOKENS.color.dim, margin: [0, 5, 0, 3] },
      th:       { fontSize: 7, bold: true, color: TOKENS.color.dim, fillColor: TOKENS.color.fill },
      kpiNum:   { fontSize: 17, bold: true, color: TOKENS.color.ink },
      kpiLbl:   { fontSize: 7, color: TOKENS.color.dim },
    },
    footer: docFooter({ label: 'Laporan Analytics Operasional' }),

    content: [
      docHeader({
        docNumber: null,
        reference: null,
        printDate: d.generatedAt,
        org: 'Bidang Sarana dan Prasarana',
        orgSub: 'PBSI — Persatuan Bulu Tangkis Seluruh Indonesia',
      }),
      headerRule(),

      { text: 'LAPORAN ANALYTICS OPERASIONAL', fontSize: 13, bold: true,
        alignment: 'center', characterSpacing: 0.5 },
      { text: 'Ringkasan Kinerja Operasional Kendaraan & Driver',
        fontSize: 8, color: TOKENS.color.dim, alignment: 'center', margin: [0, 2, 0, 2] },

      { text: '1. Ringkasan Operasional', style: 'secLabel' },
      _kpiRow(d),
      _cancellationCaption(d),

      { text: '2. Analitik Driver', style: 'secLabel' },
      _driverSection(d),

      { text: '3. Analitik Kendaraan', style: 'secLabel' },
      _vehicleSection(d),

      { text: '4. Analitik Bidang', style: 'secLabel' },
      _bidangSection(d),

      { text: '5. Filter Aktif', style: 'secLabel' },
      _filterSnapshot(d.filters || {}),

      { text: '6. Metadata Laporan', style: 'secLabel' },
      _metadata(d),
    ],
  };
}

/* ── Section 1: KPI row (4 cells) ───────────────────────────── */
function _kpiRow(d) {
  const cell = (num, lbl) => ({
    table: { widths: ['*'], body: [
      [{ text: String(num), style: 'kpiNum', alignment: 'center', margin: [0, 2, 0, 0] }],
      [{ text: lbl, style: 'kpiLbl', alignment: 'center', margin: [0, 0, 0, 2] }],
    ] },
    layout: _boxLayout(),
  });
  return {
    columns: [
      cell(`${d.compRate ?? 0}%`, 'Completion Rate'),
      cell(d.total ?? 0,          'Total Assignment'),
      cell(d.activeDrivers ?? 0,  'Driver Aktif'),
      cell(d.activeVehicles ?? 0, 'Kendaraan Aktif'),
    ],
    columnGap: 6,
    margin: [0, 0, 0, 2],
  };
}

/* ── Section 1b: Cancellation summary caption (v1.10.8) ─────────
   Cancelled assignments are shown but never inflate completion/utilization.
   Rate is over ALL assignments (operational + cancelled). */
function _cancellationCaption(d) {
  const cancelled = d.cancelled ?? 0;
  const total     = d.total ?? 0;            // operational total (excludes cancelled)
  const completed = d.completed ?? 0;
  const grand     = total + cancelled;
  const cancRate  = grand > 0 ? Math.round((cancelled / grand) * 100) : 0;
  const exec      = (completed + cancelled) > 0
    ? Math.round((completed / (completed + cancelled)) * 100) : 0;
  return _caption([
    ['Dibatalkan',          `${cancelled} penugasan`],
    ['Tingkat Pembatalan',  `${cancRate}%`],
    ['Selesai vs Batal',    `${exec}%`],
  ]);
}

/* ── Section 2: Driver analytics ────────────────────────────── */
function _driverSection(d) {
  const most  = d.mostActiveDriver;
  const least = d.leastActiveDriver;
  return {
    stack: [
      _caption([
        ['Paling aktif',  most  ? `${most.name} (${most.count} tugas)`   : '—'],
        ['Paling jarang', least ? `${least.name} (${least.count} tugas)` : '—'],
      ]),
      _countTable('Driver', d.driverCounts || []),
    ],
  };
}

/* ── Section 3: Vehicle analytics ───────────────────────────── */
function _vehicleSection(d) {
  const most = d.mostUsedVehicle;
  const idle = d.idleVehicles || [];
  return {
    stack: [
      _caption([
        ['Paling sering', most ? `${most.name} (${most.count} tugas)` : '—'],
        ['Idle', idle.length ? `${idle.length} unit — ${idle.slice(0, 10).join(', ')}${idle.length > 10 ? ', …' : ''}` : 'Tidak ada'],
      ]),
      _countTable('Kendaraan', d.vehicleCounts || []),
    ],
  };
}

/* ── Section 4: Bidang analytics ────────────────────────────── */
function _bidangSection(d) {
  const rows = d.bidang || [];
  const most = rows[0];
  const body = [[
    { text: 'Bidang', style: 'th' },
    { text: 'Permintaan', style: 'th', alignment: 'right' },
    { text: 'Assignment', style: 'th', alignment: 'right' },
  ]];
  if (rows.length === 0) {
    body.push([{ text: 'Tidak ada data bidang pada periode ini.', colSpan: 3, italics: true,
                 color: TOKENS.color.dim, fontSize: 8 }, {}, {}]);
  } else {
    rows.slice(0, TOP_N).forEach(b => body.push([
      { text: b.name, fontSize: 8 },
      { text: String(b.reqCount), fontSize: 8, alignment: 'right' },
      { text: String(b.asgCount), fontSize: 8, alignment: 'right' },
    ]));
  }
  return {
    stack: [
      _caption([['Paling aktif', most ? `${most.name} (${most.reqCount} permintaan)` : '—']]),
      { table: { widths: ['*', 80, 80], body }, layout: tableLayout(), margin: [0, 0, 0, 2] },
      rows.length > TOP_N
        ? { text: `+${rows.length - TOP_N} bidang lainnya`, fontSize: 7, color: TOKENS.color.dim }
        : {},
    ],
  };
}

/* ── Section 5: Filter snapshot ─────────────────────────────── */
function _filterSnapshot(f) {
  return _kvTable([
    ['Rentang Tanggal', f.dateRange],
    ['Filter Driver',   f.driver],
    ['Filter Kendaraan', f.vehicle],
    ['Filter Bidang',   f.bidang],
  ]);
}

/* ── Section 6: Metadata ────────────────────────────────────── */
function _metadata(d) {
  return _kvTable([
    ['Dibuat Pada',   d.generatedAt],
    ['Dibuat Oleh',   d.generatedBy],
    ['Versi Aplikasi', `v${d.appVersion || '—'}`],
  ]);
}

/* ── Shared builders ────────────────────────────────────────── */

/* Compact single-line "label: value · label: value" caption. */
function _caption(pairs) {
  const parts = [];
  pairs.forEach(([label, value], i) => {
    if (i) parts.push({ text: '    ·    ', color: TOKENS.color.ghost });
    parts.push({ text: `${label}: `, color: TOKENS.color.dim });
    parts.push({ text: value, bold: true, color: TOKENS.color.ink });
  });
  return { text: parts, fontSize: 8, margin: [0, 0, 0, 3] };
}

function _countTable(kind, counts) {
  if (!counts.length) {
    return { text: `Tidak ada ${kind.toLowerCase()} dengan tugas pada periode ini.`,
             italics: true, color: TOKENS.color.dim, fontSize: 8, margin: [0, 0, 0, 2] };
  }
  const shown = counts.slice(0, TOP_N);
  const body = [[
    { text: kind, style: 'th' },
    { text: 'Jumlah Tugas', style: 'th', alignment: 'right' },
  ]];
  shown.forEach(c => body.push([
    { text: c.name, fontSize: 8 },
    { text: String(c.count), fontSize: 8, alignment: 'right' },
  ]));
  const extra = counts.length > TOP_N
    ? { text: `+${counts.length - TOP_N} ${kind.toLowerCase()} lainnya`, fontSize: 7, color: TOKENS.color.dim, margin: [0, 2, 0, 0] }
    : {};
  return { stack: [
    { table: { widths: ['*', 90], body }, layout: tableLayout(), margin: [0, 0, 0, 0] },
    extra,
  ], margin: [0, 0, 0, 2] };
}

function _kvTable(pairs) {
  return {
    table: {
      widths: [130, '*'],
      body: pairs.map(([k, v]) => ([
        { text: k, fillColor: TOKENS.color.fill, bold: true, fontSize: 7.5, color: TOKENS.color.dim },
        { text: v ?? '—', fontSize: 8.5 },
      ])),
    },
    layout: tableLayout(),
    margin: [0, 0, 0, 2],
  };
}

const _BOX = {
  hLineWidth: () => 1, vLineWidth: () => 1,
  hLineColor: () => TOKENS.color.line, vLineColor: () => TOKENS.color.line,
  paddingLeft: () => 8, paddingRight: () => 8, paddingTop: () => 6, paddingBottom: () => 6,
};
function _boxLayout() { return _BOX; }
function box(content) {
  return { table: { widths: ['*'], body: [[content]] }, layout: _BOX };
}

/* ── Self-register ──────────────────────────────────────────── */
register('analytics-summary', {
  build,
  filename: (d) => {
    const safe = s => String(s || '').replace(/[^a-z0-9]/gi, '-').replace(/-+/g, '-').toLowerCase();
    const stamp = new Date().toISOString().slice(0, 10);
    return `Laporan-Analytics-${safe(d.filters?.dateRange) || 'periode'}-${stamp}.pdf`;
  },
  meta: { title: 'Laporan Analytics', label: 'Laporan Analytics Operasional' },
});
