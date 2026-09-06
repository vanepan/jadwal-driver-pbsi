/* ============================================================
   DOCUMENT-TYPE-CLASSIFIER.JS — Corpus Ingestion & Document Analysis
   (V2, Phase 5.x.2)

   PURPOSE: deterministically classify an extracted document as
   NOR | NOTA_ORGANISASI | MEMORANDUM | LEGACY | UNKNOWN with a
   confidence, from CONTENT + STRUCTURE signals (§6). Weak evidence →
   UNKNOWN. The filename is a weak hint only, and only when nothing in the
   content decides.

   SIGNALS (each contributes a bounded weight; see resolveTypeFromSignals):
     • explicit title line — "NOTA ORGANISASI" / "MEMORANDUM" / "MEMO"
     • reference-number shape — ".../Nota Organisasi/Sarpras/..." vs
       ".../Memo/Sarpras/..."
     • recurring meta labels — "Kepada Yth.", "Dari", "Perihal",
       "Lampiran", "Tembusan" (present ⇒ it is one of this family; absent
       ⇒ weak)
     • "Realisasi Petty Cash" subject phrasing (a NOR hallmark)
     • filename token — weak, last-resort only

   NOR vs NOTA_ORGANISASI: the document's OWN explicit self-title wins.
   A document that titles itself "NOTA ORGANISASI" is classified
   `NOTA_ORGANISASI` — that is what it says it is, and re-labelling it is
   an invention the corpus must not make. The petty-cash-realisation
   subject is recorded as a SECONDARY signal that also supports `NOR`
   (the platform's name for that instrument elsewhere) but does not
   override the explicit title. `NOR` is only the winner when the
   reference-number pattern ".../Nota Organisasi/Sarpras/..." + a
   petty-cash realisation subject are present WITHOUT a standalone title
   line. A "MEMO"/"MEMORANDUM" is `MEMORANDUM`; a memo carrying a
   petty-cash realisation (the job the current instrument does) also
   raises a `LEGACY` (predecessor) signal. Every mapping is a named,
   weighted signal — never an opaque score.

   RESPONSIBILITY: classifyDocumentType({ text, structure, originalFilename })
   -> { documentType, typeConfidence, typeSignals }.

   DEPENDENCIES: ../contracts/classification-result-contract.js.
   Pure — no I/O.
   ============================================================ */

'use strict';

import { CORPUS_DOCUMENT_TYPE } from '../../contracts/corpus-document-contract.js';
import {
  SIGNAL_SOURCE, makeClassificationSignal, resolveTypeFromSignals,
} from '../contracts/classification-result-contract.js';

const META_LABELS = ['kepada yth', 'dari', 'perihal', 'lampiran', 'tembusan'];

function firstNonEmptyLines(text, n) {
  return String(text || '').split(/\n+/).map((l) => l.trim()).filter(Boolean).slice(0, n);
}

/**
 * @param {{ text?: string, structure?: Array<{type:string,text:string}>, originalFilename?: string }} input
 * @returns {{ documentType: string, typeConfidence: number, typeSignals: import('../contracts/classification-result-contract.js').ClassificationSignal[] }}
 */
