/* ============================================================
   STRUCTURE-OBSERVER.JS — Corpus Ingestion & Document Analysis
   (V2, Phase 5.x.2)

   PURPOSE: from an ExtractionResult, identify the recurring STRUCTURAL
   elements of a PBSI NOR / Memorandum and emit them as CorpusObservations
   (§10). Every observation is EVIDENCE — `lifecycleState: 'observed'` —
   never an "official rule". A single document's structure is one data
   point; a human decides later whether it is a convention.

   Recognised elements (each → one observation, deterministic key):
     document_title, dateline, reference_number, recipient_block (Kepada
     Yth.), sender (Dari), subject (Perihal), attachment (Lampiran),
     copy_distribution (Tembusan), opening (Dengan hormat,), body_present,
     closing, signature_block, terbilang (amount-in-words), page_count.

   Each observation carries provenance back to the exact source document
   (§16). For a DOCX there is no page geometry, so `pageNumber` is null
   and `region` is null — honest, never fabricated.

   RESPONSIBILITY: observeStructure({ documentId, extraction, sourceFileId,
   at }) -> CorpusObservation[].

   DEPENDENCIES: ../contracts/... (provenance, observation category),
   ../corpus-observation-record.js (makeObservationFromExtraction).
   Pure — no I/O, no model.
   ============================================================ */

'use strict';

import { OBSERVATION_CATEGORY, OBSERVATION_MODALITY } from '../contracts/corpus-observation-contract.js';
import { EXTRACTION_METHOD } from '../contracts/corpus-provenance-contract.js';
import { makeObservationFromExtraction } from '../corpus-observation-record.js';

const LINE_SPLIT = /\r?\n/;

/** Build the provenance array for a structural observation. */
function prov({ documentId, sourceFileId, pageNumber, method, confidence, at }) {
  return [{
    sourceDocumentId: documentId,
    sourceFileId: sourceFileId || null,
    pageNumber: pageNumber || null,
    region: null,                 // structure observations are not spatially anchored here
    extractionMethod: method || EXTRACTION_METHOD.UNKNOWN,
    extractedAt: at,
    confidence: typeof confidence === 'number' ? confidence : 0.6,
  }];
}

/**
 * @param {{ documentId: string, extraction: import('../ingestion/contracts/extraction-result-contract.js').ExtractionResult, sourceFileId?: string|null, at?: string }} input
 * @returns {import('../contracts/corpus-observation-contract.js').CorpusObservation[]}
 */
