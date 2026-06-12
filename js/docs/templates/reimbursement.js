/* ============================================================
   REIMBURSEMENT.JS (template) — first production document

   Pure presentation: receives a prepared view model and returns
   a pdfmake DocumentDefinition. All domain logic (overtime calc,
   plate lookup, sequential doc number, date formatting) lives in
   js/reimbursement.js and is passed in via the view model.

   Layout mirrors the legacy A4 form:
     Header · Title · A. Informasi · B. Odometer/Lembur ·
     C. Pengajuan (statement+signature | breakdown) ·
     D. Lampiran (dominant dashed receipt area) · Footer
   ============================================================ */

'use strict';

import { register } from '../template-registry.js';
import {
  tableLayout,
  A4_MARGINS, CONTENT_W, TOKENS,
} from '../doc-theme.js';
import { APP_VERSION } from '../../config.js';
import { PBSI_LOGO_DATA_URI } from './reimbursement-logo.js';

/* Header logo display size (pt). Sized by WIDTH (the source is 180×197, so
   width 31 → height ≈ 34) which also sets the centre column width — sizing an
   image by height under an 'auto' column makes pdfmake throw "unsupported
   number: auto". 34pt ≈ the left org text block, so the mark stays balanced. */
const LOGO_W = 31;

/* Receipt area height (pt). Re-measured (headless Chrome + production pdfmake)
   after the density-optimization pass tightened section margins, table cell
   padding (3→2pt), the bordered-box padding (6→4pt) and the signing area
   (60→40pt). A4 usable content height = 773.89pt. With worst-case field values
   (long purpose + destination + driver + requester) the single-page threshold
   rose from 298pt to 356pt (358pt spills to page 2) — ≈58pt reclaimed and
   allocated entirely here. Set to 346pt: 10pt of headroom under that worst-case
   threshold, ≈45% of usable page height. Largest section on the page.
   Overridable via vm.receiptH. */
const RECEIPT_H = 346;

/* Signature column width (≈30%); the cost-table cell takes the rest ('*'). */
const COL_L = Math.round((CONTENT_W - 8) * 0.30);

/* Empty signing gap above the signature line (pt). Tuned so the signature
   cluster (line · name · role) sits ≈centred in the box once it stretches to
   the cost-table height — kept just under that height so the breakdown still
   governs the row (no gap under TOTAL). Measured: the signature cell equals the
   breakdown height at gap ≈75; 70 leaves it a hair shorter so the breakdown
   still governs while the cluster sits ≈centred. Overridable via vm.signGap. */
const SIGN_GAP = 70;

function build(vm) {
  const d = vm || {};

  return {
    pageSize: 'A4',
    pageOrientation: 'portrait',
    pageMargins: A4_MARGINS,
    info: { title: `Form Reimbursement — ${d.driver || ''}`, author: 'Sarpras Operations' },
    defaultStyle: { fontSize: 8.5, color: TOKENS.color.ink, lineHeight: 1.2 },
    styles: {
      secLabel: { fontSize: 7.5, bold: true, color: TOKENS.color.dim, margin: [0, 4, 0, 2] },
      tdLbl:    { fontSize: 7, bold: true, color: TOKENS.color.dim, fillColor: TOKENS.color.fill },
    },
    /* Custom two-line footer (template-local; the shared docFooter is single
       line and used by other documents). Left: document name over platform
       version; right: page number. Both short → no wrap, no overflow. */
    footer: (currentPage, pageCount) => ({
      margin: [48, 8, 48, 0],
      columns: [
        { width: '*', stack: [
          { text: 'Form Reimbursement Kendaraan Operasional dan Driver',
            fontSize: 6.5, color: TOKENS.color.faint },
          { text: `PBSI Operations Platform v${APP_VERSION}`,
            fontSize: 6.5, color: TOKENS.color.faint, margin: [0, 1, 0, 0] },
        ] },
        { width: 'auto', text: `Hal. ${currentPage} / ${pageCount}`,
          fontSize: 6.5, color: TOKENS.color.faint, alignment: 'right' },
      ],
    }),

    content: [
      _header(d),
      // Compact header rule (inlined from the 8pt-margin shared helper to
      // tighten the header → title gap during the density pass).
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: CONTENT_W, y2: 0, lineWidth: 1.5, lineColor: TOKENS.color.ink }],
        margin: [0, 0, 0, 5] },

      { text: 'FORM REIMBURSEMENT KENDARAAN OPERASIONAL DAN DRIVER', fontSize: 13, bold: true,
        alignment: 'center', characterSpacing: 0.5 },
      { text: 'Formulir Pengajuan Penggantian Biaya Operasional Kendaraan',
        fontSize: 8, color: TOKENS.color.dim, alignment: 'center', margin: [0, 1, 0, 2] },

      { text: 'A. Informasi Perjalanan', style: 'secLabel' },
      _sectionA(d),

      { text: 'B. Data Odometer & Status Lembur', style: 'secLabel' },
      _sectionB(d),

      { text: 'C. Pengajuan Reimbursement', style: 'secLabel' },
      _sectionC(d),

      { text: 'D. Lampiran Bukti Pengeluaran', style: 'secLabel' },
      { text: 'Tempel bukti fisik pada area di bawah ini',
        fontSize: 7, color: TOKENS.color.dim, margin: [0, 0, 0, 2] },
      _receiptBox(d.receiptH || RECEIPT_H),
    ],
  };
}