export function classifyDocumentType({ text = '', structure = [], originalFilename = '' } = {}) {
  const lower = String(text).toLowerCase();
  const head = firstNonEmptyLines(text, 6).join('   ').toLowerCase();
  const headingTexts = (Array.isArray(structure) ? structure : [])
    .filter((n) => n && n.type === 'heading').map((n) => String(n.text || '').toLowerCase());

  /** @type {Record<string, import('../contracts/classification-result-contract.js').ClassificationSignal[]>} */
  const byType = {
    [CORPUS_DOCUMENT_TYPE.NOR]: [],
    [CORPUS_DOCUMENT_TYPE.NOTA_ORGANISASI]: [],
    [CORPUS_DOCUMENT_TYPE.MEMORANDUM]: [],
    [CORPUS_DOCUMENT_TYPE.LEGACY]: [],
  };
  const allSignals = [];
  const add = (type, sig) => { byType[type].push(sig); allSignals.push(sig); };

  // ── title ──
  const titleHasNota = /\bnota\s+organisasi\b/.test(head) || headingTexts.some((h) => /\bnota\s+organisasi\b/.test(h));
  const titleHasMemorandum = /\bmemorandum\b/.test(head) || headingTexts.some((h) => /\bmemorandum\b/.test(h));
  const titleHasMemo = /(^|\W)memo(\W|$)/.test(head) || headingTexts.some((h) => /(^|\W)memo(\W|$)/.test(h));

  if (titleHasNota) {
    add(CORPUS_DOCUMENT_TYPE.NOTA_ORGANISASI, makeClassificationSignal({ source: SIGNAL_SOURCE.TITLE, name: 'title_nota_organisasi', weight: 0.6, evidence: 'title line contains "NOTA ORGANISASI"' }));
  }
  if (titleHasMemorandum) {
    add(CORPUS_DOCUMENT_TYPE.MEMORANDUM, makeClassificationSignal({ source: SIGNAL_SOURCE.TITLE, name: 'title_memorandum', weight: 0.6, evidence: 'title line contains "MEMORANDUM"' }));
  }
  if (titleHasMemo && !titleHasMemorandum) {
    add(CORPUS_DOCUMENT_TYPE.MEMORANDUM, makeClassificationSignal({ source: SIGNAL_SOURCE.TITLE, name: 'title_memo', weight: 0.4, evidence: 'title line contains "MEMO"' }));
  }

  // ── reference number shape ──
  if (/\/\s*nota organisasi\s*\/\s*sarpras\s*\//i.test(text)) {
    add(CORPUS_DOCUMENT_TYPE.NOTA_ORGANISASI, makeClassificationSignal({ source: SIGNAL_SOURCE.REFERENCE_NUMBER, name: 'ref_nota_organisasi', weight: 0.4, evidence: 'reference number ".../Nota Organisasi/Sarpras/..."' }));
  }
  if (/\/\s*memo\s*\/\s*sarpras\s*\//i.test(text)) {
    add(CORPUS_DOCUMENT_TYPE.MEMORANDUM, makeClassificationSignal({ source: SIGNAL_SOURCE.REFERENCE_NUMBER, name: 'ref_memo', weight: 0.4, evidence: 'reference number ".../Memo/Sarpras/..."' }));
  }

  // ── meta-label family membership ──
  const labelsPresent = META_LABELS.filter((l) => lower.includes(l));
  if (labelsPresent.length >= 3) {
    const sig = makeClassificationSignal({ source: SIGNAL_SOURCE.LABEL, name: 'meta_labels', weight: 0.15, evidence: `meta labels present: ${labelsPresent.join(', ')}` });
    // membership evidence — split across the two "letter" families it is consistent with
    add(CORPUS_DOCUMENT_TYPE.NOTA_ORGANISASI, sig);
    add(CORPUS_DOCUMENT_TYPE.MEMORANDUM, makeClassificationSignal({ ...sig, weight: 0.1 }));
  }

  // ── NOR hallmark: petty-cash realisation subject ──
  const isPettyCashRealisation = /realisasi\s+petty\s+cash/i.test(text) || /\bpetty\s*cash\b/i.test(text);
  if (isPettyCashRealisation && (titleHasNota || /\/\s*nota organisasi\s*\/\s*sarpras\s*\//i.test(text))) {
    add(CORPUS_DOCUMENT_TYPE.NOR, makeClassificationSignal({ source: SIGNAL_SOURCE.TERMINOLOGY, name: 'subject_petty_cash_realisation', weight: 0.7, evidence: '"NOTA ORGANISASI" + "Realisasi Petty Cash" subject — the NOR instrument' }));
    // it is still, literally, a Nota Organisasi — keep that reading alive too
    add(CORPUS_DOCUMENT_TYPE.NOTA_ORGANISASI, makeClassificationSignal({ source: SIGNAL_SOURCE.TERMINOLOGY, name: 'subject_petty_cash_realisation_no', weight: 0.2, evidence: 'petty-cash realisation subject' }));
  } else if (isPettyCashRealisation && (titleHasMemo || titleHasMemorandum)) {
    // a MEMO/MEMORANDUM doing the job a NOR now does → a predecessor instrument
    add(CORPUS_DOCUMENT_TYPE.LEGACY, makeClassificationSignal({ source: SIGNAL_SOURCE.TERMINOLOGY, name: 'memo_doing_nor_job', weight: 0.55, evidence: '"MEMO/MEMORANDUM" carrying a petty-cash realisation — a predecessor of the current NOR' }));
    add(CORPUS_DOCUMENT_TYPE.MEMORANDUM, makeClassificationSignal({ source: SIGNAL_SOURCE.TERMINOLOGY, name: 'memo_petty_cash', weight: 0.35, evidence: 'petty-cash realisation subject in a memorandum' }));
  }

  // ── filename token — WEAK, last resort ──
  const fn = String(originalFilename || '').toLowerCase();
  if (fn) {
    if (/nota organisasi/.test(fn)) add(CORPUS_DOCUMENT_TYPE.NOTA_ORGANISASI, makeClassificationSignal({ source: SIGNAL_SOURCE.FILENAME, name: 'filename_nota_organisasi', weight: 0.1, evidence: `filename hint: "${originalFilename}"` }));
    if (/\bmemo\b/.test(fn)) add(CORPUS_DOCUMENT_TYPE.MEMORANDUM, makeClassificationSignal({ source: SIGNAL_SOURCE.FILENAME, name: 'filename_memo', weight: 0.1, evidence: `filename hint: "${originalFilename}"` }));
  }

  const { documentType, typeConfidence } = resolveTypeFromSignals(byType);
  return { documentType, typeConfidence, typeSignals: allSignals };
}
