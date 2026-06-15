'use strict';

/* ============================================================
   CONTRIBUTORS-SECTION.JS — Complete P4 full contributors
   (.cfs / .cfsl / .cfi / .cfl / .cfn / .cfd / .cfr / .cfp / .cfpl)

   The full per-entity contributor sections, grouped by dimension
   (Pengemudi / Kendaraan / Bidang). Distinct from the single-report
   footer line: each entity has a prose description (.cfd) and a
   right-aligned metric (.cfp value + .cfpl unit). Maps to the
   approved prototype (Complete P4):
     <div class="cfs"><div class="cfsl">Pengemudi</div>
       <div class="cfi"><div class="cfl"><div class="cfn">Igo</div>
         <div class="cfd">…</div></div>
         <div class="cfr"><div class="cfp">581</div>
           <div class="cfpl">km</div></div></div> …
     </div>

   A "—" metric is rendered muted (prototype uses inline grey).
   Pure string builder; values already projected/formatted.
   ============================================================ */

const { esc } = require('../layouts/report-layout');

/**
 * @param {Array<{ label:string,
 *                 items:Array<{name:string, description:string,
 *                              metricValue:string, metricLabel:string}> }>} groups
 * @returns {string} HTML for the stacked contributor sections
 */
function contributorsSection(groups = []) {
  return (Array.isArray(groups) ? groups : []).map((group) => {
    const itemsHtml = (group.items || []).map((it) => {
      const muted = (it.metricValue == null || it.metricValue === '' || it.metricValue === '—');
      const valStyle = muted ? ' style="color:#9A9A9A"' : '';
      return (
        '<div class="cfi">' +
          '<div class="cfl">' +
            `<div class="cfn">${esc(it.name)}</div>` +
            `<div class="cfd">${esc(it.description || '')}</div>` +
          '</div>' +
          '<div class="cfr">' +
            `<div class="cfp"${valStyle}>${esc(it.metricValue != null ? it.metricValue : '—')}</div>` +
            `<div class="cfpl">${esc(it.metricLabel || '')}</div>` +
          '</div>' +
        '</div>'
      );
    }).join('');
    return (
      '<div class="cfs">' +
        `<div class="cfsl">${esc(group.label)}</div>` +
        itemsHtml +
      '</div>'
    );
  }).join('');
}

module.exports = { contributorsSection };
