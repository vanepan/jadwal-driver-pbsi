/* ============================================================
   NOR-GENERATOR-CONTRACT.JS — NOR Intelligence Foundation (V2, Phase 8)

   PURPOSE: lock the shape of a future "NOR Generator" — the pilot's
   equivalent of a DocumentAnalyzer, specialized to `domainType: 'nor'` —
   and the NOR Pipeline instantiation, WITHOUT generating, templating, or
   rendering anything. Explicitly reuses the EXISTING NOR Engine
   (js/petty-cash/nor-document-engine.js, js/docs/templates/nor.js,
   js/docs/templates/nor-paper.js, js/petty-cash/nor-excel-exporter.js) as
   the only renderer that will ever exist — a NorGenerator's job (once
   implemented, NOT in Phase 8) is to propose FIELD VALUES, never a
   rendered document.

   RESPONSIBILITY: NorGenerator shape (mirrors DocumentAnalyzer's `{ id,
   version, ...}` family) and a NorPipeline instance of
   document-pipeline-contract.js's generic Pipeline, fixed to
   `domainType: 'nor'`.

   DEPENDENCIES: document-intelligence/contracts/document-pipeline-contract.js.

   NON-GOALS: does not generate a NOR. Does not implement AI. Does not
   implement templates. Does not implement PDF. No generator is
   registered.

   FUTURE EVOLUTION: Phase 8+ (beyond this architecture-only phase)
   implements one real NorGenerator that, given approved Knowledge
   (template_pattern/vocabulary items scoped to domainType: 'nor'),
   proposes field values a human reviews before they ever reach
   `buildNorViewModel` — the existing renderer stays untouched throughout.
   ============================================================ */

'use strict';

import { DOCUMENT_PIPELINE_STEP, isDocumentPipeline } from '../contracts/document-pipeline-contract.js';

export const NOR_GENERATOR_ERRORS = Object.freeze({
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
});

/**
 * @typedef {Object} NorGenerator
 * @property {string} id
 * @property {string} version
 * @property {string} description
 * @property {(request: import('./contracts/nor-knowledge-contract.js').NorKnowledgeRequest) => object} propose
 *   - STUB shape only; no implementation exists to satisfy this signature in Phase 8.
 */

/** The standard NOR pipeline instance — reuses the generic step vocabulary,
 *  fixed to domainType: 'nor'. Not run by anything in Phase 8. */
export const NOR_PIPELINE = Object.freeze({
  id: 'nor-pilot',
  domainType: 'nor',
  steps: Object.freeze([
    DOCUMENT_PIPELINE_STEP.ANALYZE,
    DOCUMENT_PIPELINE_STEP.DRAFT,
    DOCUMENT_PIPELINE_STEP.VALIDATE,
    DOCUMENT_PIPELINE_STEP.EXPLAIN,
    DOCUMENT_PIPELINE_STEP.RECOMMEND,
  ]),
});

/** Confirms NOR_PIPELINE itself satisfies the generic Pipeline contract —
 *  a structural self-check, not a runtime guarantee about any instance a
 *  caller constructs. */
export const NOR_PIPELINE_IS_VALID = isDocumentPipeline(NOR_PIPELINE);

/**
 * STUB. No generator exists to propose anything.
 * @returns {never}
 */
export function proposeNorFields(_request) {
  throw new Error('proposeNorFields: NOT_IMPLEMENTED — no NOR generator exists yet; this is architecture-only (Phase 8).');
}
