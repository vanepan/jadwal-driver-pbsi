/* ============================================================
   NOR.JS (template) — Nota Organisasi Realisasi Petty Cash

   Pure presentation: receives a prepared view model (built by
   js/petty-cash/nor-document-engine.js) and returns a pdfmake
   DocumentDefinition that reproduces the official PBSI NOR:

     Page 1 — NOTA ORGANISASI (cover memo)
       · centred PBSI mark + "NOTA ORGANISASI" (no underline)
       · Jakarta date + No. line (left)
       · Kepada Yth / Dari / Tembusan / Perihal / Lampiran block
       · balance recap + terbilang
       · 3-up signatory grid (left-aligned) + payer block

     Page 2 — RINCIAN PENGGUNAAN PETTY CASH
       · bordered No/Tanggal/Rincian/Biaya/Keterangan table
       · total row + balance recap + terbilang
       · 2-up recap signatory grid

   A4 portrait, ~10pt body. The default embedded sans (Roboto) is
   the closest available face to Arial in pdfmake's VFS; the on-
   screen NOR renders in actual Arial.
   ============================================================ */

'use strict';

import { register } from '../template-registry.js';
// Sprint 11.10 — orgLogo/signatureBlock/signatureGrid extracted FROM this
// file into doc-theme.js (the shared "universal renderer" primitives every
// template already imports CONTENT_W/etc. from); this file is now a
// consumer of its own former inline code, not a second copy of it.
import { CONTENT_W, orgLogo, signatureBlock } from '../doc-theme.js';
// Phase 12 Sprint 12.1 — the official PBSI NOR layout (page geometry,
// colours, rincian grid, column widths, heading sizes) is now declared in
// the Document Design System, not hardcoded here. `nor` v1 was seeded
// byte-for-byte FROM the constants this file used to own, so the printed
// PDF is pixel-identical; the numbers just live in one governed, versioned,
// explainable place now (a future Template Manager / Live Editor edits
// that, never this source file).
import { getDesignSystem, pageGeometry, tableGridLayout } from '../design-system/document-design-system.js';
import { APP_VERSION } from '../../config.js';

const NOR_DS = getDesignSystem('nor');
const INK = NOR_DS.color.ink;
const DIM = NOR_DS.color.dim;

/* Black 1pt grid for the rincian table (matches the official borders).
   Built from `nor` v1's `table` block — same 1pt ink borders / 4·2 padding. */
const GRID = tableGridLayout(NOR_DS);

/* Label : value block (Kepada Yth / Dari / …). Borderless. */
function _metaTable(d) {
  const recipients = (d.recipients || []).map((v, i) => `${i + 1}. ${v}`).join('\n');
  const cc = (d.cc || []).map((v, i) => `${i + 1}. ${v}`).join('\n');
  const row = (label, value, bold) => ([
    { text: label, fontSize: 10 },
    { text: ':', fontSize: 10 },
    { text: value, fontSize: 10, bold: !!bold },
  ]);
  return {
    table: {
      widths: NOR_DS.layout.metaWidths,
      body: [
        row('Kepada Yth.', recipients),
        row('Dari', d.senderTitle || ''),
        row('Tembusan Yth.', cc),
        row('Perihal', d.subject || '', true),
        row('Lampiran', '1 (satu) berkas'),
      ],
    },
    layout: 'noBorders',
    margin: [0, 0, 0, 8],
  };
}

/* Dana Awal / Terealisasi / Sisa recap (borderless, right-aligned values).
   `widths` is a 3-element column spec from the Document Design System
   (`nor` v1's layout.balanceWidthsPage1/2 — the recap block is a touch
   wider on page 2). */
function _balanceTable(d, widths) {
  const row = (label, value) => ([
    { text: label, fontSize: 10 },
    { text: ': Rp', fontSize: 10 },
    { text: value, fontSize: 10, alignment: 'right' },
  ]);
  return {
    table: {
      widths,
      body: [
        row(`Dana Awal (${d.danaAwalDate || '-'})`, d.openingDoc),
        row('Dana Terealisasi', d.realizedDoc),
        row('Sisa Dana', d.remainingDoc),
      ],
    },
    layout: 'noBorders',
    margin: [0, 0, 0, 6],
  };
}

