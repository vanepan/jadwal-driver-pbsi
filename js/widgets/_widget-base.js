/* ============================================================
   _WIDGET-BASE.JS — v1.19.9 Executive Command Center

   Shared, PURE presentation helpers for workspace widgets. No DOM queries,
   no Firebase, no business logic — every helper returns an HTML string built
   from already-shaped data. Deep links are emitted as declarative
   `data-wsp-action` / `data-wsp-detail` hooks; the renderer wires them to
   ctx.actions once (event delegation), so widgets stay logic-free.

   Widget contract (each widget object in a group's `widgets` map):
     {
       render(ctx) -> htmlString,      // required
       onMount?(bodyEl, ctx)           // optional; most widgets need none
     }
   Card chrome (title/span) comes from the Widget Registry, not the widget.
   ============================================================ */

'use strict';

/** HTML-escape a value for safe interpolation. */
export function esc(value) {
  const d = document.createElement('div');
  d.textContent = String(value ?? '');
  return d.innerHTML;
}

/** Empty-state block — the ONE way widgets render "no data". */
export function empty(message = 'Belum ada data') {
  return `<div class="wsp-empty">${esc(message)}</div>`;
}

/** A labelled statistic tile. `tone` ∈ good|warn|danger|info|neutral.
 *  `countUp` (Phase 7C, opt-in — every existing caller omits it, so their
 *  output is byte-for-byte unchanged) marks a finite numeric value with
 *  `data-countup` for a widget's own onMount to animate 0 -> value, the
 *  same mechanism the Hero's pulse stats already use. Purely a data
 *  attribute — inert unless something reads it.
 *  `barPct` (Phase 7D, opt-in, 0-100) draws a comparative bar under the
 *  value — the CALLER computes it (typically value/maxOfTheSet*100, a
 *  same-unit comparison across the tiles shown together), never a
 *  percentage of an unknown/invented total. Omitted keeps output
 *  unchanged.
 *  `barKey` (Premium Pass, opt-in) gives the bar a stable identity across a
 *  live refresh so the caller's onMount can smoothly MORPH its width from
 *  the last-shown value instead of snapping (see index.js's
 *  mountBarReveal) — omitted, the bar still renders (starts at 0%, caller
 *  is responsible for revealing it) but is never tracked across refreshes. */
export function metric(label, value, { sub = '', tone = 'neutral', countUp = false, barPct = null, barKey = '' } = {}) {
  const numeric = countUp && typeof value === 'number' && Number.isFinite(value);
  const bar = barPct == null ? '' : `<div class="wsp-metric__bar-track"><div class="wsp-metric__bar-fill" data-bar-target="${Math.max(0, Math.min(100, barPct))}"${barKey ? ` data-bar-key="${esc(barKey)}"` : ''} style="width:0%"></div></div>`;
  return `
    <div class="wsp-metric wsp-metric--${esc(tone)}">
      <div class="wsp-metric__value"${numeric ? ` data-countup="${esc(value)}"` : ''}>${numeric ? '0' : esc(value)}</div>
      <div class="wsp-metric__label">${esc(label)}</div>
      ${bar}
      ${sub ? `<div class="wsp-metric__sub">${esc(sub)}</div>` : ''}
    </div>`;
}

/** Wrap a set of metric() tiles in a responsive strip. */
export function metricRow(inner) {
  return `<div class="wsp-metric-row">${inner}</div>`;
}

/** Small status pill. */
export function pill(text, tone = 'neutral') {
  return `<span class="wsp-pill wsp-pill--${esc(tone)}">${esc(text)}</span>`;
}

