/* ============================================================
   COMPOSER-DOCUMENT.JS (template) — Phase 10, Sprint 10.6: Export & Publishing

   PURPOSE: a GENERIC pdfmake template for an Approved ComposerDocument
   (js/v2/document-intelligence/composer/) — deliberately NOT an attempt
   to reproduce the official PBSI NOR letterhead `templates/nor.js`
   renders (that template needs recipients[]/cc[]/a balance-recap table/
   a signatory grid — structured fields the V2 Composer's flat
   `sections: [{field, value}]` shape does not carry; per Sprint 9.8's own
   finding, "Recipient/cc block: 100% manual, both new types," fabricating
   that structure here would invent content nobody supplied). This
   template honestly renders what the Composer actually has: every
   section's real field/value pair, under a plain metadata header — "the
   composed draft, exported for a reviewer to finish formatting by hand,"
   not a camera-ready final artifact.

   REASONING-METADATA SCRUBBING (spec: "Published document must never
   contain reasoning metadata"): enforced by construction — `build()`
   below only ever reads `data.sections`/`data.domainType`/etc.; it has no
   parameter through which a reasoningTrace/explainability bundle could
   arrive. The caller (review-workspace.js) constructs `data` from
   `doc.sections` directly, never from `getExplainability()`.

   `buildContentModel()` is exported and reused by
   ../docx-exporter.js-adjacent HTML building (review-workspace.js) so
   the PDF and Word exports show IDENTICAL content — one content model,
   two renderers, never two independently-maintained copies.

   SPRINT 11.3 (Document-first Experience) ADDITION — `buildDocumentStructure()`
   is now that SAME one source of truth for a THIRD renderer too: the
   in-app Live Document Workspace (review-workspace.js#renderLiveDocument).
   Before this, that in-page preview independently re-derived "which
   section is the dateline / which fields are the fixed letterhead rows
   (Kepada Yth./Dari/Tembusan Yth./Perihal/Lampiran) / which are body vs.
   detail" with its own copy of this exact logic — a real, silently
   drift-prone duplication of what this file already decided once for
   PDF/Word export. `buildContentModel()` below now calls
   `buildDocumentStructure()` too, so all three surfaces (PDF, Word,
   in-page preview) read the identical structural decision — never three
   independently-maintained copies. The exported PDF/Word documents also
   gained the SAME labeled letterhead rows and separated body paragraphs
   the in-page preview already showed, which is a real fidelity
   improvement (closer to "resembles the final printed NOR"), not a
   side effect to work around — still nothing fabricated: an unfilled
   letterhead field renders as "—", exactly like every other empty
   section already did.

   DEPENDENCIES: ../doc-theme.js (shared design tokens/builders — the
   SAME visual language every other generated document in this app
   uses), ../template-registry.js.
   ============================================================ */

'use strict';

import { register } from '../template-registry.js';
import {
  TOKENS, BASE_STYLES, docHeader, headerRule, docFooter,
  // Sprint 11.10 — the real PBSI logo and a real visual signature grid,
  // extracted from templates/nor.js (see doc-theme.js's own header) — the
  // "universal renderer" primitives this generic template never had access
  // to before. signatureGrid() is used with showBlankLine:true (never
  // fabricated names — see its own doc comment): the Composer's flat data
  // model only ever carries a signatory COUNT (nor-generator.js#
  // proposeNorFields's own real, evidence-based statistical suggestion),
  // never real names, so a visible blank line is the honest rendering.
  orgLogo, signatureGrid,
} from '../doc-theme.js';
// Phase 12 Sprint 12.1 — this generic composed-draft export's page
// geometry and logo size now come from the Document Design System
// (`composer` v1, seeded byte-for-byte from the literals below). Palette
// and typography still flow in from the shared operational design via
// doc-theme (TOKENS/BASE_STYLES above), so nothing here is hardcoded that
// the design system could own.
import { getDesignSystem } from '../design-system/document-design-system.js';

/** Humanizes a ComposerDocument section field id into a readable label.
 *  Pattern-derived fields are keyed `pattern:<knowledgeId>` by
 *  nor-composer.js itself (never inferred from string shape elsewhere) —
 *  shown as "Pattern: <knowledgeId>". Everything else gets simple
 *  camelCase/snake_case -> Title Case humanization. */
function fieldLabel(field) {
  if (field.startsWith('pattern:')) return `Pattern: ${field.slice('pattern:'.length)}`;
  return field
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/^./, (c) => c.toUpperCase());
}

/** The fixed NOR letterhead rows every real NOR carries (see
 *  docs/NOR-Specification.md) — the SAME field ids nor-composer.js's own
 *  fieldMap and the Live Document Workspace's inline editor both already
 *  read/write. Exported so review-workspace.js's live preview reads this
 *  ONE list too, instead of hand-keeping a second copy. */
