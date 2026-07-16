/* ============================================================
   OVERTIME-TEMPLATE.JS (template) — canonical administrative layout
   (UX Refinement — replaces Sprint 8's generic KPI-card report;
   Production Polish pass — table/footer/total styling only, no
   structural change to the two-section layout)

   Pure presentation: receives an OvertimeReportModel (built by
   overtime-report-model.js from svc.getReportSnapshot()) and returns a
   pdfmake DocumentDefinition matching the org's real payroll spreadsheet
   EXACTLY — two pages:
     Page 1 "DATA PENGAJUAN LEMBUR TIM/KARYAWAN SARPRAS PBSI PERIODE [x]"
       — date-grouped detail table (Tanggal → Unit → Employee displayOrder,
         sorted upstream by overtime-service.js#buildDetailRecords), merged
         date/subtotal cells (rowSpan, vertically centered), grand total row.
     Page 2 "Rekapitulasi Lembur Staf Sarpras Periode [x]"
       — alphabetical per-employee recap, Total Keseluruhan row.
   Still the DEFAULT (pdfmake) backend, not puppeteer — unchanged reasoning
   from Sprint 8 (no functions/ deploy needed for tables+text). "Print" is
   inherited for free from document-viewer.js's "Cetak" button.
   ============================================================ */

'use strict';

import { register } from '../../docs/template-registry.js';
import {
  docHeader, headerRule, tableLayout,
  A4_MARGINS, TOKENS,
} from '../../docs/doc-theme.js';
import { APP_VERSION } from '../../config.js';

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
      th: { fontSize: 7, bold: true, color: TOKENS.color.dim, fillColor: TOKENS.color.fill, alignment: 'center' },
      cell: { fontSize: 7.5 },
      // FIX 6 + FIX 16 + FIX 18 (Round 2 — "harus menjadi titik fokus
      // laporan, tanpa merusak estetika dokumen"): FIX 16's colored tint
      // ('#F7E6E8') read too close to an alert/error colour once actually
      // rendered (and had a real bug besides — the fillColor string was
      // missing its '#' prefix, which pdfmake silently fell back to solid
      // BLACK for, not the intended tint). Grand Total now uses the exact
      // same neutral light fill the table HEADER already uses
      // (TOKENS.color.fill) — elegant, unmistakably "Sarpras Operations",
      // never reads as an error state. Prominence instead comes from the
      // heavier maroon top rule (_reportTableLayout below) and the bold,
      // slightly-larger accent-colored figure alone.
      totalRow: { fontSize: 9.5, bold: true, fillColor: TOKENS.color.fill, color: TOKENS.color.ink },
      totalAmount: { fontSize: 10.5, bold: true, fillColor: TOKENS.color.fill, color: TOKENS.color.accent, noWrap: true },
    },
    // FIX 15 (Round 2) — Periode/Filter/Versi/Dicetak are document
    // METADATA, not report content: moved from a content-flow block (FIX
    // 5's compact table, still eating page space) into a REAL pdfmake page
    // footer — pinned to the bottom margin of every page, repeating
    // automatically, never competing with the table for vertical room.
    footer: _overtimeFooter(d),

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
    ],
  };
}

/* FIX 15 — small, grey, tight-spaced document-metadata footer (NOT a
   content block): a "Periode/Filter/Dicetak" line above the standard
   "PBSI Operations Platform vX — Hal. N/M" line every other document in
   this codebase already uses (local to this template only — doc-theme.js's
   shared docFooter() is untouched, so no other document is affected). */
function _overtimeFooter(d) {
  const periode = (d.filters && d.filters.periodLabel) || '—';
  const filter = (d.filters && d.filters.scopeLabel) || '—';
  const cetak = d.generatedAt || '—';
  return (currentPage, pageCount) => ({
    margin: [48, 6, 48, 0],
    stack: [
      { text: `Periode: ${periode}  ·  Filter: ${filter}  ·  Dicetak: ${cetak}`,
        fontSize: 6.5, color: TOKENS.color.faint, margin: [0, 0, 0, 2] },
      { columns: [
        { text: `PBSI Operations Platform v${APP_VERSION} — Laporan Overtime`, fontSize: 6.5, color: TOKENS.color.faint },
        { text: `Hal. ${currentPage} / ${pageCount}`, fontSize: 6.5, color: TOKENS.color.faint, alignment: 'right' },
      ] },
    ],
  });
}

/* Header/footer/grand-total rows get a touch more breathing room than
   plain data rows (FIX 4 "tinggi header sedikit lebih proporsional", FIX 6
   grand total prominence) — a local wrapper over the shared tableLayout()
   token set so no other document's tables are affected. FIX 16 (Round 2)
   thickens the rule directly above the Grand Total row further (2pt,
   heavier than the header's own 1pt rules) so it visibly anchors the
   report's focal number even on a printed/scanned page. */
function _reportTableLayout() {
  const base = tableLayout();
  const isEdgeRow = (i, node) => i === 0 || i === node.table.body.length - 1;
  const isTotalRule = (i, node) => i === node.table.body.length - 1;
  return {
    ...base,
    paddingTop: (i, node) => (isEdgeRow(i, node) ? 6 : 3),
    paddingBottom: (i, node) => (isEdgeRow(i, node) ? 6 : 3),
    hLineWidth: (i, node) => (isTotalRule(i, node) ? 2 : (i === 0 || i === 1 ? 1 : 0.5)),
    hLineColor: (i, node) => (isTotalRule(i, node) ? TOKENS.color.accent : TOKENS.color.lineSoft),
  };
}