/* ── Header: org (left) · PBSI logo (center) · meta (right) ──── */
function _header(d) {
  const meta = [];
  if (d.docNumber)     meta.push(_metaLine('No. Dokumen: ', d.docNumber, 0));
  if (d.assignmentRef) meta.push(_metaLine('Referensi: ', d.assignmentRef, 2));
  meta.push(_metaLine('Tanggal Cetak: ', d.printDate || '—', 2));

  return {
    columns: [
      { width: '*', stack: [
        { text: 'Bidang Sarana dan Prasarana', bold: true, fontSize: 11 },
        { text: 'PBSI — Persatuan Bulu Tangkis Seluruh Indonesia',
          fontSize: 7.5, color: TOKENS.color.dim, margin: [0, 1, 0, 0] },
      ] },
      // Negative top margin lifts the mark ≈4pt so it aligns with the first
      // org line ("Bidang Sarana dan Prasarana") rather than the block centre.
      { image: PBSI_LOGO_DATA_URI, width: LOGO_W, margin: [0, -4, 0, 0] },
      { width: '*', stack: meta },
    ],
    columnGap: 10,
    margin: [0, 0, 0, 4],
  };
}

function _metaLine(label, value, topMargin) {
  return {
    text: [{ text: label, color: TOKENS.color.dim }, { text: value, bold: true }],
    fontSize: 7.5, alignment: 'right', margin: [0, topMargin, 0, 0],
  };
}

/* Local density variant of the shared tableLayout: identical thin-line styling
   and horizontal padding, but tighter vertical cell padding (3→2pt per side) to
   reclaim row height across Sections A/B and the cost table. Defined here so the
   shared tableLayout() (used by other documents) is left untouched. */
function denseTableLayout() {
  return { ...tableLayout(), paddingTop: () => 2, paddingBottom: () => 2 };
}

/* ── Section A: trip info (4-column key/value grid) ──────────── */
function _sectionA(d) {
  const lbl = t => ({ text: t, style: 'tdLbl' });
  const val = t => ({ text: t ?? '—', fontSize: 8.5, bold: true });
  const purpose = d.destination
    ? { text: [{ text: d.purpose || '—', bold: true }, { text: `  —  ${d.destination}`, color: TOKENS.color.dim }], fontSize: 8.5 }
    : val(d.purpose);

  return {
    table: {
      widths: [80, '*', 80, '*'],
      body: [
        [lbl('Nama Driver'), val(d.driver), lbl(d.requesterLabel || 'PIC'), val(d.requesterValue)],
        [lbl('Keperluan'), { ...purpose, colSpan: 3 }, {}, {}],
        [lbl('Tanggal'), val(d.dateStr), lbl('Unit Kendaraan'), val(d.vehicle)],
        [lbl('Jam Berangkat'), _timeVal(d.startT, d.fullDay), lbl('Nomor Polisi'), val(d.vehiclePlate)],
        [lbl('Jam Kembali'), _timeVal(d.endT, d.fullDay), lbl('Jumlah Penumpang'), val(`${d.pax ?? 0} pax`)],
      ],
    },
    layout: denseTableLayout(),
    margin: [0, 0, 0, 1],
  };
}

function _timeVal(t, fullDay) {
  const parts = [{ text: t ?? '—', bold: true }];
  if (fullDay) parts.push({ text: '  (Penuh Hari)', color: TOKENS.color.dim, bold: false });
  return { text: parts, fontSize: 8.5 };
}