export const LETTERHEAD_META_FIELDS = Object.freeze([
  Object.freeze({ field: 'kepadaYth', label: 'Kepada Yth.' }),
  Object.freeze({ field: 'dari', label: 'Dari' }),
  Object.freeze({ field: 'tembusanYth', label: 'Tembusan Yth.' }),
  Object.freeze({ field: 'perihal', label: 'Perihal' }),
  Object.freeze({ field: 'lampiran', label: 'Lampiran' }),
]);

/** Pure structural decision — "given a ComposerDocument's flat sections,
 *  which one is the dateline, which is the NOR number, which are the fixed
 *  letterhead rows, which are the letter's own body paragraphs (pattern-
 *  sourced), and which are genuinely leftover facts (the 'Rincian'
 *  appendix)." Sprint 11.3 (Document-first Experience) — this used to be
 *  independently re-derived by BOTH this file's own buildContentModel()
 *  AND review-workspace.js's renderLiveDocument(); now the ONE place
 *  either reads. The seeded "Jakarta, {{tanggalPanjang}}" pattern text is
 *  the only reliable signal for "which composed section is the dateline,"
 *  since there is no dedicated field name for it — honestly absent (never
 *  fabricated) when no section matches, same for every other slot here.
 *  @param {{field:string, value:*}[]} sections
 */
export function buildDocumentStructure(sections) {
  const all = sections || [];
  const dateLineSection = all.find((s) => typeof s.value === 'string' && /^jakarta,/i.test(s.value.trim())) || null;
  const norNumberSection = all.find((s) => s.field === 'norNumber') || null;
  // Sprint 11.10 — an OPTIONAL reviewer override for the document heading
  // (default "NOTA ORGANISASI" stays in buildContentModel() below,
  // unchanged for the real, only-ever-used 'nor' domain — see that
  // function's own comment for why no domain-to-title mapping was
  // invented). Same "special field id, never guessed" treatment as
  // dateLineSection/norNumberSection above.
  const documentTitleSection = all.find((s) => s.field === 'documentTitle') || null;
  // Sprint 11.10 — nor-generator.js#proposeNorFields already computes these
  // as a real, evidence-based statistical suggestion (rounded average
  // signatoryTopCount/BottomCount over Approved structural Knowledge —
  // never a guess, see that file's own header). Before this, they only
  // ever appeared as a raw numeric row in the generic "Rincian" leftovers
  // ("Suggested Signatory Top Count: 3"); pulling them out here lets every
  // renderer show an ACTUAL signature area instead of a number a reviewer
  // had to mentally translate.
  const signatoryTopSection = all.find((s) => s.field === 'suggestedSignatoryTopCount') || null;
  const signatoryBottomSection = all.find((s) => s.field === 'suggestedSignatoryBottomCount') || null;
  const usedFields = new Set([
    dateLineSection ? dateLineSection.field : null,
    'norNumber',
    'documentTitle',
    'suggestedSignatoryTopCount',
    'suggestedSignatoryBottomCount',
    ...LETTERHEAD_META_FIELDS.map((m) => m.field),
  ].filter(Boolean));

  return Object.freeze({
    dateLineSection,
    norNumberSection,
    documentTitleSection,
    // null when nor-generator.js had no Approved structural Knowledge to
    // suggest from (computeNorStructuralStats() returns null, honestly, in
    // that case) — never a fabricated default count.
    signatureSuggestion: Object.freeze({
      topCount: signatoryTopSection ? Number(signatoryTopSection.value) || 0 : null,
      bottomCount: signatoryBottomSection ? Number(signatoryBottomSection.value) || 0 : null,
    }),
    metaFields: Object.freeze(LETTERHEAD_META_FIELDS.map((m) => Object.freeze({
      ...m, section: all.find((s) => s.field === m.field) || null,
    }))),
    bodySections: Object.freeze(all.filter((s) => s.field.startsWith('pattern:') && !usedFields.has(s.field))),
    detailSections: Object.freeze(all.filter((s) => !s.field.startsWith('pattern:') && !usedFields.has(s.field))),
  });
}

/** Pure, format-agnostic content model — the ONE place "what does an
 *  exported ComposerDocument contain" is decided. The pdfmake definition
 *  below, the HTML builder review-workspace.js uses for Word export, AND
 *  (Sprint 11.3) the in-page Live Document Workspace preview all consume
 *  this SAME model (via buildDocumentStructure() above).
 *
 *  Phase 11 Course Correction, Workstream 1 — a light letterhead touch-up
 *  (title "NOTA ORGANISASI", a date/number line pulled out of the generic
 *  section dump) toward the same visual the in-page Live Document
 *  Workspace renders, WITHOUT fabricating anything this template's own
 *  header already rules out: no recipients[]/cc[]/balance-recap table is
 *  invented here — dateLine/norNumber/metaFields are still just the
 *  Composer's own real sections, only reordered/labeled instead of
 *  appearing mid-list.
 *  @param {{documentId:string, domainType:string, version:number, statusLabel:string, approvedAt:string|null, sections:{field:string,value:*}[]}} data
 */
