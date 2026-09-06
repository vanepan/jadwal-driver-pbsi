/* ============================================================
   CORPUS-OBSERVATION-CONTRACT.JS — NOR & Memorandum Corpus Acquisition
   Foundation (V2, Phase 5.x.1)

   PURPOSE: fix the shape of ONE extracted observation — a single thing a
   historical document was observed to do, whether that is a turn of
   phrase (§7), a structural convention, or a page-layout fact that plain
   text cannot express (§8). This is the EXTRACTED ORGANIZATIONAL
   KNOWLEDGE layer — still evidence, NOT an organizational rule.

   THE MANDATORY DISTINCTIONS (§7, §9, §10, §15), encoded in this file:

     observedValue      — what the document literally contains. Historical
                          EVIDENCE. Not `preferredValue`, not
                          `approvedValue`, not an organizational rule.
     normalizedValue    — ALWAYS null here. Normalisation is a separate,
                          later concern; a contract must not pre-empt it.
     confidence         — EXTRACTION / classification confidence (0..1).
                          confidence 0.99 with lifecycleState 'observed'
                          does NOT mean "approved". Different axes.
     lifecycleState     — observation-lifecycle-contract.js. Starts
                          'observed'. Only a human may move it to
                          'approved'; there is no store method that does.
     preferenceRationale — human-written at approval only, NEVER
                          auto-generated (mirrors
                          src/knowledge/contracts/knowledge-item-contract.js).

   RESPONSIBILITY: OBSERVATION_MODALITY, OBSERVATION_CATEGORY (+ its
   default-modality map), CorpusObservation typedef, makeCorpusObservation
   / isCorpusObservation / isCorpusObservationList / CORPUS_OBSERVATION_FIELDS.

   DEPENDENCIES: corpus-provenance-contract.js (an observation without a
   traceable origin is invalid — §6), observation-lifecycle-contract.js.

   NON-GOALS: does not extract, score, normalise, or persist anything.
   Does not decide whether repeated observations become a candidate — that
   is a later grouping step (§9).
   ============================================================ */

'use strict';

import {
  CORPUS_PROVENANCE_SCHEMA, makeCorpusProvenance, isCorpusProvenance, isCorpusProvenanceList,
} from './corpus-provenance-contract.js';
import {
  OBSERVATION_LIFECYCLE, isObservationLifecycleState,
} from './observation-lifecycle-contract.js';

export const CORPUS_OBSERVATION_SCHEMA = 'corpus-observation@1';

/** How the observation was perceived — the axis that separates a text
 *  observation (§7) from a visual/layout one (§8). A structural
 *  observation (document-tree convention) is its own modality. */
export const OBSERVATION_MODALITY = Object.freeze({
  TEXT: 'text',
  STRUCTURE: 'structure',
  VISUAL: 'visual',
});

/** What KIND of thing was observed. Covers the text/redaction catalogue
 *  of §7, plus `structure` for document-tree conventions, plus `layout`
 *  for the page-geometry catalogue of §8. */
export const OBSERVATION_CATEGORY = Object.freeze({
  // ── text / redaction conventions (§7) ──
  TERMINOLOGY: 'terminology',
  OPENING_PATTERN: 'opening_pattern',
  CLOSING_PATTERN: 'closing_pattern',
  RECIPIENT_CONVENTION: 'recipient_convention',
  SUBJECT_CONVENTION: 'subject_convention',
  DATE_CONVENTION: 'date_convention',
  ATTACHMENT_CONVENTION: 'attachment_convention',
  COPY_CONVENTION: 'copy_convention',            // "Tembusan"
  SIGNATURE_WORDING: 'signature_wording',
  BODY_STRUCTURE: 'body_structure',
  FORMAL_TONE: 'formal_tone',
  PREFERRED_PHRASE: 'preferred_phrase',
  ORGANIZATIONAL_TERM: 'organizational_term',
  // ── structural extraction (§2) ──
  STRUCTURE: 'structure',
  // ── visual / layout (§8) ──
  LAYOUT: 'layout',
});

