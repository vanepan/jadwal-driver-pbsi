/* ============================================================
   WRITING-MEMORY-CONTRACT.JS — Organizational Writing Memory
   (V2, Phase 5.x.4)

   PURPOSE: fix the shape of ONE Organizational Writing Memory entry —
   LAYER 3 in the chain:

     Historical Corpus → CorpusDocument → CorpusObservation →
     Temporal Interpretation → ORGANIZATIONAL WRITING MEMORY →
     Human Review → Approved Organizational Rule

   A WritingMemory entry is a DERIVED, EVIDENCE-BACKED summary of a
   recurring WRITING / LANGUAGE pattern. It is NOT an organizational rule.
   Its `authorityState` may be `observed` or `candidate` ONLY — this layer
   NEVER produces `approved` (Phase 5.x.4 §8). `confidence` is never
   authority (§18).

   OBSERVATION ≠ MEMORY ≠ AUTHORITY.

   RESPONSIBILITY: WRITING_MEMORY_CATEGORIES (the language subset of the
   corpus vocabulary — layout/structure are OUT, §4), WRITING_AUTHORITY_STATE
   + PRODUCIBLE_AUTHORITY_STATES, DOCUMENT_TYPE_SCOPE,
   WRITING_MEMORY_EVIDENCE_FIELDS, memoryIdFrom(), makeWritingMemory /
   isWritingMemory, makeWritingMemoryConflict / isWritingMemoryConflict,
   makeWritingMemoryReport / isWritingMemoryReport.

   DEPENDENCIES: ../../contracts/corpus-observation-contract.js
   (OBSERVATION_CATEGORY), ../../contracts/corpus-document-contract.js
   (CORPUS_DOCUMENT_TYPE), ../../temporal/contracts/temporal-contract.js
   (CONVENTION_STATUS, TEMPORAL_CLASSIFICATION — reused, not re-invented).
   PURE.
   ============================================================ */

'use strict';

import { OBSERVATION_CATEGORY } from '../../contracts/corpus-observation-contract.js';
import { CORPUS_DOCUMENT_TYPE } from '../../contracts/corpus-document-contract.js';
import { CONVENTION_STATUS, TEMPORAL_CLASSIFICATION } from '../../temporal/contracts/temporal-contract.js';

export const WRITING_MEMORY_SCHEMA = 'writing-memory@1';
export const WRITING_MEMORY_REPORT_SCHEMA = 'writing-memory-report@1';

/** §4 — Writing Memory is about LANGUAGE / WRITING CONVENTION. The corpus
 *  `structure` and `layout` categories are deliberately EXCLUDED — they
 *  belong to the future template/style system. This is the language
 *  subset of OBSERVATION_CATEGORY, not a competing taxonomy. */
export const WRITING_MEMORY_CATEGORIES = Object.freeze([
  OBSERVATION_CATEGORY.TERMINOLOGY,
  OBSERVATION_CATEGORY.ORGANIZATIONAL_TERM,
  OBSERVATION_CATEGORY.PREFERRED_PHRASE,
  OBSERVATION_CATEGORY.OPENING_PATTERN,
  OBSERVATION_CATEGORY.CLOSING_PATTERN,
  OBSERVATION_CATEGORY.RECIPIENT_CONVENTION,
  OBSERVATION_CATEGORY.SUBJECT_CONVENTION,
  OBSERVATION_CATEGORY.DATE_CONVENTION,
  OBSERVATION_CATEGORY.ATTACHMENT_CONVENTION,
  OBSERVATION_CATEGORY.COPY_CONVENTION,
  OBSERVATION_CATEGORY.SIGNATURE_WORDING,
  OBSERVATION_CATEGORY.BODY_STRUCTURE,
  OBSERVATION_CATEGORY.FORMAL_TONE,
]);
export function isWritingMemoryCategory(c) {
  return WRITING_MEMORY_CATEGORIES.includes(c);
}

/** §8 — the enum has three states, but this PHASE may only ever produce
 *  the first two. `approved` exists for the eventual human-review
 *  consumer and for representing an EXTERNAL approved rule — never as an
 *  entry this builder emits. */
export const WRITING_AUTHORITY_STATE = Object.freeze({
  OBSERVED: 'observed',
  CANDIDATE: 'candidate',
  APPROVED: 'approved',
});
export const PRODUCIBLE_AUTHORITY_STATES = Object.freeze([
  WRITING_AUTHORITY_STATE.OBSERVED, WRITING_AUTHORITY_STATE.CANDIDATE,
]);

