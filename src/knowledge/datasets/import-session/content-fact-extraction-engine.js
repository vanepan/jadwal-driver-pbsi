/* ============================================================
   CONTENT-FACT-EXTRACTION-ENGINE.JS — Intelligent Ingestion (V2, Part A1)

   PURPOSE: derive documentNumber / senderOrigin / value (the three
   content facts that used to require a human to open Advanced Metadata
   and type them by hand) from a real `.docx`'s extracted text
   (docx-text-extractor.js). Deterministic regex/keyword extraction over
   real text — the SAME idiom problem-intelligence/problem-parser.js and
   conversation/intent/intent-engine.js already use elsewhere in this
   codebase ("no AI/embeddings"), not a new paradigm. Every field carries
   its own confidence and basis — an unmatched field is honestly absent
   (empty string, confidence 0), never guessed.

   GROUNDING (per this project's own standing rule — "grounded against
   real PBSI documents, real bugs found this way", see docs/SPRINT_9_8_
   PRODUCTION_READINESS.md): every pattern below was verified against two
   real, already-archived NOR documents in this repository —
   "Petty Cash Center/uploads/Memo Sarpras 362 - ....docx" and
   "...Nota Organisasi Sarpras 113 - ....docx" — not hand-waved. Both
   share the exact same PBSI memo convention:

     No. 362/Memo/Sarpras/IX/2025            <- documentNumber
     ...
     Dari  :  Kabid Sarana dan Prasarana      <- senderOrigin
     ...
     Perihal : Realisasi Petty Cash ... Bidang Sarana dan
     Prasarana                                <- value (wraps onto the
                                                  next line in real
                                                  documents — handled,
                                                  see extractValue())

   RESPONSIBILITY: extractContentFacts(text, filename).

   NON-GOALS: recipients/cc ("Kepada Yth."/"Tembusan Yth.") and itemized
   tables are NOT extracted here — both are real, visible patterns in the
   same sample documents, but filling them is Sprint 11.1's own,
   deliberately-scoped-out territory (needs new fact-gathering/Knowledge,
   not just text extraction — see docs/PHASE_11_EXECUTIVE_INTELLIGENCE.md
   planning notes). "Catatan" is never extracted — it is an inherently
   open-ended human-annotation field, not a fact this document states.

   DEPENDENCIES: ./parser-registry.js (CURRENT_CONTENT_PARSER_VERSION
   stamp only — no control-flow dependency).
   ============================================================ */

'use strict';

import { CURRENT_CONTENT_PARSER_VERSION } from './parser-registry.js';

/** Lines that start a new "Label : value" field in this memo convention —
 *  used to stop a continuation-line append from swallowing the NEXT
 *  field by mistake (see extractValue()'s Perihal-wraps-a-line case,
 *  grounded in the real "...Bidang Sarana dan\nPrasarana" sample). */
const KNOWN_LABEL_RE = /^(Kepada|Dari|Tembusan|Perihal|Lampiran|No\.?|Jakarta)\b/i;

const DOCUMENT_NUMBER_RE = /\bNo\.?\s*(\d+[^\n\r]*?\/\d{4})\b/i;
const SENDER_LABEL_RE = /^Dari\s*:?\s*(.+)$/i;
const VALUE_LABEL_RE = /^Perihal\s*:?\s*(.+)$/i;

function splitLines(text) {
  return String(text || '').split(/\r?\n/);
}

/** documentNumber — a single, whole-text regex is enough (the pattern's
 *  own `\/\d{4}` anchor already keeps it from crossing a real line
 *  boundary; `[^\n\r]` makes that explicit too). */
function extractDocumentNumber(text) {
  const m = text.match(DOCUMENT_NUMBER_RE);
  if (!m) return { value: '', confidence: 0, basis: 'Tidak ditemukan pola "No. .../.../dddd" pada teks dokumen.' };
  return { value: m[1].trim(), confidence: 1, basis: `Ditemukan pada baris "No.": "${m[0].trim()}".` };
}

/** senderOrigin ("Dari") — single-line label:value, no continuation. */
function extractSender(lines) {
  for (const line of lines) {
    const m = line.match(SENDER_LABEL_RE);
    if (m && m[1].trim()) {
      return { value: m[1].trim(), confidence: 1, basis: `Ditemukan pada baris "Dari": "${line.trim()}".` };
    }
  }
  return { value: '', confidence: 0, basis: 'Tidak ditemukan baris "Dari :" pada teks dokumen.' };
}

