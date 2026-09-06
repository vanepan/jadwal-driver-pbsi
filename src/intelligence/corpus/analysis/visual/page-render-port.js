/* ============================================================
   PAGE-RENDER-PORT.JS — Corpus Ingestion & Document Analysis
   (V2, Phase 5.x.2)

   PURPOSE: the BOUNDARY for turning a PDF page into an analyzable visual
   representation (§13). This phase ships only the CONTRACT and a Null
   implementation. A real renderer (headless Chromium via the already-
   present `puppeteer` / `@sparticuz/chromium`, or pdfjs canvas) is
   registered later — server-side only, never in the browser bundle.

   THE CONTRACT: renderPages({ source, pages }) ->
     { ok, pages: [{ pageNumber, width, height, coordinateSpace,
       imageRef|null, imageMimeType|null }], error }
   `imageRef` is an OPAQUE handle (a Storage path, a data URI the CALLER
   holds briefly, …) — this module never embeds bytes and never returns a
   URL that leaks the document.

   §14 — with no renderer configured the pipeline MUST fail safe: this
   Null port returns RENDER_UNAVAILABLE, the visual stage is skipped, and
   analysisStatus is NOT advanced to `visual_analyzed`.

   DEPENDENCIES: ../../contracts/corpus-provenance-contract.js
   (COORDINATE_SPACE). Pure.
   ============================================================ */

'use strict';

import { COORDINATE_SPACE } from '../../contracts/corpus-provenance-contract.js';

export const PAGE_RENDER_SCHEMA = 'corpus-page-render@1';

export const PAGE_RENDER_ERRORS = Object.freeze({
  RENDER_UNAVAILABLE: 'RENDER_UNAVAILABLE',
  RENDER_FAILED: 'RENDER_FAILED',
  UNSUPPORTED_FORMAT: 'UNSUPPORTED_FORMAT',
});

export function renderSuccess(pages) {
  return Object.freeze({ ok: true, pages: Object.freeze((pages || []).map((p) => Object.freeze({ ...p }))), error: null });
}
export function renderFailure(code, message) {
  return Object.freeze({ ok: false, pages: Object.freeze([]), error: Object.freeze({ code, message: String(message || '') }) });
}

export function isPageRenderPort(p) {
  return !!p && typeof p === 'object'
    && typeof p.id === 'string' && p.id.length > 0
    && typeof p.renderPages === 'function';
}

export const NULL_PAGE_RENDER_ID = 'null';

/** The inert default — no rendering capability. */
export const nullPageRenderPort = Object.freeze({
  id: NULL_PAGE_RENDER_ID,
  version: 'corpus-null-page-render@1',
  async renderPages() {
    return renderFailure(PAGE_RENDER_ERRORS.RENDER_UNAVAILABLE, 'No page renderer is configured — visual analysis is skipped (§14).');
  },
});

/** Re-export for adapters that build render results. */
export { COORDINATE_SPACE };
