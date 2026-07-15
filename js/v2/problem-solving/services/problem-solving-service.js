/* ============================================================
   PROBLEM-SOLVING-SERVICE.JS — Problem Solving Pipeline Integration
   (V2, Phase 8-10 Part 4 / Phase 10.5 Parts 1-4)

   PURPOSE: the ONE place the full pipeline this platform's brief names is
   actually threaded together — Problem -> Problem Intelligence ->
   Problem Classification -> Diagnostic Planning -> Routing Decision ->
   Conversation -> Reasoning -> Recommendation -> NOR Composition (when
   applicable) — without a single edit to any file any of the domains it
   composes already owned. This file is the "sees every domain, owns none
   of them" layer js/v2/README.md already reserves for `ui/`.

   PHASE 10.5 ADDITION (extends Phase 8-10's own beginProblemSolving,
   composeApprovedNor is UNCHANGED). "The legacy Intent Engine becomes a
   downstream helper. It is no longer the primary entry point." —
   `startConversation()` (which internally calls the real Intent Engine)
   is now called ONLY for a category the Problem Router's own
   CATEGORY_TO_INTENT table honestly maps — never as the first thing a
   free-text utterance touches. Every OTHER routable category (including
   'facility', which drove the whole migration) now gets a REAL downstream
   workflow too: `problem-conversation-engine.js`'s generic, engine-backed
   turn loop, closing the exact gap
   PROBLEM_SOLVING_PIPELINE_IMPLEMENTATION_REPORT.md's own Known
   Limitations named, without touching conversation/'s closed Intent enum.

   WHY CATEGORY_TO_INTENT STILL LIVES HERE, NOT IN A REGISTRY. Unchanged
   reasoning from Phase 8-10 — Problem Category and Conversation Intent
   are deliberately un-merged taxonomies; this table is the one, honest,
   still-small place they are related.

   RESPONSIBILITY: beginProblemSolving(utterance, actorId),
   continueProblemConversation(state), composeApprovedNor(conversationId).

   DEPENDENCIES (this file is the one layer allowed to see all of them):
   problem-intelligence/services/problem-classification-service.js,
   problem-intelligence/contracts/problem-category-contract.js,
   reasoning/services/reasoning-service.js, ../problem-router.js,
   ../clarification-engine.js, ../problem-conversation-engine.js,
   conversation/services/conversation-service.js,
   conversation/contracts/intent-contract.js (INTENT only — vocabulary),
   document-intelligence/nor/nor-composer.js.
   ============================================================ */

'use strict';

import { classifyProblem } from '../../problem-intelligence/services/problem-classification-service.js';
import { getProblemCategory } from '../../problem-intelligence/contracts/problem-category-contract.js';
import { planDiagnosis } from '../../reasoning/services/reasoning-service.js';
import { startConversation, findConversation } from '../../conversation/services/conversation-service.js';
import { INTENT } from '../../conversation/contracts/intent-contract.js';
import { composeNorDocument } from '../../document-intelligence/nor/nor-composer.js';
import { routeProblem } from '../problem-router.js';
import { WORKFLOW_ROUTE } from '../contracts/workflow-route-contract.js';
import { generateClarification } from '../clarification-engine.js';
import { advanceProblemConversation } from '../problem-conversation-engine.js';

export const PROBLEM_SOLVING_ERRORS = Object.freeze({
  INVALID_UTTERANCE: 'INVALID_UTTERANCE',
  NOT_FOUND: 'NOT_FOUND',
  NOT_READY: 'NOT_READY',
});

/** The ONE honest category -> intent mapping that exists today. See
 *  header — this is deliberately not exhaustive; every other routable
 *  category now falls through to the generic Problem Conversation loop
 *  instead of getting no downstream workflow at all (Phase 10.5's own
 *  fix to Phase 8-10's Known Limitation #2). */
const CATEGORY_TO_INTENT = Object.freeze({
  business_trip: INTENT.CREATE_NOR,
});

/** Only 'facility' is genuinely diagnostic (root-cause hypotheses make
 *  sense for "what's wrong with this asset"); procurement/administration
 *  are plain fact-gathering requests with no cause to diagnose — see
 *  problem-conversation-engine.js's own header for why this is one engine
 *  with a flag, not two. */
const DIAGNOSTIC_CATEGORIES = Object.freeze(['facility']);

function failure(code, message) {
  return Object.freeze({ ok: false, data: null, error: Object.freeze({ code, message }) });
}
function success(data) {
  return Object.freeze({ ok: true, data: Object.freeze(data), error: null });
}

/**
 * Part 1 (Entry Point Migration) + Part 2 (Problem Router). Never rejects
 * an utterance before Problem Classification — the only two failure modes
 * are an empty/invalid utterance (a real input error) and an internal
 * classification failure; a genuinely unclassifiable PROBLEM routes to
 * CLARIFICATION_CONVERSATION, never a failure.
 * @param {string} utterance
 * @param {string} actorId
 * @returns {{ok: boolean, data: object|null, error: object|null}}
 */
