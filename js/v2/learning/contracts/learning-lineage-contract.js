/* ============================================================
   LEARNING-LINEAGE-CONTRACT.JS — Universal Learning Engine (Phase 12.6.1)

   PURPOSE: fix the shape of a Learning Lineage — DISAMBIGUATED from
   Learning History, which already exists and is unchanged by this phase:
     - History (services/learning-service.js#getLearningHistory /
       #explainLearningEvent's `supersessionChain`) answers "what changed
       on THIS ONE ROW" — a single LearningEvent's own version/supersession
       trail. Already real, already used, not touched by Phase 12.6.
     - Lineage is NEW: a purely computed (never stored) trail spanning the
       WHOLE PIPELINE for one logical thread — originating signal's
       LearningEvent(s) -> any LearningRecommendation citing them -> any
       Outcome recorded against that recommendation -> any KnowledgeItem
       the Outcome names as promoted. Answers "where did this ultimately
       come from and what did it become," not just "what changed on this
       row." See learning-lineage-engine.js's header (Phase 12.6.5) — it
       explicitly COMPOSES explainLearningEvent()'s existing chain-walk
       rather than re-implementing one.

   RESPONSIBILITY: define LearningLineage (shape only) and a structural
   validator.

   DEPENDENCIES: none.

   NON-GOALS: this file computes nothing — see learning-lineage-engine.js.
   ============================================================ */

'use strict';

export const LEARNING_LINEAGE_SCHEMA = 'learning-lineage@1';

/**
 * @typedef {Object} LearningLineage
 * @property {string} originId                 - the LearningEvent id lineage was traced from
 * @property {Object[]} events                  - the full supersession chain (reused from explainLearningEvent)
 * @property {Object[]} recommendations          - LearningRecommendations citing any event in the chain
 * @property {Object[]} outcomes                 - LearningOutcome-shaped LearningEvents recorded against those recommendations
 * @property {string[]} promotedKnowledgeIds     - bare ids named by any outcome's `promotedKnowledgeId`, deduped
 * @property {string} computedAt                 - ISO 8601
 */

export function isLearningLineage(l) {
  return !!l && typeof l === 'object'
    && typeof l.originId === 'string' && l.originId.length > 0
    && Array.isArray(l.events) && Array.isArray(l.recommendations)
    && Array.isArray(l.outcomes) && Array.isArray(l.promotedKnowledgeIds)
    && typeof l.computedAt === 'string' && l.computedAt.length > 0;
}
