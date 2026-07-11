/* ============================================================
   EXPLAINABILITY-CONTRACT.JS — Knowledge Platform (V2, Phase 3)

   PURPOSE: fix what every Approved KnowledgeItem must be able to answer on
   demand (Decision 5, architecture doc §4.2.5) — "no Approved item may
   exist without a non-empty provenance." This is a THIRD explainability
   surface, alongside js/prediction/explainability.js (prediction-side) and
   js/services/dispatch-presentation.js + decision-replay-service.js
   (dispatch-side) — designed to share vocabulary (confidence, reasons,
   tone) with both so a future unification stays possible, without
   attempting that unification now.

   RESPONSIBILITY: define the Provenance typedef and the explainability
   question-to-field mapping as data.

   DEPENDENCIES: none.

   NON-GOALS: does not compute corroboration count, does not generate
   preferenceRationale text (that is explicitly human-written at approval
   time, never auto-generated — enforced by the review workflow, not by
   this contract). Does not reconcile with the two existing explainability
   surfaces — that reconciliation is explicitly an open question deferred
   past Phase 3 (architecture doc §5, closing questions).

   FUTURE EVOLUTION: knowledge/explainability/knowledge-explainability-engine.js
   (still a Phase 3 stub) will implement `explain(item)` against this
   contract once a real repository exists.
   ============================================================ */

'use strict';

/**
 * @typedef {Object} Provenance
 * @property {string} connectorId       - which connector produced this item (contracts/connector-contract.js)
 * @property {string} sourceRef         - opaque reference into the connector's source (a file id, a config key, a decision id, ...)
 * @property {string} capturedAt        - ISO 8601
 */

export const EXPLAINABILITY_SCHEMA = 'knowledge-explainability@1';

/** The five questions every Approved KnowledgeItem must answer, and where
 *  the answer lives. Mirrors the table in architecture doc §4.2.5. */
export const EXPLAINABILITY_QUESTIONS = Object.freeze([
  Object.freeze({ question: 'Where did I learn this?', field: 'provenance' }),
  Object.freeze({ question: 'How many approved sources support this?', field: 'corroborationCount', derivedFrom: Object.freeze(['provenance', 'relationship']) }),
  Object.freeze({ question: 'When was it approved?', field: 'approvedAt' }),
  Object.freeze({ question: 'Who approved it?', field: 'approvedBy' }),
  Object.freeze({ question: 'Why is this preferred?', field: 'preferenceRationale', humanWrittenOnly: true }),
]);

/**
 * Structural check: does a Provenance object satisfy the contract shape?
 * @param {*} p
 * @returns {boolean}
 */
export function isProvenance(p) {
  return !!p && typeof p === 'object'
    && typeof p.connectorId === 'string' && p.connectorId.length > 0
    && typeof p.sourceRef === 'string' && p.sourceRef.length > 0
    && typeof p.capturedAt === 'string' && p.capturedAt.length > 0;
}