/** value ("Perihal"/subject) — label:value, PLUS one continuation-line
 *  lookahead: real PBSI memos wrap a long Perihal onto a LATER paragraph
 *  with no label of its own, separated by one or more BLANK paragraphs
 *  (verified against the real "...Bidang Sarana dan\n\nPrasarana" sample
 *  — mammoth renders each Word paragraph, including empty ones, as its
 *  own line). So the lookahead skips blank lines to find the next real
 *  content line, and only appends it when that line does NOT itself
 *  start a known label — otherwise "Perihal: X" eventually followed by
 *  "Lampiran: Y" would wrongly swallow "Lampiran: Y" into the subject. */
function extractValue(lines) {
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(VALUE_LABEL_RE);
    if (!m || !m[1].trim()) continue;
    let value = m[1].trim();
    let continuationLine = '';
    for (let j = i + 1; j < lines.length && j <= i + 4; j++) {
      const candidate = lines[j].trim();
      if (!candidate) continue; // skip blank paragraphs, keep looking
      if (!KNOWN_LABEL_RE.test(candidate)) continuationLine = candidate;
      break; // first real content line decides it either way
    }
    if (continuationLine) value = `${value} ${continuationLine}`;
    return { value, confidence: 1, basis: `Ditemukan pada baris "Perihal": "${lines[i].trim()}"${continuationLine ? ' (+ baris lanjutan)' : ''}.` };
  }
  return { value: '', confidence: 0, basis: 'Tidak ditemukan baris "Perihal :" pada teks dokumen.' };
}

/**
 * @param {string} text - raw text from docx-text-extractor.js#extractDocxText
 * @param {string} filename - unused for content extraction today (reserved for future filename-vs-content cross-checks); accepted for a stable call shape with metadata-inference-engine.js's own inferMetadata(...)
 * @returns {{
 *   documentNumber: string, senderOrigin: string, value: string,
 *   confidencePerField: {documentNumber: number, senderOrigin: number, value: number},
 *   basisPerField: {documentNumber: string, senderOrigin: string, value: string},
 *   overallConfidence: number,
 *   parserVersion: number,
 * }}
 */
/** Sprint 11.10 — "IF confidence is high, save automatically; ELSE ask
 *  only for what's missing" only holds when EVERY field this engine is
 *  designed to find (documentNumber/senderOrigin/value — see this file's
 *  own header) was actually found. `overallConfidence` alone hid a real
 *  gap: 2-of-3 fields found already averages to 0.67 (above the
 *  auto-populate bar), which used to let the genuinely-blank third field
 *  ride along into manualEntryFacts as an empty string — silently
 *  satisfying import-session-engine.js#hasContentFacts()'s "any key
 *  present" check and skipping the human gate for a fact nobody ever
 *  confirmed. The one caller that decides "skip the human, auto-import"
 *  (dataset-import-center.js#processOneFile) uses this instead of the
 *  average; a partial result still pre-fills the Advanced Metadata form
 *  (attachExtractionSuggestion runs unconditionally) so the human is
 *  asked ONLY for the specific field this returns false because of.
 * @param {{documentNumber: number, senderOrigin: number, value: number}} confidencePerField
 * @returns {boolean}
 */
export function isContentFactsComplete(confidencePerField) {
  return !!confidencePerField
    && confidencePerField.documentNumber > 0
    && confidencePerField.senderOrigin > 0
    && confidencePerField.value > 0;
}

export function extractContentFacts(text) {
  const lines = splitLines(text);
  const documentNumber = extractDocumentNumber(text);
  const senderOrigin = extractSender(lines);
  const value = extractValue(lines);

  const fields = { documentNumber, senderOrigin, value };
  const foundCount = Object.values(fields).filter((f) => f.confidence > 0).length;

  return {
    documentNumber: documentNumber.value,
    senderOrigin: senderOrigin.value,
    value: value.value,
    confidencePerField: {
      documentNumber: documentNumber.confidence,
      senderOrigin: senderOrigin.confidence,
      value: value.confidence,
    },
    basisPerField: {
      documentNumber: documentNumber.basis,
      senderOrigin: senderOrigin.basis,
      value: value.basis,
    },
    overallConfidence: Math.round((foundCount / 3) * 100) / 100,
    parserVersion: CURRENT_CONTENT_PARSER_VERSION,
  };
}