export function observeStructure({ documentId, extraction, sourceFileId = null, at } = {}) {
  const when = at || new Date().toISOString();
  const ex = extraction || {};
  const text = typeof ex.text === 'string' ? ex.text : '';
  const method = ex.method || EXTRACTION_METHOD.UNKNOWN;
  const lines = text.split(LINE_SPLIT).map((l) => l.trim()).filter(Boolean);
  const joined = lines.join('\n');
  const out = [];

  const emit = ({ category, key, modality, observedValue, observation, confidence }) => {
    out.push(makeObservationFromExtraction({
      documentId, category, key,
      observedValue: observedValue == null ? null : String(observedValue).slice(0, 400),
      observation: observation || null,
      modality: modality || OBSERVATION_MODALITY.STRUCTURE,
      provenance: prov({ documentId, sourceFileId, method, confidence, at: when }),
      confidence: typeof confidence === 'number' ? confidence : 0.6,
      at: when,
    }));
  };

  // ── title ──
  const titleLine = lines.slice(0, 5).find((l) => /^(NOTA ORGANISASI|MEMORANDUM|MEMO)\b/i.test(l));
  if (titleLine) {
    emit({ category: OBSERVATION_CATEGORY.STRUCTURE, key: 'document_title', observedValue: titleLine,
      observation: { role: 'title', lineIndex: lines.indexOf(titleLine) }, confidence: 0.85 });
  }

  // ── dateline ──
  const datelineLine = lines.find((l) => /^[A-Z][A-Za-zÀ-ſ.'-]{2,20}\s*,\s*\d{1,2}\s+[A-Za-zÀ-ſ]{3,12}\s+\d{4}/.test(l));
  if (datelineLine) {
    emit({ category: OBSERVATION_CATEGORY.DATE_CONVENTION, key: 'dateline', observedValue: datelineLine,
      observation: { role: 'dateline', pattern: '<Kota>, <d> <BulanIndonesia> <yyyy>' }, confidence: 0.8 });
  }

  // ── reference number ──
  const refLine = lines.find((l) => /^No\.?\s*\.?\s*\d+\s*\/.+\/(Sarpras|SARPRAS)\/.+\/\d{4}/i.test(l) || /^No\.?\s*\d+\/(Nota Organisasi|Memo)\//i.test(l));
  if (refLine) {
    emit({ category: OBSERVATION_CATEGORY.STRUCTURE, key: 'reference_number', observedValue: refLine,
      observation: { role: 'reference', pattern: '<seq>/<Instrument>/Sarpras/<RomanMonth>/<year>' }, confidence: 0.8 });
  }

  // ── meta labels (Kepada Yth. / Dari / Perihal / Lampiran / Tembusan) ──
  const labelSpecs = [
    { re: /^(Kepada\s+Yth\.?)\s*:?/i, key: 'recipient_label', category: OBSERVATION_CATEGORY.RECIPIENT_CONVENTION },
    { re: /^(Dari)\s*:?/i, key: 'sender_label', category: OBSERVATION_CATEGORY.STRUCTURE },
    { re: /^(Perihal)\s*:?/i, key: 'subject_label', category: OBSERVATION_CATEGORY.SUBJECT_CONVENTION },
    { re: /^(Lampiran)\s*:?/i, key: 'attachment_label', category: OBSERVATION_CATEGORY.ATTACHMENT_CONVENTION },
    { re: /^(Tembusan(\s+Yth\.?)?)\s*:?/i, key: 'copy_label', category: OBSERVATION_CATEGORY.COPY_CONVENTION },
  ];
  for (const spec of labelSpecs) {
    const line = lines.find((l) => spec.re.test(l));
    if (line) {
      const m = line.match(spec.re);
      emit({ category: spec.category, key: spec.key, observedValue: (m && m[1]) || line,
        observation: { role: 'meta_label', fullLine: line.slice(0, 200) }, confidence: 0.75 });
    }
  }

  // ── opening ──
  const opening = lines.find((l) => /^Dengan hormat\b/i.test(l));
  if (opening) {
    emit({ category: OBSERVATION_CATEGORY.OPENING_PATTERN, key: 'opening_salutation', observedValue: opening,
      observation: { role: 'opening' }, confidence: 0.8 });
  }

  // ── terbilang (amount in words) ──
  const terbilang = lines.find((l) => /^Terbilang\s*:/i.test(l));
  if (terbilang) {
    emit({ category: OBSERVATION_CATEGORY.BODY_STRUCTURE, key: 'terbilang_line', observedValue: terbilang.slice(0, 200),
      observation: { role: 'body', element: 'amount_in_words' }, confidence: 0.7 });
  }

  // ── closing ──
  const closing = lines.find((l) => /(atas perhatian(nya)?|demikian( kami sampaikan| disampaikan)?|terima kasih)\b/i.test(l));
  if (closing) {
    emit({ category: OBSERVATION_CATEGORY.CLOSING_PATTERN, key: 'closing_courtesy', observedValue: closing.slice(0, 200),
      observation: { role: 'closing' }, confidence: 0.65 });
  }

  // ── signature block (a position label after the closing, near the end) ──
  const tail = lines.slice(Math.max(0, lines.length - 12));
  const sigLine = tail.find((l) => /(Plt\.?\s*)?(Kabid|Kepala Bidang|Wakil|Sekretaris|Bendahara|Ketua)\b/i.test(l) && l.length < 80);
  if (sigLine) {
    emit({ category: OBSERVATION_CATEGORY.SIGNATURE_WORDING, key: 'signatory_title', observedValue: sigLine,
      observation: { role: 'signature', nearEnd: true }, confidence: 0.55 });
  }

  // ── page count (structure metadata) ──
  if (Number.isInteger(ex.pageCount) && ex.pageCount >= 1) {
    emit({ category: OBSERVATION_CATEGORY.STRUCTURE, key: 'page_count', observedValue: String(ex.pageCount),
      observation: { role: 'page_geometry', pageCount: ex.pageCount, extractionMethod: method }, confidence: 0.9 });
  }

  // ── heading outline (DOCX structure) ──
  const headings = (Array.isArray(ex.structure) ? ex.structure : []).filter((n) => n && n.type === 'heading');
  if (headings.length) {
    emit({ category: OBSERVATION_CATEGORY.BODY_STRUCTURE, key: 'heading_outline',
      observedValue: headings.map((h) => h.text).join(' | ').slice(0, 300),
      observation: { role: 'outline', headings: headings.map((h) => ({ level: h.level, text: String(h.text).slice(0, 120) })) },
      confidence: 0.6 });
  }

  return out;
}
