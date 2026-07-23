/* ============================================================
   METADATA-INFERENCE-ENGINE.JS — Zero-Configuration Dataset Import (V2.1)

   PURPOSE: "automatic metadata detection... without OCR or AI... use
   deterministic information only" — infers domainType/datasetType/
   knowledgeKind from filename/folder tokens matched against ALREADY-
   REGISTERED vocabulary (registry/domain-type-registry.js,
   registry/kind-registry.js, datasets/contracts/dataset-contract.js's
   DATASET_TYPE), plus duplicate-history via the new file-storage dedup
   ledger, plus Pattern Discovery's existing statistics
   (profiles/pattern-discovery-engine.js, UNCHANGED). Every inferred field
   carries its own confidence and rationale — nothing is silently guessed,
   and a field with no matching evidence always resolves to an honest
   low-confidence default rather than a fabricated one.

   RESPONSIBILITY: inferMetadata() (administrative metadata only — never
   the document's actual content, see import-session-contract.js's header
   for why content-fact completeness is a LATER gate, not an upload-time
   one), inferPatternAssisted() (Pattern Discovery cross-reference,
   confirm-only suggestions), AUTO_POPULATE_CONFIDENCE_THRESHOLD (the one
   number both this file and the UI layer read, defined once).

   DEPENDENCIES: registry/domain-type-registry.js, registry/kind-registry.js
   (reused, vocabulary only), datasets/contracts/dataset-contract.js
   (DATASET_TYPE), services/pattern-discovery-service.js (reused
   unchanged), file-storage/file-storage-registry.js (reused — the new
   top-level sibling module; knowledge/ is explicitly allowed to import
   FROM it, since file-storage/ has zero dependency back).

   NON-GOALS: never reads file CONTENT (no OCR, no parsing beyond what
   ../import-session-engine.js already does for JSON). Never auto-applies
   a Pattern Discovery suggestion — inferPatternAssisted() always returns
   confirm-required suggestions, never a silent field write.
   ============================================================ */

'use strict';

import { listDomainTypes } from '../../registry/domain-type-registry.js';
import { listKinds } from '../../registry/kind-registry.js';
import { DATASET_TYPE } from '../contracts/dataset-contract.js';
import { computePatternRecommendations } from '../../services/pattern-discovery-service.js';
import { hasStoredFile, getStoredFileBySha256 } from '../../../file-storage/file-storage-registry.js';
// Phase 2 Follow-up — the real deterministic confidence engine that
// replaces the old Math.min() placeholder. See its header for the
// availability rule and the two honest gaps.
import { computeImportConfidence } from './import-confidence-engine.js';
import { listOverrides } from '../../profiles/overrides/profile-override-engine.js';
import { LIFECYCLE_STATE } from '../../contracts/lifecycle-contract.js';

/** The one threshold deciding "auto-populate" vs "fall back to Advanced
 *  Metadata" — defined once, read by both this engine's callers and the
 *  UI layer, per Part A/E of the roadmap. */
export const AUTO_POPULATE_CONFIDENCE_THRESHOLD = 0.6;

/* Phase 2.6 — AUTO_IMPORT_CONFIDENCE_THRESHOLD (0.85) was REMOVED here.
 *
 * It was a second, higher confidence bar that once decided whether a session
 * could "skip human review entirely". Phase 2.5 superseded it with a better
 * question — is the real content EVIDENCE present? — and left the constant
 * behind, exported, referenced by nothing but its own explanatory comment. A
 * threshold that no longer gates anything is not documentation; it is a
 * plausible-looking number that the next reader will assume is load-bearing.
 *
 * What actually decides autonomy now, in exactly one place
 * (../pipeline-scheduler.js):
 *   - AUTO_POPULATE_CONFIDENCE_THRESHOLD (below) OR a human's
 *     `metadataConfirmedBy`  -> is the METADATA trustworthy?
 *   - hasContentFacts()      -> does the real EVIDENCE exist?
 * Both true, and the pipeline completes on its own. Either false, and it
 * parks and says why. Confidence never again decides whether a human must
 * click a button. */

/** Lower-case, extension-stripped, punctuation-split tokens — the one
 *  deterministic signal every inference below reads. */
export function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Best registry-entry match by token overlap against `{id, label}`
 *  candidates — pure token-set intersection, no fuzzy/semantic matching. */
function bestLabelMatch(tokens, candidates) {
  let best = null;
  for (const c of candidates) {
    const labelTokens = tokenize(c.label);
    const idTokens = tokenize(c.id);
    const matchCount = tokens.filter((t) => labelTokens.includes(t) || idTokens.includes(t)).length;
    if (matchCount === 0) continue;
    const confidence = Math.min(1, matchCount / Math.max(labelTokens.length, idTokens.length, 1));
    if (!best || confidence > best.confidence) {
      best = { id: c.id, confidence, rationale: `Token nama file/folder cocok dengan "${c.label}".` };
    }
  }
  return best;
}

