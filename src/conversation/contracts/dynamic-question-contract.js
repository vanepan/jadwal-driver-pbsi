/* ============================================================
   DYNAMIC-QUESTION-CONTRACT.JS — Conversation Intelligence Foundation
   (V2, Phase 4-7, Part 4)

   PURPOSE: fix the shape of ONE prioritized, dedup-tracked question the
   Dynamic Conversation Engine may ask — a strict ADDITION alongside
   contracts/question-contract.js's existing `Question` shape, never a
   replacement for it. Every DynamicQuestion wraps either a schema-sourced
   Question (questionnaire-engine.js) or a gap-sourced recommendedQuestion
   (reasoning/contracts/knowledge-gap-contract.js), tagged with a priority
   and a stable dedup key.

   RESPONSIBILITY: DYNAMIC_QUESTION_PRIORITY, DYNAMIC_QUESTION_SOURCE,
   makeDynamicQuestion, isDynamicQuestion.

   DEPENDENCIES: none.
   ============================================================ */

'use strict';

export const DYNAMIC_QUESTION_PRIORITY = Object.freeze({
  CRITICAL: 'critical',
  HIGH: 'high',
  NORMAL: 'normal',
});

/** Where a DynamicQuestion originated — a schema-required fact
 *  (questionnaire-engine.js) or a detected Knowledge Gap
 *  (reasoning/knowledge-gap-engine.js). Never conflated with
 *  question-contract.js#QUESTION_SOURCE, which answers a different
 *  question (how a fact was RESOLVED, not why it is being ASKED). */
export const DYNAMIC_QUESTION_SOURCE = Object.freeze({
  REQUIRED_FACT: 'required_fact',
  KNOWLEDGE_GAP: 'knowledge_gap',
});

/**
 * @typedef {Object} DynamicQuestion
 * @property {string} dedupKey   - stable across turns: a field name, or a Gap's own id
 * @property {string} field      - the field this question is about (a schema field, or a Gap's field)
 * @property {string} prompt
 * @property {string} priority   - one of DYNAMIC_QUESTION_PRIORITY
 * @property {boolean} critical  - convenience mirror of priority === CRITICAL
 * @property {string} source     - one of DYNAMIC_QUESTION_SOURCE
 * @property {string|null} reason - present only for KNOWLEDGE_GAP-sourced questions — the Gap's own rationale
 */
export function makeDynamicQuestion({
  dedupKey, field, prompt, priority, source, reason = null,
}) {
  return Object.freeze({
    dedupKey, field, prompt, priority, critical: priority === DYNAMIC_QUESTION_PRIORITY.CRITICAL, source, reason,
  });
}

export function isDynamicQuestion(q) {
  return !!q && typeof q === 'object'
    && typeof q.dedupKey === 'string' && q.dedupKey.length > 0
    && typeof q.field === 'string' && q.field.length > 0
    && typeof q.prompt === 'string' && q.prompt.length > 0
    && Object.values(DYNAMIC_QUESTION_PRIORITY).includes(q.priority)
    && Object.values(DYNAMIC_QUESTION_SOURCE).includes(q.source);
}
