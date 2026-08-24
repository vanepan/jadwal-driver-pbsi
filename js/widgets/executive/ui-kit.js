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
import { anIcon } from '../../analytics/analytics-shell.js';

/** Phase 7D — domain -> canonical icon (anIcon()), used by rankedItem()'s
 *  severity badge. Reuses the exact domain vocabulary exec-attention
 *  already assigns (see index.js's items.push() calls) — no new
 *  classification, just an icon per existing label. */
const DOMAIN_ICON = { Operations: 'operations', Engineering: 'maintenance', Finance: 'pettycash' };

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
 *  severityRow(); markup and CSS classes are unchanged.
 *  v1.30.10.x — optional `i.domain` (a display label like "Operations" /
 *  "Finance" / "Warehouse" / "Engineering", already implied by each item's
 *  own `action` destination in exec-attention — no new classification
 *  logic, just a label) renders as an eyebrow above the title, and the CTA
 *  switches to the 'link' variant (text + arrow, styled in
 *  workspace-styles.js) — both purely presentational, `i.domain` omitted
 *  keeps any other caller byte-for-byte unchanged. */
export function rankedItem(i) {
  const m = SEV_META[i.sev];
  // Phase 7D — a colored domain-icon badge replaces the plain severity dot
  // for rows that carry `i.domain` (every real Attention row does); rows
  // without one (none today, kept for safety) fall back to the original
  // small bar so no caller's output silently breaks.
  const icon = i.domain && DOMAIN_ICON[i.domain];
  const marker = icon
    ? `<span class="wsp-sevrow__icon wsp-sevrow__icon--${i.sev}" aria-hidden="true">${anIcon(icon, { size: 16 })}</span>`
    : `<span class="wsp-sevrow__bar" aria-hidden="true"></span>`;
  return `
    <div class="wsp-sevrow wsp-sevrow--${i.sev} fade-up">
      ${marker}
      <div class="wsp-sevrow__body">
        ${i.domain ? `<div class="wsp-sevrow__domain">${esc(i.domain)}</div>` : ''}
        <div class="wsp-sevrow__title">${i.domain ? '' : `<span class="wsp-sevrow__sev">${esc(m.label)}</span>`}${esc(i.title)}</div>
        <div class="wsp-sevrow__reason">${esc(i.reason)}</div>
      </div>
      ${i.action ? actionBtn(i.actionLabel, i.action, { variant: i.domain ? 'link' : 'ghost' }) : ''}
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

/** v1.30.10.6 — Quick Nav destination tile: icon-over-label, no border/pill
 *  background at rest (spec: "refined contextual navigation... not a giant
 *  pill collection"). Writes the same data-wsp-action/data-wsp-arg contract
 *  actionBtn/chip already use, consumed by workspace-renderer.js's single
 *  delegated click handler — no new wiring needed.
 *  Phase 7D — `d.tint` ('op'|'intel', optional) colors the icon's badge
 *  background; every existing caller omits it (byte-for-byte unchanged). */
export function launcherItem(d) {
  const tintClass = d.tint ? ` wsp-launcher__icon--${esc(d.tint)}` : '';
  return `
    <button type="button" class="wsp-launcher__item" data-wsp-action="${esc(d.action)}"${d.arg ? ` data-wsp-arg="${esc(d.arg)}"` : ''}>
      <span class="wsp-launcher__icon${tintClass}" aria-hidden="true">${d.icon || ''}</span>
      <span class="wsp-launcher__label">${esc(d.label)}</span>
    </button>`;
}

/** Destination board wrapper — a responsive grid, not a wrapped pill row. */
export function launcherGrid(items) {
  return `<div class="wsp-launcher">${items.map(launcherItem).join('')}</div>`;
}

/** Phase 7D — the Launcher as a grouped "app switcher": one labeled section
 *  per `d.group`, each its own launcherGrid(). `sections` is
 *  [{ id, label, tint, items }]; a section with no items is skipped
 *  (role-filtering can empty one group without leaving a headerless gap). */
export function launcherGroups(sections) {
  return sections
    .filter(s => s.items.length)
    .map(s => `
      <div class="wsp-launcher-group">
        <div class="wsp-launcher-group__label">${esc(s.label)}</div>
        ${launcherGrid(s.items.map(it => ({ ...it, tint: s.tint })))}
      </div>`)
    .join('');
}
