/* ============================================================
   DYNAMIC-CONVERSATION-SERVICE.JS — Conversation Intelligence Foundation
   (V2, Phase 4-7, Part 4)

   PURPOSE: the ONE public surface for "what should this Conversation ask
   next, and how confident are we?" — a stateless enrichment over an
   already-real, already-persisted Conversation
   (conversation/services/conversation-service.js, entirely unmodified by
   this phase). Holds NO repository of its own and creates NO new
   Conversation state: every field this file reads comes from the SAME
   Conversation record conversation-service.js already builds turn over
   turn (`missingFacts`, `gatheredFacts`, `currentIntent`,
   `explainability.questionsAsked` / `questionsSkipped`) plus a fresh
   Knowledge Gap scan (reasoning/services/reasoning-service.js).

   WHY QUESTION HISTORY NEEDS NO NEW FIELD. conversation-service.js's own
   `advance()` already accumulates `explainability.questionsAsked` (human
   answers) and `questionsSkipped` (Optimizer resolutions) turn over turn,
   never overwritten (see that file's `mergeExplainability`). Reading
   those two lists' `field`s back out is the entire "question history /
   deduplication" requirement — inventing a second, parallel history would
   be exactly the duplication this phase's own brief says to avoid.

   WHY domainType IS RE-DERIVED HERE INSTEAD OF IMPORTED.
   conversation-service.js's own `domainTypeOf()` is a private, unexported
   helper (by design — it is an internal step of that file's `advance()`).
   Its entire logic is two lines (CREATE_NOR is hardcoded to 'nor'; every
   other intent already carries `domainType` as one of its own required
   facts, per intent-contract.js#INTENT_FIELD_SCHEMA). Re-stating two lines
   inline is more honest than adding a new export to a file this phase's
   brief says not to touch.

   RESPONSIBILITY: `explainDynamicConversation(conversationId, opts)`.

   DEPENDENCIES: ../services/conversation-service.js (its public,
   documented API only — findConversation/explainConversation — never its
   repository), ../contracts/intent-contract.js, ../questionnaire/
   questionnaire-engine.js (explainQuestionnaire, already exported and
   already used by conversation-service.js's own explainConversation — the
   identical reuse), ../dynamic-conversation-engine.js,
   ../../reasoning/services/reasoning-service.js.
   ============================================================ */

'use strict';

import { findConversation } from './conversation-service.js';
import { INTENT, getRequiredFacts } from '../contracts/intent-contract.js';
import { explainQuestionnaire } from '../questionnaire/questionnaire-engine.js';
import {
  prioritizeQuestions, selectNextQuestion, computeConversationConfidence, hasReachedConfidenceThreshold,
  DEFAULT_CONFIDENCE_THRESHOLD,
} from '../dynamic-conversation-engine.js';
import { detectKnowledgeGaps } from '../../reasoning/services/reasoning-service.js';

export const DYNAMIC_CONVERSATION_SERVICE_ERRORS = Object.freeze({ NOT_FOUND: 'NOT_FOUND' });

function failure(code, message) {
  return Object.freeze({ ok: false, data: null, error: Object.freeze({ code, message }) });
}
function success(data) {
  return Object.freeze({ ok: true, data, error: null });
}

/** See header — the ONLY two lines re-derived from
 *  conversation-service.js's own (private) domainTypeOf(). */
function domainTypeOf(intent, gatheredFacts) {
  if (intent === INTENT.CREATE_NOR) return 'nor';
  return gatheredFacts.domainType || null;
}

/** North Star Gap Closure — same re-derivation precedent as domainTypeOf()
 *  above, mirroring conversation-service.js's own private norTypeOf(). */
function norTypeOf(intent, gatheredFacts) {
  return intent === INTENT.CREATE_NOR ? (gatheredFacts.type || null) : null;
}

/**
 * @param {string} conversationId
 * @param {{confidenceThreshold?: number}} [opts]
 * @returns {{ok: boolean, data: object|null, error: object|null}}
 */
export function explainDynamicConversation(conversationId, opts = {}) {
  const current = findConversation(conversationId);
  if (!current.ok) return failure(DYNAMIC_CONVERSATION_SERVICE_ERRORS.NOT_FOUND, `No conversation "${conversationId}".`);
  const c = current.data;
  const threshold = typeof opts.confidenceThreshold === 'number' ? opts.confidenceThreshold : DEFAULT_CONFIDENCE_THRESHOLD;

  const intent = c.currentIntent.intent;
  const domainType = domainTypeOf(intent, c.gatheredFacts);
  const norType = norTypeOf(intent, c.gatheredFacts);
  const gaps = domainType ? detectKnowledgeGaps(domainType, norType) : [];

  const askedDedupKeys = new Set([
    ...c.explainability.questionsAsked.map((q) => q.field),
    ...c.explainability.questionsSkipped.map((q) => q.field),
  ]);
  const schemaByField = new Map(getRequiredFacts(intent, norType).map((f) => [f.field, f]));

  const dynamicQuestions = prioritizeQuestions(c.missingFacts, schemaByField, gaps, askedDedupKeys);
  const nextQuestion = selectNextQuestion(dynamicQuestions);

  const questionnaire = explainQuestionnaire(intent, c.gatheredFacts);
  const { confidence, basis } = computeConversationConfidence({
    knownCount: questionnaire.known.length,
    outstandingCount: dynamicQuestions.length,
  });

  return success(Object.freeze({
    conversationId: c.id,
    domainType,
    nextQuestion,
    queuedQuestions: Object.freeze(dynamicQuestions),
    gaps: Object.freeze(gaps),
    confidence,
    confidenceBasis: basis,
    confidenceThreshold: threshold,
    thresholdReached: hasReachedConfidenceThreshold(confidence, threshold),
  }));
}