/** §12 — the document-type SCOPE of an entry. The real corpus types plus
 *  `cross_type` for an entry whose evidence explicitly spans >= 2 real
 *  types (its `documentTypeDistribution` carries the per-type breakdown —
 *  §13). A LEGACY-only convention keeps `documentType: 'LEGACY'` — it is
 *  never silently generalised to a current PBSI convention. */
export const DOCUMENT_TYPE_SCOPE = Object.freeze({
  NOR: CORPUS_DOCUMENT_TYPE.NOR,
  NOTA_ORGANISASI: CORPUS_DOCUMENT_TYPE.NOTA_ORGANISASI,
  MEMORANDUM: CORPUS_DOCUMENT_TYPE.MEMORANDUM,
  LEGACY: CORPUS_DOCUMENT_TYPE.LEGACY,
  UNKNOWN: CORPUS_DOCUMENT_TYPE.UNKNOWN,
  CROSS_TYPE: 'cross_type',
});
const DOCUMENT_TYPE_SCOPE_VALUES = Object.freeze(Object.values(DOCUMENT_TYPE_SCOPE));

/** §19 — transparent evidence components. NO black-box style/memory/
 *  authority score. */
export const WRITING_MEMORY_EVIDENCE_FIELDS = Object.freeze([
  'documentCount',
  'recentDocumentCount',
  'historicalDocumentCount',
  'transitionalDocumentCount',
  'undatedDocumentCount',
  'occurrenceCount',
  'oldestSourceDate',
  'latestSourceDate',
  'temporalSpreadDays',
  'documentTypeDistribution', // { NOR: n, MEMORANDUM: n, LEGACY: n, ... } — NEVER collapsed (§13)
  'conflictingDocumentCount',
  'approvedRulePresent',
  'approvedRuleMatches',
]);

function clamp01(v) { const n = Number(v); return !Number.isFinite(n) ? 0 : n < 0 ? 0 : n > 1 ? 1 : n; }
function intOrZero(v) { return Number.isInteger(v) && v >= 0 ? v : 0; }
function isoOrNull(v) { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null; }
function slug(s) {
  return String(s == null ? '' : s).toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 80);
}
/** FNV-1a 32-bit hex — dependency-free, deterministic, browser + Node.
 *  Same fingerprint discipline as src/organizational-memory/document-hash.js
 *  (not imported — the corpus tree keeps its own tiny helper). */
function fnv1a(str) {
  let h = 0x811c9dc5;
  const s = String(str == null ? '' : str);
  for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}
