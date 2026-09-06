/* ============================================================
   NOR-PREVIEW-VIEW-MODEL.JS — NorDraftRecord → Composer renderer input
   (V2, Phase 6C)

   PURPOSE: the ONE pure translation from a persisted `NorDraftRecord`
   (functions/src/intelligence/norDraftStore.js#rehydrate shape:
   `{schema, draftId, version, ownerId, status:'requires_review', jenis,
   subject, recipient, recipientStatus, date, facts:{item,quantity,unit,
   purpose,budget}, body, numbering, provenance, …}`) into the INPUT of the
   EXISTING, already-shipping generic document renderer
   js/docs/templates/composer-document.js
   (`{documentId, domainType, version, statusLabel, approvedAt,
   sections:[{field,value}], renderingVisualModel?, isPreview?,
   disclaimerOverride?}`).

   WHY THIS RENDERER (see docs/V2_SARPRAS_INTELLIGENCE_PHASE_6C_NOR_PREVIEW.md
   §1-4): the official `js/docs/templates/nor.js` template is the *Petty
   Cash Realisasi* NOR — hard-coded petty-cash body prose, a balance recap,
   a "terbilang" line and a petty-cash expense table. A Sarpras Intelligence
   NOR draft carries none of that (free-text `body`, structured procurement
   `facts`, a `subject`, a `recipient`). `composer-document.js` is the
   codebase's only GENERIC letter renderer and is explicitly honest about
   NOT fabricating recipient blocks / balance tables the data does not
   carry. THIS ADAPTER + one small additive block in composer-document.js
   are the only new render code — no second renderer, no second pdfmake
   pipeline (Phase 6C §4, §15).

   HARD RULES (Phase 6C §5-8, §12-14):
     • Maps only ACTUAL NorDraftRecord fields — never invents a missing one.
     • A `recipientStatus: 'proposed'` recipient is rendered WITH an
       explicit "(diusulkan — belum dikonfirmasi)" suffix on the printed
       text itself — never silently shown as confirmed authority (§6).
     • NEVER emits a NOR number. The draft's `numbering.publishedNumber` is
       structurally always null; a "suggested" number must never look
       official, so the preview names no number at all (§13).
     • NEVER invents a signer. No signatory section is emitted, so the
       Composer's own "nothing suggested" path (an empty signature area)
       applies (§8).
     • Deterministic + PURE — no DOM, no pdfmake, no Firebase, no clock, no
       import of any js/ file. Same record ⇒ byte-identical output.

   The `renderingVisualModel` (Phase 6B `resolveRenderingVisualModel()`
   output) is carried straight through onto the returned object; this module
   does NOT resolve it — js/intelligence-backend-wiring.js#previewIntelligenceNorDraft
   does, from the SERVER-verified `provenance.visualBinding`, and only when
   the server's freshness verdict is `applied` (§9-11, §32).
   ============================================================ */

'use strict';

/** Structured intake facts → the Indonesian labels the review workspace
 *  itself shows (js/intelligence-console.js#WS_FIELDS). Passed directly as
 *  the Composer section's `field` id: composer-document.js#fieldLabel() is a
 *  no-op on a string that already reads correctly (no camelCase transition,
 *  no underscore, already capitalised). Cross-referenced by NAME only — this
 *  file never imports composer-document.js. */
const FACT_LABELS = Object.freeze([
  Object.freeze(['item', 'Barang / Uraian']),
  Object.freeze(['quantity', 'Jumlah']),
  Object.freeze(['unit', 'Satuan']),
  Object.freeze(['purpose', 'Tujuan / Keperluan']),
  Object.freeze(['budget', 'Perkiraan Anggaran']),
]);

const ID_MONTHS = Object.freeze([
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
]);

/** Preview-honest replacement for composer-document.js's built-in
 *  "…draf … yang telah disetujui" disclaimer — which would be FALSE for a
 *  draft still at `requires_review` (§12). */
const PREVIEW_DISCLAIMER = 'PRATINJAU internal Sarpras Intelligence dari draf NOR yang MASIH DALAM PENINJAUAN — '
  + 'bukan dokumen resmi: belum disetujui, belum bernomor, belum diterbitkan, belum ditandatangani. '
  + 'Nomor resmi, penandatangan, dan format akhir ditetapkan melalui proses persetujuan manusia dan Registry, bukan oleh pratinjau ini.';

