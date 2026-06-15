'use strict';

/* ============================================================
   APPENDIX-SECTION.JS — Complete P5 "Lampiran"
   (.lgrid / .lkey / .lval / .lsub / .lnote)

   The two-column key/value metadata grid + closing note. Maps to
   the approved prototype (Complete P5):
     <div class="lgrid">
       <div><div class="lkey">Periode Laporan</div>
         <div class="lval">30 Hari Terakhir<br>
           <span class="lsub">16 Mei – 15 Juni 2026</span></div></div> …
     </div>
     <div class="lnote">…</div>

   The grid is CSS row-major (grid-template-columns:1fr 1fr), so the
   entries array order fills left-to-right, top-to-bottom exactly as
   the prototype. A `muted` entry renders grey italic (period
   comparison "Tidak tersedia"). Pure string builder.
   ============================================================ */

const { esc } = require('../layouts/report-layout');

/**
 * @param {{ entries:Array<{key:string, value:string, sub?:string, muted?:boolean}>,
 *           note?:string }} appendix
 * @returns {string} HTML for the appendix block
 */
function appendixSection(appendix = {}) {
  const entries = Array.isArray(appendix.entries) ? appendix.entries : [];

  const cells = entries.map((e) => {
    const subHtml = e.sub ? `<br><span class="lsub">${esc(e.sub)}</span>` : '';
    const valStyle = e.muted ? ' style="color:#9A9A9A;font-style:italic"' : '';
    return (
      '<div>' +
        `<div class="lkey">${esc(e.key)}</div>` +
        `<div class="lval"${valStyle}>${esc(e.value)}${subHtml}</div>` +
      '</div>'
    );
  }).join('');

  const noteHtml = appendix.note ? `<div class="lnote">${esc(appendix.note)}</div>` : '';

  return `<div class="lgrid">${cells}</div>${noteHtml}`;
}

module.exports = { appendixSection };
