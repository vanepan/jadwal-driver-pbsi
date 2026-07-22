/* ============================================================
   NOR-KNOWLEDGE-CONTRACT.JS — NOR Intelligence Foundation (V2, Phase 8)

   PURPOSE: fix the shape of a query FROM the NOR pilot INTO the Knowledge
   Platform, scoped to `domainType: 'nor'` — the seam that keeps NOR from
   ever reaching into knowledge/repository/ directly (it goes through
   knowledge/services/, same as any other consumer).

   RESPONSIBILITY: NorKnowledgeRequest, NorKnowledgeResponse typedefs.

   DEPENDENCIES: none directly — a real implementation calls
   `js/v2/knowledge/services/index.js`'s `dependencyGraph`/`explainability`/
   `registry` services with `domainType: 'nor'`, never a new query path.

   NON-GOALS: no request is ever sent. No Knowledge item is read.

   FUTURE EVOLUTION: Phase 8+ implements the actual call
   (knowledge/services -> list/search filtered to domainType: 'nor'); this
   contract's shape should not need to change.
   ============================================================ */

'use strict';

/**
 * @typedef {Object} NorKnowledgeRequest
 * @property {'nor'} domainType
 * @property {string[]} [kinds]     - restrict to specific registered `kind`s (e.g. ['template_pattern', 'vocabulary'])
 * @property {string} [query]       - free-text, passed to knowledge/services' search
 */

/**
 * @typedef {Object} NorKnowledgeResponse
 * @property {boolean} ok
 * @property {import('../../../../js/v2/knowledge/contracts/knowledge-item-contract.js').KnowledgeItem[]} items
 * @property {{code: string, message: string}|null} error
 */

export function isNorKnowledgeRequest(r) {
  return !!r && typeof r === 'object' && r.domainType === 'nor';
}
