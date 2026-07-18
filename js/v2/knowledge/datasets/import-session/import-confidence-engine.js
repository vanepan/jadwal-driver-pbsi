/* ============================================================
   IMPORT-CONFIDENCE-ENGINE.JS — Deterministic Upload Confidence (Phase 2 Follow-up)

   PURPOSE: replace the old placeholder `overallConfidence = Math.min(...)`
   (three token-match confidences) with a real, documented, weighted,
   EXPLAINABLE confidence score composed from multiple independent pieces
   of deterministic evidence available at upload time. No AI, no ML model,
   no randomness — same "documented weighted formula, report-only, every
   number carries a rationale" discipline as machine-learning/
   confidence-engine.js (a deliberate SIBLING, not a reuse: that engine
   scores a POST-import KnowledgeItem via source-weight + corroboration;
   this scores the PRE-import inference of one uploaded file).

   THE AVAILABILITY RULE (the honest core of this engine): a signal is
   `available:true` only when there is genuine evidence to assess. Absence
   of evidence is NEUTRAL (available:false → excluded from the weighted
   mean), never a punitive zero — so a file with an uninformative filename,
   or the very first upload in a brand-new domain, is not falsely marked
   low-confidence for lacking evidence it could never have had. The overall
   score is the weighted mean over ONLY the available signals, re-normalized
   — which is also what guarantees the score is never a constant: which
   signals are available, and their sub-scores, both vary per file.

   HONEST GAPS (confirmed product decision, same pattern as the existing
   "Profile Conflict not implemented" note): two of the requested example
   signals have no real evidence source at upload time and are therefore
   reported but NEVER scored (available:false, always):
   - policyMatch: there is no policy-conflict engine; this reports the real
     count of approved Profile Overrides for the domain (a real read) but
     cannot score a "match" without a conflict check that does not exist.
   - knowledgeGraphEvidence: the document is not in the Knowledge Graph at
     upload — that edge only exists AFTER it becomes Knowledge — so there
     is genuinely nothing to measure yet.

   RESPONSIBILITY: computeImportConfidence(evidence) — pure. The CALLER
   (metadata-inference-engine.js#inferMetadata) does the real repository
   reads (pattern discovery, profile overrides) and hands this engine plain
   numbers, keeping this file trivially unit-testable with no dependency on
   the rest of the platform.

   DEPENDENCIES: none.
   ============================================================ */

'use strict';

/** Level bands — purely DESCRIPTIVE labels ("high"/"medium"/"low") for the
 *  explainability report. Defined locally (not imported) to avoid an import
 *  cycle — metadata-inference-engine.js imports THIS file.
 *
 *  Phase 2.6 — LEVEL_HIGH no longer mirrors any decision threshold: the 0.85
 *  auto-import bar it used to track has been removed (see
 *  metadata-inference-engine.js's note on why). The ONE confidence value that
 *  still gates anything is AUTO_POPULATE_CONFIDENCE_THRESHOLD (0.6), which
 *  LEVEL_MEDIUM matches. 0.85 survives here only as the boundary of the word
 *  "high" in a human-readable report — it decides nothing. */
const LEVEL_HIGH = 0.85;
const LEVEL_MEDIUM = 0.6;

/** Weights per scoring signal. Do NOT need to sum to 1 — the overall score
 *  re-normalizes over whichever signals are actually available. */
const SIGNAL_WEIGHTS = Object.freeze({
  filenameSimilarity: 0.25,
  metadataCompleteness: 0.25,
  duplicateConfidence: 0.20,
  documentStructure: 0.15,
  contentFacts: 0.10,
  historicalSimilarity: 0.15,
});

/** Keys that, when present in parsed JSON, indicate real document content
 *  (not just an arbitrary object) — a small, honest heuristic, not schema
 *  validation. */
const EXPECTED_CONTENT_KEYS = ['value', 'documentnumber', 'rules', 'recipients', 'facts', 'content'];

