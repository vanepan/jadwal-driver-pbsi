'use strict';

/* ============================================================
   HERO-METRIC.JS — Zone B hero number (.hs / .hn / .hpu / .hl)

   The big headline figure of a single-report page. Maps to the
   approved prototype verbatim:
     <div><div class="hs"><span class="hn">100</span>
       <span class="hpu">%</span></div><div class="hl">…</div></div>

   Does NOT include the .zb wrapper — the page composer wraps the
   hero + metric grid together in Zone B (matching the prototype,
   where both live inside one .zb).

   Pure string builder. value/unit are already formatted strings.
   ============================================================ */

const { esc } = require('../layouts/report-layout');

/**
 * @param {{ value:string, unit?:string, label:string }} hero
 * @returns {string} HTML for the hero block (no .zb wrapper)
 */
function heroMetric(hero = {}) {
  const value = esc(hero.value != null ? hero.value : '');
  const label = esc(hero.label || '');
  // Percent hugs the number ("100%"); other units take a hair of space (" km").
  const unitHtml = hero.unit
    ? `<span class="hpu">${hero.unit === '%' ? '%' : ` ${esc(hero.unit)}`}</span>`
    : '';
  return (
    '<div>' +
      `<div class="hs"><span class="hn">${value}</span>${unitHtml}</div>` +
      `<div class="hl">${label}</div>` +
    '</div>'
  );
}

module.exports = { heroMetric };
