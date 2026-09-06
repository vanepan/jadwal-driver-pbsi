/* ============================================================
   TEMPORAL-CONTRACT.JS — Historical vs Current Convention
   (V2, Phase 5.x.3)

   PURPOSE: fix the vocabularies + shapes of the temporal interpretation
   layer that sits OVER corpus observations. This layer is a derived,
   read-only ANALYTICAL VIEW — it never rewrites an observation, never
   moves a lifecycle state, never creates an approval (Phase 5.x.3 §3,
   §16, §17).

   TWO INDEPENDENT AXES (§4, §5) — deliberately NOT conflated:

     1. TEMPORAL_CLASSIFICATION  — "when does this evidence belong?"
        historical | current | transitional | unknown
        Applies to a document (from its sourceDate) AND, separately, to
        the spread of evidence behind a convention.

     2. CONVENTION_STATUS        — "does this observed convention look
        like the CURRENT convention, and how does it relate to an
        approved rule if one exists?"
        aligned | historical_only | current_evidence | conflicting |
        possible_drift | insufficient_evidence
        (the smallest useful vocabulary — §11)

   `unknown` / `insufficient_evidence` are FIRST-CLASS results (§15). No
   source date, no configured window, conflicting evidence, too little
   recent evidence → say so; do not force a guess.

   RESPONSIBILITY: the enums + DEFs, EVIDENCE field list, and the
   structural builders/validators for a ConventionTemporalEntry, a
   ConventionConflict, a DriftFinding, and the ConventionTemporalReport.

   DEPENDENCIES: ../../contracts/corpus-document-contract.js
   (CORPUS_DOCUMENT_ERA — the same four labels), for cross-reference only.
   PURE.
   ============================================================ */

'use strict';

import { CORPUS_DOCUMENT_ERA } from '../../contracts/corpus-document-contract.js';

export const TEMPORAL_REPORT_SCHEMA = 'corpus-temporal-report@1';

/** "When does this evidence belong?" — the same four labels as
 *  CORPUS_DOCUMENT_ERA, reused (not re-invented). */
export const TEMPORAL_CLASSIFICATION = Object.freeze({
  HISTORICAL: CORPUS_DOCUMENT_ERA.HISTORICAL,     // 'historical'
  CURRENT: CORPUS_DOCUMENT_ERA.CURRENT,           // 'current'
  TRANSITIONAL: CORPUS_DOCUMENT_ERA.TRANSITIONAL, // 'transitional'
  UNKNOWN: CORPUS_DOCUMENT_ERA.UNKNOWN,           // 'unknown'
});

export const TEMPORAL_CLASSIFICATION_DEFS = Object.freeze([
  Object.freeze({ id: TEMPORAL_CLASSIFICATION.HISTORICAL, label: 'Historical evidence' }),
  Object.freeze({ id: TEMPORAL_CLASSIFICATION.CURRENT, label: 'Current evidence' }),
  Object.freeze({ id: TEMPORAL_CLASSIFICATION.TRANSITIONAL, label: 'Transitional' }),
  Object.freeze({ id: TEMPORAL_CLASSIFICATION.UNKNOWN, label: 'Unknown / insufficient evidence' }),
]);

/** "Does this convention look current, and how does it sit against an
 *  approved rule?" — the drift + applicability vocabulary (§11). */
export const CONVENTION_STATUS = Object.freeze({
  ALIGNED: 'aligned',                             // an approved rule exists AND recent corpus agrees with it
  HISTORICAL_ONLY: 'historical_only',             // dated evidence, all historical, no current evidence
  CURRENT_EVIDENCE: 'current_evidence',           // enough distinct recent documents support it
  CONFLICTING: 'conflicting',                     // recent documents disagree among themselves
  POSSIBLE_DRIFT: 'possible_drift',               // an approved rule exists but recent corpus favours a DIFFERENT value
  INSUFFICIENT_EVIDENCE: 'insufficient_evidence', // no config, no dated evidence, or too little of it
});