export function beginProblemSolving(utterance, actorId) {
  if (typeof utterance !== 'string' || !utterance.trim()) {
    return failure(PROBLEM_SOLVING_ERRORS.INVALID_UTTERANCE, 'beginProblemSolving: utterance must be a non-empty string.');
  }

  const classified = classifyProblem(utterance);
  if (!classified.ok) return classified;
  const { problem, categoryConfidence, matchedKeywords } = classified.data;

  const category = getProblemCategory(problem.facts.category) || getProblemCategory('unknown');
  const candidateFields = category.fieldSchema.filter((f) => !(f.field in problem.facts));
  const diagnosticPlan = planDiagnosis(problem, candidateFields);

  const hasIntentMapping = !!CATEGORY_TO_INTENT[category.id];
  const routingDecision = routeProblem(problem, categoryConfidence, { hasIntentMapping });

  const result = {
    problem, categoryConfidence, category: category.id, diagnosticPlan, routingDecision,
    conversation: null, problemConversationTurn: null, clarification: null, searchQuery: null, navigateTo: null,
    // Backward-compatible with Phase 8-10's own `downstreamNote` field
    // (Part 5 — "preserve all existing workflows"); recomputed below once
    // the actual route is known, never left stale.
    downstreamNote: '',
  };

  switch (routingDecision.route) {
    case WORKFLOW_ROUTE.CONVERSATION: {
      const mappedIntent = CATEGORY_TO_INTENT[category.id];
      // GRACEFUL DEGRADATION, NOT A SILENT FAILURE — READ CAREFULLY.
      // Problem Classification's own vocabulary ('perjalanan dinas',
      // 'dinas', 'trip') is deliberately broader than conversation/'s real
      // Intent Engine, which requires the literal word "NOR" somewhere in
      // the utterance (verified directly in intent-engine.js's own CREATE_NOR
      // pattern — a real, pre-existing narrowness this phase's own
      // Executive Summary already found, not something introduced here).
      // "Mau perjalanan dinas" therefore classifies correctly as
      // business_trip but would make the REAL startConversation() land on
      // UNKNOWN/FAILED — exactly the "Request not recognized" outcome Part
      // 3 forbids. Rather than editing conversation/contracts/
      // intent-contract.js's closed enum (a previous-phase file this phase
      // still does not touch) or duplicating conversation-service.js's own
      // logic, this tries the REAL, richer path first (real Conversation,
      // real eventual NOR Composition) and only falls back to the generic
      // Problem Conversation loop — same engine, same fields
      // (business_trip's own fieldSchema), same honest "Reasoning" step at
      // completion (advanceProblemConversation calls reason() too) — when
      // the real Intent Engine genuinely did not recognize the utterance.
      // The exact "safe(label, fn) graceful-degradation convention" the
      // original V2 architecture proposal (§4.3) already names as the
      // platform's own idiom, applied here for the first time in js/v2/.
      if (mappedIntent) {
        const started = startConversation({ utterance, actorId });
        if (started.ok && started.data.currentIntent.intent !== INTENT.UNKNOWN && started.data.state !== 'failed') {
          result.conversation = started.data;
          break;
        }
      }
      result.problemConversationTurn = advanceProblemConversation({
        problem, includeHypotheses: false, isFirstTurn: true,
      });
      break;
    }
    case WORKFLOW_ROUTE.DIAGNOSTIC_CONVERSATION: {
      result.problemConversationTurn = advanceProblemConversation({
        problem, includeHypotheses: DIAGNOSTIC_CATEGORIES.includes(category.id), isFirstTurn: true,
      });
      break;
    }
    case WORKFLOW_ROUTE.SEARCH: {
      result.searchQuery = problem.facts.query || problem.description;
      break;
    }
    case WORKFLOW_ROUTE.KNOWLEDGE_ACQUISITION: {
      result.navigateTo = 'archive';
      break;
    }
    case WORKFLOW_ROUTE.CLARIFICATION_CONVERSATION:
    default: {
      result.clarification = generateClarification(problem, matchedKeywords);
      break;
    }
  }

  result.downstreamNote = result.conversation
    ? `Routed to a REAL Conversation (intent "${result.conversation.currentIntent.intent}", id: ${result.conversation.id}).`
    : result.problemConversationTurn
      ? `Routed to the generic Problem Conversation loop for category "${category.id}" (route: ${routingDecision.route}).`
      : result.clarification
        ? `Category could not be confidently routed — clarification requested instead of a rejection.`
        : result.searchQuery !== null
          ? `Routed to Search for query "${result.searchQuery}".`
          : result.navigateTo
            ? `Routed to Knowledge Acquisition (${result.navigateTo}).`
            : 'No route resolved.';

  return success(result);
}

/**
 * Part 2/4 — advances an in-progress Problem Conversation (Diagnostic or
 * plain) by one turn. A thin, stateless pass-through to
 * problem-conversation-engine.js so the UI has exactly one import surface
 * for the whole pipeline (services/ convention).
 * @param {{problem: object, answeredFacts?: Object, askedFields?: string[], hypotheses?: object[], includeHypotheses?: boolean}} state
 */
export function continueProblemConversation(state) {
  return advanceProblemConversation({ ...state, isFirstTurn: false });
}

/**
 * Part 3 integration point — a NOR Composition only ever proceeds from an
 * ALREADY-COMPLETE Conversation's genuinely gathered facts (never from raw
 * text, never invented). Mirrors task-executor.js's own
 * "refuses anything not READY" discipline (conversation-service.js#
 * completeConversation). UNCHANGED since Phase 8-10.
 * @param {string} conversationId
 */
export function composeApprovedNor(conversationId) {
  const current = findConversation(conversationId);
  if (!current.ok) return failure(PROBLEM_SOLVING_ERRORS.NOT_FOUND, `No conversation "${conversationId}".`);
  const c = current.data;
  if (c.state !== 'ready' && c.state !== 'completed') {
    return failure(PROBLEM_SOLVING_ERRORS.NOT_READY, `Conversation "${conversationId}" is "${c.state}" — NOR Composition requires READY or COMPLETED (organizational reasoning must be complete before composition, never before).`);
  }
  return composeNorDocument(c.gatheredFacts, { sessionId: c.id });
}
