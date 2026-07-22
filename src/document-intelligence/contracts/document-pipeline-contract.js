/* ============================================================
   DOCUMENT-PIPELINE-CONTRACT.JS — Document Intelligence Foundation (V2, Phase 7)

   PURPOSE: fix the shape of a Document Pipeline — an ordered sequence of
   named steps a document passes through (analyze → draft → validate →
   explain → recommend), mirroring the Stage/Pipeline pattern already
   established in knowledge/builder/contracts/pipeline-contract.js rather
   than inventing a second orchestration shape.

   RESPONSIBILITY: DocumentPipeline typedef + the closed set of step names.
   Unlike the Knowledge Builder (Phase 4), this contract does NOT ship a
   working orchestrator — Phase 7 is architecture-only, more conservative
   than Phase 4/5's "orchestration is real" choice, per the master prompt's
   explicit "Only define architecture" framing for this phase.

   DEPENDENCIES: none.

   NON-GOALS: no step is implemented. No orchestrator runs a
   DocumentPipeline in this phase.

   FUTURE EVOLUTION: Phase 8's NOR pilot is expected to be the first real
   DocumentPipeline instantiation; if a working orchestrator is wanted then,
   it can reuse knowledge/builder/builder-orchestrator.js's sequencing
   pattern rather than reinventing one.
   ============================================================ */

'use strict';

export const DOCUMENT_PIPELINE_STEP = Object.freeze({
  ANALYZE: 'analyze',
  DRAFT: 'draft',
  VALIDATE: 'validate',
  EXPLAIN: 'explain',
  RECOMMEND: 'recommend',
});

/**
 * @typedef {Object} DocumentPipeline
 * @property {string} id
 * @property {string} domainType
 * @property {string[]} steps   - ordered subset of DOCUMENT_PIPELINE_STEP values
 */

export function isDocumentPipeline(p) {
  return !!p && typeof p === 'object'
    && typeof p.id === 'string' && p.id.length > 0
    && typeof p.domainType === 'string' && p.domainType.length > 0
    && Array.isArray(p.steps) && p.steps.every((s) => Object.values(DOCUMENT_PIPELINE_STEP).includes(s));
}