/** Max Pattern Discovery support count among patterns whose value tokens
 *  match the filename — the real historical-similarity evidence, reusing
 *  the existing engine unchanged. 0 when there is no precedent. */
function historicalSupportFor(domainValue, filename, folderPath) {
  if (!domainValue) return 0;
  let max = 0;
  const tokens = [...tokenize(filename), ...tokenize(folderPath)];
  for (const r of computePatternRecommendations(domainValue)) {
    const valueTokens = tokenize(r.value);
    if (valueTokens.some((vt) => tokens.includes(vt)) && r.evidence && typeof r.evidence.supportCount === 'number') {
      if (r.evidence.supportCount > max) max = r.evidence.supportCount;
    }
  }
  return max;
}

/** Real count of approved Profile Overrides for the domain — feeds the
 *  honest (non-scoring) policyMatch rationale. 0 (the norm today) means
 *  "no policy to match against". */
function approvedOverrideCountFor(domainValue) {
  if (!domainValue) return 0;
  const result = listOverrides({ domainType: domainValue, lifecycleState: LIFECYCLE_STATE.APPROVED });
  return result.ok ? result.data.length : 0;
}

/** V2, Part A1 (Intelligent Ingestion) — the same PBSI memo numbering
 *  convention grounded in content-fact-extraction-engine.js (real sample:
 *  "Nota Organisasi Sarpras 154 - ...docx" / "Memo Sarpras 355 - ...docx")
 *  is usually ALSO right there in the filename. This stays inside this
 *  file's own "filename-only" NON-GOAL boundary (still no file content
 *  read) — a zero-risk floor that works even when content extraction
 *  fails outright (a corrupt .docx, or a format Mammoth can't parse). */
function documentNumberFromFilename(filename) {
  const m = String(filename || '').match(/(?:Nota Organisasi|Memo)\s+Sarpras\s+(\d+)/i);
  if (!m) return { value: '', confidence: 0, rationale: 'Tidak ada pola "Sarpras <nomor>" pada nama file.' };
  return { value: m[1], confidence: 0.5, rationale: `Token nomor "${m[1]}" ditemukan pada nama file (bukan dari isi dokumen — lebih rendah dari kepastian ekstraksi konten).` };
}

/**
 * Infers administrative metadata ONLY — never the document's content
 * (except reading an already-parsed JSON object the caller passes in, for
 * the confidence engine's structure/content signals — still no OCR/parse
 * of PDF/DOCX, except the real evidence content-fact-extraction-engine.js
 * already computed for a `.docx`, passed in as `contentExtraction` — this
 * function still never reads a file itself). `parsedContent`/`kind`/
 * `contentExtraction` are optional so every existing caller keeps
 * working; when omitted, the JSON/docx-only confidence signals are simply
 * reported unavailable (honest, neutral).
 * @param {{filename: string, mimeType: string, sizeBytes: number, folderPath?: string, sha256?: string|null, scopedDomainType?: string|null, kind?: string|null, parsedContent?: Object|null, contentExtraction?: {ran: boolean, overallConfidence: number}|null}} input
 */
