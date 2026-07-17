/* ============================================================
   CONVERSATION-SERVICE.JS — Conversation Intelligence Foundation (Phase 6)

   PURPOSE: Conversation's ONE owner, and the single orchestrator of the
   mission's whole pipeline — Intent Detection -> Questionnaire Engine ->
   Question Optimizer -> Context Builder -> Task Executor. Built to the
   identical shape as Import Session (pipeline-scheduler.js), Knowledge
   (knowledge-service.js), Archive (archive-service.js) and Learning
   (learning-service.js): a reader who understands one of those four now
   understands this one too.

   THE RULE, stated once:

     repository/conversation-repository.js#create / appendVersion

     ...have exactly ONE caller in the platform: this file. Every other
     module (the engines this file itself calls) is a CLIENT. Enforced by
     scripts/conversation-ownership-check.mjs, not by discipline.

   WHY EVERY TURN RECOMPUTES FROM SCRATCH. Both startConversation() and
   continueConversation() funnel through the same private advance() step:
   recompute missing facts (questionnaire-engine), let the Question
   Optimizer resolve whatever it honestly can (question-optimizer.js), and
   rebuild Context (context-builder.js) — every single call, never an
   incremental patch. This is the same "a converged sweep costs nothing"
   discipline pipeline-scheduler.js established: newly Approved Knowledge or
   a newly approved Profile Override between turns should immediately start
   being used to skip a question, without this file needing to know THAT
   happened — it only needs to recompute, cheaply, every time.

   WHY intent DOES NOT CHANGE ACROSS TURNS. Once detectIntent() runs at
   startConversation(), currentIntent is fixed for the life of the
   Conversation — continueConversation() only ever answers questions FOR
   that intent. A human who wants to do something else starts a new
   Conversation; this file never re-interprets an utterance mid-flow.

   Part 8, restated precisely (see repository's own header for the fuller
   version): this file may read organizational facts FROM knowledge/,
   organizational-memory/ and learning/ (through their services/pure
   engines only), but nothing under those trees may ever import this file
   or the repository it owns.

   RESPONSIBILITY:
     lifecycle  startConversation / continueConversation /
                completeConversation / cancelConversation /
                resumeConversation
     read       findConversation / listConversationHistory /
                getConversationHistory
     explain    explainConversation

   DEPENDENCIES: ../repository/conversation-repository.js (the ONLY module
   allowed to call its writers), ../contracts/conversation-contract.js,
   ../contracts/intent-contract.js, ../contracts/question-contract.js,
   ../intent/intent-engine.js, ../questionnaire/questionnaire-engine.js,
   ../questionnaire/question-optimizer.js, ../context/context-builder.js,
   ../task-executor.js.
   ============================================================ */

'use strict';

import {
  create as repoCreate,
  appendVersion as repoAppendVersion,
  getById as repoGetById,
  getHistory as repoGetHistory,
  list as repoList,
} from '../repository/conversation-repository.js';
import {
  CONVERSATION_STATE, canTransitionConversation, isTerminalConversationState, makeConversation,
} from '../contracts/conversation-contract.js';
import { INTENT } from '../contracts/intent-contract.js';
import { QUESTION_SOURCE } from '../contracts/question-contract.js';
import { detectIntent } from '../intent/intent-engine.js';
import { computeMissingFacts, explainQuestionnaire } from '../questionnaire/questionnaire-engine.js';
import { optimizeQuestions } from '../questionnaire/question-optimizer.js';
import { buildContext } from '../context/context-builder.js';
import { executeTask } from '../task-executor.js';

export const CONVERSATION_SERVICE_ERRORS = Object.freeze({
  NOT_FOUND: 'NOT_FOUND',
  INVALID_UTTERANCE: 'INVALID_UTTERANCE',
  ILLEGAL_TRANSITION: 'ILLEGAL_TRANSITION',
  NOT_READY: 'NOT_READY',
});

function failure(code, message) {
  return Object.freeze({ ok: false, data: null, error: Object.freeze({ code, message }) });
}
function success(data) {
  return Object.freeze({ ok: true, data, error: null });
}

/* ══ THE ONE PIPELINE — Questionnaire -> Optimizer -> Context ══════════ */

/** CREATE_NOR is this pilot's one supported document domain (see
 *  document-intelligence/README.md — NOR is the only real pipeline);
 *  every other intent names its own domainType as a gathered fact. */
function domainTypeOf(intent, gatheredFacts) {
  if (intent === INTENT.CREATE_NOR) return 'nor';
  return gatheredFacts.domainType || null;
}

/** North Star Gap Closure — the extracted/answered "Jenis NOR" fact,
 *  needed by getRequiredFacts(intent, norType) (intent-contract.js) to pick
 *  the right NOR Type's fieldSchema. Meaningless for any intent other than
 *  CREATE_NOR, exactly like domainTypeOf() above. */
function norTypeOf(intent, gatheredFacts) {
  return intent === INTENT.CREATE_NOR ? (gatheredFacts.type || null) : null;
}