export const CONVENTION_STATUS_DEFS = Object.freeze([
  Object.freeze({ id: CONVENTION_STATUS.ALIGNED, label: 'Aligned with the approved rule' }),
  Object.freeze({ id: CONVENTION_STATUS.HISTORICAL_ONLY, label: 'Historical only' }),
  Object.freeze({ id: CONVENTION_STATUS.CURRENT_EVIDENCE, label: 'Current evidence' }),
  Object.freeze({ id: CONVENTION_STATUS.CONFLICTING, label: 'Conflicting recent evidence' }),
  Object.freeze({ id: CONVENTION_STATUS.POSSIBLE_DRIFT, label: 'Possible drift from the approved rule' }),
  Object.freeze({ id: CONVENTION_STATUS.INSUFFICIENT_EVIDENCE, label: 'Insufficient evidence' }),
]);

/** The structured, transparent evidence behind every temporal call
 *  (§13 — no black-box score; if a score is offered its components are
 *  always present). */
export const TEMPORAL_EVIDENCE_FIELDS = Object.freeze([
  'documentCount',            // distinct documents this convention was observed in
  'datedDocumentCount',       // of those, how many have a canonical sourceDate
  'undatedDocumentCount',
  'historicalDocumentCount',  // dated docs in the historical window
  'currentDocumentCount',     // dated docs in the current window
  'transitionalDocumentCount',
  'oldestSourceDate',
  'latestSourceDate',
  'temporalSpreadDays',
  'recentDocumentCount',      // alias of currentDocumentCount, kept for the §7/§13 vocabulary
  'conflictingDocumentCount', // current-window docs supporting a COMPETING value in the same category+key
  'approvedRulePresent',      // was a human-approved rule supplied for this category+key?
  'approvedRuleMatches',      // if present, does its value equal this convention's value?
]);

function isoOrNull(v) {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}
function intOrZero(v) {
  return Number.isInteger(v) && v >= 0 ? v : 0;
}

/**
 * @typedef {Object} ConventionTemporalEntry
 * @property {string} groupKey            - deterministic: category|key|normalisedValue
 * @property {string} category            - OBSERVATION_CATEGORY.*
 * @property {string} observationKey       - the observation `key` slug
 * @property {string|null} observedValue   - the verbatim wording (never merged / normalised away — §8, §12)
 * @property {string} conventionEra        - TEMPORAL_CLASSIFICATION.* — where the EVIDENCE sits
 * @property {string} conventionStatus     - CONVENTION_STATUS.*
 * @property {Object} evidence             - the TEMPORAL_EVIDENCE_FIELDS bag (transparent components)
 * @property {string} basis                - human-readable, non-empty — why this call was made
 * @property {string[]} observationIds     - links back to the source observations (§12)
 * @property {string[]} documentIds        - links back to the source documents (§12)
 */
