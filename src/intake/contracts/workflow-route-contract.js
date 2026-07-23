/* ============================================================
   WORKFLOW-ROUTE-CONTRACT.JS — Problem Solving Pipeline Integration
   (V2, Phase 10.5, Part 2)

   PURPOSE: fix the shape of the Problem Router's ONE output — a
   RoutingDecision naming which of the six named workflows a classified
   Problem should enter, and WHY (always traceable back to the Problem
   Model's own `facts.category`, never a bare keyword match — Part 2's own
   binding constraint).

   RESPONSIBILITY: WORKFLOW_ROUTE enum, RoutingDecision typedef,
   constructor, structural check.

   DEPENDENCIES: none.
   ============================================================ */

'use strict';

export const WORKFLOW_ROUTE_SCHEMA = 'problem-solving-workflow-route@1';

/** The six named routes Phase 10.5's own brief lists, verbatim. */
export const WORKFLOW_ROUTE = Object.freeze({
  DIAGNOSTIC_CONVERSATION: 'diagnostic_conversation',
  CONVERSATION: 'conversation',
  SEARCH: 'search',
  KNOWLEDGE_ACQUISITION: 'knowledge_acquisition',
  CLARIFICATION_CONVERSATION: 'clarification_conversation',
});

/**
 * @typedef {Object} RoutingDecision
 * @property {string} route        - one of WORKFLOW_ROUTE
 * @property {string} category     - the Problem's own facts.category this decision was based on
 * @property {string} reason       - human-readable — always names the real category, never "keyword matched"
 * @property {boolean} hasIntentMapping - whether a real conversation-service.js Intent exists for this category (only ever true for CONVERSATION-routed categories with a real downstream Intent)
 */
export function makeRoutingDecision({
  route, category, reason, hasIntentMapping = false,
}) {
  return Object.freeze({
    route, category, reason, hasIntentMapping,
  });
}

export function isRoutingDecision(r) {
  return !!r && typeof r === 'object'
    && Object.values(WORKFLOW_ROUTE).includes(r.route)
    && typeof r.category === 'string' && r.category.length > 0
    && typeof r.reason === 'string' && r.reason.length > 0
    && typeof r.hasIntentMapping === 'boolean';
}