export function buildContentModel(data) {
  const structure = buildDocumentStructure(data.sections);
  const dateLine = structure.dateLineSection ? structure.dateLineSection.value : null;
  const norNumber = structure.norNumberSection && structure.norNumberSection.value ? String(structure.norNumberSection.value) : null;

  return {
    // Sprint 11.10 — reviewer-editable (documentTitleSection, above), never
    // domain-derived: createDocument() has exactly one real call site in
    // this codebase (nor-composer.js) and it is always domainType 'nor', so
    // a domain-to-title lookup table would be speculative machinery for
    // domains that never actually reach this template — the default stays
    // the exact, already-correct string for the one domain in real use.
    title: (structure.documentTitleSection && structure.documentTitleSection.value) || 'NOTA ORGANISASI',
    dateLine,
    norNumber,
    metaLines: [
      `Domain: ${data.domainType}`,
      `Versi: ${data.version}`,
      `Status: ${data.statusLabel}`,
      data.approvedAt ? `Disetujui: ${data.approvedAt}` : null,
    ].filter(Boolean),
    // Always all 5 fixed rows, "—" when genuinely unfilled — same honest-
    // absence convention `sections` below already used, never silently
    // dropping a letterhead row just because it is still blank.
    metaFields: structure.metaFields.map((m) => ({
      label: m.label,
      value: m.section && m.section.value != null && m.section.value !== '' ? String(m.section.value) : '—',
    })),
    bodyParagraphs: structure.bodySections
      .map((s) => (s.value == null || s.value === '' ? null : String(s.value)))
      .filter(Boolean),
    sections: structure.detailSections.map((s) => ({
      label: fieldLabel(s.field),
      value: s.value == null || s.value === '' ? '—' : String(s.value),
    })),
    signatureSuggestion: structure.signatureSuggestion,
    disclaimer: 'Dokumen ini adalah draf hasil komposisi Sarpras Intelligence yang telah disetujui. '
      + 'Blok penerima/tembusan, tabel rincian biaya, dan format akhir tetap memerlukan penyusunan manual '
      + 'sebelum diterbitkan sebagai dokumen resmi.',
  };
}

function chunk3(items) {
  const out = [];
  for (let i = 0; i < items.length; i += 3) out.push(items.slice(i, i + 3));
  return out;
}

/** Sprint 11.10 — a real, visual signature area: blank signing lines, one
 *  row per up to 3 signatories, built from nor-generator.js's real
 *  suggested counts (never real names — see this file's own import
 *  comment for why showBlankLine:true is correct here). Returns []
 *  when no Approved structural Knowledge ever existed to suggest a count
 *  from — an honest absence, not a fabricated default row. */
function signatureRows({ topCount, bottomCount } = {}) {
  const rows = [];
  for (const count of [topCount, bottomCount]) {
    if (!count) continue;
    const blanks = Array.from({ length: count }, () => ({ showBlankLine: true }));
    chunk3(blanks).forEach((row, i) => rows.push({ ...signatureGrid(row, { gap: 36 }), margin: [0, i === 0 ? 20 : 10, 0, 0] }));
  }
  return rows;
}

