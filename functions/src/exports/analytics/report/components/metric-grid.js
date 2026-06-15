'use strict';

/* ============================================================
   METRIC-GRID.JS — KPI row (.kr / .kc / .kv / .ku / .kl)

   The horizontal row of n hairline-divided KPI cells under the
   hero. Maps to the approved prototype:
     <div class="kr">
       <div class="kc"><div class="kv">1.342 <span class="ku">km</span></div>
         <div class="kl">Jarak Tempuh</div></div> … </div>

   Pure string builder. cell.value / cell.unit are formatted strings.
   ============================================================ */

const { esc } = require('../layouts/report-layout');

/**
 * @param {Array<{value:string, unit?:string, label:string}>} cells
 * @param {{ borderless?:boolean }} [opts] borderless → standalone row
 *        (Complete P1: no top rule, no top margin/padding)
 * @returns {string} HTML for the .kr KPI row
 */
function metricGrid(cells = [], opts = {}) {
  const krStyle = opts.borderless
    ? ' style="margin-top:0;padding-top:0;border-top:none"'
    : '';
  const body = (cells || []).map((c) => {
    const value = esc(c.value != null ? c.value : '');
    const label = esc(c.label || '');
    // Percent hugs the value ("50%"); other units take a space ("1.342 km").
    const unitHtml = c.unit
      ? (c.unit === '%'
          ? `<span class="ku">%</span>`
          : ` <span class="ku">${esc(c.unit)}</span>`)
      : '';
    return (
      '<div class="kc">' +
        `<div class="kv">${value}${unitHtml}</div>` +
        `<div class="kl">${label}</div>` +
      '</div>'
    );
  }).join('');

  return `<div class="kr"${krStyle}>${body}</div>`;
}

module.exports = { metricGrid };
