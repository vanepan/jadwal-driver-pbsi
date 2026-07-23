/* ============================================================
   NOR-EXPLAINER.JS — NOR Intelligence Runtime (V2.0.6, Phase 9.5)

   PURPOSE: the EXPLAIN step — turns the DRAFT step's `citedKnowledgeIds`
   into real DocumentExplanations, reusing
   knowledge/services/explainability-service.js#explain (Phase 6, real)
   for each cited item. No new explanation logic — a translation from
   Knowledge's explainability vocabulary into DocumentExplanation's shape
   (document-draft-contract.js), exactly as that contract's header says to.

   RESPONSIBILITY: `explainNorDraft(citedKnowledgeIds)`, registered as the
   EXPLAIN step (reads `context.results.draft.citedKnowledgeIds`).

   DEPENDENCIES: knowledge/repository/knowledge-repository.js,
   knowledge/services/explainability-service.js, registry/step-registry.js.
   ============================================================ */

'use strict';

import {
  getKnowledge as getById,
} from '../../knowledge/services/knowledge-service.js';
import { explain } from '../../knowledge/services/explainability-service.js';
import { registerStep } from '../registry/step-registry.js';
import { DOCUMENT_PIPELINE_STEP } from '../contracts/document-pipeline-contract.js';

/**
 * @param {string[]} citedKnowledgeIds
 * @returns {import('../contracts/document-draft-contract.js').DocumentExplanation[]}
 */
export function explainNorDraft(citedKnowledgeIds) {
  return (citedKnowledgeIds || []).map((id) => {
    const itemResult = getById(id);
    if (!itemResult.ok) return { statement: `Source "${id}" is no longer available.`, citedKnowledgeIds: [id] };
    const explanation = explain(itemResult.data);
    const statement = explanation.ok
      ? `Approved ${itemResult.data.updatedAt.slice(0, 10)}, cited by ${explanation.data.corroborationCount} corroborating item(s).`
      : 'Not yet explainable.';
    return { statement, citedKnowledgeIds: [id] };
  });
}

registerStep('nor', DOCUMENT_PIPELINE_STEP.EXPLAIN, (context) => {
  const draftOutput = context.results && context.results.draft;
  const citedKnowledgeIds = draftOutput ? draftOutput.citedKnowledgeIds : [];
  return { ok: true, output: explainNorDraft(citedKnowledgeIds) };
});
