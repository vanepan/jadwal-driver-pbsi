'use strict';

/* ============================================================
   HEALTH-SCORE-HERO.JS — Complete P1 centered hero
   (.zb.ctr / .hsc / .hscn / .hscd / .hsbadge / .hslbl)

   Maps to the approved prototype (Complete P1):
     <div class="zb ctr">
       <div class="hsc"><span class="hscn">99</span>
         <span class="hscd"> / 100</span></div>
       <div><div class="hsbadge">Sangat Baik</div></div>
       <div class="hslbl">Kesehatan Operasional</div>
     </div>

   Includes its own .zb.ctr wrapper (centered Zone B variant), unlike
   heroMetric which omits the .zb so the page can pair it with a KPI
   grid. Pure string builder; values are already computed/formatted.
   ============================================================ */

const { esc } = require('../layouts/report-layout');

/* Badge tone → extra class. Green is the default `.hsbadge` styling, so it adds
   NO class (keeps the Complete report and the green Executive case byte-
   identical). Amber/crit add a tone modifier so the PDF badge colour matches the
   dashboard hero (B2 parity). Any other/absent tone falls through to green. */
const BADGE_TONE_CLASS = { amber: ' amber', crit: ' crit' };

/**
 * @param {{ score:number|string|null, outOf:number|string,
 *           badge:string, badgeTone?:string, label:string }} hs
 * @returns {string} HTML for the centered Zone B health-score hero
 */
function healthScoreHero(hs = {}) {
  const badge = esc(hs.badge || '');
  const label = esc(hs.label || 'Kesehatan Operasional');
  const toneClass = BADGE_TONE_CLASS[hs.badgeTone] || '';

  // Empty-state (Phase F, I-1): no score → em dash, no "/100", neutral badge.
  if (hs.score == null) {
    return (
      '<div class="zb ctr">' +
        '<div class="hsc"><span class="hscn">—</span></div>' +
        `<div><div class="hsbadge" style="background:#EFEFED;color:#6B6B6B">${badge}</div></div>` +
        `<div class="hslbl">${label}</div>` +
      '</div>'
    );
  }

  const score = esc(hs.score);
  const outOf = esc(hs.outOf != null ? hs.outOf : 100);
  return (
    '<div class="zb ctr">' +
      `<div class="hsc"><span class="hscn">${score}</span><span class="hscd"> / ${outOf}</span></div>` +
      `<div><div class="hsbadge${toneClass}">${badge}</div></div>` +
      `<div class="hslbl">${label}</div>` +
    '</div>'
  );
}

module.exports = { healthScoreHero };