/** Real, CONFIRMED prior occasions only — a Conversation still ACTIVE or
 *  READY has not been confirmed as anything yet, and using it as a source
 *  for ANOTHER conversation would let one unfinished guess launder itself
 *  into another's answer. */
function previousConversationsFor(actorId, intent, excludeConversationId) {
  const result = repoList({ actorId, intent });
  if (!result.ok) return [];
  return result.data.filter((c) => c.state === CONVERSATION_STATE.COMPLETED && c.id !== excludeConversationId);
}

function advance({
  intent, gatheredFacts, actorId, excludeConversationId,
}) {
  const missing = computeMissingFacts(intent, gatheredFacts);
  const domainType = domainTypeOf(intent, gatheredFacts);
  const norType = norTypeOf(intent, gatheredFacts);
  const previousConversations = previousConversationsFor(actorId, intent, excludeConversationId);
  const { resolved, stillMissing } = optimizeQuestions({
    intent, domainType, norType, missingQuestions: missing, previousConversations,
  });

  const mergedFacts = { ...gatheredFacts };
  for (const r of resolved) mergedFacts[r.field] = r.value;

  const context = buildContext({
    domainType,
    conversationHistory: previousConversations.map((c) => ({ id: c.id, intent: c.currentIntent.intent, completedAt: c.updatedAt })),
  });

  return {
    state: stillMissing.length === 0 ? CONVERSATION_STATE.READY : CONVERSATION_STATE.ACTIVE,
    gatheredFacts: mergedFacts,
    missingFacts: stillMissing,
    resolved,
    context,
  };
}

/** Part 7 — every question asked and every question skipped, accumulated
 *  turn over turn, never overwritten. */
function mergeExplainability(current, advanced, newHumanAnswers) {
  return Object.freeze({
    questionsAsked: Object.freeze([...current.questionsAsked, ...newHumanAnswers]),
    questionsSkipped: Object.freeze([...current.questionsSkipped, ...advanced.resolved]),
    knowledgeUsed: Object.freeze([...current.knowledgeUsed, ...advanced.resolved.filter((r) => r.source === QUESTION_SOURCE.KNOWLEDGE)]),
    policiesApplied: Object.freeze([...current.policiesApplied, ...advanced.resolved.filter((r) => r.source === QUESTION_SOURCE.PROFILE_OVERRIDE)]),
    patternMatches: advanced.context ? advanced.context.patterns : current.patternMatches,
  });
}

/* ══ LIFECYCLE ══════════════════════════════════════════════════════ */

/**
 * Part 1/2 — parses the opening utterance, detects intent, and advances the
 * new Conversation as far as its real facts (utterance-extracted +
 * Optimizer-resolved) allow in this one call — exactly like Archive's
 * CREATED or Learning's VALIDATED, transient by construction.
 * @param {{utterance: string, actorId: string}} args
 */
export function startConversation({ utterance, actorId }) {
  if (typeof utterance !== 'string' || !utterance.trim()) {
    return failure(CONVERSATION_SERVICE_ERRORS.INVALID_UTTERANCE, 'startConversation: utterance must be a non-empty string.');
  }
  if (typeof actorId !== 'string' || !actorId) {
    return failure(CONVERSATION_SERVICE_ERRORS.INVALID_UTTERANCE, 'startConversation: actorId is required.');
  }

  const currentIntent = detectIntent(utterance);
  const seed = makeConversation({
    actorId, utterance, currentIntent, gatheredFacts: { ...currentIntent.extractedFacts }, missingFacts: [],
  });
  const created = repoCreate(seed);
  if (!created.ok) return created;

  if (currentIntent.intent === INTENT.UNKNOWN) {
    return repoAppendVersion(seed.id, {
      state: CONVERSATION_STATE.FAILED,
      taskResult: { kind: 'intent_not_recognized', utterance },
    });
  }

  const advanced = advance({
    intent: currentIntent.intent, gatheredFacts: seed.gatheredFacts, actorId, excludeConversationId: seed.id,
  });
  const explainability = mergeExplainability(seed.explainability, advanced, []);

  return repoAppendVersion(seed.id, {
    state: advanced.state,
    gatheredFacts: advanced.gatheredFacts,
    missingFacts: advanced.missingFacts,
    context: advanced.context,
    explainability,
  });
}

/**
 * Part 1/3 — a human answers one or more of the currently missing
 * questions. Recomputes the FULL pipeline (see advance()'s header), so any
 * fact that became optimizable-away between turns is used immediately.
 * @param {string} conversationId
 * @param {Object} answers - {field: value}
 */