function normValue(v) {
  return String(v == null ? '' : v).toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Deterministic entry identity — the SAME (scope, category, key,
 * normalised value) always yields the SAME memoryId (§24).
 */
export function memoryIdFrom(scope, category, key, value) {
  return `mem_${slug(scope)}__${slug(category)}__${slug(key)}__${fnv1a(normValue(value))}`;
}

/**
 * @typedef {Object} WritingMemory
 * @property {string} schema
 * @property {string} memoryId
 * @property {string} category            - WRITING_MEMORY_CATEGORIES
 * @property {string} key                 - the observation `key` slug
 * @property {string} value               - the VERBATIM observed wording (original evidence — §6)
 * @property {string|null} normalizedValue - a SEPARATE analytical field (§6); may be null
 * @property {string} documentType        - DOCUMENT_TYPE_SCOPE.* (a real type, or 'cross_type')
 * @property {string} temporalStatus      - CONVENTION_STATUS.* (consumed from the temporal layer — §7)
 * @property {string} conventionEra       - TEMPORAL_CLASSIFICATION.*
 * @property {Object} evidence            - WRITING_MEMORY_EVIDENCE_FIELDS bag (§19)
 * @property {number} confidence          - 0..1 observation confidence — NOT authority (§18)
 * @property {string} authorityState      - 'observed' | 'candidate' ONLY (§8)
 * @property {string[]} sourceObservationIds - >= 1 (§5)
 * @property {string[]} sourceDocumentIds    - >= 1 (§5)
 * @property {string} createdAt
 * @property {string} updatedAt
 */
export function makeWritingMemory(seed = {}) {
  const s = seed && typeof seed === 'object' ? seed : {};
  const ev = s.evidence && typeof s.evidence === 'object' ? s.evidence : {};
  const evidence = {};
  for (const f of WRITING_MEMORY_EVIDENCE_FIELDS) {
    if (f === 'oldestSourceDate' || f === 'latestSourceDate') evidence[f] = isoOrNull(ev[f]);
    else if (f === 'temporalSpreadDays') evidence[f] = Number.isInteger(ev[f]) && ev[f] >= 0 ? ev[f] : null;
    else if (f === 'approvedRulePresent' || f === 'approvedRuleMatches') evidence[f] = ev[f] === true;
    else if (f === 'documentTypeDistribution') {
      const d = ev[f] && typeof ev[f] === 'object' && !Array.isArray(ev[f]) ? ev[f] : {};
      const out = {};
      for (const [k, v] of Object.entries(d)) if (Number.isInteger(v) && v > 0) out[k] = v;
      evidence[f] = Object.freeze(out);
    } else evidence[f] = intOrZero(ev[f]);
  }
  const created = String(s.createdAt || new Date().toISOString());
  // §8 — anything other than the two producible states is coerced to `observed`.
  const authorityState = PRODUCIBLE_AUTHORITY_STATES.includes(s.authorityState) ? s.authorityState : WRITING_AUTHORITY_STATE.OBSERVED;
  const value = s.value == null ? '' : String(s.value);
  return Object.freeze({
    schema: WRITING_MEMORY_SCHEMA,
    memoryId: String(s.memoryId || ''),
    category: String(s.category || ''),
    key: String(s.key || ''),
    value,
    normalizedValue: s.normalizedValue == null ? null : String(s.normalizedValue),
    documentType: DOCUMENT_TYPE_SCOPE_VALUES.includes(s.documentType) ? s.documentType : DOCUMENT_TYPE_SCOPE.UNKNOWN,
    temporalStatus: Object.values(CONVENTION_STATUS).includes(s.temporalStatus) ? s.temporalStatus : CONVENTION_STATUS.INSUFFICIENT_EVIDENCE,
    conventionEra: Object.values(TEMPORAL_CLASSIFICATION).includes(s.conventionEra) ? s.conventionEra : TEMPORAL_CLASSIFICATION.UNKNOWN,
    evidence: Object.freeze(evidence),
    confidence: clamp01(s.confidence),
    authorityState,
    sourceObservationIds: Object.freeze((Array.isArray(s.sourceObservationIds) ? s.sourceObservationIds : []).map(String)),
    sourceDocumentIds: Object.freeze((Array.isArray(s.sourceDocumentIds) ? s.sourceDocumentIds : []).map(String)),
    createdAt: created,
    updatedAt: String(s.updatedAt || created),
  });
}

export function isWritingMemory(m) {
  if (!m || typeof m !== 'object') return false;
  if (m.schema !== WRITING_MEMORY_SCHEMA) return false;
  if (typeof m.memoryId !== 'string' || !m.memoryId) return false;
  if (!isWritingMemoryCategory(m.category)) return false;
  if (typeof m.value !== 'string' || !m.value) return false; // §5/§6 — recoverable wording required
  if (m.normalizedValue !== null && typeof m.normalizedValue !== 'string') return false;
  if (!DOCUMENT_TYPE_SCOPE_VALUES.includes(m.documentType)) return false;
  if (!Object.values(CONVENTION_STATUS).includes(m.temporalStatus)) return false;
  if (!Object.values(TEMPORAL_CLASSIFICATION).includes(m.conventionEra)) return false;
  if (!m.evidence || typeof m.evidence !== 'object') return false;
  if (!WRITING_MEMORY_EVIDENCE_FIELDS.every((f) => f in m.evidence)) return false;
  if (typeof m.confidence !== 'number' || m.confidence < 0 || m.confidence > 1) return false;
  // §8 — a produced entry is NEVER `approved`.
  if (!PRODUCIBLE_AUTHORITY_STATES.includes(m.authorityState)) return false;
  // §5 — no evidence ⇒ not a valid entry.
  if (!Array.isArray(m.sourceObservationIds) || m.sourceObservationIds.length < 1) return false;
  if (!Array.isArray(m.sourceDocumentIds) || m.sourceDocumentIds.length < 1) return false;
  return true;
}
export function isWritingMemoryList(list) {
  return Array.isArray(list) && list.every(isWritingMemory);
}

/**
 * @typedef {Object} WritingMemoryConflict
 * @property {string} category
 * @property {string} key
 * @property {string} documentType   - the scope the conflict was seen in ('cross_type' or a real type)
 * @property {Array<{memoryId:string|null, value:string, normalizedValue:string|null, temporalStatus:string, conventionEra:string, evidence:Object}>} sides  - >= 2, EACH kept (§14)
 * @property {string} note
 */
export function makeWritingMemoryConflict(seed = {}) {
  const s = seed && typeof seed === 'object' ? seed : {};
  return Object.freeze({
    category: String(s.category || ''),
    key: String(s.key || ''),
    documentType: DOCUMENT_TYPE_SCOPE_VALUES.includes(s.documentType) ? s.documentType : DOCUMENT_TYPE_SCOPE.CROSS_TYPE,
    sides: Object.freeze((Array.isArray(s.sides) ? s.sides : []).map((x) => Object.freeze({
      memoryId: x && x.memoryId != null ? String(x.memoryId) : null,
      value: x && x.value != null ? String(x.value) : '',
      normalizedValue: x && x.normalizedValue != null ? String(x.normalizedValue) : null,
      temporalStatus: x && Object.values(CONVENTION_STATUS).includes(x.temporalStatus) ? x.temporalStatus : CONVENTION_STATUS.INSUFFICIENT_EVIDENCE,
      conventionEra: x && Object.values(TEMPORAL_CLASSIFICATION).includes(x.conventionEra) ? x.conventionEra : TEMPORAL_CLASSIFICATION.UNKNOWN,
      evidence: x && x.evidence && typeof x.evidence === 'object' ? Object.freeze({ ...x.evidence }) : Object.freeze({}),
    }))),
    note: String(s.note || ''),
  });
}
export function isWritingMemoryConflict(c) {
  return !!c && typeof c === 'object'
    && typeof c.category === 'string'
    && Array.isArray(c.sides) && c.sides.length >= 2
    && c.sides.every((x) => x && typeof x.value === 'string');
}

/**
 * @typedef {Object} WritingMemoryReport
 * @property {string} schema
 * @property {string} generatedAt
 * @property {boolean} temporalConfigured
 * @property {WritingMemory[]} entries
 * @property {WritingMemoryConflict[]} conflicts
 * @property {import('../../temporal/contracts/temporal-contract.js').DriftFinding[]} drift  - pass-through (ruleUnchanged: true — §17)
 * @property {Object} summary
 */
export function makeWritingMemoryReport(seed = {}) {
  const s = seed && typeof seed === 'object' ? seed : {};
  const entries = (Array.isArray(s.entries) ? s.entries : []).map((x) => (isWritingMemory(x) ? x : makeWritingMemory(x)));
  const byAuthority = (a) => entries.filter((e) => e.authorityState === a).length;
  const byStatus = (st) => entries.filter((e) => e.temporalStatus === st).length;
  return Object.freeze({
    schema: WRITING_MEMORY_REPORT_SCHEMA,
    generatedAt: String(s.generatedAt || new Date().toISOString()),
    temporalConfigured: s.temporalConfigured === true,
    entries: Object.freeze(entries),
    conflicts: Object.freeze((Array.isArray(s.conflicts) ? s.conflicts : []).map((x) => (isWritingMemoryConflict(x) ? x : makeWritingMemoryConflict(x)))),
    drift: Object.freeze((Array.isArray(s.drift) ? s.drift : []).map((x) => Object.freeze({ ...x, ruleUnchanged: true }))),
    summary: Object.freeze({
      total: entries.length,
      observed: byAuthority(WRITING_AUTHORITY_STATE.OBSERVED),
      candidate: byAuthority(WRITING_AUTHORITY_STATE.CANDIDATE),
      approved: 0, // never — this phase produces none (§8)
      crossType: entries.filter((e) => e.documentType === DOCUMENT_TYPE_SCOPE.CROSS_TYPE).length,
      historicalOnly: byStatus(CONVENTION_STATUS.HISTORICAL_ONLY),
      currentEvidence: byStatus(CONVENTION_STATUS.CURRENT_EVIDENCE),
      conflicting: byStatus(CONVENTION_STATUS.CONFLICTING),
      possibleDrift: byStatus(CONVENTION_STATUS.POSSIBLE_DRIFT),
      aligned: byStatus(CONVENTION_STATUS.ALIGNED),
      insufficientEvidence: byStatus(CONVENTION_STATUS.INSUFFICIENT_EVIDENCE),
    }),
  });
}
export function isWritingMemoryReport(r) {
  if (!r || typeof r !== 'object') return false;
  if (r.schema !== WRITING_MEMORY_REPORT_SCHEMA) return false;
  if (typeof r.generatedAt !== 'string' || !r.generatedAt) return false;
  if (typeof r.temporalConfigured !== 'boolean') return false;
  if (!Array.isArray(r.entries) || !r.entries.every(isWritingMemory)) return false;
  if (!Array.isArray(r.conflicts) || !Array.isArray(r.drift)) return false;
  // §17 — every drift finding is authority-preserving.
  if (!r.drift.every((d) => d && d.ruleUnchanged === true)) return false;
  return true;
}