/* rowSpan cells (merged "Hari, Tanggal"/subtotal) render their text
   anchored to the FIRST spanned row by default — FIX 10 approximates true
   vertical centering by pushing the text down half the height of the rows
   it spans, so it lands in the middle of the merged cell instead of
   "menempel pada baris pertama". ROW_H is the data row's own rendered
   height (7.5pt cell font × 1.2 lineHeight + 3+3pt padding, rounded). */
const ROW_H = 15;
function _vCenterMargin(spanRows) {
  return [0, Math.max(0, ((spanRows - 1) * ROW_H) / 2), 0, 0];
}

/* ── Page 1: date-grouped detail, merged date/subtotal cells ──────── */
function _detailTable(groups, grandTotal, isEmpty) {
  if (isEmpty || !groups.length) {
    return { text: 'Tidak ada entri pada periode ini.', italics: true, color: TOKENS.color.dim, fontSize: 8.5, margin: [0, 0, 0, 6] };
  }

  const header = [
    { text: 'No', style: 'th' },
    { text: 'Hari, Tanggal', style: 'th' },
    { text: 'Nama', style: 'th' },
    { text: 'Unit', style: 'th' },
    { text: 'Rincian', style: 'th' },
    { text: 'Total', style: 'th' },
  ];
  const body = [header];

  groups.forEach(g => {
    g.rows.forEach((r, i) => {
      body.push([
        { text: String(r.no), style: 'cell', alignment: 'center' },
        i === 0 ? { text: g.dateLabel, style: 'cell', rowSpan: g.rows.length, alignment: 'left', margin: _vCenterMargin(g.rows.length) } : {},
        { text: r.employeeName, style: 'cell' },
        { text: r.unitName, style: 'cell' },
        { text: r.amount, style: 'cell', alignment: 'right', noWrap: true },
        i === 0 ? { text: g.subtotal, style: 'cell', rowSpan: g.rows.length, alignment: 'right', bold: true, noWrap: true, margin: _vCenterMargin(g.rows.length) } : {},
      ]);
    });
  });

  body.push([
    { text: 'TOTAL KESELURUHAN', style: 'totalRow', colSpan: 5, alignment: 'right' }, {}, {}, {}, {},
    { text: grandTotal, style: 'totalAmount', alignment: 'right', noWrap: true },
  ]);

  // FIX 18 — the Total column must be wide enough that a real payroll
  // figure ("Rp1.900.000" and up) never needs to wrap; widened from 65 to
  // 95, absorbed from the flexible Nama ('*') column (still plenty wide).
  return {
    table: { headerRows: 1, widths: [24, 90, '*', 70, 60, 95], body },
    layout: _reportTableLayout(),
    margin: [0, 0, 0, 8],
  };
}

/* ── Page 2: alphabetical recap, Total Keseluruhan row ─────────────── */
function _recapTable(rows, grandTotal, isEmpty) {
  if (isEmpty || !rows.length) {
    return { text: 'Tidak ada data karyawan pada periode ini.', italics: true, color: TOKENS.color.dim, fontSize: 8.5, margin: [0, 0, 0, 6] };
  }

  const header = [
    { text: 'No', style: 'th' },
    { text: 'Nama', style: 'th' },
    { text: 'Jumlah Hari', style: 'th' },
    { text: 'Jumlah Lemburan', style: 'th' },
    { text: 'Unit', style: 'th' },
  ];
  const body = [header];
  rows.forEach(r => {
    body.push([
      { text: String(r.no), style: 'cell', alignment: 'center' },
      { text: r.name, style: 'cell' },
      { text: String(r.days), style: 'cell', alignment: 'right' },
      { text: r.amount, style: 'cell', alignment: 'right', noWrap: true },
      { text: r.unitName, style: 'cell' },
    ]);
  });
  body.push([
    { text: 'Total Keseluruhan', style: 'totalRow', colSpan: 3, alignment: 'right' }, {}, {},
    { text: grandTotal, style: 'totalAmount', alignment: 'right', noWrap: true },
    {},
  ]);

  // FIX 18 — same no-wrap guarantee for the recap's "Jumlah Lemburan"
  // column, widened from 75 to 90.
  return {
    table: { headerRows: 1, widths: [24, '*', 55, 90, 80], body },
    layout: _reportTableLayout(),
    margin: [0, 0, 0, 8],
  };
}

/* ── Self-register ──────────────────────────────────────────── */
register('overtime-report', {
  build,
  // "Laporan Lembur {Scope} - {Periode}.pdf" (Production Polish FIX 3) —
  // computed once in overtime-report-model.js so PDF/Excel/CSV can never
  // drift onto different naming schemes.
  filename: (d) => (d.meta && d.meta.pdfFilename) || 'Laporan Lembur Sarpras.pdf',
  meta: { title: 'Laporan Overtime', label: 'Laporan Overtime Management' },
});