function clamp01(n) {
  if (typeof n !== 'number' || Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * @typedef {Object} ImportConfidenceEvidence
 * @property {{domainType: number, datasetType: number, knowledgeKind: number}} filenameMatch - raw 0..1 token-match confidence per field (0 when only a default/scoped value was used, i.e. no filename evidence)
 * @property {{domainType: number, datasetType: number, knowledgeKind: number}} fieldResolution - per-field resolution quality: 1 = matched real evidence, 0.65 = a sensible registered default was used, 0 = genuinely unresolved (e.g. null domain)
 * @property {boolean} isDuplicate - a real byte-identical (sha256) hit in the dedup ledger
 * @property {string} kind - IMPORT_SESSION_KIND (pdf/docx/json/...)
 * @property {Object|null} parsedContent - JSON.parse() result (JSON only), else null
 * @property {number} historicalSupport - max Pattern Discovery support count for filename-token-matching patterns (0 = no precedent)
 * @property {number} approvedOverrideCount - real count of approved Profile Overrides for the domain (for the honest policyMatch rationale)
 * @property {{ran: boolean, overallConfidence: number}|null} contentExtraction - V2, Part A1: content-fact-extraction-engine.js's real result for a `.docx` session (docx-text-extractor.js + content-fact-extraction-engine.js), or null when extraction never ran (any non-docx kind, or a docx whose text could not be read at all — see docx-text-extractor.js's honest failure mode). PDF still has no reader, so this stays null for it — the two signals below keep their original `else` branch for anything that isn't a successfully-read docx.
 */

/**
 * @param {ImportConfidenceEvidence} evidence
 * @returns {{score: number, level: 'low'|'medium'|'high', signals: Array<{id: string, label: string, weight: number|null, subScore: number|null, available: boolean, rationale: string}>}}
 */
export function computeImportConfidence(evidence = {}) {
  const {
    filenameMatch = { domainType: 0, datasetType: 0, knowledgeKind: 0 },
    fieldResolution = { domainType: 0, datasetType: 0, knowledgeKind: 0 },
    isDuplicate = false,
    kind = null,
    parsedContent = null,
    historicalSupport = 0,
    approvedOverrideCount = 0,
    contentExtraction = null,
  } = evidence;

  const isJson = kind === 'json';
  const isExtractedDocx = kind === 'docx' && contentExtraction && contentExtraction.ran;
  const signals = [];

  // 1 — filenameSimilarity: available only when a token actually matched.
  const bestFilename = Math.max(clamp01(filenameMatch.domainType), clamp01(filenameMatch.datasetType), clamp01(filenameMatch.knowledgeKind));
  if (bestFilename > 0) {
    signals.push({ id: 'filenameSimilarity', label: 'Kemiripan Nama File', weight: SIGNAL_WEIGHTS.filenameSimilarity, subScore: round2(bestFilename), available: true, rationale: `Token nama file cocok dengan kosakata terdaftar (skor cocok tertinggi ${round2(bestFilename)}).` });
  } else {
    signals.push({ id: 'filenameSimilarity', label: 'Kemiripan Nama File', weight: null, subScore: null, available: false, rationale: 'Tidak ada token nama file yang cocok — tidak ada bukti dari nama file (netral, tidak menurunkan skor).' });
  }

  // 2 — metadataCompleteness: always available (there is always a
  //     classification result to assess).
  const resScores = [clamp01(fieldResolution.domainType), clamp01(fieldResolution.datasetType), clamp01(fieldResolution.knowledgeKind)];
  const metaScore = resScores.reduce((a, b) => a + b, 0) / 3;
  signals.push({ id: 'metadataCompleteness', label: 'Kelengkapan Metadata', weight: SIGNAL_WEIGHTS.metadataCompleteness, subScore: round2(metaScore), available: true, rationale: `Resolusi 3 bidang klasifikasi (domain/tipe dataset/knowledge kind): ${resScores.map(round2).join(' / ')} (1 = cocok nyata, 0.65 = default wajar, 0 = belum terselesaikan).` });

  // 3 — duplicateConfidence: available only for a real byte-identical hit.
  if (isDuplicate) {
    signals.push({ id: 'duplicateConfidence', label: 'Keyakinan Duplikat', weight: SIGNAL_WEIGHTS.duplicateConfidence, subScore: 1, available: true, rationale: 'Byte-identik (sha256) dengan file yang sudah tersimpan — identitas dokumen sangat pasti.' });
  } else {
    signals.push({ id: 'duplicateConfidence', label: 'Keyakinan Duplikat', weight: null, subScore: null, available: false, rationale: 'Bukan duplikat konten — tidak ada bukti duplikat untuk dinilai (netral).' });
  }

  // 4 — documentStructure: JSON only (we never parse PDF/DOCX content).
  if (isJson) {
    let structScore = 0;
    let structRationale = 'JSON tidak dapat di-parse atau kosong — struktur lemah.';
    if (parsedContent && typeof parsedContent === 'object') {
      const keys = Object.keys(parsedContent);
      if (keys.length > 0) {
        const hasExpected = keys.some((k) => EXPECTED_CONTENT_KEYS.includes(String(k).toLowerCase()));
        structScore = hasExpected ? 1 : 0.8;
        structRationale = hasExpected
          ? `JSON ter-parse dengan ${keys.length} kunci termasuk kunci konten yang dikenali.`
          : `JSON ter-parse dengan ${keys.length} kunci (tanpa kunci konten yang dikenali).`;
      } else {
        structScore = 0.3;
        structRationale = 'JSON ter-parse tetapi objek kosong.';
      }
    }
    signals.push({ id: 'documentStructure', label: 'Struktur Dokumen', weight: SIGNAL_WEIGHTS.documentStructure, subScore: round2(structScore), available: true, rationale: structRationale });
  } else if (isExtractedDocx) {
    // V2, Part A1 — real evidence now exists for .docx: the document was
    // actually read (Mammoth), so "structure" here means "did the known
    // memo shape (No./Dari/Perihal) resolve" — the same signal
    // content-fact-extraction-engine.js's own overallConfidence already is.
    signals.push({ id: 'documentStructure', label: 'Struktur Dokumen', weight: SIGNAL_WEIGHTS.documentStructure, subScore: round2(contentExtraction.overallConfidence), available: true, rationale: `Konten .docx berhasil dibaca (Mammoth) — struktur memo (No./Dari/Perihal) cocok ${round2(contentExtraction.overallConfidence * 3)}/3 bidang.` });
  } else {
    signals.push({ id: 'documentStructure', label: 'Struktur Dokumen', weight: null, subScore: null, available: false, rationale: kind === 'docx' ? 'Konten .docx tidak berhasil dibaca (file rusak/tidak didukung) — struktur tidak dinilai (netral).' : 'Konten PDF tidak di-parse (tanpa OCR/AI) — struktur tidak dinilai (netral).' });
  }

  // 5 — contentFacts: JSON only; for PDF/DOCX facts are typed later, so
  //     absence at upload is neutral (available:false), not negative.
  if (isJson) {
    const hasContent = !!parsedContent && typeof parsedContent === 'object' && Object.keys(parsedContent).length > 0;
    signals.push({ id: 'contentFacts', label: 'Fakta Konten', weight: SIGNAL_WEIGHTS.contentFacts, subScore: hasContent ? 1 : 0, available: true, rationale: hasContent ? 'Konten JSON nyata sudah tersedia pada saat unggah.' : 'JSON tanpa konten nyata — fakta belum tersedia.' });
  } else if (isExtractedDocx) {
    signals.push({ id: 'contentFacts', label: 'Fakta Konten', weight: SIGNAL_WEIGHTS.contentFacts, subScore: round2(contentExtraction.overallConfidence), available: true, rationale: contentExtraction.overallConfidence > 0 ? `Fakta konten diekstraksi otomatis dari isi .docx pada saat unggah (keyakinan ${round2(contentExtraction.overallConfidence)}).` : 'Konten .docx dibaca tetapi tidak ada bidang fakta (No./Dari/Perihal) yang cocok — fakta belum tersedia.' });
  } else {
    signals.push({ id: 'contentFacts', label: 'Fakta Konten', weight: null, subScore: null, available: false, rationale: kind === 'docx' ? 'Konten .docx tidak berhasil dibaca — fakta diisi manusia setelah unggah (netral).' : 'Fakta PDF diisi manusia setelah unggah — belum tersedia (netral).' });
  }

  // 6 — historicalSimilarity: available only when there is real precedent.
  if (historicalSupport > 0) {
    const histScore = Math.min(1, historicalSupport / 3);
    signals.push({ id: 'historicalSimilarity', label: 'Kemiripan Historis', weight: SIGNAL_WEIGHTS.historicalSimilarity, subScore: round2(histScore), available: true, rationale: `Pattern Discovery: dukungan historis ${historicalSupport} untuk pola yang cocok (dibatasi pada 3).` });
  } else {
    signals.push({ id: 'historicalSimilarity', label: 'Kemiripan Historis', weight: null, subScore: null, available: false, rationale: 'Belum ada preseden historis yang cocok — tidak ada bukti historis (netral).' });
  }

  // 7 — policyMatch: HONEST GAP. Real read (override count), never scored.
  signals.push({ id: 'policyMatch', label: 'Kesesuaian Kebijakan', weight: null, subScore: null, available: false, rationale: approvedOverrideCount > 0
    ? `${approvedOverrideCount} Profile Override disetujui untuk domain ini; deteksi konflik kebijakan belum diimplementasikan, jadi tidak dinilai.`
    : 'Tidak ada Profile Override yang disetujui untuk domain ini — tidak ada kebijakan untuk dicocokkan (netral).' });

  // 8 — knowledgeGraphEvidence: HONEST GAP. Not in the graph at upload.
  signals.push({ id: 'knowledgeGraphEvidence', label: 'Bukti Knowledge Graph', weight: null, subScore: null, available: false, rationale: 'Dokumen belum ada di Knowledge Graph saat unggah (tepi graf baru terbentuk setelah menjadi Knowledge) — belum ada yang bisa diukur.' });

  // Overall — weighted mean over AVAILABLE scoring signals only.
  const scoring = signals.filter((s) => s.available && typeof s.weight === 'number');
  const weightSum = scoring.reduce((n, s) => n + s.weight, 0);
  const score = weightSum > 0
    ? round2(scoring.reduce((n, s) => n + s.weight * s.subScore, 0) / weightSum)
    : 0;

  const level = score >= LEVEL_HIGH ? 'high' : score >= LEVEL_MEDIUM ? 'medium' : 'low';

  return { score, level, signals };
}
