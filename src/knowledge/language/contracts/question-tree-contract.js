/* ============================================================
   QUESTION-TREE-CONTRACT.JS — Knowledge Language Foundation (V2, Phase 4-7)

   PURPOSE: fix the payload shape for `kind: 'question_tree'` — a
   structured register of open questions about a domainType. Evidenced by
   NOR-Specification.md §F (Question Discovery) — deliberately NOT a FAQ
   of invented staff questions (see that report's own refusal to fabricate
   examples). `status: 'wont-know'` is a legitimate, honest terminal state,
   not merely 'answered' vs 'open'.

   RESPONSIBILITY: typedef + structural validator only.

   DEPENDENCIES: none.

   NON-GOALS: does not decide WHICH questions to ask a human in a live
   conversation, and in what priority — that is
   js/v2/reasoning/knowledge-gap-engine.js's job (Phase 4-7), which EMITS
   QuestionTreeEntry-shaped `recommendedQuestion` fields on the Gaps it
   detects. This file only fixes the shape both sides share.

   FUTURE EVOLUTION: none anticipated — `answerRef` already accommodates a
   future real human-interview workflow without a reshape (Knowledge-Asset-
   Specification.md §10, Open Question 3).
   ============================================================ */

'use strict';

export const QUESTION_TREE_STATUS = Object.freeze({
  OPEN: 'open',
  ANSWERED: 'answered',
  WONT_KNOW: 'wont-know',
});

/**
 * @typedef {Object} QuestionTreeEntry
 * @property {string} question    - the question itself, verbatim
 * @property {string} raisedBy     - how this question was discovered, e.g. 'document-structural-analysis' | 'human-interview'
 * @property {string} status       - one of QUESTION_TREE_STATUS
 * @property {string|null} [answerRef] - KnowledgeItem id of the asset that answers this, once status is 'answered'
 */

export function isQuestionTreeEntry(p) {
  return !!p && typeof p === 'object'
    && typeof p.question === 'string' && p.question.length > 0
    && typeof p.raisedBy === 'string' && p.raisedBy.length > 0
    && Object.values(QUESTION_TREE_STATUS).includes(p.status);
}
