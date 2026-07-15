/* ============================================================
   REASONING-SERVICE.JS — Organizational Reasoning Foundation (V2, Phase 4-7)

   PURPOSE: the ONE public surface over js/v2/reasoning/ — mirrors
   knowledge/services/README.md's own rule ("a future UI or consumer never
   reaches past services/ into an engine directly"). A future Dynamic
   Conversation Engine, NOR pilot, or any other consumer imports ONLY this
   file, never reasoning-engine.js / knowledge-gap-engine.js /
   rule-applicability-engine.js / conflict-detection-engine.js directly.

   WHY THIS FILE HOLDS NO REPOSITORY. Unlike knowledge-service.js or
   conversation-service.js, Reasoning has nothing of its own to persist — a
   Recommendation and a KnowledgeGap are both computed fresh, every call,
   from whatever is Approved right now (the exact "a converged sweep costs
   nothing" discipline conversation-service.js's own header names for the
   identical reason). Nothing under reasoning/ ever gains a repository —
   see reasoning/README.md.

   RESPONSIBILITY: pure delegation + two composed conveniences
   (`reasonWithGaps`, unchanged since Phase 4-7; `reasonWithGaps` itself is
   untouched by this addition) that a caller wanting several sub-calls in
   one round-trip does not need to duplicate.

   PHASE 8-10 ADDITION (purely additive — zero existing exports changed):
   planDiagnosis / generateHypotheses / updateHypotheses / HYPOTHESIS_STATUS
   / isHypothesis / isDiagnosticPlan, delegating to the new
   diagnostic-planning-engine.js / hypothesis-engine.js. Mirrors
   knowledge/services/README.md's own precedent of a services/ facade
   growing new exports phase over phase (Confidence/Statistics/Knowledge
   Graph in V2.0.12, Profiles in V2.0.12.5) without ever revising an
   existing one.

   DEPENDENCIES: ../reasoning-engine.js, ../knowledge-gap-engine.js,
   ../diagnostic-planning-engine.js (Phase 8-10), ../hypothesis-engine.js
   (Phase 8-10), ../contracts/problem-contract.js.
   ============================================================ */

'use strict';

import { reason } from '../reasoning-engine.js';
import { detectKnowledgeGaps } from '../knowledge-gap-engine.js';
import { planDiagnosis } from '../diagnostic-planning-engine.js';
import { generateHypotheses, updateHypotheses } from '../hypothesis-engine.js';
import { makeProblem, isProblem } from '../contracts/problem-contract.js';
import { RECOMMENDATION_ERRORS } from '../contracts/recommendation-contract.js';
import { HYPOTHESIS_STATUS, isHypothesis } from '../contracts/hypothesis-contract.js';
import { isDiagnosticPlan } from '../contracts/diagnostic-plan-contract.js';

export { makeProblem, isProblem, RECOMMENDATION_ERRORS };
export { reason, detectKnowledgeGaps };
export {
  planDiagnosis, generateHypotheses, updateHypotheses, HYPOTHESIS_STATUS, isHypothesis, isDiagnosticPlan,
};

/**
 * Composition only — computes no new number either sub-call doesn't
 * already produce. A Recommendation genuinely may be NO_APPLICABLE_KNOWLEDGE
 * while Gaps are still real and worth surfacing (that IS the honest
 * relationship between the two: gaps explain WHY a recommendation could
 * not be made).
 * @param {import('../contracts/problem-contract.js').Problem} problem
 */
export function reasonWithGaps(problem) {
  const recommendation = reason(problem);
  const gaps = detectKnowledgeGaps(problem.domainType);
  return Object.freeze({ recommendation, gaps });
}
