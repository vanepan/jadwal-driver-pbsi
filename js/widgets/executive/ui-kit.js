/* ============================================================
   WIDGETS/EXECUTIVE/UI-KIT.JS — Phase 0 Executive Foundation

   Presentation-only primitives for the Executive widget group
   (js/widgets/executive/index.js). Extracted from markup/mappings that
   were previously duplicated or scattered inside index.js — same CSS
   classes, same output, zero visual change (pure refactor).

   Consumed ONLY by js/widgets/executive/*. Never imported by the
   request/driver/engineering widget groups — those keep using
   _widget-base.js exactly as before. This module extends the shared
   helper layer, it does not replace or modify it.
   ============================================================ */

'use strict';

import { esc, actionBtn } from '../_widget-base.js';

/** Canonical Executive tone vocabulary. Every mood / severity / engine
 *  tone in the Executive widgets resolves into one of these five keys
 *  before reaching a rendering helper — one output vocabulary, several
 *  input adapters (below), instead of each widget inventing its own. */
export const EXEC_TONES = ['good', 'warn', 'danger', 'info', 'neutral'];

/** score.level (executive-score-engine.js's healthLevel(), via
 *  executive-analytics.js) → Executive tone.
 *  v1.22.6 fix — this previously keyed on 'high'/'medium'/'low'/'insufficient',
 *  a vocabulary healthLevel() has never emitted (it returns 'excellent'/
 *  'good'/'fair'/'attention'; 'high'/'medium'/'low'/'insufficient' belongs to
 *  the unrelated computeConfidence() elsewhere in executive-analytics.js) —
 *  every non-nodata level silently fell through to the 'neutral' default. */
const LEVEL_TONE = { excellent: 'good', good: 'info', fair: 'warn', attention: 'warn', nodata: 'neutral' };
export function toneFromLevel(level) { return LEVEL_TONE[level] || 'neutral'; }

/** Recommendation-engine tone → Executive tone. */
const ENGINE_TONE = { ok: 'good', good: 'good', info: 'info', warn: 'warn', danger: 'danger', critical: 'danger' };
export function toneFromEngine(tone) { return ENGINE_TONE[tone] || 'neutral'; }

/** Severity ranking (critical before warn) shared by every section that
 *  sorts a mixed-severity list (Priority, Attention; Decision uses its
 *  own impact rank and is unaffected). */
const SEV_META = {
  critical: { rank: 0, label: 'Kritis' },
  warn: { rank: 1, label: 'Perlu Perhatian' },
};
export function severityRank(sev) {
  return SEV_META[sev] ? SEV_META[sev].rank : 99;
}

/** A single ranked/severity row — the shape shared today by Priority
 *  and Attention. Pure move from index.js's former private
 *  severityRow(); markup and CSS classes are unchanged. */
export function rankedItem(i) {
  const m = SEV_META[i.sev];
  return `
    <div class="wsp-sevrow wsp-sevrow--${i.sev}">
      <span class="wsp-sevrow__bar" aria-hidden="true"></span>
      <div class="wsp-sevrow__body">
        <div class="wsp-sevrow__title"><span class="wsp-sevrow__sev">${esc(m.label)}</span>${esc(i.title)}</div>
        <div class="wsp-sevrow__reason">${esc(i.reason)}</div>
      </div>
      ${i.action ? actionBtn(i.actionLabel, i.action, { variant: 'ghost' }) : ''}
    </div>`;
}

/** Ranked list, most-severe first (caller pre-sorts/slices). Pure move
 *  from index.js's former private severityList(). */
export function rankedList(items) {
  return `<div class="wsp-sevlist">${items.map(rankedItem).join('')}</div>`;
}

/** Compact single-line success state — used when a section has nothing
 *  to brief on. Pure move from index.js's former private
 *  compactSuccess(). */
export function compactSuccessLine(message) {
  return `<div class="wsp-compact-ok"><span class="wsp-compact-ok__dot" aria-hidden="true"></span>${esc(message)}</div>`;
}
