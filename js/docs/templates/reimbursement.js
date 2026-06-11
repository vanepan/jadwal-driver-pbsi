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
  docHeader, headerRule, docFooter, tableLayout,
  A4_MARGINS, CONTENT_W, TOKENS,
} from '../doc-theme.js';

/* Receipt area height (pt). Conservative so the form never spills to
   a 2nd page, while remaining the largest section. Tunable after
   on-device page-count verification. */
const RECEIPT_H = 320;

const COL_GAP = 8;
const COL_L   = Math.round((CONTENT_W - COL_GAP) * 0.35);   // statement
const COL_R   = CONTENT_W - COL_GAP - COL_L;                // breakdown

function build(vm) {
  const d = vm || {};

  return {
    pageSize: 'A4',
    pageOrientation: 'portrait',
    pageMargins: A4_MARGINS,
    info: { title: `Form Reimbursement — ${d.driver || ''}`, author: 'Sarpras Operations' },
    defaultStyle: { fontSize: 8.5, color: TOKENS.color.ink, lineHeight: 1.2 },
    styles: {
      secLabel: { fontSize: 7.5, bold: true, color: TOKENS.color.dim, margin: [0, 7, 0, 3] },
      tdLbl:    { fontSize: 7, bold: true, color: TOKENS.color.dim, fillColor: TOKENS.color.fill },
    },
    footer: docFooter({ label: 'Form Reimbursement Perjalanan Dinas' }),

    content: [
      docHeader({
        docNumber: d.docNumber,
        reference: d.assignmentRef,
        printDate: d.printDate,
        org: 'Bidang Sarana dan Prasarana',
        orgSub: 'PBSI — Persatuan Bulu Tangkis Seluruh Indonesia',
      }),
      headerRule(),

      { text: 'FORM REIMBURSEMENT PERJALANAN DINAS', fontSize: 13, bold: true,
        alignment: 'center', characterSpacing: 0.5 },
      { text: 'Formulir Pengajuan Penggantian Biaya Operasional Kendaraan',
        fontSize: 8, color: TOKENS.color.dim, alignment: 'center', margin: [0, 2, 0, 4] },

      { text: 'A. Informasi Perjalanan', style: 'secLabel' },
      _sectionA(d),

      { text: 'B. Data Odometer & Status Lembur', style: 'secLabel' },
      _sectionB(d),

      { text: 'C. Pengajuan Reimbursement', style: 'secLabel' },
      _sectionC(d),

      { text: 'D. Lampiran Bukti Pengeluaran', style: 'secLabel' },
      { text: 'Tempel bukti fisik pada area di bawah ini',
        fontSize: 7, color: TOKENS.color.dim, margin: [0, 0, 0, 3] },
      _receiptBox(RECEIPT_H),
    ],
  };
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
    layout: tableLayout(),
    margin: [0, 0, 0, 2],
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
    layout: tableLayout(),
    margin: [0, 0, 0, 2],
  };
}

/* ── Section C: 35% statement+signature | 65% breakdown ─────── */
function _sectionC(d) {
  return {
    columns: [
      { width: COL_L, ...box(_statement(d)) },
      { width: COL_R, ...box(_breakdown()) },
    ],
    columnGap: COL_GAP,
    margin: [0, 0, 0, 2],
  };
}

function _statement(d) {
  const inner = COL_L - 16; // box horizontal padding
  return {
    stack: [
      { text: 'PERNYATAAN DRIVER', fontSize: 6.5, bold: true, color: TOKENS.color.dim, margin: [0, 0, 0, 3] },
      { text: 'Dengan ini saya menyatakan bahwa data perjalanan dinas yang tercantum di atas adalah benar dan biaya yang diajukan sesuai dengan bukti pengeluaran yang disertakan.',
        fontSize: 7, color: '#3A3835', lineHeight: 1.4 },
      { text: `Jakarta, ${d.printDate || '—'}`, fontSize: 6.5, color: TOKENS.color.dim, margin: [0, 16, 0, 0] },
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: inner, y2: 0, lineWidth: 1, lineColor: TOKENS.color.ink }], margin: [0, 22, 0, 0] },
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
      { text: 'RINCIAN BIAYA', fontSize: 6.5, bold: true, color: TOKENS.color.dim, margin: [0, 0, 0, 4] },
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
        layout: tableLayout(),
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

/* ── Bordered box helper (mirrors the legacy card borders) ──── */
const BOX_LAYOUT = {
  hLineWidth: () => 1, vLineWidth: () => 1,
  hLineColor: () => TOKENS.color.line, vLineColor: () => TOKENS.color.line,
  paddingLeft: () => 8, paddingRight: () => 8, paddingTop: () => 6, paddingBottom: () => 6,
};
function box(content) {
  return { table: { widths: ['*'], body: [[content]] }, layout: BOX_LAYOUT };
}

/* ── Self-register ──────────────────────────────────────────── */
register('reimbursement', {
  build,
  filename: (d) => {
    const safe = s => String(s || '').replace(/[^a-z0-9]/gi, '-').replace(/-+/g, '-').toLowerCase();
    const date = (d.rawDate || '').replace(/-/g, '');
    return `Form-Reimbursement-${safe(d.driver)}-${date}.pdf`;
  },
  meta: { title: 'Form Reimbursement', label: 'Form Reimbursement Perjalanan Dinas' },
});
