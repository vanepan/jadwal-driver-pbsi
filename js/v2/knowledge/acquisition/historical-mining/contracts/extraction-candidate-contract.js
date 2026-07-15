/* ============================================================
   EXTRACTION-CANDIDATE-CONTRACT.JS — Autonomous Knowledge Acquisition
   (Sprint 02)

   PURPOSE: fix the shape of ONE pre-ingestion candidate — what
   candidate-extraction-engine.js and consensus-engine.js produce BEFORE
   a real KnowledgeItem exists. Kept as its own contract, separate from
   knowledge/contracts/knowledge-item-contract.js, because a candidate
   carries POPULATION EVIDENCE (sample size, consistency, contradiction)
   that a KnowledgeItem itself has no field for — draft-generation-engine.js
   is the ONE place a candidate's evidence gets compressed into a
   KnowledgeItem's plain `confidence` number plus a human-readable
   rationale string.

   RESPONSIBILITY: typedef + structural validator only.

   DEPENDENCIES: none.

   NON-GOALS: does not decide `kind` semantics, does not compute
   confidence, does not touch the repository.
   ============================================================ */

'use strict';

/**
 * @typedef {Object} ExtractionCandidate
 * @property {string} key                 - stable slug identifying WHAT this candidate is about, e.g. 'rule.recipients-fixed'
 * @property {string} domainType          - registry-backed, e.g. 'nor'
 * @property {string} kind                - registry-backed
 * @property {*} payload                  - shaped per the existing knowledge/language/contracts/*.js for this kind
 * @property {number} sampleSize          - population size this was computed against
 * @property {number} supportingCount     - how many population records support THIS specific value
 * @property {number} consistencyPct      - supportingCount / sampleSize, 0-1
 * @property {boolean} isException        - true for a minority variant explicitly represented, never discarded (Task 3)
 * @property {string|null} exceptionOfKey - the majority candidate's `key` this is an exception to, if isException
 * @property {boolean} contradicted       - true if a real, non-trivial minority disagrees with this candidate
 * @property {string} rationale           - human-readable, non-empty
 * @property {string[]} evidenceSourceRefs - NorHistoricalRecord.sourceRef values actually contributing
 */

export function isExtractionCandidate(c) {
  return !!c && typeof c === 'object'
    && typeof c.key === 'string' && c.key.length > 0
    && typeof c.domainType === 'string' && c.domainType.length > 0
    && typeof c.kind === 'string' && c.kind.length > 0
    && c.payload !== null && c.payload !== undefined
    && typeof c.sampleSize === 'number' && c.sampleSize >= 1
    && typeof c.supportingCount === 'number' && c.supportingCount >= 0 && c.supportingCount <= c.sampleSize
    && typeof c.consistencyPct === 'number' && c.consistencyPct >= 0 && c.consistencyPct <= 1
    && typeof c.isException === 'boolean'
    && typeof c.contradicted === 'boolean'
    && typeof c.rationale === 'string' && c.rationale.length > 0
    && Array.isArray(c.evidenceSourceRefs);
}

/**
 * @param {object} fields
 * @returns {ExtractionCandidate}
 */
export function makeExtractionCandidate({
  key, domainType, kind, payload, sampleSize, supportingCount,
  isException = false, exceptionOfKey = null, contradicted = false,
  rationale, evidenceSourceRefs = [],
}) {
  const consistencyPct = sampleSize > 0 ? Math.round((supportingCount / sampleSize) * 100) / 100 : 0;
  return Object.freeze({
    key, domainType, kind, payload, sampleSize, supportingCount, consistencyPct,
    isException, exceptionOfKey, contradicted, rationale,
    evidenceSourceRefs: Object.freeze([...evidenceSourceRefs]),
  });
}
