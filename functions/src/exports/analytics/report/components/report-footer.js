'use strict';

/* ============================================================
   REPORT-FOOTER.JS — Zone E (.ze / .sl / .cm / .fb / .fm)

   The single-report footer: a "Kontributor Utama" lead (eyebrow +
   inline contributor line with bold names) above the filter/version
   bar. Maps to the approved prototype:
     <div class="ze">
       <div><div class="sl">Kontributor Utama</div>
         <div class="cm"><b>Igo</b> — … &nbsp;·&nbsp; <b>Aria</b> — …</div></div>
       <div class="fb"><div class="fm">Filter: …</div>
         <div class="fm">v… · Evan · 15 Jun 2026</div></div>
     </div>

   Contributors arrive as structured {name, role} so no HTML crosses
   the wire; the bold-name markup is built (and escaped) here.
   ============================================================ */

const { esc } = require('../layouts/report-layout');

/**
 * The Zone-E lead (above the filter/version bar) is one of:
 *   • a "Kontributor Utama" contributor line (single reports),
 *   • a `.cnote` italic note (Complete P1 baseline note), or
 *   • empty (Complete P2–P5).
 *
 * @param {{ contributorsLabel?:string,
 *           contributors?:Array<{name:string, role:string}>,
 *           note?:string,
 *           filterLine?:string, versionLine?:string }} meta
 * @returns {string} HTML for the Zone E footer
 */
function reportFooter(meta = {}) {
  const contributors = Array.isArray(meta.contributors) ? meta.contributors : [];

  let lead = '';
  if (meta.note) {
    lead = `<div class="cnote">${esc(meta.note)}</div>`;
  } else if (contributors.length > 0) {
    const line = contributors
      .map((c) => `<b>${esc(c.name)}</b> — ${esc(c.role)}`)
      .join(' &nbsp;·&nbsp; ');
    lead =
      '<div>' +
        `<div class="sl">${esc(meta.contributorsLabel || 'Kontributor Utama')}</div>` +
        `<div class="cm">${line}</div>` +
      '</div>';
  }

  return (
    '<div class="ze">' +
      lead +
      '<div class="fb">' +
        `<div class="fm">${esc(meta.filterLine || '')}</div>` +
        `<div class="fm">${esc(meta.versionLine || '')}</div>` +
      '</div>' +
    '</div>'
  );
}

module.exports = { reportFooter };
