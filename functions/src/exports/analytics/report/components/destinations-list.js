'use strict';

/* ============================================================
   DESTINATIONS-LIST.JS — Complete P3 "Destinasi Utama"
   (.sl + subtitle / .dlist / .ditem / .dname / .dfreq)

   Maps to the approved prototype (Complete P3):
     <div class="sl">Destinasi Utama <span …>— 16 tujuan unik …</span></div>
     <div class="dlist">
       <div class="ditem"><div class="dname">Pelatnas – Istora Senayan</div>
         <div class="dfreq">8 trip</div></div> …
     </div>

   The subtitle (unique-destination count) is rendered as a muted
   inline span on the section label, exactly as the prototype.
   Pure string builder; values are already formatted.
   ============================================================ */

const { esc } = require('../layouts/report-layout');

/** The muted inline-span style used by the prototype subtitle. */
const SUB_STYLE = 'font-weight:400;letter-spacing:0;text-transform:none;font-size:9px;color:#9A9A9A';

/**
 * @param {{ label?:string, subtitle?:string,
 *           items:Array<{name:string, freqLabel:string}> }} section
 * @returns {string} HTML for the destinations block
 */
function destinationsList(section = {}) {
  const items = Array.isArray(section.items) ? section.items : [];
  const label = section.label || 'Destinasi Utama';
  const subtitleHtml = section.subtitle
    ? ` <span style="${SUB_STYLE}">${esc(section.subtitle)}</span>`
    : '';

  const itemsHtml = items.map((it) => (
    '<div class="ditem">' +
      `<div class="dname">${esc(it.name)}</div>` +
      `<div class="dfreq">${esc(it.freqLabel || '')}</div>` +
    '</div>'
  )).join('');

  return (
    `<div class="sl">${esc(label)}${subtitleHtml}</div>` +
    `<div class="dlist" style="margin-top:4px">${itemsHtml}</div>`
  );
}

module.exports = { destinationsList };
