/* ============================================================
   OVERTIME-TEMPLATE.JS (template) — canonical administrative layout
   (UX Refinement — replaces Sprint 8's generic KPI-card report)

   Pure presentation: receives an OvertimeReportModel (built by
   overtime-report-model.js from svc.getReportSnapshot()) and returns a
   pdfmake DocumentDefinition matching the org's real payroll spreadsheet
   EXACTLY — two pages:
     Page 1 "DATA PENGAJUAN LEMBUR TIM/KARYAWAN SARPRAS PBSI PERIODE [x]"
       — date-grouped detail table, merged date/subtotal cells (rowSpan),
         grand total row.
     Page 2 "Rekapitulasi Lembur Staf Sarpras Periode [x]"
       — alphabetical per-employee recap, Total Keseluruhan row.
   Still the DEFAULT (pdfmake) backend, not puppeteer — unchanged reasoning
   from Sprint 8 (no functions/ deploy needed for tables+text). "Print" is
   inherited for free from document-viewer.js's "Cetak" button.
   ============================================================ */

'use strict';

import { register } from '../../docs/template-registry.js';
import {
  docHeader, headerRule, docFooter, tableLayout,
  A4_MARGINS, TOKENS,
} from '../../docs/doc-theme.js';

function build(vm) {
  const d = vm || {};

  return {
    pageSize: 'A4',
    pageOrientation: 'portrait',
    pageMargins: A4_MARGINS,
    info: { title: 'Laporan Overtime', author: 'Sarpras Operations' },
    defaultStyle: { fontSize: 8.5, color: TOKENS.color.ink, lineHeight: 1.2 },
    styles: {
      secTitle: { fontSize: 11.5, bold: true, alignment: 'center', margin: [0, 4, 0, 8] },
      th: { fontSize: 7, bold: true, color: TOKENS.color.dim, fillColor: TOKENS.color.fill },
      cell: { fontSize: 7.5 },
      totalRow: { fontSize: 8, bold: true, fillColor: TOKENS.color.fill },
    },
    footer: docFooter({ label: 'Laporan Overtime' }),

    content: [
      docHeader({
        docNumber: null,
        reference: null,
        printDate: d.generatedAt,
        org: (d.meta && d.meta.org) || 'Bidang Sarana dan Prasarana',
        orgSub: (d.meta && d.meta.orgSub) || 'PBSI — Persatuan Bulu Tangkis Seluruh Indonesia',
      }),
      headerRule(),

      { text: (d.meta && d.meta.detailTitle) || 'DATA PENGAJUAN LEMBUR', style: 'secTitle' },
      _detailTable(d.dateGroups || [], d.detailGrandTotal || 'Rp0', d.detailIsEmpty),

      { text: (d.meta && d.meta.recapTitle) || 'Rekapitulasi Lembur', style: 'secTitle', pageBreak: 'before' },
      _recapTable(d.recapRows || [], d.recapGrandTotal || 'Rp0', d.recapIsEmpty),

      { text: 'Filter Snapshot', fontSize: 8, bold: true, color: TOKENS.color.dim, margin: [0, 10, 0, 4] },
      _kvTable([
        ['Periode', (d.filters && d.filters.periodLabel) || '—'],
        ['Rentang Tanggal', (d.filters && d.filters.dateRangeLabel) || '—'],
        ['Cakupan', (d.filters && d.filters.scopeLabel) || '—'],
      ]),

      { text: 'Metadata Laporan', fontSize: 8, bold: true, color: TOKENS.color.dim, margin: [0, 6, 0, 4] },
      _kvTable([
        ['Dibuat Pada', d.generatedAt],
        ['Dibuat Oleh', d.generatedBy],
        ['Versi Aplikasi', `v${d.appVersion || '—'}`],
      ]),
    ],
  };
}

/* ── Page 1: date-grouped detail, merged date/subtotal cells ──────── */
function _detailTable(groups, grandTotal, isEmpty) {
  if (isEmpty || !groups.length) {
    return { text: 'Tidak ada entri pada periode ini.', italics: true, color: TOKENS.color.dim, fontSize: 8.5, margin: [0, 0, 0, 6] };
  }

  const header = [
    { text: 'No', style: 'th', alignment: 'center' },
    { text: 'Hari, Tanggal', style: 'th' },
    { text: 'Nama', style: 'th' },
    { text: 'Bidang', style: 'th' },
    { text: 'Rincian', style: 'th', alignment: 'right' },
    { text: 'Total', style: 'th', alignment: 'right' },
  ];
  const body = [header];

  groups.forEach(g => {
    g.rows.forEach((r, i) => {
      body.push([
        { text: String(r.no), style: 'cell', alignment: 'center' },
        i === 0 ? { text: g.dateLabel, style: 'cell', rowSpan: g.rows.length, alignment: 'left' } : {},
        { text: r.employeeName, style: 'cell' },
        { text: r.unitName, style: 'cell' },
        { text: r.amount, style: 'cell', alignment: 'right' },
        i === 0 ? { text: g.subtotal, style: 'cell', rowSpan: g.rows.length, alignment: 'right', bold: true } : {},
      ]);
    });
  });

  body.push([
    { text: 'TOTAL KESELURUHAN', style: 'totalRow', colSpan: 5, alignment: 'right' }, {}, {}, {}, {},
    { text: grandTotal, style: 'totalRow', alignment: 'right' },
  ]);

  return {
    table: { headerRows: 1, widths: [24, 90, '*', 70, 60, 65], body },
    layout: tableLayout(),
    margin: [0, 0, 0, 8],
  };
}

/* ── Page 2: alphabetical recap, Total Keseluruhan row ─────────────── */
function _recapTable(rows, grandTotal, isEmpty) {
  if (isEmpty || !rows.length) {
    return { text: 'Tidak ada data karyawan pada periode ini.', italics: true, color: TOKENS.color.dim, fontSize: 8.5, margin: [0, 0, 0, 6] };
  }

  const header = [
    { text: 'No', style: 'th', alignment: 'center' },
    { text: 'Nama', style: 'th' },
    { text: 'Jumlah Hari', style: 'th', alignment: 'right' },
    { text: 'Jumlah Lemburan', style: 'th', alignment: 'right' },
    { text: 'Bidang', style: 'th' },
  ];
  const body = [header];
  rows.forEach(r => {
    body.push([
      { text: String(r.no), style: 'cell', alignment: 'center' },
      { text: r.name, style: 'cell' },
      { text: String(r.days), style: 'cell', alignment: 'right' },
      { text: r.amount, style: 'cell', alignment: 'right' },
      { text: r.unitName, style: 'cell' },
    ]);
  });
  body.push([
    { text: 'Total Keseluruhan', style: 'totalRow', colSpan: 3, alignment: 'right' }, {}, {},
    { text: grandTotal, style: 'totalRow', alignment: 'right' },
    {},
  ]);

  return {
    table: { headerRows: 1, widths: [24, '*', 55, 75, 80], body },
    layout: tableLayout(),
    margin: [0, 0, 0, 8],
  };
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

/* ── Self-register ──────────────────────────────────────────── */
register('overtime-report', {
  build,
  filename: (d) => {
    const safe = s => String(s || '').replace(/[^a-z0-9]/gi, '-').replace(/-+/g, '-').toLowerCase();
    const stamp = new Date().toISOString().slice(0, 10);
    return `Laporan-Overtime-${safe(d.filters?.periodLabel) || 'periode'}-${stamp}.pdf`;
  },
  meta: { title: 'Laporan Overtime', label: 'Laporan Overtime Management' },
});
