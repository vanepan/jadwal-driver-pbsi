/* ============================================================
   TEST-REPORT.JS — Phase 1.5 Proof-of-Concept template

   Exercises every primitive the real reports need:
     · org header + meta + version footer with page numbers
     · centered title / subtitle
     · key/value info table (Section A pattern)
     · data table with header + TOTAL row (breakdown pattern)
     · fixed-height dashed box drawn via canvas (receipt-area pattern)

   Deterministic by construction: given identical input data, the
   pdfmake layout engine produces identical output on every device.
   The POC harness feeds FIXED sample data so cross-platform PDFs
   can be compared directly.
   ============================================================ */

'use strict';

import { register } from '../template-registry.js';
import {
  docHeader, headerRule, docFooter, tableLayout,
  BASE_STYLES, DEFAULT_STYLE, A4_MARGINS, CONTENT_W, TOKENS,
} from '../doc-theme.js';

function build(data) {
  const d = data || {};

  return {
    pageSize: 'A4',
    pageOrientation: 'portrait',
    pageMargins: A4_MARGINS,
    info: { title: 'Test Report', author: 'Sarpras Operations' },
    defaultStyle: DEFAULT_STYLE,
    styles: BASE_STYLES,
    footer: docFooter({ label: 'Test Report (POC)' }),

    content: [
      docHeader({ docNumber: d.docNumber, reference: d.reference, printDate: d.printDate }),
      headerRule(),

      { text: 'DOCUMENT FRAMEWORK — TEST REPORT', style: 'title' },
      { text: 'Proof-of-Concept · Deterministic A4 Rendering', style: 'subtitle', margin: [0, 2, 0, 6] },

      { text: 'A. Informasi', style: 'secLabel' },
      _kvTable([
        ['Nama',    d.name],
        ['Tanggal', d.date],
        ['Unit',    d.unit],
        ['Status',  d.status],
      ]),

      { text: 'B. Rincian Biaya', style: 'secLabel' },
      _dataTable(d.rows || [], d.total),

      { text: 'C. Area Lampiran', style: 'secLabel' },
      _attachBox(170),
    ],
  };
}

/* ── Section builders ───────────────────────────────────────── */

function _kvTable(pairs) {
  return {
    table: {
      widths: [110, '*'],
      body: pairs.map(([k, v]) => ([
        { text: k, fillColor: TOKENS.color.fill, bold: true, fontSize: 7.5, color: TOKENS.color.dim },
        { text: v ?? '—', fontSize: 8.5 },
      ])),
    },
    layout: tableLayout(),
    margin: [0, 0, 0, 4],
  };
}

function _dataTable(rows, total) {
  const body = [[
    { text: 'Keterangan', style: 'th' },
    { text: 'Jumlah (Rp)', style: 'th', alignment: 'right' },
  ]];

  rows.forEach(r => body.push([
    { text: r.label, fontSize: 8.5 },
    { text: r.amount ?? '—', fontSize: 8.5, alignment: 'right' },
  ]));

  body.push([
    { text: 'TOTAL', bold: true, fillColor: TOKENS.color.fill },
    { text: total ?? '—', bold: true, alignment: 'right', fillColor: TOKENS.color.fill },
  ]);

  return {
    table: { widths: ['*', 130], body },
    layout: tableLayout(),
    margin: [0, 0, 0, 4],
  };
}

/** Fixed-height dashed rectangle with a centred ghost label. */
function _attachBox(height) {
  return {
    stack: [
      { canvas: [{ type: 'rect', x: 0, y: 0, w: CONTENT_W, h: height, r: 4,
                   dash: { length: 4 }, lineWidth: 1.5, lineColor: TOKENS.color.line }] },
      { text: 'Lampirkan Bukti Pengeluaran di Area Ini',
        color: TOKENS.color.ghost, fontSize: 8, alignment: 'center',
        margin: [0, -(height / 2) - 6, 0, 0] },
    ],
  };
}

/* ── Self-register ──────────────────────────────────────────── */

register('test-report', {
  build,
  filename: (d) => `Test-Report-${(d && d.id) || 'sample'}.pdf`,
  meta: { title: 'Test Report', label: 'Test Report (POC)' },
});
