/* ============================================================
   DIAGNOSTIC-PLANNING-ENGINE.JS — Organizational Reasoning Foundation
   (V2, Phase 8-10, Part 2)

   PURPOSE: "the Diagnostic Planner's job is NOT to answer, it is to
   decide: what should we find out first." Orchestrates two already-real
   capabilities (knowledge-gap-engine.js for missing information,
   hypothesis-engine.js — new this phase — for possible causes) into ONE
   DiagnosticPlan, plus the one genuinely new computation this file owns:
   ranking candidate questions by
   HYPOTHESIS-DISCRIMINATION VALUE (does answering this help tell competing
   candidate causes apart), which is a DIFFERENT criterion from
   conversation/dynamic-conversation-engine.js's schema/gap-priority
   ranking — a different question is being asked ("what best narrows the
   diagnosis" vs. "what does the intent's schema require"), so a second,
   self-contained engine is correct separation of concerns here, not
   duplicated logic.

   WHY THIS FILE NEVER IMPORTS problem-intelligence/. `planDiagnosis()`
   receives `candidateFields` (RequiredFact-shaped: field/label/prompt/
   optimizable) as a plain parameter from its caller — mirroring
   conversation/dynamic-conversation-engine.js's own `prioritizeQuestions()`
   signature exactly (it too receives its schema as a parameter, never
   looks one up itself). This keeps reasoning/ properly upstream:
   `problem-intelligence/` depends on `reasoning/`'s Problem contract, and
   the reverse edge (reasoning/ depending on problem-intelligence/'s
   category registry) is never created — the caller
   (problem-solving/services/problem-solving-service.js) is the one layer
   allowed to see both domains and does the wiring.

   WHY A RECOMMENDATION IS NEVER A DECISION applies identically here: a
   DiagnosticPlan is read-only advisory output. No file under reasoning/
   writes to the Knowledge Repository.

   RESPONSIBILITY: planDiagnosis(problem, candidateFields).

   DEPENDENCIES: ./reasoning-engine.js, ./knowledge-gap-engine.js,
   ./hypothesis-engine.js, contracts/diagnostic-plan-contract.js.
   ============================================================ */

'use strict';

import { detectKnowledgeGaps } from './knowledge-gap-engine.js';
import { generateHypotheses } from './hypothesis-engine.js';
import { makeDiagnosticPlan } from './contracts/diagnostic-plan-contract.js';
import { HYPOTHESIS_STATUS } from './contracts/hypothesis-contract.js';

/** A candidate schema field's baseline share of the total "what's still
 *  outstanding" pool, boosted when a live candidate hypothesis's own cause
 *  text mentions it (this question would help discriminate between
 *  hypotheses), and again when it can never be resolved any other way
 *  (optimizable: false, the exact vocabulary intent-contract.js and
 *  problem-category-contract.js both already use). Plain, documented
 *  arithmetic — never a model score. */
const HYPOTHESIS_RELEVANCE_BONUS = 0.15;
const NEVER_OPTIMIZABLE_BONUS = 0.1;

function fieldGain(field, label, hypotheses, poolSize) {
  const baseline = 1 / poolSize;
  const needle = String(label || field).toLowerCase();
  const relevant = hypotheses.some((h) => h.status === HYPOTHESIS_STATUS.CANDIDATE && h.cause.toLowerCase().includes(needle));
  return Math.min(1, baseline + (relevant ? HYPOTHESIS_RELEVANCE_BONUS : 0));
}

/**
 * @param {import('./contracts/problem-contract.js').Problem} problem
 * @param {{field: string, label: string, prompt: string, optimizable: boolean}[]} candidateFields - fields the caller already knows are still unresolved for this Problem's category
 * @returns {import('./contracts/diagnostic-plan-contract.js').DiagnosticPlan}
 */
export function planDiagnosis(problem, candidateFields = []) {
  const hypotheses = generateHypotheses(problem);
  const gaps = detectKnowledgeGaps(problem.domainType);

  const poolSize = candidateFields.length + gaps.length;
  const questionCandidates = [];

  if (poolSize > 0) {
    for (const f of candidateFields) {
      const gain = fieldGain(f.field, f.label, hypotheses, poolSize) + (f.optimizable === false ? NEVER_OPTIMIZABLE_BONUS : 0);
      questionCandidates.push({
        field: f.field, prompt: f.prompt, expectedConfidenceGain: Math.min(1, gain),
        gainBasis: `Baseline share of ${poolSize} outstanding item(s)${f.optimizable === false ? ', boosted — this field can never be resolved any other way' : ''}.`,
      });
    }
    for (const g of gaps) {
      const gain = fieldGain(g.field, g.field, hypotheses, poolSize) + (g.priority === 'critical' ? NEVER_OPTIMIZABLE_BONUS : 0);
      questionCandidates.push({
        field: g.field, prompt: g.recommendedQuestion.question, expectedConfidenceGain: Math.min(1, gain),
        gainBasis: `Baseline share of ${poolSize} outstanding item(s), from a detected Knowledge Gap (${g.gapType}, priority ${g.priority}).`,
      });
    }
  }

  const recommendedNextQuestion = questionCandidates.length
    ? questionCandidates.reduce((best, cur) => (cur.expectedConfidenceGain > best.expectedConfidenceGain ? cur : best), questionCandidates[0])
    : null;

  const knownCount = Object.keys(problem.facts || {}).length;
  const confidence = (knownCount + poolSize) === 0 ? 1 : Math.max(0, Math.min(1, knownCount / (knownCount + poolSize)));

  return makeDiagnosticPlan({
    problem, hypotheses, missingInformation: gaps, recommendedNextQuestion, confidence,
  });
}
