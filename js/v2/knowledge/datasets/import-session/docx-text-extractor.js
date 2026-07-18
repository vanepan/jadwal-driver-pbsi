/* ============================================================
   DOCX-TEXT-EXTRACTOR.JS — Intelligent Ingestion (V2, Part A1)

   PURPOSE: the ONE place that turns an uploaded `.docx` File into plain
   text. `.docx` is a zip of XML — extractable deterministically, no OCR,
   no AI (mammoth.extractRawText walks the real word/document.xml, it does
   not guess). This is the capability
   dataset-import-center.js's own NON-GOALS header named as absent ("no
   OCR, no AI, no PDF/DOCX content parsing") — that statement is now true
   of PDF only; `.docx` gets a real reader.

   WHY A CDN <script> TAG, NOT AN npm IMPORT: this codebase has no bundler
   (js/app.js is loaded as a plain `<script type="module">`, confirmed —
   see index.html). Every third-party runtime dependency the browser code
   uses (firebase, chart.js, flatpickr) is loaded the same way: firebase
   via ESM `https://www.gstatic.com/...` imports, chart.js/flatpickr via a
   plain global-exposing `<script src="https://cdn.jsdelivr.net/...">` tag
   (index.html). Mammoth's npm package ships a browser build
   (`mammoth.browser.min.js`) that exposes `window.mammoth`, not an ESM
   module — so it follows the chart.js/flatpickr pattern, not the firebase
   one. `mammoth` IS also listed in package.json (devDependency) — that
   copy is for Node-side tests only (content-fact-extraction-check.mjs and
   similar can `import mammoth from 'mammoth'` directly in Node); it is
   never what the browser actually runs.

   RESPONSIBILITY: extractDocxText(file).

   NON-GOALS: no PDF (would need OCR — a fundamentally different, much
   larger capability, explicitly out of scope). No formatting/structure
   preservation — raw text only, exactly what
   content-fact-extraction-engine.js's regexes need and nothing more.

   DEPENDENCIES: none (reads the global `window.mammoth` the CDN script
   tag in index.html provides).
   ============================================================ */

'use strict';

export const DOCX_TEXT_EXTRACTOR_ERRORS = Object.freeze({
  MAMMOTH_UNAVAILABLE: 'MAMMOTH_UNAVAILABLE',
  EXTRACTION_FAILED: 'EXTRACTION_FAILED',
});

function assertMammothAvailable() {
  if (typeof window === 'undefined' || !window.mammoth || typeof window.mammoth.extractRawText !== 'function') {
    return {
      ok: false,
      text: '',
      error: {
        code: DOCX_TEXT_EXTRACTOR_ERRORS.MAMMOTH_UNAVAILABLE,
        message: 'window.mammoth is not loaded — check the mammoth <script> tag in index.html.',
      },
    };
  }
  return null;
}

/**
 * @param {File} file
 * @returns {Promise<{ok: boolean, text: string, error: {code: string, message: string}|null}>}
 */
export async function extractDocxText(file) {
  const unavailable = assertMammothAvailable();
  if (unavailable) return unavailable;
  try {
    const arrayBuffer = await file.arrayBuffer();
    return await extractDocxTextFromBytes(arrayBuffer);
  } catch (err) {
    // A corrupt/unsupported .docx must not throw out of the upload
    // pipeline — the caller falls back to today's honest "no content
    // extracted" behavior (empty text -> content-fact-extraction-engine.js
    // finds nothing -> session parks at Menunggu Bukti exactly as before
    // this feature existed).
    return {
      ok: false,
      text: '',
      error: { code: DOCX_TEXT_EXTRACTOR_ERRORS.EXTRACTION_FAILED, message: err && err.message ? err.message : String(err) },
    };
  }
}

/**
 * V2, Part A2 (Background Re-Analysis) — the same extraction, but starting
 * from bytes already in hand (js/firebase.js#downloadFileFromStorage's
 * real re-fetch of an ALREADY-UPLOADED session's file — a browser File
 * handle cannot survive past the original upload, so re-analysis of an
 * old session can never start from extractDocxText(file) above; it must
 * start here instead). Same honest failure mode as extractDocxText().
 * @param {ArrayBuffer} arrayBuffer
 * @returns {Promise<{ok: boolean, text: string, error: {code: string, message: string}|null}>}
 */
export async function extractDocxTextFromBytes(arrayBuffer) {
  const unavailable = assertMammothAvailable();
  if (unavailable) return unavailable;
  try {
    const result = await window.mammoth.extractRawText({ arrayBuffer });
    return { ok: true, text: result && typeof result.value === 'string' ? result.value : '', error: null };
  } catch (err) {
    return {
      ok: false,
      text: '',
      error: { code: DOCX_TEXT_EXTRACTOR_ERRORS.EXTRACTION_FAILED, message: err && err.message ? err.message : String(err) },
    };
  }
}
