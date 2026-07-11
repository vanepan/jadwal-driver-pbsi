/* ============================================================
   TRACE-SERVICE.JS — Knowledge Services (V2.0.6, Phase 9.5)

   PURPOSE: "Knowledge Trace" — ONE composite answer to "how did we arrive
   at this", combining three ALREADY-REAL capabilities that each answer
   part of the question: explainability-service.js#explain (provenance/
   corroboration/approval), learning/knowledge-evolution-engine.js#getKnowledgeEvolution
   (version-by-version history), dependency-graph-service.js#getDependencies
   (related items). No new computation — a composition, not a new engine.

   RESPONSIBILITY: `traceKnowledge(itemId)`.

   DEPENDENCIES: repository/knowledge-repository.js, explainability-service.js,
   dependency-graph-service.js, learning/knowledge-evolution-engine.js.

   NON-GOALS: does not compute anything the three composed capabilities
   don't already compute.
   ============================================================ */

'use strict';

import { getById } from '../repository/knowledge-repository.js';
import { explain } from './explainability-service.js';
import { getDependencies } from './dependency-graph-service.js';
import { getKnowledgeEvolution } from '../learning/knowledge-evolution-engine.js';

/**
 * @param {string} itemId
 * @returns {{ok: boolean, data: {itemId: string, explanation: object, evolution: object, dependencies: object[]}|null, error: object|null}}
 */
export function traceKnowledge(itemId) {
  const itemResult = getById(itemId);
  if (!itemResult.ok) {
    return { ok: false, data: null, error: itemResult.error };
  }

  const explanation = explain(itemResult.data);
  const evolution = getKnowledgeEvolution(itemId);
  const deps = getDependencies(itemId);

  return {
    ok: true,
    error: null,
    data: Object.freeze({
      itemId,
      explanation: explanation.ok ? explanation.data : null,
      evolution,
      dependencies: deps.ok ? deps.data : [],
    }),
  };
}