function build(vm) {
  const d = vm || {};
  const top = d.letterTop || [];
  const bottom = d.letterBottom || [];
  const recap = d.recap || [];
  // The null-safety `_signBlock(undefined) -> {text:''}` used to provide
  // inline — signatureBlock() itself intentionally does not swallow a bad
  // call, so that guard stays here, at the one place this template calls
  // it with a possibly-missing array slot.
  const sb = (s, gap) => (s ? signatureBlock({ ...s, gap }) : { text: '' });

  /* Rincian cell — description plus an optional reimbursement breakdown. The
     breakdown is a clean indented detail inside the same cell: no new columns,
     no extra table, no borders. Only non-zero components reach the view model. */
  const rincianCell = (it) => {
    if (!it.reimburse || !it.reimburse.length) return { text: it.description, fontSize: 9 };
    return {
      stack: [
        { text: it.description, fontSize: 9 },
        ...it.reimburse.map(r => ({
          columns: [
            { text: r.label, fontSize: 7.5, color: DIM },
            { text: r.amountFmt, fontSize: 7.5, color: DIM, alignment: 'right' },
          ],
          columnGap: 6,
          margin: [10, 1, 0, 0],
        })),
      ],
    };
  };

  /* Rincian table body. */
  const itemRows = (d.items || []).map(it => ([
    { text: String(it.no), fontSize: 9, alignment: 'center' },
    { text: it.dateFmt, fontSize: 9, alignment: 'center' },
    rincianCell(it),
    { text: it.amountFmt, fontSize: 9, alignment: 'right' },
    { text: it.keterangan, fontSize: 9 },
  ]));
  const totalRow = [
    { text: 'Total Pengeluaran', colSpan: 3, fontSize: 9, bold: true, alignment: 'right' }, {}, {},
    { text: d.totalTable, fontSize: 9, bold: true, alignment: 'right' },
    { text: '', fontSize: 9 },
  ];

  return {
    ...pageGeometry(NOR_DS),
    info: { title: `Nota Organisasi — ${d.norNumber || ''}`, author: 'Sarpras Operations' },
    defaultStyle: NOR_DS.typography.default,
    // Page 1 (NOTA ORGANISASI) is a formal PBSI document — NO footer at all
    // (no app name, no branding, no page number). Footer appears on page 2+
    // only (RINCIAN PENGGUNAAN PETTY CASH). (v1.13.2)
    footer: (currentPage, pageCount) => (currentPage === 1 ? undefined : {
      margin: [56, 6, 56, 0],
      columns: [
        { text: `Sarpras Operations Platform v${APP_VERSION} — Nota Organisasi Realisasi Petty Cash`,
          fontSize: 6.5, color: '#9a9a9a' },
        { text: `Hal. ${currentPage} / ${pageCount}`, fontSize: 6.5, color: '#9a9a9a', alignment: 'right' },
      ],
    }),

    content: [
      /* ── PAGE 1: NOTA ORGANISASI ─────────────────────────────── */
      ...(d.isTest ? [{
        text: 'TEST ONLY — DOKUMEN TIDAK SAH', fontSize: 9, bold: true, color: INK,
        alignment: 'center', characterSpacing: 1.5, margin: [0, 0, 0, 12],
      }] : []),
      orgLogo({ width: 56 }),
      { text: 'NOTA ORGANISASI', fontSize: NOR_DS.typography.documentTitle.fontSize, bold: true, alignment: 'center', margin: [0, 0, 0, 14] },

      { text: `Jakarta, ${d.dateLong || ''}`, fontSize: 10, margin: [0, 0, 0, 0] },
      { text: `No.${d.norNumber || ''}`, fontSize: 10, margin: [0, 0, 0, 12] },

      _metaTable(d),

      { text: 'Dengan hormat,', fontSize: 10, margin: [0, 0, 0, 6] },
      { text: 'Sehubungan dengan kegiatan operasional bidang sarana dan prasarana, kami melaporkan realisasi petty cash bidang sarana dan prasarana dengan rincian sebagai berikut:',
        fontSize: 10, alignment: 'justify', margin: [0, 0, 0, 6] },

      _balanceTable(d, NOR_DS.layout.balanceWidthsPage1),
      { text: `Terbilang: ${d.terbilang || ''}`, fontSize: 10, margin: [0, 0, 0, 6] },

      { text: 'Sehubungan dengan telah direalisasikannya petty cash tersebut, kami memohon agar dana petty cash dapat ditambahkan kembali untuk memastikan kelancaran operasional di bidang Sarana dan Prasarana. Sebagai dasar perhitungan, kami lampirkan laporan realisasi penggunaan dana.',
        fontSize: 10, alignment: 'justify', margin: [0, 0, 0, 6] },
      { text: 'Demikian nota organisasi ini disampaikan, atas perhatiannya kami ucapkan terima kasih.',
        fontSize: 10, alignment: 'justify', margin: [0, 0, 0, 18] },

      { columns: [
        sb(top[0], 40), sb(top[1], 40), sb(top[2], 40),
      ], columnGap: 8 },
      bottom.length
        ? { columns: [sb(bottom[0], 40), { text: '' }, { text: '' }], columnGap: 8, margin: [0, 10, 0, 0] }
        : { text: '' },

      /* ── PAGE 2: RINCIAN PENGGUNAAN PETTY CASH ───────────────── */
      { text: 'RINCIAN PENGGUNAAN PETTY CASH', fontSize: NOR_DS.typography.sectionHeading.fontSize, bold: true, alignment: 'center',
        pageBreak: 'before', margin: [0, 0, 0, 0] },
      { text: 'BIDANG SARANA DAN PRASARANA', fontSize: 10, alignment: 'center', margin: [0, 0, 0, 10] },

      {
        table: {
          headerRows: 1,
          widths: NOR_DS.layout.itemTableWidths,
          body: [
            [
              { text: 'No', fontSize: 9, bold: true, alignment: 'center' },
              { text: 'Tanggal', fontSize: 9, bold: true, alignment: 'center' },
              { text: 'Rincian', fontSize: 9, bold: true, alignment: 'center' },
              { text: 'Biaya', fontSize: 9, bold: true, alignment: 'center' },
              { text: 'Keterangan', fontSize: 9, bold: true, alignment: 'center' },
            ],
            ...itemRows,
            totalRow,
          ],
        },
        layout: GRID,
        margin: [0, 0, 0, 12],
      },

      _balanceTable(d, NOR_DS.layout.balanceWidthsPage2),
      { text: `Terbilang: ${d.terbilang || ''}`, fontSize: 10, margin: [0, 0, 0, 18] },

      { columns: [
        sb(recap[0], 38), sb(recap[1], 38),
      ], columnGap: 8, margin: [0, 0, 0, 0] },
    ],
  };
}

register('nor', {
  build,
  // Filename: "Nota Organisasi Sarpras [SEQUENCE] - [PERIHAL].pdf" (v1.13.2).
  // Uses ONLY the NOR sequence (e.g. "120"), never the full composed number
  // (no slashes / Roman month). Sanitised for Windows/macOS.
  filename: (d) => {
    const sequence = String(d.norNumber || '').split('/')[0].trim();
    const perihal = String(d.subject || '').trim();
    const raw = `Nota Organisasi Sarpras ${sequence}${perihal ? ` - ${perihal}` : ''}`;
    const safe = raw
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ') // strip OS-reserved + control chars
      .replace(/\s+/g, ' ')                    // collapse whitespace
      .replace(/[. ]+$/, '')                   // no trailing dot/space (Windows)
      .trim();
    return `${safe || 'Nota Organisasi Sarpras'}.pdf`;
  },
  meta: { title: 'Nota Organisasi', label: 'Nota Organisasi Realisasi Petty Cash' },
});