export function inferMetadata({ filename, mimeType, sizeBytes, folderPath = '', sha256 = null, scopedDomainType = null, kind = null, parsedContent = null, contentExtraction = null }) {
  const tokens = [...tokenize(filename), ...tokenize(folderPath)];

  // rawMatch tracks the ACTUAL filename-token evidence per field (0 when a
  // default/scoped value was used) — kept separate from the field's final
  // confidence, so the confidence engine can weigh real filename evidence
  // without a scoped/default value masquerading as filename similarity.
  const rawMatch = { domainType: 0, datasetType: 0, knowledgeKind: 0 };
  // fieldResolution: 1 = matched real evidence, 0.65 = sensible default, 0 = unresolved.
  const fieldResolution = { domainType: 0, datasetType: 0, knowledgeKind: 0 };

  const domainType = scopedDomainType
    ? { value: scopedDomainType, confidence: 1, rationale: 'Domain terkunci oleh workspace ini.' }
    : (() => {
      const match = bestLabelMatch(tokens, listDomainTypes());
      return match
        ? { value: match.id, confidence: match.confidence, rationale: match.rationale }
        : { value: null, confidence: 0, rationale: 'Tidak ada token nama file/folder yang cocok dengan domain terdaftar.' };
    })();
  if (scopedDomainType) {
    fieldResolution.domainType = 1; // a locked domain is a known-good resolution (just not filename-derived, so rawMatch stays 0)
  } else if (domainType.value) {
    rawMatch.domainType = domainType.confidence;
    fieldResolution.domainType = 1;
  }

  // Defaults deliberately sit ABOVE the auto-populate threshold: "Official"
  // is the sane default for most real document uploads, and
  // 'document_fact' is registered specifically as a generic, always-valid
  // fallback (see registry/kind-registry.js's own bootstrap comment) — so
  // defaulting to either is a real, honest answer, not a guess needing
  // Advanced Mode. Only a genuinely unresolved DOMAIN (no batch default,
  // no token match) should force the zero-config flow to pause.
  const datasetTypeMatch = bestLabelMatch(tokens, Object.values(DATASET_TYPE).map((t) => ({ id: t, label: t })));
  const datasetType = datasetTypeMatch
    ? { value: datasetTypeMatch.id, confidence: Math.max(datasetTypeMatch.confidence, 0.7), rationale: datasetTypeMatch.rationale }
    : { value: DATASET_TYPE.OFFICIAL, confidence: 0.65, rationale: 'Default: official — tidak ada token yang menunjukkan tipe dataset lain.' };
  if (datasetTypeMatch) { rawMatch.datasetType = datasetTypeMatch.confidence; fieldResolution.datasetType = 1; } else { fieldResolution.datasetType = 0.65; }

  const kindMatch = bestLabelMatch(tokens, listKinds());
  const knowledgeKind = kindMatch
    ? { value: kindMatch.id, confidence: kindMatch.confidence, rationale: kindMatch.rationale }
    : { value: 'document_fact', confidence: 0.65, rationale: 'Default: document_fact — tidak ada token yang menunjukkan kind spesifik.' };
  if (kindMatch) { rawMatch.knowledgeKind = kindMatch.confidence; fieldResolution.knowledgeKind = 1; } else { fieldResolution.knowledgeKind = 0.65; }

  const duplicate = sha256 && hasStoredFile(sha256)
    ? { isDuplicate: true, existingRecord: getStoredFileBySha256(sha256) }
    : { isDuplicate: false, existingRecord: null };

  // Phase 2 Follow-up — the real, deterministic, explainable confidence
  // (replaces the old Math.min() placeholder). Every repository read
  // happens HERE (pattern discovery, profile overrides); the engine itself
  // stays a pure function of the assembled evidence.
  const confidenceReport = computeImportConfidence({
    filenameMatch: rawMatch,
    fieldResolution,
    isDuplicate: duplicate.isDuplicate,
    kind,
    parsedContent,
    historicalSupport: historicalSupportFor(domainType.value, filename, folderPath),
    approvedOverrideCount: approvedOverrideCountFor(domainType.value),
    contentExtraction,
  });

  return {
    domainType, datasetType, knowledgeKind, duplicate,
    // overallConfidence is now the confidence engine's real weighted score
    // (the auto-populate/auto-import thresholds read this, unchanged).
    overallConfidence: confidenceReport.score,
    confidenceReport,
    // V2, Part A1 — a zero-risk documentNumber floor, filename-only (see
    // documentNumberFromFilename()'s header). The CALLER (dataset-import-
    // center.js#processOneFile) decides whether to prefer this or a
    // higher-confidence content-extraction result; this engine never reads
    // file content, so it cannot make that comparison itself.
    documentNumberFloor: documentNumberFromFilename(filename),
  };
}

/**
 * Cross-references Pattern Discovery's existing statistical evidence
 * (UNCHANGED engine) against filename/folder tokens — confirm-required
 * suggestions only, never auto-applied.
 * @param {string} domainType
 * @param {string} filename
 * @param {string} [folderPath]
 * @returns {{patternType: string, value: string, confidence: number, supportCount: number, rationale: string}[]}
 */
export function inferPatternAssisted(domainType, filename, folderPath = '') {
  if (!domainType) return [];
  const tokens = [...tokenize(filename), ...tokenize(folderPath)];
  const recommendations = computePatternRecommendations(domainType);
  const suggestions = [];
  for (const r of recommendations) {
    const valueTokens = tokenize(r.value);
    const matched = valueTokens.some((vt) => tokens.includes(vt));
    if (matched && r.evidence.supportCount >= 2) {
      suggestions.push({
        patternType: r.patternType,
        value: r.value,
        confidence: r.evidence.confidence,
        supportCount: r.evidence.supportCount,
        rationale: `Pattern Discovery: "${r.value}" (support ${r.evidence.supportCount}, confidence ${r.evidence.confidence}) cocok dengan token nama file.`,
      });
    }
  }
  return suggestions.sort((a, b) => b.supportCount - a.supportCount);
}
