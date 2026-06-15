'use strict';

/* ============================================================
   BIDANG-STATUS-STRIP.JS — Zone C fulfilled/waiting strips
   (.zc / .sl / .be / .bdn / .bdd / .bsw / .bs / .bsl)

   The Bidang report's Zone C is NOT proportional bars — the
   approved design (prototype #r-bidang) shows a per-bidang
   fulfilment status: name, a detail line, and a status bar
   (fulfilled = green .bs.ok / waiting = hollow .bs.wt) with a
   matching label. This component is listed in the architecture
   design inventory (§1.3) as BidangStatusStrip, distinct from
   DistributionStrip. Maps verbatim to the prototype:

     <div class="zc"><div class="sl">Permintaan per Bidang</div>
       <div style="display:flex;flex-direction:column;gap:18px">
         <div class="be"><div class="bdn">Bidang Turnamen</div>
           <div class="bdd">1 permintaan · 1 penugasan · 87 km</div>
           <div class="bsw"><div class="bs ok"></div>
             <div class="bsl ok">Terpenuhi</div></div></div> …
       </div></div>

   Pure string builder. status: 'fulfilled' → ok, else → wt.
   ============================================================ */

const { esc } = require('../layouts/report-layout');

/**
 * The status items wrapped in their flex column (no .zc/.sl). Reused by
 * the full Zone-C strip below AND by Complete P3 (which uses gap:16 and
 * its own section heading). `gap` defaults to the Bidang-report 18px.
 * @param {Array<{name:string, detail:string, status:'fulfilled'|'waiting', statusLabel:string}>} items
 * @param {{ gap?:number }} [opts]
 * @returns {string} HTML for the status items column
 */
function bidangStatusItems(items = [], opts = {}) {
  const gap = opts.gap != null ? opts.gap : 18;
  const itemsHtml = (Array.isArray(items) ? items : []).map((it) => {
    const cls = it.status === 'fulfilled' ? 'ok' : 'wt';
    return (
      '<div class="be">' +
        `<div class="bdn">${esc(it.name)}</div>` +
        `<div class="bdd">${esc(it.detail || '')}</div>` +
        '<div class="bsw">' +
          `<div class="bs ${cls}"></div>` +
          `<div class="bsl ${cls}">${esc(it.statusLabel || '')}</div>` +
        '</div>' +
      '</div>'
    );
  }).join('');
  return `<div style="display:flex;flex-direction:column;gap:${gap}px">${itemsHtml}</div>`;
}

/**
 * @param {{ label?:string,
 *           items:Array<{name:string, detail:string,
 *                        status:'fulfilled'|'waiting', statusLabel:string}> }} section
 * @returns {string} HTML for the Zone C bidang status block
 */
function bidangStatusStrip(section = {}) {
  const label = section.label || 'Permintaan per Bidang';
  return (
    '<div class="zc">' +
      `<div class="sl">${esc(label)}</div>` +
      bidangStatusItems(section.items) +
    '</div>'
  );
}

module.exports = { bidangStatusStrip, bidangStatusItems };
