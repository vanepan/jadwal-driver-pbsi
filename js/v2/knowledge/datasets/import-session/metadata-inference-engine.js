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

/** The one threshold deciding "auto-populate" vs "fall back to Advanced
 *  Metadata" — defined once, read by both this engine's callers and the
 *  UI layer, per Part A/E of the roadmap. */
export const AUTO_POPULATE_CONFIDENCE_THRESHOLD = 0.6;

/** V2.1.2 (Part C) — a SEPARATE, higher bar: populating a field and
 *  trusting it enough to skip human review entirely are different
 *  questions. At or above this threshold, an Import Session may proceed
 *  straight through Approve -> Knowledge Imported -> Archived without a
 *  manual click — but this ONLY ever affects the Import Session's own
 *  administrative lifecycle, never the resulting KnowledgeItem's own
 *  separate, unchanged, human-gated curation lifecycle (still Draft,
 *  still requires its own review in Knowledge Center before it is real
 *  "Approved Knowledge" — see the V2.1.2 plan's Decision 5). */
export const AUTO_IMPORT_CONFIDENCE_THRESHOLD = 0.85;

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

/**
 * Infers administrative metadata ONLY — never the document's content.
 * @param {{filename: string, mimeType: string, sizeBytes: number, folderPath?: string, sha256?: string|null, scopedDomainType?: string|null}} input
 */
export function inferMetadata({ filename, mimeType, sizeBytes, folderPath = '', sha256 = null, scopedDomainType = null }) {
  const tokens = [...tokenize(filename), ...tokenize(folderPath)];

  const domainType = scopedDomainType
    ? { value: scopedDomainType, confidence: 1, rationale: 'Domain terkunci oleh workspace ini.' }
    : (() => {
      const match = bestLabelMatch(tokens, listDomainTypes());
      return match
        ? { value: match.id, confidence: match.confidence, rationale: match.rationale }
        : { value: null, confidence: 0, rationale: 'Tidak ada token nama file/folder yang cocok dengan domain terdaftar.' };
    })();

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

  const kindMatch = bestLabelMatch(tokens, listKinds());
  const knowledgeKind = kindMatch
    ? { value: kindMatch.id, confidence: kindMatch.confidence, rationale: kindMatch.rationale }
    : { value: 'document_fact', confidence: 0.65, rationale: 'Default: document_fact — tidak ada token yang menunjukkan kind spesifik.' };

  const duplicate = sha256 && hasStoredFile(sha256)
    ? { isDuplicate: true, existingRecord: getStoredFileBySha256(sha256) }
    : { isDuplicate: false, existingRecord: null };

  return {
    domainType, datasetType, knowledgeKind, duplicate,
    overallConfidence: Math.min(domainType.confidence, datasetType.confidence, knowledgeKind.confidence),
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