export const OBSERVATION_CATEGORY_LIST = Object.freeze(Object.values(OBSERVATION_CATEGORY));

/** The modality a category is normally perceived through. Advisory —
 *  makeCorpusObservation uses it as the default when a caller omits
 *  `modality`, but a caller MAY override (e.g. a signature wording first
 *  noticed in a rendered page image is category=signature_wording,
 *  modality=visual). */
export const OBSERVATION_CATEGORY_DEFAULT_MODALITY = Object.freeze({
  [OBSERVATION_CATEGORY.LAYOUT]: OBSERVATION_MODALITY.VISUAL,
  [OBSERVATION_CATEGORY.STRUCTURE]: OBSERVATION_MODALITY.STRUCTURE,
  [OBSERVATION_CATEGORY.BODY_STRUCTURE]: OBSERVATION_MODALITY.STRUCTURE,
});

export const CORPUS_OBSERVATION_FIELDS = Object.freeze([
  'schema', 'observationId', 'documentId', 'category', 'modality', 'key',
  'observedValue', 'normalizedValue', 'observation',
  'provenance', 'confidence', 'occurrenceCount',
  'lifecycleState', 'approvedBy', 'approvedAt', 'preferenceRationale',
  'createdAt', 'updatedAt',
]);

/**
 * @typedef {Object} CorpusObservation
 * @property {string} schema
 * @property {string} observationId  - stable identity (deterministic from documentId+category+key, or store-assigned)
 * @property {string} documentId     - the CorpusDocument this was observed in (required)
 * @property {string} category       - OBSERVATION_CATEGORY.*
 * @property {string} modality       - OBSERVATION_MODALITY.*
 * @property {string} key            - stable slug for WHAT this is about, e.g. 'recipient_label', 'signature_block'
 * @property {string|null} observedValue - the historical evidence, as text (null for a pure-visual observation)
 * @property {null} normalizedValue  - ALWAYS null at this layer (§7)
 * @property {Object|null} observation - opaque structured payload for structure/visual, e.g.
 *                                       { anchor:'bottom-right', alignment:'right', relativePagePosition:{x,y} }
 * @property {import('./corpus-provenance-contract.js').CorpusProvenance[]} provenance - >= 1 (§6)
 * @property {number} confidence     - 0..1, extraction/classification confidence — NOT authority (§10)
 * @property {number} occurrenceCount - how many times this exact observed value was seen (>= 1)
 * @property {string} lifecycleState - OBSERVATION_LIFECYCLE.*; starts 'observed'
 * @property {string|null} approvedBy - human, set only at approval
 * @property {string|null} approvedAt - ISO 8601, set only at approval
 * @property {string|null} preferenceRationale - human-written at approval, never auto-generated
 * @property {string} createdAt      - ISO 8601
 * @property {string} updatedAt      - ISO 8601
 */

function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/**
 * @param {Object} seed
 * @returns {CorpusObservation}
 */
