/* ============================================================
   DOCUMENT-DESIGN-SYSTEM.JS — Phase 12, Sprint 12.1

   The single source of truth for EVERY generated document's layout.

   Phase 12 directive ("DOCUMENT DESIGN SYSTEM"): the visual appearance
   of every NOR must NEVER be hardcoded in CSS or JavaScript. Settings →
   Document Design System becomes the one place a document's geometry,
   typography, colours, tables, signatures, header and footer are
   declared. Templates RENDER FROM this configuration; they no longer own
   the numbers.

   This sprint introduces the data model, the versioned registry, the
   resolver, and pure pdfmake builders — WITHOUT changing a single pixel
   of any document that ships today. Every value below was extracted
   byte-for-byte from the code that currently owns it:

     · `operational` v1  ← js/docs/doc-theme.js module constants
                            (A4_MARGINS / CONTENT_W / TOKENS / DEFAULT_STYLE
                            / BASE_STYLES / tableLayout / headerRule / logo /
                            signature / footer) — the shared design language
                            of every operational document (analytics,
                            reimbursement, test-report, overtime, composer).
     · `nor` v1          ← js/docs/templates/nor.js (the official PBSI
                            "Nota Organisasi Realisasi Petty Cash" letter).
     · `composer` v1     ← js/docs/templates/composer-document.js (the
                            generic Sarpras Intelligence composed-draft
                            export). Shares the operational palette/type but
                            owns its own page margins.

   DESIGN INTENT (later sprints build on this, this sprint only lays it):
     · VERSIONING — every template owns an ordered list of versions.
       Archived documents render with the exact version they were made
       with (pinned); new documents use the latest. `getDesignSystem(id)`
       returns the latest; `getDesignSystem(id, n)` pins to version n.
       An unknown version THROWS — never silently falls back, because
       "Nothing changes silently" (Phase 12: LAYOUT VERSIONING).
     · PROVENANCE — every descriptor carries a `provenance` string. Every
       automatic layout decision must be explainable back to where the
       value came from (Phase 12: "Every automatic decision must include
       provenance").

   Pure data + pure builders. No DOM, no imports, no side effects, so
   this module can be unit-tested in Node and can never introduce a
   circular import (doc-theme.js imports THIS; this imports nothing).
   ============================================================ */

'use strict';

/* Deep-freeze so a template can never accidentally mutate the shared
   source of truth (pdfmake only reads these nodes; this makes that a
   guarantee, not a convention). */
function deepFreeze(obj) {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    for (const key of Object.keys(obj)) deepFreeze(obj[key]);
  }
  return obj;
}

/* ── operational v1 — the shared doc-theme design language ──────────
   Every number here is the exact value js/docs/doc-theme.js hardcodes
   today. doc-theme.js re-exports its public constants FROM this object,
   so all five operational templates inherit it unchanged. */
const OPERATIONAL_V1 = {
  id: 'operational',
  version: 1,
  label: 'Sarpras Operations — Dokumen Operasional',
  provenance:
    'Extracted byte-for-byte from js/docs/doc-theme.js module constants as shipped in v1.27.1 '
    + '(Phase 12 Sprint 12.1). Shared design language of every operational document. No visual change.',
  page: {
    size: 'A4',
    orientation: 'portrait',
    // [left, top, right, bottom] in pt — the operational margin scheme
    // (17mm L/R · 13mm top · 11mm bottom).
    margins: [48, 37, 48, 31],
    contentWidth: 499, // 595.28 − 48 − 48, rounded down
  },
  unit: { mmToPt: 2.834645 },
  color: {
    ink: '#1A1917',
    dim: '#5B5953',
    faint: '#94918B',
    ghost: '#C0C0C0',
    line: '#C9C6C0',
    lineSoft: '#E2DFD9',
    fill: '#F7F6F3',
    accent: '#A8292F',
  },
  typography: {
    default: { fontSize: 8.5, color: '#1A1917', lineHeight: 1.2 },
    title: { fontSize: 15, bold: true, alignment: 'center' },
    subtitle: { fontSize: 8, color: '#5B5953', alignment: 'center' },
    secLabel: { fontSize: 7.5, bold: true, color: '#5B5953', margin: [0, 8, 0, 4] },
    th: { fontSize: 7, bold: true, color: '#5B5953', fillColor: '#F7F6F3' },
  },
  // The thin-line layout shared by all operational data tables.
  table: {
    hLineWidth: 0.5,
    vLineWidth: 0.5,
    lineColor: '#E2DFD9',
    paddingLeft: 6,
    paddingRight: 6,
    paddingTop: 3,
    paddingBottom: 3,
  },
  headerRule: { lineWidth: 1.5, lineColor: '#1A1917' },
  logo: { width: 56, margin: [0, 0, 0, 6] },
  signature: { gap: 38, columnGap: 8, maxColumns: 3 },
  footer: { fontSize: 6.5, color: '#94918B' },
};

/* ── nor v1 — the official PBSI Petty Cash NOR letter ───────────────
   Every number here is the exact value js/docs/templates/nor.js
   hardcodes today. That template reads its page geometry / body type /
   colours / rincian grid / signatory gaps / footer from this object. */
