/* ============================================================
   CLASSIFICATION-RESULT-CONTRACT.JS — Corpus Ingestion & Document
   Analysis (V2, Phase 5.x.2)

   PURPOSE: fix the shape a classifier returns for ONE document —
   documentType + typeConfidence (§6) and documentEra + eraConfidence
   (§7), plus the explicit list of signals it weighed so the result is
   explainable and never opaque.

   THE HARD RULES (§6, §7), encoded in makeClassificationResult /
   isClassificationResult:
     • weak evidence → documentType 'UNKNOWN', era 'unknown'
     • an 'unknown' era can NEVER carry eraConfidence >= 1
       (same invariant CorpusDocument enforces)
     • era is a property of the DOCUMENT/convention — a classifier MUST
       NOT return 'current' merely because ingestion happened now. The
       only inputs are `signals` derived from document content/structure
       and an explicit, operator-configured era cutover date.
     • signals must not include a filename-derived date as an era signal.

   RESPONSIBILITY: CLASSIFICATION_SIGNAL kinds, ClassificationSignal +
   ClassificationResult typedefs + builders + validators + the pure
   `resolveTypeFromSignals` / `resolveEraFromSignals` helpers.

   DEPENDENCIES: ../../contracts/corpus-document-contract.js
   (CORPUS_DOCUMENT_TYPE, CORPUS_DOCUMENT_ERA).
   ============================================================ */

'use strict';

import {
  CORPUS_DOCUMENT_TYPE, CORPUS_DOCUMENT_ERA,
} from '../../contracts/corpus-document-contract.js';

export const CLASSIFICATION_RESULT_SCHEMA = 'corpus-classification-result@1';

/** Where a signal came from. `filename` is deliberately the weakest and
 *  is NEVER accepted as an era signal. */
export const SIGNAL_SOURCE = Object.freeze({
  TITLE: 'title',
  HEADING: 'heading',
  LABEL: 'label',              // recurring meta labels: Kepada Yth. / Dari / Perihal / …
  REFERENCE_NUMBER: 'reference_number',
  TERMINOLOGY: 'terminology',
  STRUCTURE: 'structure',
  METADATA: 'metadata',        // e.g. PDF /Producer — weak
  CONTENT_DATE: 'content_date', // a date read from the document BODY
  ERA_CUTOVER: 'era_cutover',   // operator-configured cutover comparison
  FILENAME: 'filename',        // weakest — a hint only, never authoritative
});

function clamp01(v) { const n = Number(v); return !Number.isFinite(n) ? 0 : n < 0 ? 0 : n > 1 ? 1 : n; }

/**
 * @typedef {Object} ClassificationSignal
 * @property {string} source   - SIGNAL_SOURCE.*
 * @property {string} name     - short slug, e.g. 'title_nota_organisasi'
 * @property {number} weight   - 0..1 contribution
 * @property {string} evidence - human-readable, the exact text/fact observed
 */
export function makeClassificationSignal({ source, name, weight = 0, evidence = '' } = {}) {
  return Object.freeze({
    source: Object.values(SIGNAL_SOURCE).includes(source) ? source : SIGNAL_SOURCE.STRUCTURE,
    name: String(name || ''),
    weight: clamp01(weight),
    evidence: String(evidence || ''),
  });
}
export function isClassificationSignal(s) {
  return !!s && typeof s === 'object'
    && Object.values(SIGNAL_SOURCE).includes(s.source)
    && typeof s.name === 'string' && s.name.length > 0
    && typeof s.weight === 'number' && s.weight >= 0 && s.weight <= 1
    && typeof s.evidence === 'string';
}

/**
 * @typedef {Object} ClassificationResult
 * @property {string} schema
 * @property {string} documentType     - CORPUS_DOCUMENT_TYPE.*
 * @property {number} typeConfidence   - 0..1
 * @property {string} documentEra      - CORPUS_DOCUMENT_ERA.*
 * @property {number} eraConfidence    - 0..1 (< 1 when era is 'unknown')
 * @property {string|null} sourceDate  - the document's OWN stated date (ISO), from CONTENT only; null if none found
 * @property {ClassificationSignal[]} typeSignals
 * @property {ClassificationSignal[]} eraSignals
 */
