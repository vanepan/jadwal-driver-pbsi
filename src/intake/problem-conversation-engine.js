/* ============================================================
   PROBLEM-CONVERSATION-ENGINE.JS — Problem Solving Pipeline Integration
   (V2, Phase 10.5, Parts 2 & 4)

   PURPOSE: closes the exact gap
   PROBLEM_SOLVING_PIPELINE_IMPLEMENTATION_REPORT.md's own "Known
   Limitations" named — "facility-category problems have no downstream
   platform action" (and, as of Phase 10.5's own worked examples,
   procurement/administration don't either — no matching Conversation
   Intent exists in conversation/contracts/intent-contract.js's closed
   enum for any of the three, and this phase still does not touch that
   file, per "do not revisit previous architectural decisions"). Rather
   than inventing new Intents, this file is a GENERIC, category-agnostic
   turn-based Q&A loop built entirely from Phase 8-10's own
   `reasoning/services/reasoning-service.js` exports
   (`planDiagnosis`/`generateHypotheses`/`updateHypotheses`) — capabilities
   that were ALREADY domain-agnostic and never needed a Conversation
   Intent to work.

   STATELESS BY DESIGN, mirroring conversation/dynamic-conversation-
   engine.js's own precedent exactly: this file owns no repository. The
   caller (sarpras-intelligence-center.js's own Home UI state, for this
   phase — see that file's `problemConversationState`) holds the
   accumulated `answeredFacts`/`hypotheses`/`askedFields` between turns and
   hands them back in on every call; `advanceProblemConversation()`
   recomputes fresh from whatever it is given, the same "a converged sweep
   costs nothing" idiom every pure engine in this platform follows.

   DIAGNOSTIC VS. NON-DIAGNOSTIC, ONE ENGINE. `includeHypotheses` is the
   only behavioral fork: TRUE for the 'facility' (Diagnostic Conversation)
   route, FALSE for 'procurement'/'administration' (plain Conversation
   fallback route, when no real Intent mapping exists) — a category whose
   problem is not "what's the root cause" has no hypotheses to track, and
   this file never fabricates one just to fill the shape.

   RESPONSIBILITY: advanceProblemConversation(state).

   DEPENDENCIES: reasoning/services/reasoning-service.js (planDiagnosis,
   generateHypotheses, updateHypotheses, reason — ALL reused, unchanged),
   problem-intelligence/contracts/problem-category-contract.js,
   reasoning/contracts/problem-contract.js (makeProblem — reused).

   A REAL BUG THIS FILE'S OWN FIRST DRAFT HAD, FIXED — READ CAREFULLY.
   `planDiagnosis()`'s own `recommendedNextQuestion` freely mixes category-
   schema fields (things only the REPORTING HUMAN can answer — "how urgent
   is this?") with domain-wide Knowledge Gaps (things an ADMIN/knowledge
   curator would need to fix — "no Ontology is recorded for this domain
   yet"), and a critical-priority Gap always outranks a normal-priority
   schema field. Driving the end-user-facing conversation loop directly
   off it meant a regular user reporting "AC kamar atlet rusak" got asked
   "What is the Ontology for 'engineering'?" — a real, verified defect
   (found by actually running this engine, not by inspection). The fix:
   `nextQuestion` below is sourced ONLY from `candidateFields` (the
   category's own schema) — `plan`'s gaps/hypotheses/confidence are still
   composed and returned (useful for Developer Mode / an admin), but never
   drive what is put in front of the person who reported the problem.
   ============================================================ */

'use strict';

import {
  planDiagnosis, generateHypotheses, updateHypotheses, reason, RECOMMENDATION_ERRORS,
} from '../reasoning/services/reasoning-service.js';
import { getProblemCategory } from './contracts/problem-category-contract.js';
import { makeProblem } from '../reasoning/contracts/problem-contract.js';

/** A plain, documented completion rule — never a model decision. Complete
 *  when every schema field this category names is genuinely known, OR the
 *  DiagnosticPlan's own confidence (knownCount / (knownCount+outstanding),
 *  see diagnostic-planning-engine.js) reaches this bar — whichever happens
 *  first, mirroring conversation/dynamic-conversation-engine.js's own
 *  DEFAULT_CONFIDENCE_THRESHOLD (0.75) exactly. */
export const PROBLEM_CONVERSATION_CONFIDENCE_THRESHOLD = 0.75;

/**
 * @param {{problem: import('../reasoning/contracts/problem-contract.js').Problem,
 *          answeredFacts?: Object, askedFields?: string[], hypotheses?: object[],
 *          includeHypotheses?: boolean, isFirstTurn?: boolean}} state
 * @returns {{problem: object, plan: object, hypotheses: object[], nextQuestion: object|null,
 *            isComplete: boolean, recommendation: object|null}}
 */
export function advanceProblemConversation({
  problem, answeredFacts = {}, askedFields = [], hypotheses = [], includeHypotheses = false, isFirstTurn = false,
}) {
  const mergedFacts = { ...problem.facts, ...answeredFacts };
  const updatedProblem = makeProblem({ domainType: problem.domainType, description: problem.description, facts: mergedFacts });

  const category = getProblemCategory(mergedFacts.category) || getProblemCategory('unknown');
  const askedSet = new Set(askedFields);
  const candidateFields = category.fieldSchema.filter((f) => !(f.field in mergedFacts) && !askedSet.has(f.field));

  let nextHypotheses = hypotheses;
  if (includeHypotheses) {
    if (isFirstTurn) {
      nextHypotheses = generateHypotheses(updatedProblem);
    } else {
      for (const [field, value] of Object.entries(answeredFacts)) {
        nextHypotheses = updateHypotheses(nextHypotheses, { field, value });
      }
    }
  }

  const plan = planDiagnosis(updatedProblem, candidateFields);
  // Schema-only completion (see header) — a domain-wide Knowledge Gap
  // (e.g. "no Ontology recorded") can never block or artificially prolong
  // an end-user conversation that has genuinely answered everything its
  // own category schema asks for.
  const isComplete = candidateFields.length === 0;

  // Ranked directly from candidateFields — non-optimizable (never
  // fabricable any other way) first, same priority convention
  // conversation/dynamic-conversation-engine.js already established.
  // Deliberately NOT plan.recommendedNextQuestion (see header).
  const orderedCandidates = [...candidateFields].sort((a, b) => (a.optimizable === false ? -1 : 1) - (b.optimizable === false ? -1 : 1));
  const nextField = orderedCandidates[0] || null;

  // Part "Reasoning -> Recommendation" of the pipeline — attempted only
  // once the conversation is genuinely complete, never mid-flow (organizational
  // reasoning must be complete before a recommendation, never before —
  // the same ordering nor-composer.js already enforces for NOR Composition).
  // Cite-or-abstain: NO_APPLICABLE_KNOWLEDGE is a legitimate, honest outcome,
  // never masked as an error.
  let recommendation = null;
  if (isComplete) {
    const result = reason(updatedProblem);
    if (result.ok) recommendation = result.data;
    else if (result.error.code !== RECOMMENDATION_ERRORS.NO_APPLICABLE_KNOWLEDGE) throw new Error(result.error.message);
  }

  return Object.freeze({
    problem: updatedProblem,
    plan,
    hypotheses: Object.freeze(nextHypotheses),
    nextQuestion: nextField ? Object.freeze({ field: nextField.field, prompt: nextField.prompt, label: nextField.label }) : null,
    isComplete,
    recommendation,
  });
}
