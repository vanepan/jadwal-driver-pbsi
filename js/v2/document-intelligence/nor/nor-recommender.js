/* ============================================================
   NOR-RECOMMENDER.JS — NOR Intelligence Runtime (V2.0.6, Phase 9.5)

   PURPOSE: the RECOMMEND step — turns nor-generator.js's already-computed
   structural statistics into DocumentRecommendation[] (one per suggested
   field), reusing `computeNorStructuralStats()` rather than recomputing
   the same aggregation twice.

   RESPONSIBILITY: `recommendNorFields()`, registered as the RECOMMEND step.

   DEPENDENCIES: nor-generator.js, registry/step-registry.js.
   ============================================================ */

'use strict';

import { computeNorStructuralStats } from './nor-generator.js';
import { registerStep } from '../registry/step-registry.js';
import { DOCUMENT_PIPELINE_STEP } from '../contracts/document-pipeline-contract.js';

/** @returns {import('../contracts/document-draft-contract.js').DocumentRecommendation[]} */
export function recommendNorFields() {
  const stats = computeNorStructuralStats();
  if (!stats) return [];

  return [
    { field: 'letterTop', suggestion: `Typically ${Math.round(stats.avgSignatoryTopCount)} signatory line(s) (from ${stats.sampleSize} Approved NOR${stats.sampleSize === 1 ? '' : 's'}).`, citedKnowledgeIds: stats.citedKnowledgeIds },
    { field: 'letterBottom', suggestion: `Typically ${Math.round(stats.avgSignatoryBottomCount)} signatory line(s).`, citedKnowledgeIds: stats.citedKnowledgeIds },
    { field: 'items', suggestion: `Typically ${Math.round(stats.avgItemCount)} line item(s) per NOR.`, citedKnowledgeIds: stats.citedKnowledgeIds },
  ];
}

registerStep('nor', DOCUMENT_PIPELINE_STEP.RECOMMEND, () => ({ ok: true, output: recommendNorFields() }));
