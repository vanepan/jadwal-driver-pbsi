/* ============================================================
   DOCX-EXPORTER.JS — Word (.docx) export (Phase 10, Sprint 10.6)

   Stable interface: exportHtmlToDocx(html) → Promise<Blob>

   Mirrors pdf-exporter.js's EXACT lazy-CDN-script-load idiom (this app
   has no bundler — see that file's own header — so any docx library
   must ship a browser UMD build hostable from a CDN, the same
   constraint that already shaped the pdfmake choice). Verified live in
   this environment before committing to this approach (not assumed):
   `https://unpkg.com/html-docx-js/dist/html-docx.js` loads, exposes
   `window.htmlDocx.asBlob(html)`, and produces a real, correctly-typed
   `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
   Blob from a plain HTML string.

   WHY html-docx-js AND NOT THE `docx` LIBRARY: `docx` requires building
   a full document object model (paragraphs/runs/sections as JS objects);
   html-docx-js instead converts a plain HTML string — the SAME kind of
   string ../../petty-cash/nor-paper.js already builds for the on-screen
   NOR — directly into a .docx Blob. Lower integration cost, and lets the
   PDF and Word exports share one content model
   (templates/composer-document.js#buildContentModel) rendered by two
   thin, format-specific builders, never two independently-maintained
   document structures.
   ============================================================ */

'use strict';

const HTML_DOCX_JS = 'https://unpkg.com/html-docx-js/dist/html-docx.js';

let _htmlDocxPromise = null;

function _loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

function _loadHtmlDocx() {
  if (window.htmlDocx) return Promise.resolve(window.htmlDocx);
  if (_htmlDocxPromise) return _htmlDocxPromise;

  _htmlDocxPromise = _loadScript(HTML_DOCX_JS).then(() => {
    if (!window.htmlDocx) throw new Error('htmlDocx global missing after load');
    return window.htmlDocx;
  });
  return _htmlDocxPromise;
}

/**
 * @param {string} html a complete `<html>...</html>` document string
 * @returns {Promise<Blob>} a real .docx blob
 */
export async function exportHtmlToDocx(html) {
  const htmlDocx = await _loadHtmlDocx();
  return htmlDocx.asBlob(html);
}
