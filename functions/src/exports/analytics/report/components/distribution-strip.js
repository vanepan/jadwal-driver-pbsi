'use strict';

/* ============================================================
   DISTRIBUTION-STRIP.JS — Zone C labelled bars
   (.zc / .sl / .dr / .drow / .dn / .dt / .df / .dp / .dk / .dnote)

   The proportional workload/utilisation strip. Maps to the
   approved prototype:
     <div class="zc"><div class="sl">Distribusi Beban</div>
       <div class="dr">
         <div class="drow"><div class="dn">Igo</div>
           <div class="dt"><div class="df" style="width:100%"></div></div>
           <div class="dp">42%</div><div class="dk">581 km</div></div> …
       </div><div class="dnote">…</div></div>

   The bar fill (.df width) carries the primary metric (count
   relative to the leader); .dp is the share label; .dk a secondary
   figure (distance). All values arrive pre-formatted; fillPct is a
   clamped 0–100 number.

   `compact` renders the .dr.sm variant (Complete P2, later phase).
   ============================================================ */

const { esc } = require('../layouts/report-layout');

function _clampPct(n) {
  const v = Number(n || 0);
  if (v < 0) return 0;
  if (v > 100) return 100;
  return v;
}

/**
 * Rows-only renderer (.dr / .dr.sm) — no .zc/.sl/.dnote wrapper. Reused
 * by the full Zone-C strip below AND by the Complete report's two-column
 * page (P2), where the column heading replaces the section label.
 * @param {Array<{name:string, fillPct:number, shareLabel:string, secondaryLabel?:string}>} rows
 * @param {{ compact?:boolean }} [opts]
 * @returns {string} HTML for the .dr[.sm] rows block
 */
function distributionRows(rows = [], opts = {}) {
  const drClass = opts.compact ? 'dr sm' : 'dr';
  const rowsHtml = (Array.isArray(rows) ? rows : []).map((row) => {
    const width = _clampPct(row.fillPct);
    const secondary = row.secondaryLabel ? esc(row.secondaryLabel) : '';
    return (
      '<div class="drow">' +
        `<div class="dn">${esc(row.name)}</div>` +
        `<div class="dt"><div class="df" style="width:${width}%"></div></div>` +
        `<div class="dp">${esc(row.shareLabel || '')}</div>` +
        `<div class="dk">${secondary}</div>` +
      '</div>'
    );
  }).join('');
  return `<div class="${drClass}">${rowsHtml}</div>`;
}

/**
 * @param {{ label?:string,
 *           rows:Array<{name:string, fillPct:number, shareLabel:string, secondaryLabel?:string}>,
 *           note?:string }} dist
 * @param {{ compact?:boolean }} [opts]
 * @returns {string} HTML for the Zone C distribution block
 */
function distributionStrip(dist = {}, opts = {}) {
  const labelHtml = dist.label ? `<div class="sl">${esc(dist.label)}</div>` : '';
  const noteHtml = dist.note ? `<div class="dnote">${esc(dist.note)}</div>` : '';

  return (
    '<div class="zc">' +
      labelHtml +
      distributionRows(dist.rows, opts) +
      noteHtml +
    '</div>'
  );
}

module.exports = { distributionStrip, distributionRows };
