/* ============================================================
   KNOWLEDGE-GAP-CONTRACT.JS — Organizational Reasoning Foundation
   (V2, Phase 4-7, Part 3)

   PURPOSE: fix the shape of a Knowledge Gap — missing entities, missing
   approvals, missing context, missing evidence, missing business
   constraints, missing reasoning. Deliberately a DIFFERENT concept from
   organizational-memory/contracts/gap-contract.js's ArchiveGap (a missing
   NOR NUMBER in a numbering sequence) — same vocabulary word, same
   {reason, priority, confidence, recommendedQuestion} shape discipline,
   different thing entirely, exactly the same deliberate-non-conflation
   precedent js/v2/README.md already documents for knowledge/learning/ vs.
   top-level learning/. Do not conflate the two.

   RESPONSIBILITY: KnowledgeGap typedef, GAP_TYPE enum, constructor,
   structural check.

   DEPENDENCIES: knowledge/language/contracts/question-tree-contract.js
   (a Gap's `recommendedQuestion` is a QuestionTreeEntry — reused, not
   redefined).

   NON-GOALS: does not detect anything — see knowledge-gap-engine.js.
   ============================================================ */

'use strict';

import { QUESTION_TREE_STATUS } from '../../knowledge/language/contracts/question-tree-contract.js';

export const KNOWLEDGE_GAP_SCHEMA = 'reasoning-knowledge-gap@1';

/** The six gap categories this phase's brief names, verbatim. */
export const GAP_TYPE = Object.freeze({
  MISSING_ENTITY: 'missing_entity',
  MISSING_APPROVAL: 'missing_approval',
  MISSING_CONTEXT: 'missing_context',
  MISSING_EVIDENCE: 'missing_evidence',
  MISSING_BUSINESS_CONSTRAINT: 'missing_business_constraint',
  MISSING_REASONING: 'missing_reasoning',
});

export const GAP_PRIORITY = Object.freeze({
  CRITICAL: 'critical',
  HIGH: 'high',
  NORMAL: 'normal',
});

/**
 * @typedef {Object} KnowledgeGap
 * @property {string} id                - deterministic: `${domainType}:${gapType}:${field}`
 * @property {string} domainType
 * @property {string} gapType           - one of GAP_TYPE
 * @property {string} field             - the specific fact/entity/approval this gap is about
 * @property {string} reason            - human-readable — why this is considered a gap
 * @property {string} priority          - one of GAP_PRIORITY
 * @property {number} confidence        - 0-1 — how confident the engine is this is a REAL gap (not a false positive)
 * @property {import('../../knowledge/language/contracts/question-tree-contract.js').QuestionTreeEntry} recommendedQuestion
 */

export function makeKnowledgeGap({
  domainType, gapType, field, reason, priority = GAP_PRIORITY.NORMAL, confidence, recommendedQuestion,
}) {
  return Object.freeze({
    id: `${domainType}:${gapType}:${field}`,
    domainType,
    gapType,
    field,
    reason,
    priority,
    confidence,
    recommendedQuestion: Object.freeze({ ...recommendedQuestion }),
  });
}

export function isKnowledgeGap(g) {
  return !!g && typeof g === 'object'
    && typeof g.domainType === 'string' && g.domainType.length > 0
    && Object.values(GAP_TYPE).includes(g.gapType)
    && typeof g.field === 'string' && g.field.length > 0
    && typeof g.reason === 'string' && g.reason.length > 0
    && Object.values(GAP_PRIORITY).includes(g.priority)
    && typeof g.confidence === 'number' && g.confidence >= 0 && g.confidence <= 1
    && !!g.recommendedQuestion && Object.values(QUESTION_TREE_STATUS).includes(g.recommendedQuestion.status);
}
