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

/** A labelled statistic tile. `tone` ∈ good|warn|danger|info|neutral. */
export function metric(label, value, { sub = '', tone = 'neutral' } = {}) {
  return `
    <div class="wsp-metric wsp-metric--${esc(tone)}">
      <div class="wsp-metric__value">${esc(value)}</div>
      <div class="wsp-metric__label">${esc(label)}</div>
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
 */
export function listRow({ title, meta = '', trailing = '', tone = 'neutral', detailId = null }) {
  const inner = `
    <span class="wsp-row__dot wsp-row__dot--${esc(tone)}" aria-hidden="true"></span>
    <span class="wsp-row__main">
      <span class="wsp-row__title">${esc(title)}</span>
      ${meta ? `<span class="wsp-row__meta">${esc(meta)}</span>` : ''}
    </span>
    ${trailing ? `<span class="wsp-row__trailing">${esc(trailing)}</span>` : ''}`;
  if (detailId != null) {
    return `<button type="button" class="wsp-row wsp-row--click" data-wsp-detail="${esc(detailId)}">${inner}</button>`;
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
