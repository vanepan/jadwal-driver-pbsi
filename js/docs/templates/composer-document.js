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

   DEPENDENCIES: ../doc-theme.js (shared design tokens/builders — the
   SAME visual language every other generated document in this app
   uses), ../template-registry.js.
   ============================================================ */

'use strict';

import { register } from '../template-registry.js';
import { TOKENS, BASE_STYLES, docHeader, headerRule, docFooter } from '../doc-theme.js';

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

/** Pure, format-agnostic content model — the ONE place "what does an
 *  exported ComposerDocument contain" is decided. Both the pdfmake
 *  definition below and the HTML builder review-workspace.js uses for
 *  Word export consume this SAME model.
 *  @param {{documentId:string, domainType:string, version:number, statusLabel:string, approvedAt:string|null, sections:{field:string,value:*}[]}} data
 */
export function buildContentModel(data) {
  return {
    title: 'Draf Komposisi Dokumen',
    metaLines: [
      `Domain: ${data.domainType}`,
      `Versi: ${data.version}`,
      `Status: ${data.statusLabel}`,
      data.approvedAt ? `Disetujui: ${data.approvedAt}` : null,
    ].filter(Boolean),
    sections: (data.sections || []).map((s) => ({
      label: fieldLabel(s.field),
      value: s.value == null || s.value === '' ? '—' : String(s.value),
    })),
    disclaimer: 'Dokumen ini adalah draf hasil komposisi Sarpras Intelligence yang telah disetujui. '
      + 'Blok penerima/tembusan, tabel rincian biaya, dan format akhir tetap memerlukan penyusunan manual '
      + 'sebelum diterbitkan sebagai dokumen resmi.',
  };
}

function build(data) {
  const model = buildContentModel(data);
  return {
    pageSize: 'A4',
    pageMargins: [48, 37, 48, 48],
    header: docHeader({ org: 'Bidang Sarana dan Prasarana', reference: data.documentId }),
    footer: docFooter({ label: 'Draf Komposisi Dokumen (Sarpras Intelligence)' }),
    content: [
      headerRule(),
      { text: model.title, style: 'title', margin: [0, 0, 0, 4] },
      { text: model.metaLines.join('   ·   '), style: 'subtitle', margin: [0, 0, 0, 12] },
      ...model.sections.flatMap((s) => [
        { text: s.label, style: 'secLabel' },
        { text: s.value, fontSize: 9.5, color: TOKENS.color.ink, margin: [0, 0, 0, 4] },
      ]),
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
  const sectionsHtml = model.sections.map((s) => `<h3>${_escapeHtml(s.label)}</h3><p>${_escapeHtml(s.value)}</p>`).join('\n');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${_escapeHtml(model.title)}</title></head>
<body>
<h1>${_escapeHtml(model.title)}</h1>
<p><em>${_escapeHtml(model.metaLines.join('   ·   '))}</em></p>
<hr/>
${sectionsHtml}
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