/* ── Section B: odometer + overtime ─────────────────────────── */
function _sectionB(d) {
  const lbl = t => ({ text: t, style: 'tdLbl' });
  const val = t => ({ text: t ?? '—', fontSize: 8.5, bold: true });
  const otColor = d.isOT ? TOKENS.color.accent : '#2F7D62';

  return {
    table: {
      widths: [80, '*', 80, '*'],
      body: [
        [lbl('KM Awal'), val(d.startOdo), lbl('KM Akhir'), val(d.endOdo)],
        [lbl('Total Jarak'), val(d.distance), lbl('Status Lembur'),
          { stack: [
            { text: d.otLabel, bold: true, fontSize: 8.5, color: otColor },
            { text: d.otDesc, fontSize: 7, color: TOKENS.color.dim, margin: [0, 1, 0, 0] },
          ] }],
      ],
    },
    layout: denseTableLayout(),
    margin: [0, 0, 0, 1],
  };
}

/* ── Section C: signature (left) | cost breakdown (right) ─────
   Rendered as ONE table row (not independent columns) so both cells take the
   shared row height — the signature box border now matches the full height of
   the cost table, aligned top and bottom. */
function _sectionC(d) {
  return {
    table: {
      widths: [COL_L, '*'],
      body: [[ _statement(d), _breakdown() ]],
    },
    layout: BOX_LAYOUT,
    margin: [0, 0, 0, 1],
  };
}

/* Clean signature box: caption · signing space · signature line · name · role.
   Declaration paragraph and "Jakarta, [date]" line intentionally removed. */
function _statement(d) {
  const inner = COL_L - 16; // box horizontal padding
  const gap = d.signGap || SIGN_GAP;
  return {
    stack: [
      { text: 'TANDA TANGAN', fontSize: 6.5, bold: true, color: TOKENS.color.dim, margin: [0, 0, 0, 3] },
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: inner, y2: 0, lineWidth: 1, lineColor: TOKENS.color.ink }], margin: [0, gap, 0, 0] },
      { text: d.driver || '—', fontSize: 8.5, bold: true, alignment: 'center', margin: [0, 3, 0, 0] },
      { text: 'Driver Operasional', fontSize: 6.5, color: TOKENS.color.dim, alignment: 'center' },
    ],
  };
}

function _breakdown() {
  const row = (label) => ([
    { text: label, fontSize: 8.5 },
    { text: '', fontSize: 8.5 },
  ]);
  return {
    stack: [
      { text: 'RINCIAN BIAYA', fontSize: 6.5, bold: true, color: TOKENS.color.dim, margin: [0, 0, 0, 3] },
      {
        table: {
          widths: ['*', 110],
          body: [
            [{ text: 'Keterangan', style: 'tdLbl' }, { text: 'Jumlah (Rp)', style: 'tdLbl', alignment: 'right' }],
            row('BBM / Bensin'),
            row('Tol'),
            row('Parkir'),
            row('Lain-lain'),
            [{ text: 'TOTAL', bold: true, fillColor: TOKENS.color.fill },
             { text: '', bold: true, alignment: 'right', fillColor: TOKENS.color.fill }],
          ],
        },
        layout: denseTableLayout(),
      },
    ],
  };
}

/* ── Section D: dominant dashed receipt area ────────────────── */
function _receiptBox(height) {
  return {
    stack: [
      { canvas: [{ type: 'rect', x: 0, y: 0, w: CONTENT_W, h: height, r: 6,
                   dash: { length: 4 }, lineWidth: 1.5, lineColor: TOKENS.color.line }] },
      { text: 'Lampirkan Bukti Pengeluaran di Area Ini',
        color: TOKENS.color.ghost, fontSize: 8, alignment: 'center',
        margin: [0, -(height / 2) - 6, 0, 0] },
    ],
  };
}

/* ── Bordered box layout for the Section C table (mirrors legacy cards) ── */
const BOX_LAYOUT = {
  hLineWidth: () => 1, vLineWidth: () => 1,
  hLineColor: () => TOKENS.color.line, vLineColor: () => TOKENS.color.line,
  paddingLeft: () => 8, paddingRight: () => 8, paddingTop: () => 4, paddingBottom: () => 4,
};

/* ── Self-register ──────────────────────────────────────────── */
register('reimbursement', {
  build,
  filename: (d) => {
    const safe = s => String(s || '').replace(/[^a-z0-9]/gi, '-').replace(/-+/g, '-').toLowerCase();
    const date = (d.rawDate || '').replace(/-/g, '');
    return `Form-Reimbursement-${safe(d.driver)}-${date}.pdf`;
  },
  meta: { title: 'Form Reimbursement', label: 'Form Reimbursement Kendaraan Operasional dan Driver' },
});