export function makeClassificationResult({
  documentType = CORPUS_DOCUMENT_TYPE.UNKNOWN,
  typeConfidence = 0,
  documentEra = CORPUS_DOCUMENT_ERA.UNKNOWN,
  eraConfidence = 0,
  sourceDate = null,
  typeSignals = [],
  eraSignals = [],
} = {}) {
  const type = Object.values(CORPUS_DOCUMENT_TYPE).includes(documentType) ? documentType : CORPUS_DOCUMENT_TYPE.UNKNOWN;
  const era = Object.values(CORPUS_DOCUMENT_ERA).includes(documentEra) ? documentEra : CORPUS_DOCUMENT_ERA.UNKNOWN;
  let eraConf = clamp01(eraConfidence);
  if (era === CORPUS_DOCUMENT_ERA.UNKNOWN && eraConf >= 1) eraConf = 0.99;
  const eraSig = (Array.isArray(eraSignals) ? eraSignals : [])
    .map((s) => (isClassificationSignal(s) ? s : makeClassificationSignal(s)))
    // §7 — a filename-derived date can never be an era signal.
    .filter((s) => s.source !== SIGNAL_SOURCE.FILENAME);
  return Object.freeze({
    schema: CLASSIFICATION_RESULT_SCHEMA,
    documentType: type,
    typeConfidence: clamp01(typeConfidence),
    documentEra: era,
    eraConfidence: eraConf,
    sourceDate: sourceDate == null ? null : String(sourceDate),
    typeSignals: Object.freeze((Array.isArray(typeSignals) ? typeSignals : []).map((s) => (isClassificationSignal(s) ? s : makeClassificationSignal(s)))),
    eraSignals: Object.freeze(eraSig),
  });
}

export function isClassificationResult(r) {
  if (!r || typeof r !== 'object') return false;
  if (r.schema !== CLASSIFICATION_RESULT_SCHEMA) return false;
  if (!Object.values(CORPUS_DOCUMENT_TYPE).includes(r.documentType)) return false;
  if (!Object.values(CORPUS_DOCUMENT_ERA).includes(r.documentEra)) return false;
  if (typeof r.typeConfidence !== 'number' || r.typeConfidence < 0 || r.typeConfidence > 1) return false;
  if (typeof r.eraConfidence !== 'number' || r.eraConfidence < 0 || r.eraConfidence > 1) return false;
  if (r.documentEra === CORPUS_DOCUMENT_ERA.UNKNOWN && r.eraConfidence >= 1) return false;
  if (r.sourceDate !== null && typeof r.sourceDate !== 'string') return false;
  if (!Array.isArray(r.typeSignals) || !r.typeSignals.every(isClassificationSignal)) return false;
  if (!Array.isArray(r.eraSignals) || !r.eraSignals.every(isClassificationSignal)) return false;
  if (r.eraSignals.some((s) => s.source === SIGNAL_SOURCE.FILENAME)) return false;
  return true;
}

/**
 * Pure resolver: given weighted signals per candidate type, pick the
 * winner and a confidence. Weak/no signal → UNKNOWN.
 * @param {Record<string, ClassificationSignal[]>} byType  - CORPUS_DOCUMENT_TYPE -> signals
 * @param {{ minConfidence?: number, dominanceMargin?: number }} [opts]
 * @returns {{ documentType: string, typeConfidence: number }}
 */
export function resolveTypeFromSignals(byType, opts = {}) {
  const minConfidence = opts.minConfidence == null ? 0.35 : opts.minConfidence;
  const dominanceMargin = opts.dominanceMargin == null ? 0.15 : opts.dominanceMargin;
  const scores = Object.entries(byType || {})
    .map(([type, sigs]) => ({ type, score: (Array.isArray(sigs) ? sigs : []).reduce((a, s) => a + (s.weight || 0), 0) }))
    .filter((x) => Object.values(CORPUS_DOCUMENT_TYPE).includes(x.type) && x.type !== CORPUS_DOCUMENT_TYPE.UNKNOWN)
    .sort((a, b) => b.score - a.score);
  if (!scores.length || scores[0].score <= 0) {
    return { documentType: CORPUS_DOCUMENT_TYPE.UNKNOWN, typeConfidence: 0 };
  }
  const top = scores[0];
  const runnerUp = scores[1] ? scores[1].score : 0;
  // confidence = how strong AND how dominant the top signal is, capped at 0.95
  const strength = Math.min(1, top.score);
  const dominance = top.score - runnerUp;
  const confidence = Math.min(0.95, strength * (dominance >= dominanceMargin ? 1 : 0.6));
  if (confidence < minConfidence) {
    return { documentType: CORPUS_DOCUMENT_TYPE.UNKNOWN, typeConfidence: Math.round(confidence * 100) / 100 };
  }
  return { documentType: top.type, typeConfidence: Math.round(confidence * 100) / 100 };
}
