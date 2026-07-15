/* ============================================================
   DYNAMIC-CONVERSATION-ENGINE.JS — Conversation Intelligence Foundation
   (V2, Phase 4-7, Part 4)

   PURPOSE: "behave like an experienced Sarpras staff member — never ask
   static forms, never ask every question, only ask questions that reduce
   uncertainty." PURE composition over three ALREADY-REAL capabilities:
   questionnaire-engine.js's still-missing schema Questions,
   reasoning/services/reasoning-service.js's detected Knowledge Gaps, and a
   caller-supplied set of already-asked field names (question history/
   dedup). Computes no new fact-resolution logic of its own — that remains
   entirely questionnaire-engine.js / question-optimizer.js's job,
   unmodified.

   WHY THIS FILE NEVER TOUCHES questionnaire-engine.js / question-
   optimizer.js / conversation-service.js. Those three are real, tested,
   ownership-checked (scripts/conversation-ownership-check.mjs) files this
   phase's own brief says to reuse, not redesign. This file is a NEW,
   additive layer that reads their OUTPUT (a Question[] list, a
   Conversation's own accumulated `explainability.questionsAsked`/
   `questionsSkipped`) and adds exactly three things none of them do:
   priority tagging, cross-referencing against detected Knowledge Gaps,
   and a confidence-threshold stopping rule.

   RESPONSIBILITY: prioritizeQuestions, selectNextQuestion,
   computeConversationConfidence, hasReachedConfidenceThreshold.

   DEPENDENCIES: contracts/dynamic-question-contract.js. Deliberately does
   NOT import knowledge/ or reasoning/ directly — gaps are handed in by the
   caller (services/dynamic-conversation-service.js), keeping this engine
   acyclic and pure over its inputs, the same discipline question-
   optimizer.js's own header documents for "previous conversations".

   NON-GOALS: does not fetch a Conversation, does not call any service,
   does not persist anything.
   ============================================================ */

'use strict';

import {
  DYNAMIC_QUESTION_PRIORITY, DYNAMIC_QUESTION_SOURCE, makeDynamicQuestion,
} from './contracts/dynamic-question-contract.js';

export const DEFAULT_CONFIDENCE_THRESHOLD = 0.75;

/**
 * @param {import('./contracts/question-contract.js').Question[]} stillMissingQuestions - questionnaire-engine.js's own output
 * @param {Map<string, {optimizable: boolean}>} schemaByField - getRequiredFacts(intent), keyed by field
 * @param {import('../reasoning/contracts/knowledge-gap-contract.js').KnowledgeGap[]} gaps
 * @param {Set<string>} askedDedupKeys - field names (or Gap ids) already asked THIS conversation — never re-asked
 * @returns {import('./contracts/dynamic-question-contract.js').DynamicQuestion[]}
 */
export function prioritizeQuestions(stillMissingQuestions, schemaByField, gaps, askedDedupKeys) {
  const fromSchema = stillMissingQuestions
    .filter((q) => !askedDedupKeys.has(q.field))
    .map((q) => {
      const entry = schemaByField.get(q.field);
      // A field no organizational aggregate could ever honestly stand in
      // for (optimizable: false, intent-contract.js's own vocabulary) is
      // asked at CRITICAL priority — it can never be silently skipped.
      const priority = entry && entry.optimizable === false
        ? DYNAMIC_QUESTION_PRIORITY.CRITICAL
        : DYNAMIC_QUESTION_PRIORITY.NORMAL;
      return makeDynamicQuestion({
        dedupKey: q.field, field: q.field, prompt: q.prompt, priority, source: DYNAMIC_QUESTION_SOURCE.REQUIRED_FACT,
      });
    });

  const fromGaps = gaps
    .filter((g) => !askedDedupKeys.has(g.id))
    .map((g) => makeDynamicQuestion({
      dedupKey: g.id,
      field: g.field,
      prompt: g.recommendedQuestion.question,
      priority: g.priority, // GAP_PRIORITY and DYNAMIC_QUESTION_PRIORITY share the same three values by design
      source: DYNAMIC_QUESTION_SOURCE.KNOWLEDGE_GAP,
      reason: g.reason,
    }));

  const rank = { [DYNAMIC_QUESTION_PRIORITY.CRITICAL]: 0, [DYNAMIC_QUESTION_PRIORITY.HIGH]: 1, [DYNAMIC_QUESTION_PRIORITY.NORMAL]: 2 };
  // Stable sort — Array#sort is spec-guaranteed stable, so within the same
  // priority tier, original discovery order (schema questions before gap
  // questions, each in their own original order) is preserved.
  return [...fromSchema, ...fromGaps].sort((a, b) => rank[a.priority] - rank[b.priority]);
}

/** "Only ask questions that reduce uncertainty" — never a static form:
 *  exactly one question at a time, highest priority first. Returns null
 *  when nothing genuinely remains to ask. */
export function selectNextQuestion(dynamicQuestions) {
  return dynamicQuestions.length ? dynamicQuestions[0] : null;
}

/**
 * A plain, explainable ratio — never a model score. `knownCount` is
 * whatever the caller already resolved (questionnaire-engine.js's own
 * `known` count, plus any Gaps already answered); `outstandingCount` is
 * `prioritizeQuestions()`'s own output length, post-dedup.
 * @returns {{confidence: number, basis: string}}
 */
export function computeConversationConfidence({ knownCount, outstandingCount }) {
  const total = knownCount + outstandingCount;
  if (total === 0) {
    return { confidence: 1, basis: 'Nothing was ever required or detected as a gap — trivially complete.' };
  }
  const confidence = Math.max(0, Math.min(1, knownCount / total));
  return {
    confidence,
    basis: `${knownCount} of ${total} required facts and detected gaps are currently known/resolved.`,
  };
}

export function hasReachedConfidenceThreshold(confidence, threshold = DEFAULT_CONFIDENCE_THRESHOLD) {
  return confidence >= threshold;
}
