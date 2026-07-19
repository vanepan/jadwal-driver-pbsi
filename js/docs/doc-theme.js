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
// Sprint 11.10 — the real PBSI mark, already embedded client-side (no
// network fetch) for the Petty Cash NOR template (templates/nor.js). Reused
// here, not duplicated, so orgLogo() below is the ONE place any generated
// document gets the real logo — including the Composer's generic template,
// which never had one before.
import { PBSI_LOGO_DATA_URI } from './templates/reimbursement-logo.js';
// Phase 12 Sprint 12.1 — the Document Design System is now the single
// source of truth for this shared operational design language. Every
// constant below is DERIVED from `operational` v1 (which was seeded
// byte-for-byte FROM these same constants), so all five operational
// templates keep pixel-identical output while no number is hardcoded in
// this file anymore. See js/docs/design-system/document-design-system.js.
import { getDesignSystem, tableGridLayout } from './design-system/document-design-system.js';

const OP = getDesignSystem('operational');

/* Millimetre → PDF point (72 dpi). A4 = 210×297mm = 595.28×841.89pt. */
export const MM = OP.unit.mmToPt;

/* A4 content geometry with the operational margin scheme
   (17mm L/R · 13mm top · 11mm bottom) expressed in points. */
export const A4_MARGINS   = OP.page.margins;
export const CONTENT_W    = OP.page.contentWidth;

export const TOKENS = { color: OP.color };

export const DEFAULT_STYLE = OP.typography.default;

export const BASE_STYLES = {
  title:    OP.typography.title,
  subtitle: OP.typography.subtitle,
  secLabel: OP.typography.secLabel,
  th:       OP.typography.th,
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
    canvas: [{ type: 'line', x1: 0, y1: 0, x2: CONTENT_W, y2: 0, lineWidth: OP.headerRule.lineWidth, lineColor: OP.headerRule.lineColor }],
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
        fontSize: OP.footer.fontSize, color: OP.footer.color },
      { text: `Hal. ${currentPage} / ${pageCount}`,
        fontSize: OP.footer.fontSize, color: OP.footer.color, alignment: 'right' },
    ],
  });
}

/** Thin-line table layout shared by all data tables. Built from the
 *  operational design system's `table` block (Phase 12 Sprint 12.1) —
 *  same values (0.5pt lineSoft borders, 6/3 padding) as the inline layout
 *  it replaced, now sourced from the one place layout is declared. */
export function tableLayout() {
  return tableGridLayout(OP);
}

/** Sprint 11.10 — the real PBSI mark as a centered pdfmake image node.
 *  Extracted from templates/nor.js's own inline `{ image: PBSI_LOGO_DATA_URI,
 *  width: 56, ... }` so every template (not just the Petty Cash NOR) can
 *  put a real organizational logo on a generated document, instead of each
 *  one either inventing its own copy or having none at all. */
export function orgLogo({ width = OP.logo.width, margin = OP.logo.margin } = {}) {
  return { image: PBSI_LOGO_DATA_URI, width, alignment: 'center', margin };
}

/** One signatory block: "Label, / POSITION / (signing gap) / Name
 *  (underlined)". Extracted from templates/nor.js's own `_signBlock()` —
 *  same visual shape, now shared, and BYTE-FOR-BYTE IDENTICAL to the
 *  original for a caller with real `name`/`position` data (templates/
 *  nor.js's real, already-shipping Petty Cash NOR) — the default when
 *  `name` is falsy still renders an empty (invisible) underlined line,
 *  exactly as `_signBlock()` always did, so extracting this changes zero
 *  pixels of that existing production PDF.
 *
 *  `showBlankLine: true` is the one NEW, opt-in behavior: a caller with
 *  only a COUNT of expected signatories (not real names — e.g. composer-
 *  document.js's suggestedSignatoryTopCount) can render an honest visible
 *  blank signing line ("_________________") instead of an invisible one,
 *  matching the "blank placeholder, never fabricated content" convention
 *  the rest of this platform already uses. Never invents a label either —
 *  `label` defaults to "Tanda Tangan" only when the caller gives none. */
export function signatureBlock({ label, position = '', name = '', gap = OP.signature.gap, showBlankLine = false } = {}) {
  const nameLine = name
    ? { text: name, fontSize: 10, bold: true, decoration: 'underline' }
    : (showBlankLine ? { text: '_________________', fontSize: 10 } : { text: '', fontSize: 10, bold: true, decoration: 'underline' });
  return {
    stack: [
      { text: `${label || 'Tanda Tangan'},`, fontSize: 10 },
      { text: (position || '').toUpperCase(), fontSize: 10, bold: true },
      { text: '', margin: [0, 0, 0, gap] },
      nameLine,
    ],
  };
}

/** A row of up to 3 signatory blocks (pdfmake `columns`) — the layout
 *  templates/nor.js's own `{ columns: [_signBlock(top[0]), ...] }` already
 *  used inline, now a named, reusable primitive. `signatories` may contain
 *  fewer than 3 entries; missing slots render as an empty column (never
 *  padded with a fabricated blank signer) — same convention nor.js's own
 *  `bottom.length ? ... : { text: '' }` already established. */
export function signatureGrid(signatories, { gap = OP.signature.gap, columnGap = OP.signature.columnGap } = {}) {
  const list = (signatories || []).slice(0, OP.signature.maxColumns);
  if (!list.length) return { text: '' };
  return {
    columns: list.map((s) => (s ? signatureBlock({ ...s, gap }) : { text: '' })),
    columnGap,
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
