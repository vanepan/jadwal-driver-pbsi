/* ============================================================
   NOR-ANALYZER.JS — NOR Intelligence Runtime (V2.0.6, Phase 9.5)

   PURPOSE: the first real DocumentAnalyzer (contracts/document-analysis-contract.js),
   the ANALYZE step of NOR_PIPELINE (nor-generator-contract.js). Fixed to
   domainType 'nor' by construction — classification confidence is always
   1 (the pilot IS the NOR pipeline, there is no ambiguity to classify
   away). `structure.sectionLabels` names the NOR ViewModel's real
   sections, matching js/petty-cash/nor-document-engine.js#buildNorViewModel's
   actual return shape (header/subject/recipients/financial_summary/
   items/signatories/recap) — read off the SAME structural fingerprint
   knowledge/connectors/nor-connector.js already extracts, not invented
   here.

   RESPONSIBILITY: `analyze(input)` satisfying DocumentAnalyzer; registers
   itself into document-registry.js AND into registry/step-registry.js for
   the ANALYZE step.

   DEPENDENCIES: contracts/document-analysis-contract.js,
   registry/document-registry.js, registry/step-registry.js,
   contracts/document-pipeline-contract.js.

   NON-GOALS: does not read any V1 data — the section labels are a fixed,
   known fact about the NOR domain's structure (documented, not queried).
   ============================================================ */

'use strict';

import { analysisSuccess, isDocumentAnalyzer } from '../contracts/document-analysis-contract.js';
import { registerAnalyzer } from '../registry/document-registry.js';
import { registerStep } from '../registry/step-registry.js';
import { DOCUMENT_PIPELINE_STEP } from '../contracts/document-pipeline-contract.js';

export const NOR_ANALYZER_ID = 'nor-analyzer';

const NOR_SECTION_LABELS = Object.freeze(['header', 'subject', 'recipients', 'financial_summary', 'items', 'signatories', 'recap']);

function analyze(_input) {
  return analysisSuccess({
    classification: { domainType: 'nor', confidence: 1 },
    intent: { label: 'compose_nor', confidence: 1 },
    structure: { sectionLabels: NOR_SECTION_LABELS },
  });
}

export const norAnalyzer = Object.freeze({
  id: NOR_ANALYZER_ID,
  version: 'nor-analyzer@1',
  description: "Classifies input as domainType 'nor' and describes the NOR ViewModel's known section structure.",
  analyze,
});

if (!isDocumentAnalyzer(norAnalyzer)) throw new Error('nor-analyzer.js: norAnalyzer does not satisfy the DocumentAnalyzer contract.');
registerAnalyzer(norAnalyzer);

registerStep('nor', DOCUMENT_PIPELINE_STEP.ANALYZE, (context) => {
  const result = norAnalyzer.analyze(context.input);
  return result.ok ? { ok: true, output: result } : { ok: false, error: result.error };
});
