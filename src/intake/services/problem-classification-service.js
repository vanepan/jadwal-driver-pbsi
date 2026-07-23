/* ============================================================
   PROBLEM-CLASSIFICATION-SERVICE.JS — Problem Intelligence Foundation
   (V2, Phase 8-10)

   PURPOSE: the ONE public surface over js/v2/problem-intelligence/ —
   mirrors every other domain's services/ facade convention
   (knowledge/services/README.md's own rule). Turns one utterance into a
   real, structurally-valid Problem (reasoning/contracts/
   problem-contract.js#makeProblem — REUSED, unchanged, never redefined),
   with `facts.category` + `facts.categoryConfidence` carrying the Problem
   Intelligence classification alongside whatever entities the utterance
   itself answered.

   RESPONSIBILITY: classifyProblem, classifyProblemWithContext.

   DEPENDENCIES: ../problem-parser.js, ../problem-context-builder.js,
   ../contracts/problem-category-contract.js,
   ../../reasoning/contracts/problem-contract.js (contract only — reasoning/'s
   ENGINES are never imported here; problem-intelligence/ hands its output
   to a caller, it does not call into reasoning/ itself. See
   js/v2/problem-solving/services/problem-solving-service.js for the layer
   that actually threads Problem -> planDiagnosis()).
   ============================================================ */

'use strict';

import { parseProblem } from '../problem-parser.js';
import { buildProblemContext } from '../problem-context-builder.js';
import { getProblemCategory } from '../contracts/problem-category-contract.js';
import { makeProblem, isProblem } from '../../reasoning/contracts/problem-contract.js';

export { isProblem };

/**
 * @param {string} utterance
 * @returns {{ok: boolean, data: {problem: object, categoryConfidence: number, matchedKeywords: string[], matchedPatterns: string[]}, error: object|null}}
 */
export function classifyProblem(utterance) {
  if (typeof utterance !== 'string' || !utterance.trim()) {
    return Object.freeze({ ok: false, data: null, error: Object.freeze({ code: 'INVALID_UTTERANCE', message: 'classifyProblem: utterance must be a non-empty string.' }) });
  }

  const parsed = parseProblem(utterance);
  const category = getProblemCategory(parsed.category) || getProblemCategory('unknown');

  const problem = makeProblem({
    domainType: category.defaultDomainType,
    description: utterance.trim(),
    facts: { category: category.id, ...parsed.extractedFacts },
  });

  if (!isProblem(problem)) throw new Error('classifyProblem: constructed an invalid Problem.');

  return Object.freeze({
    ok: true,
    error: null,
    data: Object.freeze({
      problem,
      categoryConfidence: parsed.confidence,
      matchedKeywords: parsed.matchedKeywords,
      matchedPatterns: parsed.matchedPatterns,
    }),
  });
}

/** Convenience composition — a Problem plus its read-only ProblemContext,
 *  in one round-trip. Computes no new number either sub-call doesn't
 *  already produce. */
export function classifyProblemWithContext(utterance) {
  const classified = classifyProblem(utterance);
  if (!classified.ok) return classified;
  const context = buildProblemContext(classified.data.problem.domainType);
  return Object.freeze({
    ok: true, error: null, data: Object.freeze({ ...classified.data, context }),
  });
}
