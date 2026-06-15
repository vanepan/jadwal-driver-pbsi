'use strict';

/* ============================================================
   TWO-COLUMN-LAYOUT.JS — Complete P2 two-column body
   (.tcol / .cl / .cr / .crule / .ch / .cs)  + cross-dimension note
   (.cdim / .cdlbl / .cdtxt)

   Maps to the approved prototype (Complete P2):
     <div class="tcol">
       <div class="cl"> <div class="ch">Pengemudi</div>
         <div class="cs">3 aktif · …</div> {distribution rows} {compact highlights} </div>
       <div class="crule"></div>
       <div class="cr"> … Armada … </div>
     </div>
     <div class="cdim"><div class="cdlbl">Koneksi Lintas Dimensi</div>
       <div class="cdtxt">…</div></div>

   Pure composition helpers — the page builder supplies each column's
   inner HTML (heading + summary + rows + highlights).
   ============================================================ */

const { esc } = require('../layouts/report-layout');

/** A column header pair: bold-eyebrow heading (.ch) + summary line (.cs). */
function columnHeader(heading, summary) {
  return (
    `<div class="ch">${esc(heading || '')}</div>` +
    (summary ? `<div class="cs">${esc(summary)}</div>` : '')
  );
}

/**
 * Two-column body with a center hairline rule.
 * @param {string} leftHtml   full inner HTML of the left column (.cl)
 * @param {string} rightHtml  full inner HTML of the right column (.cr)
 * @returns {string} HTML for the .tcol block
 */
function twoColumn(leftHtml, rightHtml) {
  return (
    '<div class="tcol" style="flex:1">' +
      `<div class="cl">${leftHtml || ''}</div>` +
      '<div class="crule"></div>' +
      `<div class="cr">${rightHtml || ''}</div>` +
    '</div>'
  );
}

/** Cross-dimension footnote (.cdim). */
function crossDimensionNote(label, text) {
  if (!text) return '';
  return (
    '<div class="cdim">' +
      `<div class="cdlbl">${esc(label || 'Koneksi Lintas Dimensi')}</div>` +
      `<div class="cdtxt">${esc(text)}</div>` +
    '</div>'
  );
}

module.exports = { twoColumn, columnHeader, crossDimensionNote };