export function makeCorpusObservation({
  observationId = '',
  documentId,
  category,
  modality,
  key = '',
  observedValue = null,
  observation = null,
  provenance = [],
  confidence = 0,
  occurrenceCount = 1,
  lifecycleState = OBSERVATION_LIFECYCLE.OBSERVED,
  approvedBy = null,
  approvedAt = null,
  preferenceRationale = null,
  createdAt = new Date().toISOString(),
  updatedAt = null,
} = {}) {
  const cat = OBSERVATION_CATEGORY_LIST.includes(category) ? category : String(category || '');
  const mod = Object.values(OBSERVATION_MODALITY).includes(modality)
    ? modality
    : (OBSERVATION_CATEGORY_DEFAULT_MODALITY[cat] || OBSERVATION_MODALITY.TEXT);
  const state = isObservationLifecycleState(lifecycleState) ? lifecycleState : OBSERVATION_LIFECYCLE.OBSERVED;
  const isApproved = state === OBSERVATION_LIFECYCLE.APPROVED;
  const oc = Number(occurrenceCount);
  const provList = (Array.isArray(provenance) ? provenance : [])
    .map((p) => (p && p.schema === CORPUS_PROVENANCE_SCHEMA ? p : makeCorpusProvenance(p || {})));
  const created = String(createdAt);

  return Object.freeze({
    schema: CORPUS_OBSERVATION_SCHEMA,
    observationId: String(observationId || ''),
    documentId: documentId ? String(documentId) : '',
    category: cat,
    modality: mod,
    key: String(key || ''),
    observedValue: observedValue == null ? null : String(observedValue),
    // §7 — a contract must not pre-empt normalisation. Always null here.
    normalizedValue: null,
    observation: observation && typeof observation === 'object' && !Array.isArray(observation)
      ? observation : null,
    provenance: Object.freeze(provList),
    confidence: clamp01(confidence),
    occurrenceCount: Number.isInteger(oc) && oc >= 1 ? oc : 1,
    lifecycleState: state,
    // approval fields exist ONLY in the approved state — an 'observed' row
    // carrying an approvedBy would be a contradiction.
    approvedBy: isApproved && approvedBy ? String(approvedBy) : null,
    approvedAt: isApproved && approvedAt ? String(approvedAt) : null,
    preferenceRationale: isApproved && typeof preferenceRationale === 'string' && preferenceRationale.trim()
      ? preferenceRationale : null,
    createdAt: created,
    updatedAt: updatedAt == null ? created : String(updatedAt),
  });
}

/**
 * Structural validity check.
 * @param {*} o
 * @returns {boolean}
 */
export function isCorpusObservation(o) {
  if (!o || typeof o !== 'object') return false;
  if (o.schema !== CORPUS_OBSERVATION_SCHEMA) return false;
  if (typeof o.observationId !== 'string' || !o.observationId) return false;
  if (typeof o.documentId !== 'string' || !o.documentId) return false;
  if (!OBSERVATION_CATEGORY_LIST.includes(o.category)) return false;
  if (!Object.values(OBSERVATION_MODALITY).includes(o.modality)) return false;
  if (typeof o.key !== 'string' || !o.key) return false;
  if (o.observedValue !== null && typeof o.observedValue !== 'string') return false;
  // §7 — normalizedValue is a distinct concept; it must be null at this layer.
  if (o.normalizedValue !== null) return false;
  if (o.observation !== null && (typeof o.observation !== 'object' || Array.isArray(o.observation))) return false;
  // §6 — every observation must be traceable to source.
  if (!isCorpusProvenanceList(o.provenance)) return false;
  if (typeof o.confidence !== 'number' || o.confidence < 0 || o.confidence > 1) return false;
  if (!Number.isInteger(o.occurrenceCount) || o.occurrenceCount < 1) return false;
  if (!isObservationLifecycleState(o.lifecycleState)) return false;
  // approval fields are present iff approved.
  if (o.lifecycleState === OBSERVATION_LIFECYCLE.APPROVED) {
    if (typeof o.approvedBy !== 'string' || !o.approvedBy) return false;
    if (typeof o.approvedAt !== 'string' || !o.approvedAt) return false;
    if (typeof o.preferenceRationale !== 'string' || !o.preferenceRationale.trim()) return false;
  } else if (o.approvedBy !== null || o.approvedAt !== null || o.preferenceRationale !== null) {
    return false;
  }
  if (typeof o.createdAt !== 'string' || !o.createdAt) return false;
  if (typeof o.updatedAt !== 'string' || !o.updatedAt) return false;
  return CORPUS_OBSERVATION_FIELDS.every((f) => f in o);
}

/** @param {*} list @returns {boolean} */
export function isCorpusObservationList(list) {
  return Array.isArray(list) && list.every(isCorpusObservation);
}

export { isCorpusProvenance };
