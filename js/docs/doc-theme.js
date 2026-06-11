/* ============================================================
   DOC-THEME.JS — Shared Document Design Tokens & Builders

   Single visual language for every generated document
   (Reimbursement, Analytics, Audit, Asset, Engineering, AI).

   Pure data + pdfmake node builders. No DOM, no side effects.
   APP_VERSION is injected here once so no document ever hard-
   codes a version string again.
   ============================================================ */

'use strict';

import { APP_VERSION } from '../config.js';

/* Millimetre → PDF point (72 dpi). A4 = 210×297mm = 595.28×841.89pt. */
export const MM = 2.834645;

/* A4 content geometry with the operational margin scheme
   (17mm L/R · 13mm top · 11mm bottom) expressed in points. */
export const A4_MARGINS   = [48, 37, 48, 31];
export const CONTENT_W    = 499;            // 595.28 − 48 − 48, rounded down

export const TOKENS = {
  color: {
    ink:      '#1A1917',
    dim:      '#5B5953',
    faint:    '#94918B',
    ghost:    '#C0C0C0',
    line:     '#C9C6C0',
    lineSoft: '#E2DFD9',
    fill:     '#F7F6F3',
    accent:   '#A8292F',
  },
};

export const DEFAULT_STYLE = { fontSize: 8.5, color: TOKENS.color.ink, lineHeight: 1.2 };

export const BASE_STYLES = {
  title:    { fontSize: 15, bold: true, alignment: 'center' },
  subtitle: { fontSize: 8,  color: TOKENS.color.dim, alignment: 'center' },
  secLabel: { fontSize: 7.5, bold: true, color: TOKENS.color.dim, margin: [0, 8, 0, 4] },
  th:       { fontSize: 7,  bold: true, color: TOKENS.color.dim, fillColor: TOKENS.color.fill },
};

/* ── Reusable nodes ─────────────────────────────────────────── */

/** Standard organisation header band (left org block, right meta). */
export function docHeader(meta = {}) {
  const right = [];
  if (meta.docNumber) right.push(_metaLine('No. Dokumen: ', meta.docNumber, 0));
  if (meta.reference) right.push(_metaLine('Referensi: ',    meta.reference, 2));
  right.push(_metaLine('Tanggal Cetak: ', meta.printDate || _todayID(), 2));

  return {
    columns: [
      { width: '*', stack: [
        { text: meta.org || 'Bidang Sarana dan Prasarana', bold: true, fontSize: 11 },
        { text: meta.orgSub || 'PBSI — Persatuan Bulu Tangkis Seluruh Indonesia',
          fontSize: 7.5, color: TOKENS.color.dim, margin: [0, 1, 0, 0] },
      ]},
      { width: 'auto', stack: right },
    ],
    margin: [0, 0, 0, 6],
  };
}

/** Heavy rule under the header. */
export function headerRule() {
  return {
    canvas: [{ type: 'line', x1: 0, y1: 0, x2: CONTENT_W, y2: 0, lineWidth: 1.5, lineColor: TOKENS.color.ink }],
    margin: [0, 0, 0, 8],
  };
}

/** Footer factory — version + page numbers. Deterministic per document. */
export function docFooter(opts = {}) {
  const label = opts.label || 'Dokumen Operasional';
  return (currentPage, pageCount) => ({
    margin: [48, 8, 48, 0],
    columns: [
      { text: `PBSI Operations Platform v${APP_VERSION} — ${label}`,
        fontSize: 6.5, color: TOKENS.color.faint },
      { text: `Hal. ${currentPage} / ${pageCount}`,
        fontSize: 6.5, color: TOKENS.color.faint, alignment: 'right' },
    ],
  });
}

/** Thin-line table layout shared by all data tables. */
export function tableLayout() {
  return {
    hLineWidth: () => 0.5,
    vLineWidth: () => 0.5,
    hLineColor: () => TOKENS.color.lineSoft,
    vLineColor: () => TOKENS.color.lineSoft,
    paddingLeft:   () => 6,
    paddingRight:  () => 6,
    paddingTop:    () => 3,
    paddingBottom: () => 3,
  };
}

/* ── Internals ──────────────────────────────────────────────── */

function _metaLine(label, value, topMargin) {
  return {
    text: [{ text: label, color: TOKENS.color.dim }, { text: value, bold: true }],
    fontSize: 7.5, alignment: 'right', margin: [0, topMargin, 0, 0],
  };
}

function _todayID() {
  return new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}