export function makeConventionTemporalEntry(seed = {}) {
  const s = seed && typeof seed === 'object' ? seed : {};
  const ev = s.evidence && typeof s.evidence === 'object' ? s.evidence : {};
  const evidence = {};
  for (const f of TEMPORAL_EVIDENCE_FIELDS) {
    if (f === 'oldestSourceDate' || f === 'latestSourceDate') evidence[f] = isoOrNull(ev[f]);
    else if (f === 'approvedRulePresent' || f === 'approvedRuleMatches') evidence[f] = ev[f] === true;
    else if (f === 'temporalSpreadDays') evidence[f] = Number.isInteger(ev[f]) && ev[f] >= 0 ? ev[f] : null;
    else evidence[f] = intOrZero(ev[f]);
  }
  return Object.freeze({
    groupKey: String(s.groupKey || ''),
    category: String(s.category || ''),
    observationKey: String(s.observationKey || ''),
    observedValue: s.observedValue == null ? null : String(s.observedValue),
    conventionEra: Object.values(TEMPORAL_CLASSIFICATION).includes(s.conventionEra) ? s.conventionEra : TEMPORAL_CLASSIFICATION.UNKNOWN,
    conventionStatus: Object.values(CONVENTION_STATUS).includes(s.conventionStatus) ? s.conventionStatus : CONVENTION_STATUS.INSUFFICIENT_EVIDENCE,
    evidence: Object.freeze(evidence),
    basis: String(s.basis || 'insufficient evidence'),
    observationIds: Object.freeze((Array.isArray(s.observationIds) ? s.observationIds : []).map(String)),
    documentIds: Object.freeze((Array.isArray(s.documentIds) ? s.documentIds : []).map(String)),
  });
}
export function isConventionTemporalEntry(e) {
  if (!e || typeof e !== 'object') return false;
  if (typeof e.groupKey !== 'string' || !e.groupKey) return false;
  if (!Object.values(TEMPORAL_CLASSIFICATION).includes(e.conventionEra)) return false;
  if (!Object.values(CONVENTION_STATUS).includes(e.conventionStatus)) return false;
  if (!e.evidence || typeof e.evidence !== 'object') return false;
  if (!TEMPORAL_EVIDENCE_FIELDS.every((f) => f in e.evidence)) return false;
  if (typeof e.basis !== 'string' || !e.basis) return false;
  if (!Array.isArray(e.observationIds) || !Array.isArray(e.documentIds)) return false;
  return true;
}

/**
 * @typedef {Object} ConventionConflict
 * @property {string} category
 * @property {string} observationKey
 * @property {ConventionTemporalEntry[]} sides   - >= 2 competing values, EACH kept with its own evidence (§8 — never merged)
 * @property {string} note
 */
export function makeConventionConflict(seed = {}) {
  const s = seed && typeof seed === 'object' ? seed : {};
  return Object.freeze({
    category: String(s.category || ''),
    observationKey: String(s.observationKey || ''),
    sides: Object.freeze((Array.isArray(s.sides) ? s.sides : []).map((x) => (isConventionTemporalEntry(x) ? x : makeConventionTemporalEntry(x)))),
    note: String(s.note || ''),
  });
}
export function isConventionConflict(c) {
  return !!c && typeof c === 'object'
    && typeof c.category === 'string'
    && Array.isArray(c.sides) && c.sides.length >= 2 && c.sides.every(isConventionTemporalEntry);
}

/**
 * @typedef {Object} DriftFinding
 * @property {{category: string, key: string, value: string, ruleId: string|null}} approvedRule  - READ-ONLY input, echoed as-is
 * @property {string} status                 - CONVENTION_STATUS.*
 * @property {ConventionTemporalEntry|null} approvedConventionEvidence  - the temporal entry for the approved value, if the corpus has any
 * @property {ConventionTemporalEntry[]} competingEvidence             - recent corpus entries for a DIFFERENT value, same category+key
 * @property {string} basis
 * @property {boolean} ruleUnchanged         - ALWAYS true — this layer never modifies an approved rule (§10, §11)
 */
export function makeDriftFinding(seed = {}) {
  const s = seed && typeof seed === 'object' ? seed : {};
  const r = s.approvedRule && typeof s.approvedRule === 'object' ? s.approvedRule : {};
  return Object.freeze({
    approvedRule: Object.freeze({
      category: String(r.category || ''),
      key: String(r.key || ''),
      value: r.value == null ? null : String(r.value),
      ruleId: r.ruleId == null ? null : String(r.ruleId),
    }),
    status: Object.values(CONVENTION_STATUS).includes(s.status) ? s.status : CONVENTION_STATUS.INSUFFICIENT_EVIDENCE,
    approvedConventionEvidence: s.approvedConventionEvidence == null ? null
      : (isConventionTemporalEntry(s.approvedConventionEvidence) ? s.approvedConventionEvidence : makeConventionTemporalEntry(s.approvedConventionEvidence)),
    competingEvidence: Object.freeze((Array.isArray(s.competingEvidence) ? s.competingEvidence : []).map((x) => (isConventionTemporalEntry(x) ? x : makeConventionTemporalEntry(x)))),
    basis: String(s.basis || 'insufficient evidence'),
    ruleUnchanged: true,
  });
}
export function isDriftFinding(f) {
  return !!f && typeof f === 'object'
    && f.approvedRule && typeof f.approvedRule === 'object'
    && Object.values(CONVENTION_STATUS).includes(f.status)
    && f.ruleUnchanged === true;
}