const NOR_V1 = {
  id: 'nor',
  version: 1,
  label: 'PBSI NOR — Nota Organisasi Realisasi Petty Cash',
  provenance:
    'Extracted byte-for-byte from js/docs/templates/nor.js as shipped in v1.27.1 '
    + '(Phase 12 Sprint 12.1). The official PBSI Petty Cash NOR letterhead. No visual change.',
  page: {
    size: 'A4',
    orientation: 'portrait',
    margins: [56, 40, 56, 40],
  },
  color: { ink: '#000000', dim: '#3a3a3a' },
  typography: {
    // Body default the whole document inherits.
    default: { fontSize: 10, color: '#000000', lineHeight: 1.3 },
    // The cover-memo heading ("NOTA ORGANISASI").
    documentTitle: { fontSize: 13, bold: true, alignment: 'center' },
    // The rincian-page heading ("RINCIAN PENGGUNAAN PETTY CASH").
    sectionHeading: { fontSize: 11, bold: true, alignment: 'center' },
    body: { fontSize: 10 },
    tableCell: { fontSize: 9 },
    reimburseDetail: { fontSize: 7.5 },
  },
  // The black 1pt grid for the rincian table (matches official borders).
  table: {
    hLineWidth: 1,
    vLineWidth: 1,
    lineColor: '#000000',
    paddingLeft: 4,
    paddingRight: 4,
    paddingTop: 2,
    paddingBottom: 2,
  },
  // Column widths are structural to this specific letter (kept here so a
  // future template variant can restyle them without a code change).
  layout: {
    metaWidths: [96, 10, '*'],
    balanceWidthsPage1: [206, 30, 104],
    balanceWidthsPage2: [216, 30, 104],
    itemTableWidths: [26, 70, '*', 92, 86],
  },
  // Signing-gap heights for the three signatory rows.
  signature: { topGap: 40, bottomGap: 40, recapGap: 38, columnGap: 8 },
  footer: { fontSize: 6.5, color: '#9a9a9a' },
};

/* ── composer v1 — the generic Sarpras Intelligence composed draft ──
   Inherits the operational palette/typography (it imports TOKENS /
   BASE_STYLES from doc-theme), but owns its own page margins
   ([48,37,48,48] — bottom 48, not the operational 31). Only the values
   composer-document.js actually sets itself live here; everything else
   it takes from `operational` via doc-theme. */
const COMPOSER_V1 = {
  id: 'composer',
  version: 1,
  label: 'Sarpras Intelligence — Draf Komposisi Dokumen',
  provenance:
    'Extracted byte-for-byte from js/docs/templates/composer-document.js as shipped in v1.27.1 '
    + '(Phase 12 Sprint 12.1). Shares the operational palette/typography; owns only its page margins. No visual change.',
  inherits: 'operational',
  page: {
    size: 'A4',
    orientation: 'portrait',
    margins: [48, 37, 48, 48],
  },
  logo: { width: 48 },
  typography: {
    body: { fontSize: 9.5 },
  },
};

/* ── The versioned registry ─────────────────────────────────────────
   id -> ordered list of versions (index 0 = v1). New versions APPEND
   (append-only, never overwrite — "Nothing changes silently").

   Each version DESCRIPTOR is deep-frozen (a consumer can never mutate the
   source of truth), while the container itself is appendable so a future
   Document Template Manager / Live Editor can register a new version at
   runtime (Phase 12 Sprint 12.3) — "no source code changes should ever be
   required" to add a template version. registerDesignSystemVersion() below
   is the ONLY sanctioned way to append. */
const DESIGN_SYSTEMS = {
  operational: [deepFreeze(OPERATIONAL_V1)],
  nor: [deepFreeze(NOR_V1)],
  composer: [deepFreeze(COMPOSER_V1)],
};

/** Every registered template id (for tooling / a future Template Manager UI). */
export function listDesignSystems() {
  return Object.keys(DESIGN_SYSTEMS);
}

/** The highest (newest) version number registered for a template id. */
export function latestVersion(id) {
  const versions = DESIGN_SYSTEMS[id];
  if (!versions) throw new Error(`No document design system registered for id "${id}"`);
  return versions[versions.length - 1].version;
}

/** All version numbers registered for a template id, oldest → newest. */
export function listVersions(id) {
  const versions = DESIGN_SYSTEMS[id];
  if (!versions) throw new Error(`No document design system registered for id "${id}"`);
  return versions.map((v) => v.version);
}

/**
 * Resolve a design-system descriptor.
 *
 * @param {string} id       template id ('operational' | 'nor' | 'composer')
 * @param {number} [version] pin to a specific version. Omitted → the latest.
 * @returns {object} the deep-frozen descriptor.
 *
 * An unknown id or an unknown version THROWS. Archived documents pin the
 * exact version they were composed with; a silent fallback to a newer
 * layout would violate the Phase 12 rule "Nothing changes silently"
 * (LAYOUT VERSIONING) — the caller must handle a missing version
 * explicitly, never inherit a redesign by accident.
 */
