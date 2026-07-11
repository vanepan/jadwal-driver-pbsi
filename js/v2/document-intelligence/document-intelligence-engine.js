/* ============================================================
   DOCUMENT-INTELLIGENCE-ENGINE.JS — Document Intelligence Foundation (V2, Phase 7)

   PURPOSE: lock the entry point that will run a DocumentPipeline once real
   analyzers exist. Kept a NOT_IMPLEMENTED stub (unlike the Knowledge
   Builder's real orchestrator) because Phase 7 is explicitly
   architecture-only — no document is analyzed, drafted, or generated.

   RESPONSIBILITY: `runPipeline(pipeline, context)` signature lock.

   DEPENDENCIES: registry/document-registry.js (read-only reference; not
   called).

   NON-GOALS: does not generate documents, does not implement NOR, does
   not implement AI, templates, or PDF (all explicitly out of scope per the
   master prompt's Phase 7/8 instructions).

   FUTURE EVOLUTION: Phase 8's NOR pilot is expected to be the first real
   caller; if real orchestration is wanted then, it should reuse
   knowledge/builder/builder-orchestrator.js's sequencing pattern.
   ============================================================ */

'use strict';

export const DOCUMENT_INTELLIGENCE_ERRORS = Object.freeze({
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
});

/**
 * STUB.
 * @returns {never}
 */
export function runPipeline(_pipeline, _context) {
  throw new Error('runPipeline: NOT_IMPLEMENTED — Document Intelligence is architecture-only in Phase 7.');
}
