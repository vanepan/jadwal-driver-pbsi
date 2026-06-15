'use strict';

/* ============================================================
   REPORT-LAYOUT.JS — A4 page wrapper + shared chrome (Zone A/E)

   The foundational layout primitives shared by every analytics
   report page. These map 1:1 to the approved prototype:

     page(inner)        → .a4 > .pi   (one A4 page, zone stack)
     rule()             → .zr         (hairline zone divider)
     reportHeader(meta) → Zone A (.za)
     reportFooter(meta) → Zone E (.ze / .fb)

   Pure string builders — no DOM, no Node APIs, no data logic.
   Phase B+ adds the body components (HeroMetric, MetricGrid,
   DistributionStrip, …); this file owns only the page shell.
   All text is HTML-escaped via esc().
   ============================================================ */

/** Escape text for safe interpolation into HTML. */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** One A4 page: the .a4 frame + .pi inner padding box (the zone stack). */
function page(innerHtml) {
  return `<div class="a4"><div class="pi">${innerHtml || ''}</div></div>`;
}

/** Hairline zone divider (.zr). */
function rule() {
  return '<div class="zr"></div>';
}

/**
 * Zone A — standard PBSI report header.
 * @param {{org?:string, orgSub?:string, periodLabel?:string,
 *          dateLabel?:string, title?:string}} meta
 */
function reportHeader(meta = {}) {
  const org        = esc(meta.org || 'Bidang Sarana dan Prasarana');
  const orgSub     = esc(meta.orgSub || 'PBSI — Persatuan Bulu Tangkis Seluruh Indonesia');
  const periodLabel = esc(meta.periodLabel || '');
  const dateLabel  = esc(meta.dateLabel || '');
  const title      = esc(meta.title || '');
  return (
    '<div class="za">' +
      '<div class="htop">' +
        '<div class="hid">' +
          '<div class="pm">PBSI</div>' +
          `<div class="hot"><div class="on1">${org}</div><div class="on2">${orgSub}</div></div>` +
        '</div>' +
        `<div class="hrt"><div class="hpe">${periodLabel}</div><div class="hda">${dateLabel}</div></div>` +
      '</div>' +
      `<div class="htt">${title}</div>` +
    '</div>'
  );
}

/**
 * Zone E — standard footer bar (filter line · version/author/date).
 * `lead` is optional content rendered above the rule (contributor line,
 * baseline note, …); Phase A passes none.
 * @param {{filterLine?:string, versionLine?:string}} meta
 * @param {string} [lead]
 */
function reportFooter(meta = {}, lead = '') {
  const filterLine  = esc(meta.filterLine || '');
  const versionLine = esc(meta.versionLine || '');
  return (
    '<div class="ze">' +
      (lead || '<div></div>') +
      '<div class="fb">' +
        `<div class="fm">${filterLine}</div>` +
        `<div class="fm">${versionLine}</div>` +
      '</div>' +
    '</div>'
  );
}

module.exports = { esc, page, rule, reportHeader, reportFooter };
