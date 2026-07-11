/* ============================================================
   EVIDENCE-CONTRACT.JS — Knowledge Platform (V2.0.12)

   PURPOSE: fix the shape of ONE piece of evidence backing a confidence
   number or a future recommendation — e.g. "this item's source is
   weighted 0.9" or "this item is corroborated by that item." Today
   confidence-engine.js produces only a raw corroborationCount number;
   this contract formalizes what that number (and the source weight
   it's blended with) actually consists of, as a typed, listable shape.

   RESPONSIBILITY: define the Evidence typedef and a structural
   validator. Does not compute weight or corroboration itself.

   DEPENDENCIES: none.

   NON-GOALS: does not decide HOW MUCH evidence is enough (that is
   confidence-engine.js's weighted formula, unchanged by this file) —
   a pure shape, same role as dependency-graph-contract.js's
   KnowledgeRelationship payload.

   FUTURE EVOLUTION: knowledge/services/confidence-service.js reshapes
   confidence-engine.js's already-computed numbers into Evidence[]
   records against this contract — see explainConfidenceAsEvidence().
   ============================================================ */

'use strict';

export const EVIDENCE_SCHEMA = 'knowledge-evidence@1';

/** Closed set of what kind of fact an Evidence record represents. */
export const EVIDENCE_KIND = Object.freeze({
  SOURCE: 'source',
  CORROBORATION: 'corroboration',
  STATISTIC: 'statistic',
  RELATIONSHIP: 'relationship',
});

/**
 * One piece of evidence backing a confidence number or recommendation.
 * @typedef {Object} Evidence
 * @property {string} itemId      - the KnowledgeItem this evidence points to
 * @property {string} kind        - one of EVIDENCE_KIND
 * @property {number} weight      - 0–1, this evidence's contribution
 * @property {string} rationale   - human-readable, non-empty
 */

/**
 * Structural validity check.
 * @param {*} e
 * @returns {boolean}
 */
export function isEvidence(e) {
  return !!e && typeof e === 'object'
    && typeof e.itemId === 'string' && e.itemId.length > 0
    && Object.values(EVIDENCE_KIND).includes(e.kind)
    && typeof e.weight === 'number' && e.weight >= 0 && e.weight <= 1
    && typeof e.rationale === 'string' && e.rationale.length > 0;
}

/**
 * @param {*} list
 * @returns {boolean}
 */
export function isEvidenceList(list) {
  return Array.isArray(list) && list.every(isEvidence);
}