export function getDesignSystem(id, version) {
  const versions = DESIGN_SYSTEMS[id];
  if (!versions) throw new Error(`No document design system registered for id "${id}"`);
  if (version == null) return versions[versions.length - 1];
  const found = versions.find((v) => v.version === version);
  if (!found) {
    throw new Error(
      `Document design system "${id}" has no version ${version} `
      + `(registered: ${versions.map((v) => v.version).join(', ')})`,
    );
  }
  return found;
}

/** A human-readable, explainable provenance line for a resolved design system. */
export function designProvenance(ds) {
  return `${ds.label} — layout v${ds.version}. ${ds.provenance}`;
}

/* ── Runtime registration (Document Template Manager core) ───────────
   The Phase 12 "DOCUMENT TEMPLATE MANAGER" requires that administrators
   configure new document layouts with "no source code changes." These two
   functions are the sanctioned, validated, append-only path a future
   Settings / Live Editor UI writes through — they never let a bad or
   silently-overwriting descriptor into the source of truth. */

const _ORIENTATIONS = new Set(['portrait', 'landscape']);

/**
 * Structurally validate a design-system descriptor (the minimal contract
 * every layout must satisfy to be renderable AND explainable). Pure — no
 * side effects; the Template Manager UI calls this to pre-validate admin
 * input before registering.
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateDesignSystem(ds) {
  const errors = [];
  const isStr = (v) => typeof v === 'string' && v.length > 0;
  const isPosInt = (v) => Number.isInteger(v) && v > 0;
  if (!ds || typeof ds !== 'object') return { ok: false, errors: ['descriptor must be an object'] };
  if (!isStr(ds.id)) errors.push('id must be a non-empty string');
  if (!isPosInt(ds.version)) errors.push('version must be a positive integer');
  if (!isStr(ds.label)) errors.push('label must be a non-empty string');
  // Explainability is not optional (Phase 12: every layout traceable).
  if (!isStr(ds.provenance)) errors.push('provenance must be a non-empty string (every layout must be explainable)');
  const p = ds.page;
  if (!p || typeof p !== 'object') {
    errors.push('page geometry is required');
  } else {
    if (!isStr(p.size)) errors.push('page.size must be a non-empty string');
    if (!_ORIENTATIONS.has(p.orientation)) errors.push('page.orientation must be "portrait" or "landscape"');
    if (!Array.isArray(p.margins) || p.margins.length !== 4 || !p.margins.every((n) => Number.isFinite(n) && n >= 0)) {
      errors.push('page.margins must be [left, top, right, bottom] of four non-negative numbers');
    }
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Append a new, validated version of a design system (the ONLY sanctioned
 * mutation of the registry). Append-only and gap-free:
 *   · descriptor.id must equal `id`;
 *   · descriptor.version must be exactly (latest existing + 1), or 1 for a
 *     brand-new id — never overwrite an existing version, never skip one
 *     (archived documents pinned to an older version keep rendering exactly
 *     as before — "Nothing changes silently");
 *   · descriptor must pass validateDesignSystem().
 * Throws with all validation errors otherwise. Returns the frozen,
 * registered descriptor.
 */
export function registerDesignSystemVersion(id, descriptor) {
  if (!id || typeof id !== 'string') throw new Error('registerDesignSystemVersion requires a string id');
  const { ok, errors } = validateDesignSystem(descriptor);
  if (!ok) throw new Error(`Invalid design system for "${id}": ${errors.join('; ')}`);
  if (descriptor.id !== id) throw new Error(`descriptor.id "${descriptor.id}" does not match registration id "${id}"`);
  const existing = DESIGN_SYSTEMS[id];
  const expected = existing ? existing[existing.length - 1].version + 1 : 1;
  if (descriptor.version !== expected) {
    throw new Error(
      `design system "${id}" next version must be ${expected} (append-only, no gaps/overwrites); got ${descriptor.version}`,
    );
  }
  const frozen = deepFreeze({ ...descriptor });
  if (existing) existing.push(frozen);
  else DESIGN_SYSTEMS[id] = [frozen];
  return frozen;
}

/* ── Pure pdfmake builders ──────────────────────────────────────────
   Turn a design-system descriptor into the pdfmake fragments a template
   plugs straight into its DocumentDefinition, so no template ever writes
   the raw numbers again. */

/** `{ pageSize, pageOrientation, pageMargins }` for a DocumentDefinition. */
export function pageGeometry(ds) {
  return {
    pageSize: ds.page.size,
    pageOrientation: ds.page.orientation,
    pageMargins: ds.page.margins,
  };
}

/** A pdfmake table `layout` object built from a descriptor's `table` block. */
export function tableGridLayout(ds) {
  const t = ds.table;
  return {
    hLineWidth: () => t.hLineWidth,
    vLineWidth: () => t.vLineWidth,
    hLineColor: () => t.lineColor,
    vLineColor: () => t.lineColor,
    paddingLeft: () => t.paddingLeft,
    paddingRight: () => t.paddingRight,
    paddingTop: () => t.paddingTop,
    paddingBottom: () => t.paddingBottom,
  };
}