function build(data) {
  const model = buildContentModel(data);
  // Phase 12 Sprint 12.2/12.3 — resolve the composer layout at BUILD time
  // (never cached at module load), so a NEW document always renders with the
  // newest registered version while a document carrying a pinned
  // `layoutVersion` renders with the exact layout it was published under
  // (Layout Versioning). Omitted → the latest, which today is v1, so current
  // output is unchanged. A pin to a version that no longer exists throws here
  // rather than silently rendering with a newer layout.
  const ds = getDesignSystem('composer', data.layoutVersion != null ? data.layoutVersion : undefined);
  return {
    pageSize: ds.page.size,
    pageMargins: ds.page.margins,
    header: docHeader({ org: 'Bidang Sarana dan Prasarana', reference: data.documentId }),
    footer: docFooter({ label: 'Draf Komposisi Dokumen (Sarpras Intelligence)' }),
    content: [
      orgLogo({ width: ds.logo.width }),
      headerRule(),
      { text: model.title, style: 'title', alignment: 'center', margin: [0, 0, 0, 2] },
      ...(model.norNumber ? [{ text: `Nomor: ${model.norNumber}`, alignment: 'center', fontSize: 9, color: TOKENS.color.dim, margin: [0, 0, 0, 2] }] : []),
      ...(model.dateLine ? [{ text: model.dateLine, alignment: 'right', fontSize: 9, color: TOKENS.color.dim, margin: [0, 0, 0, 8] }] : []),
      { text: model.metaLines.join('   ·   '), style: 'subtitle', margin: [0, 0, 0, 12] },
      ...model.metaFields.map((m) => ({
        text: [{ text: `${m.label}: `, bold: true }, { text: m.value }],
        fontSize: 9.5,
        color: TOKENS.color.ink,
        margin: [0, 0, 0, 2],
      })),
      ...(model.bodyParagraphs.length
        ? model.bodyParagraphs.map((p) => ({ text: p, fontSize: 9.5, color: TOKENS.color.ink, margin: [0, 8, 0, 8] }))
        : [{ text: 'Belum ada isi surat yang tersusun.', italics: true, fontSize: 9.5, color: TOKENS.color.dim, margin: [0, 8, 0, 8] }]),
      ...(model.sections.length ? [{ text: 'Rincian', style: 'secLabel', margin: [0, 8, 0, 0] }] : []),
      ...model.sections.flatMap((s) => [
        { text: s.label, style: 'secLabel' },
        { text: s.value, fontSize: 9.5, color: TOKENS.color.ink, margin: [0, 0, 0, 4] },
      ]),
      ...signatureRows(model.signatureSuggestion),
      { text: model.disclaimer, fontSize: 7.5, italics: true, color: TOKENS.color.dim, margin: [0, 16, 0, 0] },
    ],
    styles: BASE_STYLES,
    defaultStyle: { fontSize: 9.5, color: TOKENS.color.ink },
  };
}

function _escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Same content model as build() (the PDF definition), rendered as a
 *  complete HTML document instead — the input docx-exporter.js#
 *  exportHtmlToDocx() expects. One content model, two thin renderers. */
export function buildHtml(data) {
  const model = buildContentModel(data);
  const metaFieldsHtml = model.metaFields.map((m) => `<p><strong>${_escapeHtml(m.label)}:</strong> ${_escapeHtml(m.value)}</p>`).join('\n');
  const bodyHtml = model.bodyParagraphs.length
    ? model.bodyParagraphs.map((p) => `<p>${_escapeHtml(p)}</p>`).join('\n')
    : '<p><em>Belum ada isi surat yang tersusun.</em></p>';
  const sectionsHtml = model.sections.length
    ? `<h2>Rincian</h2>${model.sections.map((s) => `<h3>${_escapeHtml(s.label)}</h3><p>${_escapeHtml(s.value)}</p>`).join('\n')}`
    : '';
  // Sprint 11.10 — the same real, evidence-based signatory counts as the
  // PDF export (build(), above), rendered as honest blank signing lines in
  // plain HTML. Deliberately text-only, no <img> logo here: html-docx-js's
  // base64-image support is unverified in this codebase (unlike pdfmake's,
  // already proven by templates/nor.js), and this export path is real,
  // already-tested, working functionality — not a risk worth taking for a
  // cosmetic addition. See the Sprint 11.10 report's Known Limitations.
  const signatureRow = (count) => (count
    ? `<p style="margin-top:24px;">${Array.from({ length: count }, () => 'Tanda Tangan: _________________').join('&nbsp;&nbsp;&nbsp;&nbsp;')}</p>`
    : '');
  const signatureHtml = signatureRow(model.signatureSuggestion?.topCount) + signatureRow(model.signatureSuggestion?.bottomCount);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${_escapeHtml(model.title)}</title></head>
<body>
<h1 style="text-align:center;">${_escapeHtml(model.title)}</h1>
${model.norNumber ? `<p style="text-align:center;font-size:9pt;color:#555;">Nomor: ${_escapeHtml(model.norNumber)}</p>` : ''}
${model.dateLine ? `<p style="text-align:right;font-size:9pt;color:#555;">${_escapeHtml(model.dateLine)}</p>` : ''}
<p><em>${_escapeHtml(model.metaLines.join('   ·   '))}</em></p>
<hr/>
${metaFieldsHtml}
${bodyHtml}
${sectionsHtml}
${signatureHtml}
<hr/>
<p style="font-size:9px;color:#555;"><em>${_escapeHtml(model.disclaimer)}</em></p>
</body></html>`;
}

function filename(data) {
  return `draf-${data.domainType}-${(data.documentId || 'dokumen').replace(/[^a-z0-9-]/gi, '_')}.pdf`;
}

register('composer-document', {
  build,
  filename,
  meta: { title: 'Draf Komposisi Dokumen', label: 'Sarpras Intelligence — Composer' },
});
