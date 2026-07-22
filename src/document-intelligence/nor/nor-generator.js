/* ============================================================
   NOR-GENERATOR.JS — NOR Intelligence Runtime (V2.0.6, Phase 9.5)

   PURPOSE: the real DRAFT step — proposes STRUCTURAL field suggestions
   from Approved NOR structural Knowledge (knowledge/connectors/
   nor-connector.js's `kind:'structure'` items), never business content.
   nor-generator-contract.js's `proposeNorFields` stub is deliberately left
   untouched (that file's own RESPONSIBILITY is the shape lock, not the
   implementation — see its header); this is the real generator the
   contract's FUTURE EVOLUTION note describes, registered as a pipeline
   step rather than as a second competing entry point.

   Never proposes `norNumber`, `subject`, `recipients`, or any other field
   whose correct value is genuinely business-specific data this platform
   has no statistical basis to invent — that would be a fake
   implementation. What IS honestly inferable from a population of
   Approved structural facts: typical cardinalities (how many signatories,
   how many line items) — informational suggestions a human still fills
   in and reviews, never authored content.

   RESPONSIBILITY: `computeNorStructuralStats()` (pure aggregation) and
   `proposeNorFields(request)` (the real generator, registered as the
   DRAFT step for domainType 'nor').

   DEPENDENCIES: knowledge/repository/knowledge-repository.js,
   knowledge/contracts/lifecycle-contract.js, registry/step-registry.js,
   nor/contracts/nor-draft-contract.js (isNorDraft).

   NON-GOALS: never calls js/petty-cash/nor-document-engine.js#buildNorViewModel
   or writes anywhere — a human takes these suggestions (or ignores them)
   and the EXISTING NOR flow (petty-cash-service.js#generateNor) is
   untouched, exactly as this pilot's every contract file promises.
   ============================================================ */

'use strict';

import {
  listKnowledge as list,
} from '../../../js/v2/knowledge/services/knowledge-service.js';
import { LIFECYCLE_STATE } from '../../../js/v2/knowledge/contracts/lifecycle-contract.js';
import { registerStep } from '../registry/step-registry.js';
import { DOCUMENT_PIPELINE_STEP } from '../contracts/document-pipeline-contract.js';
import { isNorDraft } from './contracts/nor-draft-contract.js';

const NOR_GENERATOR_ERRORS = Object.freeze({ NO_KNOWLEDGE: 'NO_KNOWLEDGE' });

function average(items, key) {
  return items.reduce((sum, item) => sum + (Number(item.payload[key]) || 0), 0) / items.length;
}

/** Pure aggregation over Approved `nor`/`structure` Knowledge. Returns
 *  null if none exists yet — an honest "nothing to suggest from", not a
 *  fabricated default. */
export function computeNorStructuralStats() {
  const result = list({ domainType: 'nor', kind: 'structure', lifecycleState: LIFECYCLE_STATE.APPROVED });
  const items = result.ok ? result.data : [];
  if (!items.length) return null;

  return Object.freeze({
    sampleSize: items.length,
    citedKnowledgeIds: Object.freeze(items.map((i) => i.id)),
    avgSignatoryTopCount: average(items, 'signatoryTopCount'),
    avgSignatoryBottomCount: average(items, 'signatoryBottomCount'),
    avgItemCount: average(items, 'itemCount'),
    avgReimburseLineCount: average(items, 'reimburseLineCount'),
  });
}

/**
 * @param {import('./contracts/nor-knowledge-contract.js').NorKnowledgeRequest} request
 * @param {{sessionId?: string}} [opts]
 * @returns {{ok: boolean, draft: import('./contracts/nor-draft-contract.js').NorDraft|null, error: object|null}}
 */
export function proposeNorFields(request, opts = {}) {
  const stats = computeNorStructuralStats();
  if (!stats) {
    return { ok: false, draft: null, error: { code: NOR_GENERATOR_ERRORS.NO_KNOWLEDGE, message: 'No Approved NOR structural knowledge exists yet to base a proposal on.' } };
  }

  const draft = Object.freeze({
    sessionId: opts.sessionId || null,
    domainType: 'nor',
    fields: Object.freeze({
      suggestedSignatoryTopCount: Math.round(stats.avgSignatoryTopCount),
      suggestedSignatoryBottomCount: Math.round(stats.avgSignatoryBottomCount),
      typicalItemCount: Math.round(stats.avgItemCount),
      typicalReimburseLineCount: Math.round(stats.avgReimburseLineCount),
    }),
  });

  if (!isNorDraft(draft)) throw new Error('proposeNorFields: constructed an invalid NorDraft.');
  return { ok: true, draft, citedKnowledgeIds: stats.citedKnowledgeIds, sampleSize: stats.sampleSize, error: null };
}

registerStep('nor', DOCUMENT_PIPELINE_STEP.DRAFT, (context) => {
  const result = proposeNorFields(context.input || {}, { sessionId: context.sessionId });
  return result.ok ? { ok: true, output: result } : { ok: false, error: result.error };
});
