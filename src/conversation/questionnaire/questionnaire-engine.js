/* ============================================================
   QUESTIONNAIRE-ENGINE.JS — Conversation Intelligence Foundation (Phase 6, Part 3)

   PURPOSE: "once intent is detected, determine exactly what information is
   missing" — nothing more. PURE: given an intent and the facts already
   known, this file computes the SET DIFFERENCE against
   intent-contract.js#INTENT_FIELD_SCHEMA. No static forms, no fixed
   questionnaire — the field list itself lives in the contract; this engine
   only ever asks about a field this platform HAS NOT already been told.

   "Already known" means a genuinely present, non-empty value — a field set
   to '', null, or undefined is treated exactly like an absent one, because
   asking a human to confirm an empty string is not what "already known"
   means.

   RESPONSIBILITY: computeMissingFacts, explainQuestionnaire.

   NORTH STAR GAP CLOSURE — norType IS DERIVED HERE, NEVER A NEW PARAMETER.
   getRequiredFacts(intent, norType) (intent-contract.js) needs CREATE_NOR's
   own extracted/answered "Jenis NOR" fact to pick the right NOR Type's
   fieldSchema. This file already receives `gatheredFacts` on every call, so
   norTypeOf() reads `gatheredFacts.type` inline rather than adding a third
   parameter every caller would need to thread through — the same
   "re-derive two lines inline rather than widen a signature" precedent
   conversation/services/dynamic-conversation-service.js's own header
   already documents for the analogous domainTypeOf() case.

   DEPENDENCIES: ../contracts/intent-contract.js, ../contracts/question-contract.js.
   ============================================================ */

'use strict';

import { INTENT, getRequiredFacts } from '../contracts/intent-contract.js';
import { makeQuestion } from '../contracts/question-contract.js';

function isKnown(value) {
  return value !== undefined && value !== null && value !== '';
}

/** See header — meaningless for any intent other than CREATE_NOR. */
function norTypeOf(intent, gatheredFacts) {
  return intent === INTENT.CREATE_NOR ? (gatheredFacts.type || null) : null;
}

/**
 * @param {string} intent
 * @param {Object} gatheredFacts
 * @returns {Object[]} Question[] for every required field not yet known
 */
export function computeMissingFacts(intent, gatheredFacts = {}) {
  return getRequiredFacts(intent, norTypeOf(intent, gatheredFacts))
    .filter((f) => !isKnown(gatheredFacts[f.field]))
    .map((f) => makeQuestion({ field: f.field, label: f.label, prompt: f.prompt }));
}

/** Part 7 — "known facts, missing facts", assembled once so the Conversation
 *  Service and the Task Executor never re-derive it differently. */
export function explainQuestionnaire(intent, gatheredFacts = {}) {
  const required = getRequiredFacts(intent, norTypeOf(intent, gatheredFacts));
  return Object.freeze({
    required: Object.freeze(required.map((f) => f.field)),
    known: Object.freeze(required.filter((f) => isKnown(gatheredFacts[f.field])).map((f) => f.field)),
    missing: Object.freeze(required.filter((f) => !isKnown(gatheredFacts[f.field])).map((f) => f.field)),
  });
}
