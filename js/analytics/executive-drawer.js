/* ============================================================
   EXECUTIVE-DRAWER.JS — The ONE drawer grammar (v1.18.3 Foundation)

   Part of the Executive UI Kit. A single side-drawer that every future
   consumer will use — replacing the three near-identical drawers today
   (.vad-* vehicle, .dwd-* wellness, .drx-* decision-replay), whose own
   headers already admit they copy each other's grammar.

   PURE PRESENTATION + lifecycle. It renders content it is handed; it
   computes nothing. The overlay root carries `class="exec-ui v2-analytics-claude"`
   so it inherits the canonical token set AND the dark-mode variant for free,
   even though it attaches to <body> (outside any analytics scope).

   Capabilities (Sprint-1 deliverable):
     • overlay + click-outside dismiss
     • focus trap (Tab / Shift+Tab cycle within the panel)
     • ESC to close
     • keyboard navigation (focus moves into panel on open, restores on close)
     • mobile responsive (slides up as a bottom-sheet ≤640px)
     • footer action slot
     • section slot (titled content blocks)
     • timeline slot (vertical event rail)
     • metric slot (label/value grid)

   Single-instance: opening a new drawer replaces any open one. Styles live in
   platform.css under `.exec-drawer*`.

   NOTE: This file migrates NO existing drawer. It only makes the primitive
   available for Sprint 2+.
   ============================================================ */

'use strict';

import { anIcon } from './analytics-shell.js';

const OVERLAY_ID = 'execDrawerOverlay';
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

let _keyHandler = null;
let _lastFocus = null;

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ── Slot builders (exported so consumers can compose body HTML directly) ──── */

/** Titled section block. */
export function execDrawerSection({ title = '', content = '' } = {}) {
  const head = title ? `<div class="exec-drawer-sec__h">${esc(title)}</div>` : '';
  return `<section class="exec-drawer-sec">${head}<div class="exec-drawer-sec__b">${content}</div></section>`;
}

/** Metric grid (label/value pairs). */
export function execDrawerMetrics(items = []) {
  const valid = (items || []).filter(Boolean);
  if (!valid.length) return '';
  return `<div class="exec-drawer-metrics">${valid.map((m) => `
      <div class="exec-drawer-metric">
        <div class="exec-drawer-metric__l">${esc(m.label)}</div>
        <div class="exec-drawer-metric__v"${m.tone ? ` data-tone="${esc(m.tone)}"` : ''}>${m.value == null ? '—' : esc(m.value)}</div>
        ${m.sub ? `<div class="exec-drawer-metric__s">${esc(m.sub)}</div>` : ''}
      </div>`).join('')}</div>`;
}

/** Vertical timeline rail. */
export function execDrawerTimeline(events = []) {
  const valid = (events || []).filter(Boolean);
  if (!valid.length) return '';
  const tones = new Set(['ok', 'info', 'warn', 'danger']);
  return `<ul class="exec-drawer-tl">${valid.map((e) => {
    const tone = tones.has(e.tone) ? e.tone : 'info';
    return `<li class="exec-drawer-tl__li">
        <span class="exec-drawer-tl__rail"><span class="exec-drawer-tl__dot exec-drawer-tl__dot--${tone}"></span></span>
        <div class="exec-drawer-tl__body">
          <div class="exec-drawer-tl__top">${e.when ? `<span class="exec-drawer-tl__when">${esc(e.when)}</span>` : ''}<span class="exec-drawer-tl__title">${esc(e.title)}</span></div>
          ${e.desc ? `<div class="exec-drawer-tl__d">${esc(e.desc)}</div>` : ''}
        </div>
      </li>`;
  }).join('')}</ul>`;
}

/* ── Assembly ──────────────────────────────────────────────────────────────── */

function buildFooter(actions = []) {
  const valid = (actions || []).filter(Boolean);
  if (!valid.length) return '';
  return `<div class="exec-drawer__foot">${valid.map((a) => {
    const variant = a.variant === 'primary' ? ' exec-drawer-btn--primary'
      : a.variant === 'danger' ? ' exec-drawer-btn--danger' : '';
    return `<button type="button" class="exec-drawer-btn${variant}" data-exec-drawer-action="${esc(a.action || '')}">${esc(a.label)}</button>`;
  }).join('')}</div>`;
}