export function continueConversation(conversationId, answers = {}) {
  const current = repoGetById(conversationId);
  if (!current.ok) return failure(CONVERSATION_SERVICE_ERRORS.NOT_FOUND, `No conversation "${conversationId}".`);
  const c = current.data;
  if (isTerminalConversationState(c.state)) {
    return failure(CONVERSATION_SERVICE_ERRORS.ILLEGAL_TRANSITION, `Conversation "${conversationId}" is already "${c.state}" — cannot continue.`);
  }

  const newHumanAnswers = Object.entries(answers || {})
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([field, value]) => ({ field, value, source: QUESTION_SOURCE.HUMAN_ANSWER, answeredAt: new Date().toISOString() }));
  const mergedFacts = { ...c.gatheredFacts };
  for (const a of newHumanAnswers) mergedFacts[a.field] = a.value;

  const advanced = advance({
    intent: c.currentIntent.intent, gatheredFacts: mergedFacts, actorId: c.actorId, excludeConversationId: c.id,
  });
  const explainability = mergeExplainability(c.explainability, advanced, newHumanAnswers);

  return repoAppendVersion(c.id, {
    state: advanced.state,
    gatheredFacts: advanced.gatheredFacts,
    missingFacts: advanced.missingFacts,
    context: advanced.context,
    explainability,
  });
}

/**
 * Part 6 — the ONLY place a Conversation is handed to the Task Executor.
 * Refuses anything not READY: completing a Conversation that still has
 * genuinely missing facts would mean the platform acting on an incomplete
 * request, which is precisely what the Questionnaire Engine exists to
 * prevent.
 * @param {string} conversationId
 */
export function completeConversation(conversationId) {
  const current = repoGetById(conversationId);
  if (!current.ok) return failure(CONVERSATION_SERVICE_ERRORS.NOT_FOUND, `No conversation "${conversationId}".`);
  const c = current.data;
  if (c.state !== CONVERSATION_STATE.READY) {
    return failure(CONVERSATION_SERVICE_ERRORS.NOT_READY, `Conversation "${conversationId}" is "${c.state}", not READY — cannot complete.`);
  }

  const result = executeTask(c);
  if (result.ok) {
    return repoAppendVersion(c.id, { state: CONVERSATION_STATE.COMPLETED, taskResult: result.data });
  }
  return repoAppendVersion(c.id, { state: CONVERSATION_STATE.FAILED, taskResult: { kind: 'task_execution_failed', error: result.error } });
}

/** A human (or the platform) stops this Conversation before it executes
 *  anything. Terminal, and — unlike FAILED — never confused with "the
 *  platform could not understand": someone made a real decision to stop. */
export function cancelConversation(conversationId, { reason = null } = {}) {
  const current = repoGetById(conversationId);
  if (!current.ok) return failure(CONVERSATION_SERVICE_ERRORS.NOT_FOUND, `No conversation "${conversationId}".`);
  const c = current.data;
  if (!canTransitionConversation(c.state, CONVERSATION_STATE.CANCELLED)) {
    return failure(CONVERSATION_SERVICE_ERRORS.ILLEGAL_TRANSITION, `Cannot cancel "${conversationId}" from "${c.state}".`);
  }
  return repoAppendVersion(c.id, {
    state: CONVERSATION_STATE.CANCELLED, taskResult: { kind: 'cancelled', reason },
  });
}

/** A pure read — re-entry for a human returning to an unfinished
 *  Conversation. Mutates nothing (no appendVersion here), so calling it
 *  any number of times is free. */
export function resumeConversation(conversationId) {
  const current = repoGetById(conversationId);
  if (!current.ok) return failure(CONVERSATION_SERVICE_ERRORS.NOT_FOUND, `No conversation "${conversationId}".`);
  const c = current.data;
  return success({
    conversation: c,
    nextQuestion: c.missingFacts[0] || null,
    isTerminal: isTerminalConversationState(c.state),
  });
}

/* ══ READ — every consumer's one door ══════════════════════════════════ */

export const findConversation = (id) => repoGetById(id);
export const listConversationHistory = (filter) => repoList(filter || {});
export const getConversationHistory = (id) => repoGetHistory(id);

/* ══ EXPLAIN — Part 7, in full ══════════════════════════════════════════ */

/**
 * Detected intent + why, known facts + missing facts, every question asked
 * and every question skipped (with source and rationale), Knowledge/
 * Policies/Patterns used — assembled entirely from data the Conversation
 * and its history already carry.
 */
export function explainConversation(conversationId) {
  const current = repoGetById(conversationId);
  if (!current.ok) return failure(CONVERSATION_SERVICE_ERRORS.NOT_FOUND, `No conversation "${conversationId}".`);
  const c = current.data;
  const questionnaire = explainQuestionnaire(c.currentIntent.intent, c.gatheredFacts);
  return success(Object.freeze({
    id: c.id,
    state: c.state,
    intent: c.currentIntent.intent,
    intentConfidence: c.currentIntent.confidence,
    matchedRules: c.currentIntent.matchedRules,
    matchedKeywords: c.currentIntent.matchedKeywords,
    matchedPatterns: c.currentIntent.matchedPatterns,
    knownFacts: questionnaire.known,
    missingFacts: questionnaire.missing,
    questionsAsked: c.explainability.questionsAsked,
    questionsSkipped: c.explainability.questionsSkipped,
    knowledgeUsed: c.explainability.knowledgeUsed,
    policiesApplied: c.explainability.policiesApplied,
    patternMatches: c.explainability.patternMatches,
    taskResult: c.taskResult,
  }));
}

export { CONVERSATION_STATE };
