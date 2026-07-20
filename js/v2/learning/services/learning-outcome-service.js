/* ============================================================
   LEARNING-OUTCOME-SERVICE.JS — Universal Learning Engine (Phase 12.6.5)

   PURPOSE: recordLearningOutcome() — captures what happened AFTER a
   LearningRecommendation was acted on (or wasn't). A LearningOutcome is
   deliberately a SHAPE, not a new store: a persisted Outcome repository
   would be a second, competing ledger next to learning-repository.js,
   directly violating "never duplicate learning." An Outcome is instead
   recorded as an ordinary LearningEvent (kind: OBSERVATION, signalType:
   'learning:recommendation_outcome') through the EXACT SAME door every
   other producer uses — this file is a thin named wrapper over
   emitLearningSignal(), the same pattern recordCorrection/
   recordGapResolution already are: thin wrappers over one real write path.

   THE NATURAL FUTURE HOME for reasoning/'s already-deferred "Recommendation
   -> LearningEvent" wiring (reasoning/README.md: "a Recommendation is not
   recorded as a LearningEvent by this tree; that remains explicitly out of
   scope... a future phase may record a promoted Recommendation as a
   LearningEvent"). This function is that future home's shape, designed
   now — NOT wired live in this phase: no import of reasoning/ exists
   anywhere in this file or this domain.

   GOVERNANCE, AS A HARD RULE: `promotedKnowledgeId` is always a bare id
   string supplied by the CALLER, after they went through Knowledge's
   existing promoteKnowledge()/review-workflow path THEMSELVES. This
   service records that a promotion happened; it never performs one, and
   never verifies the id resolves to anything — the same bare-id
   discipline sourceDocumentId/affectedKnowledgeId already establish
   throughout this platform.

   RESPONSIBILITY: recordLearningOutcome(args).

   DEPENDENCIES: ./learning-signal-service.js (emitLearningSignal only).

   NON-GOALS: never calls knowledge-service.js#promoteKnowledge() or any
   write path outside emitLearningSignal(). Never verifies
   promotedKnowledgeId.
   ============================================================ */

'use strict';

import { emitLearningSignal } from './learning-signal-service.js';

export const OUTCOME_DECISION = Object.freeze({
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  DEFERRED: 'deferred',
});

export const OUTCOME_RESULT = Object.freeze({
  CONFIRMED: 'confirmed',       // the recommendation was later borne out
  CONTRADICTED: 'contradicted', // the recommendation was later proven wrong
  UNKNOWN: 'unknown',           // acted on, outcome not yet observable
});

/**
 * @param {{recommendation: import('../contracts/learning-recommendation-contract.js').LearningRecommendation,
 *   actorId: string, decision: string, result?: string, promotedKnowledgeId?: string|null, reason?: string|null}} args
 */
export function recordLearningOutcome({
  recommendation, actorId, decision, result = OUTCOME_RESULT.UNKNOWN, promotedKnowledgeId = null, reason = null,
}) {
  if (!Object.values(OUTCOME_DECISION).includes(decision)) {
    return { ok: false, data: null, error: { code: 'INVALID_OUTCOME', message: `recordLearningOutcome: "${decision}" is not a known OUTCOME_DECISION.` }, op: null, confidence: null, conflicts: [], dedupCandidates: [] };
  }
  return emitLearningSignal({
    domainType: recommendation.scope.domainType,
    entityType: recommendation.scope.entityType,
    entityId: recommendation.scope.entityId,
    signalType: 'learning:recommendation_outcome',
    sourceType: 'human-correction',
    actorId,
    reason,
    after: { recommendationId: recommendation.id, decision, result, promotedKnowledgeId },
    evidence: { recommendationType: recommendation.recommendationType, citedLearningEventIds: recommendation.citedLearningEventIds },
    // Scoped to THIS recommendation, not just the entity — otherwise a
    // second, unrelated recommendation's outcome for the SAME entity would
    // collide on the default entity-level targetKey and silently supersede
    // this one (see learning-signal-service.js's default:
    // targetKey ?? scopeKey(signal.scope), which has no recommendationId
    // dimension).
    targetKey: `outcome:${recommendation.id}`,
  });
}
