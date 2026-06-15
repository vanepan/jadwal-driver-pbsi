'use strict';

/* ============================================================
   COMPACT-HIGHLIGHTS.JS — two-column compact highlights
   (.chl / .chi / .chcat / .chst / .chct)

   The condensed highlight list used inside the Complete P2 columns.
   Maps to the approved prototype:
     <div class="chl">
       <div class="chi"><div class="chcat g">Efisiensi</div>
         <div><div class="chst">100% penugasan selesai.</div></div></div>
       <div class="chi"><div class="chcat">Distribusi</div>
         <div><div class="chst">…</div><div class="chct">…</div></div></div>
     </div>

   Same highlight item shape as HighlightsSection {category,tone,
   statement,context}; renders smaller (.chst/.chct). tone → category
   colour: good → .chcat.g (the prototype only uses .g here).
   ============================================================ */

const { esc } = require('../layouts/report-layout');

const TONE_CLASS = { good: ' g', attention: ' r', neutral: '' };

/**
 * @param {Array<{category:string, tone?:string, statement:string, context?:string}>} items
 * @returns {string} HTML for the .chl compact-highlights block
 */
function compactHighlights(items = []) {
  const body = (Array.isArray(items) ? items : []).map((it) => {
    const toneClass = TONE_CLASS[it.tone] || '';
    const contextHtml = it.context ? `<div class="chct">${esc(it.context)}</div>` : '';
    return (
      '<div class="chi">' +
        `<div class="chcat${toneClass}">${esc(it.category)}</div>` +
        `<div><div class="chst">${esc(it.statement)}</div>${contextHtml}</div>` +
      '</div>'
    );
  }).join('');
  return `<div class="chl">${body}</div>`;
}

module.exports = { compactHighlights };
