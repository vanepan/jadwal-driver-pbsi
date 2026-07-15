/* ============================================================
   DIAGNOSTIC-PLAN-CONTRACT.JS — Organizational Reasoning Foundation
   (V2, Phase 8-10, Part 2)

   PURPOSE: fix the shape of the Diagnostic Planning Engine's ONE output —
   "what should we find out first," not an answer. Composes hypotheses
   (hypothesis-contract.js), missing information (reuses
   knowledge-gap-contract.js#KnowledgeGap verbatim — never redefined), and
   one recommended next question with an explainable expected-confidence-
   gain justification.

   RESPONSIBILITY: DiagnosticPlan typedef, constructor, structural check.

   DEPENDENCIES: none (references sibling contracts only in JSDoc).

   NON-GOALS: does not compute anything — see diagnostic-planning-engine.js.
   A DiagnosticPlan is never itself a Decision.
   ============================================================ */

'use strict';

export const DIAGNOSTIC_PLAN_SCHEMA = 'reasoning-diagnostic-plan@1';

/**
 * @typedef {Object} DiagnosticPlan
 * @property {import('./problem-contract.js').Problem} problem
 * @property {import('./hypothesis-contract.js').Hypothesis[]} hypotheses
 * @property {import('./knowledge-gap-contract.js').KnowledgeGap[]} missingInformation
 * @property {{field: string, prompt: string, expectedConfidenceGain: number, gainBasis: string}|null} recommendedNextQuestion
 * @property {number} confidence      - plain arithmetic, mirrors conversation/dynamic-conversation-engine.js's formula
 * @property {string} createdAt
 */
export function makeDiagnosticPlan({
  problem, hypotheses = [], missingInformation = [], recommendedNextQuestion = null, confidence,
}) {
  return Object.freeze({
    problem,
    hypotheses: Object.freeze([...hypotheses]),
    missingInformation: Object.freeze([...missingInformation]),
    recommendedNextQuestion: recommendedNextQuestion ? Object.freeze({ ...recommendedNextQuestion }) : null,
    confidence,
    createdAt: new Date().toISOString(),
  });
}

export function isDiagnosticPlan(p) {
  return !!p && typeof p === 'object'
    && !!p.problem && typeof p.problem === 'object'
    && Array.isArray(p.hypotheses) && Array.isArray(p.missingInformation)
    && typeof p.confidence === 'number' && p.confidence >= 0 && p.confidence <= 1;
}
