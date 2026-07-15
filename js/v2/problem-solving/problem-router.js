/* ============================================================
   PROBLEM-ROUTER.JS — Problem Solving Pipeline Integration
   (V2, Phase 10.5, Part 2)

   PURPOSE: "Never rely on keyword matching alone. Always use the Problem
   Model." PURE — routeProblem() reads exactly ONE field,
   `problem.facts.category`, already computed by Problem Intelligence
   (problem-parser.js's own keyword/pattern scoring already happened
   upstream, once — this file never re-runs or second-guesses it). A
   Problem Category is a REGISTERED value
   (problem-intelligence/contracts/problem-category-contract.js); routing
   is a plain lookup table keyed by that registered id, never a second
   round of string matching against the raw utterance.

   WHY hasIntentMapping IS A PARAMETER, NOT A LOOKUP HERE. The real
   category -> Conversation Intent table
   (`problem-solving-service.js#CATEGORY_TO_INTENT`) already exists one
   layer up, in the one file allowed to know about both
   `problem-intelligence/` and `conversation/`. Importing `conversation/`
   from this file to re-derive that mapping would violate the exact
   dependency direction `problem-intelligence/README.md` and
   `reasoning/README.md` both already establish and enforce structurally —
   this file stays decoupled from `conversation/` entirely, and its caller
   supplies the one boolean fact it needs.

   RESPONSIBILITY: routeProblem(problem, categoryConfidence, opts).

   DEPENDENCIES: contracts/workflow-route-contract.js.
   ============================================================ */

'use strict';

import { WORKFLOW_ROUTE, makeRoutingDecision } from './contracts/workflow-route-contract.js';

/** Below this, even a NON-'unknown' category classification is too weak to
 *  act on confidently — routed to clarification instead of a wrong
 *  workflow. Matches problem-parser.js's own PROBLEM_CONFIDENCE_THRESHOLD
 *  (0.2) by design (the same bar Problem Classification itself already
 *  uses to decide 'unknown' vs. a real category) — restated here, not
 *  imported, because this file must not depend on problem-parser.js's
 *  internals (it only ever reads the Problem Model's own recorded field). */
export const MIN_ROUTABLE_CONFIDENCE = 0.2;

const CATEGORY_ROUTE = Object.freeze({
  facility: WORKFLOW_ROUTE.DIAGNOSTIC_CONVERSATION,
  business_trip: WORKFLOW_ROUTE.CONVERSATION,
  procurement: WORKFLOW_ROUTE.CONVERSATION,
  administration: WORKFLOW_ROUTE.CONVERSATION,
  knowledge_search: WORKFLOW_ROUTE.SEARCH,
  document_upload: WORKFLOW_ROUTE.KNOWLEDGE_ACQUISITION,
});

/**
 * @param {import('../reasoning/contracts/problem-contract.js').Problem} problem
 * @param {number} categoryConfidence - Problem Classification's own confidence score
 * @param {{hasIntentMapping?: boolean}} [opts]
 * @returns {import('./contracts/workflow-route-contract.js').RoutingDecision}
 */
export function routeProblem(problem, categoryConfidence, opts = {}) {
  const category = (problem.facts && problem.facts.category) || 'unknown';

  if (category === 'unknown' || categoryConfidence < MIN_ROUTABLE_CONFIDENCE) {
    return makeRoutingDecision({
      route: WORKFLOW_ROUTE.CLARIFICATION_CONVERSATION,
      category,
      reason: category === 'unknown'
        ? 'Problem Classification could not confidently identify a category — never rejected, always clarified.'
        : `Category "${category}" was detected, but confidence (${categoryConfidence.toFixed(2)}) is below the routable threshold (${MIN_ROUTABLE_CONFIDENCE}) — clarifying rather than acting on a weak signal.`,
      hasIntentMapping: false,
    });
  }

  const route = CATEGORY_ROUTE[category];
  if (!route) {
    // A registered category this router's own table has no entry for yet —
    // the same honest "Extensible Problem Types" discipline extends here:
    // a NEW category is never silently unroutable, it clarifies instead of
    // throwing or defaulting to a guessed workflow.
    return makeRoutingDecision({
      route: WORKFLOW_ROUTE.CLARIFICATION_CONVERSATION,
      category,
      reason: `Category "${category}" is registered but has no workflow route yet — clarifying rather than guessing one.`,
      hasIntentMapping: false,
    });
  }

  return makeRoutingDecision({
    route,
    category,
    reason: `Category "${category}" (confidence ${categoryConfidence.toFixed(2)}) routes to "${route}".`,
    hasIntentMapping: !!opts.hasIntentMapping,
  });
}
