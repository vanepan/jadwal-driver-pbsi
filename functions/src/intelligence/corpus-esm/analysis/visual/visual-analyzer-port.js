/* ============================================================
   VISUAL-ANALYZER-PORT.JS — Corpus Ingestion & Document Analysis
   (V2, Phase 5.x.2)

   PURPOSE: the BOUNDARY for interpreting a rendered page image into
   LAYOUT observations (§13) — logo position, title position, margins,
   spacing, metadata-block placement, signature block, footer, page
   geometry. This is where a vision MODEL would eventually be used.

   THE OPENAI / VISION BOUNDARY (§14):
     • This module holds NO key, NO endpoint, NO model name that is a
       secret. A real analyzer is a SERVER-SIDE adapter that calls the
       authenticated Sarpras backend; it is never imported into the
       browser bundle and never logs the document.
     • Model output is NOT authoritative. Every observation a visual
       analyzer returns MUST carry provenance (source doc + page +
       region + coordinateSpace + extractionMethod 'visual_analysis' +
       confidence) and lifecycleState 'observed' — the pipeline enforces
       this, but the contract states it.
     • With no analyzer configured the pipeline fails safe: this Null
       analyzer returns ANALYZER_UNAVAILABLE, the visual stage is
       skipped, and analysisStatus is NOT advanced to `visual_analyzed`.

   THE CONTRACT: analyzePage({ documentId, pageNumber, renderedPage,
   coordinateSpace }) -> { ok, observations: RawLayoutObservation[], error }
   where a RawLayoutObservation is a plain
     { key, observedValue?, observation, region?, confidence }
   that the pipeline wraps into a CorpusObservation (category 'layout',
   modality 'visual').

   DEPENDENCIES: none beyond the error vocabulary. Pure.
   ============================================================ */

'use strict';

export const VISUAL_ANALYZER_SCHEMA = 'corpus-visual-analyzer@1';

export const VISUAL_ANALYZER_ERRORS = Object.freeze({
  ANALYZER_UNAVAILABLE: 'ANALYZER_UNAVAILABLE',
  ANALYSIS_FAILED: 'ANALYSIS_FAILED',
  MODEL_ERROR: 'MODEL_ERROR',
});

export function analyzerSuccess(observations) {
  return Object.freeze({ ok: true, observations: Object.freeze((observations || []).map((o) => Object.freeze({ ...o }))), error: null });
}
export function analyzerFailure(code, message) {
  return Object.freeze({ ok: false, observations: Object.freeze([]), error: Object.freeze({ code, message: String(message || '') }) });
}

export function isVisualAnalyzerPort(p) {
  return !!p && typeof p === 'object'
    && typeof p.id === 'string' && p.id.length > 0
    && typeof p.analyzePage === 'function';
}

export const NULL_VISUAL_ANALYZER_ID = 'null';

/** The inert default — no visual analysis capability. */
export const nullVisualAnalyzer = Object.freeze({
  id: NULL_VISUAL_ANALYZER_ID,
  version: 'corpus-null-visual-analyzer@1',
  async analyzePage() {
    return analyzerFailure(VISUAL_ANALYZER_ERRORS.ANALYZER_UNAVAILABLE, 'No visual analyzer is configured — visual analysis is skipped (§14).');
  },
});
