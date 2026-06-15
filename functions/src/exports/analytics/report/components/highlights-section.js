'use strict';

/* ============================================================
   HIGHLIGHTS-SECTION.JS — Zone D (.zd / .sl / .hl-list / .hi /
   .hcat / .hbd / .hst / .hct)

   The categorised findings list. Maps to the approved prototype:
     <div class="zd"><div class="sl">Sorotan</div>
       <div class="hl-list">
         <div class="hi"><div class="hcat g">Efisiensi</div>
           <div class="hbd"><div class="hst">…</div>
             <div class="hct">…</div></div></div> …
       </div></div>

   Zone D is the one growing zone (flex:1) — it absorbs vertical
   slack so the footer pins to the page bottom. Tone maps to the
   category colour: good → .hcat.g, attention → .hcat.r, neutral → —.

   Highlight statements/contexts come from the reused Insight Engine
   and are HTML-escaped here.
   ============================================================ */

const { esc } = require('../layouts/report-layout');

const TONE_CLASS = { good: ' g', attention: ' r', neutral: '' };

/**
 * The `.hi` items only (no .zd/.sl/.hl-list wrapper). Reused by the
 * full Zone-D section below AND by Complete P3, which wraps the items
 * in its own `.hl-list` with custom spacing.
 * @param {Array<{category:string, tone?:string, statement:string, context?:string}>} items
 * @returns {string} HTML for the joined `.hi` items
 */
function highlightItems(items = []) {
  return (Array.isArray(items) ? items : []).map((it) => {
    const toneClass = TONE_CLASS[it.tone] || '';
    const contextHtml = it.context ? `<div class="hct">${esc(it.context)}</div>` : '';
    return (
      '<div class="hi">' +
        `<div class="hcat${toneClass}">${esc(it.category)}</div>` +
        '<div class="hbd">' +
          `<div class="hst">${esc(it.statement)}</div>` +
          contextHtml +
        '</div>' +
      '</div>'
    );
  }).join('');
}

/**
 * @param {{ label?:string,
 *           items:Array<{category:string, tone?:string, statement:string, context?:string}> }} section
 * @returns {string} HTML for the Zone D highlights block
 */
function highlightsSection(section = {}) {
  const label = section.label || 'Sorotan';
  return (
    '<div class="zd">' +
      `<div class="sl">${esc(label)}</div>` +
      `<div class="hl-list">${highlightItems(section.items)}</div>` +
    '</div>'
  );
}

module.exports = { highlightsSection, highlightItems };