/**
 * Open (or replace) the canonical drawer.
 *
 * @param {Object} p
 * @param {string} p.title
 * @param {string} [p.subtitle]
 * @param {string} [p.icon]               - anIcon name for the header glyph
 * @param {string} [p.body]               - pre-built HTML (compose with the slot helpers)
 * @param {Array<{label,action?,variant?}>} [p.footer]
 * @param {Function} [p.onAction]         - (actionName, close) => void  for footer buttons
 * @param {Function} [p.onClose]
 * @returns {HTMLElement|null} the overlay root (null in non-DOM env)
 */
export function openExecutiveDrawer({
  title = '', subtitle = '', icon = 'drawer', body = '',
  footer = [], onAction = null, onClose = null,
} = {}) {
  if (typeof document === 'undefined') return null;
  closeExecutiveDrawer();
  _lastFocus = document.activeElement;

  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.className = 'exec-ui v2-analytics-claude exec-drawer-overlay';
  overlay.innerHTML = `
    <aside class="exec-drawer" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <header class="exec-drawer__head">
        <div class="exec-drawer__titles">
          <div class="exec-drawer__title"><span class="exec-drawer__ico" aria-hidden="true">${anIcon(icon, { size: 18 })}</span>${esc(title)}</div>
          ${subtitle ? `<div class="exec-drawer__sub">${esc(subtitle)}</div>` : ''}
        </div>
        <button type="button" class="exec-drawer__close" aria-label="Tutup">${anIcon('x', { size: 18 })}</button>
      </header>
      <div class="exec-drawer__body">${body}</div>
      ${buildFooter(footer)}
    </aside>`;

  const close = () => closeExecutiveDrawer(onClose);

  // Click-outside (overlay backdrop only) + close button.
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) { close(); return; }
    if (e.target.closest('.exec-drawer__close')) { close(); return; }
    const actBtn = e.target.closest('[data-exec-drawer-action]');
    if (actBtn && typeof onAction === 'function') {
      onAction(actBtn.getAttribute('data-exec-drawer-action'), close);
    }
  });

  document.body.appendChild(overlay);
  // Trigger the enter transition on the next frame.
  requestAnimationFrame(() => overlay.classList.add('is-open'));

  // ESC + focus trap.
  _keyHandler = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'Tab') _trapTab(overlay, e);
  };
  document.addEventListener('keydown', _keyHandler);

  // Move focus into the panel.
  const first = overlay.querySelector('.exec-drawer__close');
  if (first) first.focus();

  return overlay;
}

/** Close + remove the drawer (short fade) and unbind handlers. */
export function closeExecutiveDrawer(onClose = null) {
  if (typeof document === 'undefined') return;
  if (_keyHandler) { document.removeEventListener('keydown', _keyHandler); _keyHandler = null; }
  const overlay = document.getElementById(OVERLAY_ID);
  if (!overlay) return;
  overlay.classList.remove('is-open');
  const done = () => {
    overlay.remove();
    if (_lastFocus && typeof _lastFocus.focus === 'function') { try { _lastFocus.focus(); } catch (_) {} }
    _lastFocus = null;
    if (typeof onClose === 'function') { try { onClose(); } catch (_) {} }
  };
  // Remove after the CSS transition (fallback timer keeps it robust).
  let removed = false;
  const once = () => { if (removed) return; removed = true; done(); };
  overlay.addEventListener('transitionend', once, { once: true });
  setTimeout(once, 260);
}

function _trapTab(overlay, e) {
  const panel = overlay.querySelector('.exec-drawer');
  if (!panel) return;
  const nodes = Array.from(panel.querySelectorAll(FOCUSABLE)).filter((n) => n.offsetParent !== null || n === document.activeElement);
  if (!nodes.length) return;
  const first = nodes[0], last = nodes[nodes.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}
