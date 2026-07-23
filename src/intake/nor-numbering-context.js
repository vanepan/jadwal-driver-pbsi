/* ============================================================
   NOR-NUMBERING-CONTEXT.JS — Problem Intelligence Foundation (V2, Sprint 11.1)

   PURPOSE: the ONE legal path from NOR composition to
   organizational-memory/numbering-engine.js#suggestNextNumber() — a
   fully-built, tested (scripts/organizational-memory-check.mjs),
   evidence-backed numbering suggestion engine that had ZERO callers
   anywhere in this codebase before this file. `document-intelligence/`
   (nor-composer.js) has no binding-graph edge to `organizational-memory/`
   (js/v2/README.md's dependency graph); `problem-intelligence/` does
   (already exercised by problem-context-builder.js, read-only, services
   only) — so this is where the read must happen, not there.

   WHY THIS IS ITS OWN FILE, NOT AN ADDITION TO problem-context-builder.js.
   That function's sole caller (problem-classification-service.js#
   classifyProblemWithContext) runs at CLASSIFICATION time — before any
   NOR Type is known, on every utterance regardless of whether it ever
   reaches NOR composition (SEARCH/CLARIFICATION/facility routes included)
   — and against the Problem's category-default domainType, not
   necessarily `'nor'`. Bolting a numbering read onto it would run a
   wasted Archive scan on most calls and compute the suggestion against
   the wrong domainType most of the time. This file is instead called
   lazily, only from problem-solving/services/problem-solving-service.js#
   composeApprovedNor, only with domainType:'nor' explicitly — the one
   place a numbering suggestion is actually needed.

   RESPONSIBILITY: getNumberingSuggestionForNor().

   DEPENDENCIES (read-only, one-way — same edge problem-context-builder.js
   already exercises): organizational-memory/numbering-engine.js.
   ============================================================ */

'use strict';

import { suggestNextNumber } from '../organizational-memory/numbering-engine.js';

/**
 * @returns {import('../organizational-memory/contracts/numbering-contract.js').NumberingSuggestion}
 */
export function getNumberingSuggestionForNor() {
  return suggestNextNumber('nor');
}