/**
 * @typedef {Object} ConventionTemporalReport
 * @property {string} schema
 * @property {string} generatedAt
 * @property {Object} windows              - the RESOLVED evidence windows actually used (or all-null when unconfigured)
 * @property {boolean} temporalConfigured  - false ⇒ every entry is `unknown` / `insufficient_evidence`
 * @property {ConventionTemporalEntry[]} conventions
 * @property {ConventionConflict[]} conflicts
 * @property {DriftFinding[]} drift
 * @property {{total: number, unknown: number, historicalOnly: number, currentEvidence: number, conflicting: number, possibleDrift: number}} summary
 */
export function makeConventionTemporalReport(seed = {}) {
  const s = seed && typeof seed === 'object' ? seed : {};
  const conventions = (Array.isArray(s.conventions) ? s.conventions : []).map((x) => (isConventionTemporalEntry(x) ? x : makeConventionTemporalEntry(x)));
  const count = (st) => conventions.filter((c) => c.conventionStatus === st).length;
  return Object.freeze({
    schema: TEMPORAL_REPORT_SCHEMA,
    generatedAt: String(s.generatedAt || new Date().toISOString()),
    windows: Object.freeze({
      historicalCutoff: isoOrNull(s.windows && s.windows.historicalCutoff),
      currentWindowStart: isoOrNull(s.windows && s.windows.currentWindowStart),
      transitionalOverlapDays: Number.isInteger(s.windows && s.windows.transitionalOverlapDays) ? s.windows.transitionalOverlapDays : 0,
    }),
    temporalConfigured: s.temporalConfigured === true,
    conventions: Object.freeze(conventions),
    conflicts: Object.freeze((Array.isArray(s.conflicts) ? s.conflicts : []).map((x) => (isConventionConflict(x) ? x : makeConventionConflict(x)))),
    drift: Object.freeze((Array.isArray(s.drift) ? s.drift : []).map((x) => (isDriftFinding(x) ? x : makeDriftFinding(x)))),
    summary: Object.freeze({
      total: conventions.length,
      unknown: conventions.filter((c) => c.conventionEra === TEMPORAL_CLASSIFICATION.UNKNOWN).length,
      insufficientEvidence: count(CONVENTION_STATUS.INSUFFICIENT_EVIDENCE),
      historicalOnly: count(CONVENTION_STATUS.HISTORICAL_ONLY),
      currentEvidence: count(CONVENTION_STATUS.CURRENT_EVIDENCE),
      conflicting: count(CONVENTION_STATUS.CONFLICTING),
      possibleDrift: count(CONVENTION_STATUS.POSSIBLE_DRIFT),
      aligned: count(CONVENTION_STATUS.ALIGNED),
    }),
  });
}
export function isConventionTemporalReport(r) {
  if (!r || typeof r !== 'object') return false;
  if (r.schema !== TEMPORAL_REPORT_SCHEMA) return false;
  if (typeof r.generatedAt !== 'string' || !r.generatedAt) return false;
  if (typeof r.temporalConfigured !== 'boolean') return false;
  if (!Array.isArray(r.conventions) || !r.conventions.every(isConventionTemporalEntry)) return false;
  if (!Array.isArray(r.conflicts) || !Array.isArray(r.drift)) return false;
  return true;
}