function isPlainObject(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
function nonEmpty(v) { return v != null && String(v).trim() !== ''; }

/** `YYYY-MM-DD` → `Jakarta, D MMMM YYYY` (Indonesian). Any other string is
 *  used verbatim after the "Jakarta, " prefix. NEVER throws, never guesses a
 *  date that is not there. */
function jakartaDateline(rawDate) {
  const s = nonEmpty(rawDate) ? String(rawDate).trim() : '';
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      return `Jakarta, ${d} ${ID_MONTHS[mo - 1]} ${y}`;
    }
  }
  return `Jakarta, ${s}`;
}

/**
 * @param {object} record  a NorDraftRecord (the persisted, rehydrated shape)
 * @param {{ renderingVisualModel?: object|null }} [opts]
 *   `renderingVisualModel` — a Phase 6B `nor-visual-rendering-model@1`
 *   ALREADY resolved by the caller from the server-verified visual binding,
 *   or null for the deterministic-fallback layout.
 * @returns {{
 *   documentId:string, domainType:string, version:number, statusLabel:string,
 *   approvedAt:null, sections:Array<{field:string,value:*}>,
 *   renderingVisualModel:object|null, isPreview:true, disclaimerOverride:string
 * }} the frozen composer-document.js `build()` input
 */
export function buildIntelligenceNorViewModel(record, opts = {}) {
  const r = isPlainObject(record) ? record : {};
  const facts = isPlainObject(r.facts) ? r.facts : {};
  const rvm = opts && isPlainObject(opts.renderingVisualModel) ? opts.renderingVisualModel : null;

  const sections = [];

  // Dateline — composer-document.js#buildDocumentStructure detects a section
  // whose value starts (case-insensitively) with "jakarta,".
  const dateline = jakartaDateline(r.date);
  if (dateline) sections.push({ field: 'dateline', value: dateline });

  // Perihal — a fixed letterhead meta row (LETTERHEAD_META_FIELDS).
  if (nonEmpty(r.subject)) sections.push({ field: 'perihal', value: String(r.subject) });

  // Kepada Yth. — a proposed recipient is disclosed IN the printed text
  // (§6), a confirmed one uses the canonical representation. `recipients`
  // (array) routes through composer-document.js#roleListNode().
  if (nonEmpty(r.recipient)) {
    const known = r.recipientStatus === 'known';
    const text = known ? String(r.recipient) : `${String(r.recipient)} (diusulkan — belum dikonfirmasi)`;
    sections.push({ field: 'recipients', value: [text] });
  }

  // Body — `pattern:` prefix routes each paragraph through
  // composer-document.js as a letter body paragraph (never a "Rincian"
  // detail row). Paragraph breaks in the reviewed body are preserved.
  if (nonEmpty(r.body)) {
    const paras = String(r.body).split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    paras.forEach((p, i) => sections.push({ field: `pattern:body-${i}`, value: p }));
  }

  // Structured facts — the "Rincian" appendix (§5). Missing facts are simply
  // omitted (§5 — "Do not invent missing fields").
  for (const [key, label] of FACT_LABELS) {
    if (nonEmpty(facts[key])) sections.push({ field: label, value: String(facts[key]) });
  }

  // §13 — NO norNumber section, ever. The draft carries no official number
  // and a suggested one must never be printed where it could read as
  // official.

  return Object.freeze({
    documentId: nonEmpty(r.draftId) ? String(r.draftId) : 'draf',
    domainType: nonEmpty(r.jenis) ? `NOR — ${String(r.jenis)}` : 'NOR',
    version: Number.isInteger(r.version) && r.version >= 1 ? r.version : 1,
    // The draft's real status — never "Diterbitkan"/"Disetujui" (§12).
    statusLabel: 'Draf — menunggu peninjauan',
    approvedAt: null,
    sections: Object.freeze(sections.map((s) => Object.freeze({ ...s }))),
    renderingVisualModel: rvm,
    isPreview: true,
    disclaimerOverride: PREVIEW_DISCLAIMER,
  });
}
