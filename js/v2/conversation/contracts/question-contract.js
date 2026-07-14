/* ============================================================
   QUESTION-CONTRACT.JS — Conversation Intelligence Foundation (Phase 6)

   PURPOSE: fix the shape of ONE unanswered Question and ONE ResolvedFact —
   the two halves of Part 4's Question Optimizer. A field named by
   intent-contract.js#INTENT_FIELD_SCHEMA is, at any moment, either still a
   Question (nobody has answered it yet) or a ResolvedFact (something
   answered it, and QUESTION_SOURCE says what). Never both.

   WHY A SOURCE IS MANDATORY ON EVERY RESOLVED FACT. "If information already
   exists, never ask again" (the mission's own words) is only trustworthy if
   every skipped question can name EXACTLY where its answer came from — this
   is Part 7's "why each question was skipped", made structurally impossible
   to omit. A ResolvedFact with no source would be indistinguishable from a
   fabricated one.

   RESPONSIBILITY: QUESTION_SOURCE, makeQuestion, makeResolvedFact,
   isQuestion, isResolvedFact.

   DEPENDENCIES: none.
   ============================================================ */

'use strict';

/** Every place a fact can honestly come from — Part 4's named sources, plus
 *  the human's own direct answer and the honest "nobody has answered this
 *  yet" absence. */
export const QUESTION_SOURCE = Object.freeze({
  HUMAN_ANSWER: 'human_answer',
  UTTERANCE: 'utterance',
  KNOWLEDGE: 'knowledge',
  ARCHIVE: 'archive',
  ORGANIZATION_MEMORY: 'organization_memory',
  PROFILE_OVERRIDE: 'profile_override',
  PREVIOUS_CONVERSATION: 'previous_conversation',
});

/**
 * @typedef {Object} Question
 * @property {string} field
 * @property {string} label
 * @property {string} prompt
 * @property {string} askedAt   - ISO 8601
 */
export function makeQuestion({ field, label, prompt }) {
  return Object.freeze({ field, label, prompt, askedAt: new Date().toISOString() });
}

export function isQuestion(q) {
  return !!q && typeof q === 'object'
    && typeof q.field === 'string' && q.field.length > 0
    && typeof q.label === 'string' && typeof q.prompt === 'string';
}

/**
 * @typedef {Object} ResolvedFact
 * @property {string} field
 * @property {*} value
 * @property {string} source      - one of QUESTION_SOURCE
 * @property {string} rationale   - a human-readable reason, e.g. "Approved Business Rule override for domain 'nor'"
 * @property {Object|null} evidence - the real record this was read from (a bare, minimal reference — never the whole object graph)
 */
export function makeResolvedFact({
  field, value, source, rationale, evidence = null,
}) {
  return Object.freeze({
    field, value, source, rationale, evidence: evidence ? Object.freeze({ ...evidence }) : null,
  });
}

export function isResolvedFact(f) {
  return !!f && typeof f === 'object'
    && typeof f.field === 'string' && f.field.length > 0
    && f.value !== undefined
    && typeof f.source === 'string' && Object.values(QUESTION_SOURCE).includes(f.source)
    && typeof f.rationale === 'string';
}
