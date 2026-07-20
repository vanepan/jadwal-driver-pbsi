/* ============================================================
   LEARNING-LINEAGE-ENGINE.JS — Universal Learning Engine (Phase 12.6.5)

   PURPOSE: traceLineage(eventId) — the whole-pipeline trail for one
   logical thread: originating LearningEvent(s) -> any LearningRecommendation
   citing them -> any LearningOutcome recorded against that recommendation
   -> any KnowledgeItem an outcome names as promoted. DISAMBIGUATED from
   Learning History (already real: getLearningHistory/
   explainLearningEvent's supersessionChain, answering "what changed on
   THIS ONE ROW") — Lineage answers "where did this ultimately come from
   and what did it become," spanning the whole pipeline.

   COMPOSES EXISTING FUNCTIONS RATHER THAN RE-WALKING CHAINS — the one
   design rule this file exists to enforce: explainLearningEvent()'s own
   cycle-safe supersessionChain walk is reused verbatim, never
   reimplemented; computeRecommendations()/learning-outcome-service.js's
   own targetKey convention (`outcome:<recommendationId>`) are both reused
   to find the rest of the trail.

   RESPONSIBILITY: traceLineage(eventId).

   DEPENDENCIES: contracts/learning-lineage-contract.js,
   contracts/learning-scope-contract.js (isLearningScope),
   learning-recommendation-engine.js, services/learning-service.js
   (explainLearningEvent, listLearningEvents — read-only).

   NON-GOALS: pure, stateless, never stored — same "computed fresh" rule
   every engine in this domain follows.
   ============================================================ */

'use strict';

import { isLearningScope } from './contracts/learning-scope-contract.js';
import { computeRecommendations } from './learning-recommendation-engine.js';
import { explainLearningEvent, listLearningEvents } from './services/learning-service.js';

/**
 * @param {string} eventId
 * @returns {{ok: boolean, data: import('./contracts/learning-lineage-contract.js').LearningLineage|null, error: object|null}}
 */
export function traceLineage(eventId) {
  const explained = explainLearningEvent(eventId);
  if (!explained.ok) return explained;

  const chainIds = explained.data.supersessionChain.map((c) => c.id);
  const scope = explained.data.evidence && isLearningScope(explained.data.evidence.scope) ? explained.data.evidence.scope : null;

  const recommendations = scope
    ? computeRecommendations(scope).filter((r) => r.citedLearningEventIds.some((id) => chainIds.includes(id) || id === eventId))
    : [];

  let outcomes = [];
  if (scope && recommendations.length > 0) {
    const recommendationIds = new Set(recommendations.map((r) => r.id));
    const domainEvents = listLearningEvents({ domainType: scope.domainType });
    if (domainEvents.ok) {
      outcomes = domainEvents.data.filter((e) => e.evidence
        && isLearningScope(e.evidence.scope)
        && e.evidence.scope.signalType === 'learning:recommendation_outcome'
        && e.after && recommendationIds.has(e.after.recommendationId));
    }
  }

  const promotedKnowledgeIds = [...new Set(outcomes.map((o) => o.after.promotedKnowledgeId).filter(Boolean))];

  return {
    ok: true,
    error: null,
    data: {
      originId: eventId,
      events: explained.data.supersessionChain,
      recommendations,
      outcomes,
      promotedKnowledgeIds,
      computedAt: new Date().toISOString(),
    },
  };
}