/**
 * A single list row. `detailId` (optional) makes the whole row a keyboard-
 * accessible button that opens the existing detail modal via the renderer.
 * `dotStyle` (optional, v1.30.9.14) — an inline CSS string overriding the
 * dot's tone-based background/shape, for callers rendering a per-entity
 * color+shape identity (e.g. vehicle hue+shape) rather than a status tone.
 * `action`/`arg` (optional, Phase 7) — same clickable-row treatment as
 * `detailId`, but dispatches through the generic `data-wsp-action` contract
 * instead of the assignment-only `ctx.actions.openDetail`. Lets a row open
 * ANY declarative action (e.g. a different entity's own drawer) without a
 * second row-button implementation. `detailId` takes precedence if both are
 * somehow passed. Every existing caller omits both, so their output is
 * byte-for-byte unchanged.
 */
export function listRow({ title, meta = '', trailing = '', tone = 'neutral', detailId = null, dotStyle = '', action = null, arg = '' }) {
  const inner = `
    <span class="wsp-row__dot wsp-row__dot--${esc(tone)}" ${dotStyle ? `style="${esc(dotStyle)}"` : ''} aria-hidden="true"></span>
    <span class="wsp-row__main">
      <span class="wsp-row__title">${esc(title)}</span>
      ${meta ? `<span class="wsp-row__meta">${esc(meta)}</span>` : ''}
    </span>
    ${trailing ? `<span class="wsp-row__trailing">${esc(trailing)}</span>` : ''}`;
  if (detailId != null) {
    return `<button type="button" class="wsp-row wsp-row--click" data-wsp-detail="${esc(detailId)}">${inner}</button>`;
  }
  if (action != null) {
    return `<button type="button" class="wsp-row wsp-row--click" data-wsp-action="${esc(action)}"${arg !== '' ? ` data-wsp-arg="${esc(arg)}"` : ''}>${inner}</button>`;
  }
  return `<div class="wsp-row">${inner}</div>`;
}

/** Join list rows in a list container. */
export function list(rows) {
  return `<div class="wsp-list">${rows}</div>`;
}

/**
 * A deep-link / action button. `action` is a key on ctx.actions; the renderer
 * invokes ctx.actions[action](arg) on click. `variant` ∈ primary|ghost.
 */
export function actionBtn(label, action, { arg = '', variant = 'ghost', icon = '' } = {}) {
  return `<button type="button" class="wsp-btn wsp-btn--${esc(variant)}" data-wsp-action="${esc(action)}"${arg !== '' ? ` data-wsp-arg="${esc(arg)}"` : ''}>${icon ? `<span class="wsp-btn__icon" aria-hidden="true">${icon}</span>` : ''}<span>${esc(label)}</span></button>`;
}

/** A grid of action buttons (Quick Actions widgets). */
export function actionGrid(buttons) {
  return `<div class="wsp-actions">${buttons.join('')}</div>`;
}

/**
 * A launcher chip — an icon + label deep-link. On mobile the chip row scrolls
 * horizontally (see .wsp-chips in workspace-styles). `action` is a ctx.actions key.
 */
export function chip(label, action, { arg = '', icon = '' } = {}) {
  return `<button type="button" class="wsp-chip" data-wsp-action="${esc(action)}"${arg !== '' ? ` data-wsp-arg="${esc(arg)}"` : ''}>${icon ? `<span class="wsp-chip__icon" aria-hidden="true">${icon}</span>` : ''}<span>${esc(label)}</span></button>`;
}

/** A horizontally-scrollable row of launcher chips. */
export function chipRow(chips) {
  return `<div class="wsp-chips">${chips.join('')}</div>`;
}

/** A short lead sentence for a widget body. */
export function lead(text) {
  return `<p class="wsp-lead">${esc(text)}</p>`;
}

/** "Coming soon" placeholder body — Engineering + not-yet-wired surfaces. */
export function placeholder(message = 'Segera hadir.') {
  return `<div class="wsp-placeholder">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
         stroke-linecap="round" stroke-linejoin="round" width="26" height="26" aria-hidden="true">
      <circle cx="12" cy="12" r="9"/><path d="M12 8v4l2.5 2.5"/>
    </svg>
    <span>${esc(message)}</span>
  </div>`;
}
