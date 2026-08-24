/* ============================================================
   DRAWER.JS — Design System Program Phase 2: THE canonical drawer

   Relocated and extended from js/analytics/executive-drawer.js (formerly
   "the ONE drawer" for Executive/Analytics content only). That file's
   mechanism was already correct — the only implementation, of six found in
   a full audit, with a real focus trap, Escape handling, focus restore,
   and a genuine CSS-driven mobile bottom-sheet — but its naming ("exec"),
   file location (js/analytics/), and capabilities were scoped to one
   module. This is the generalized, app-wide primitive: record
   detail/create/edit interactions across Driver Ops, Vehicles, Petty Cash,
   Overtime, Engineering, etc. all route through here, never a new drawer
   implementation of their own.

   PURE PRESENTATION + lifecycle. It renders content it is handed; it
   computes nothing and touches no Firebase/business logic. The overlay
   root carries `class="v2-analytics-claude drawer-overlay"` — v2-analytics-claude
   is kept (unchanged) because it's the scope class that makes global design
   tokens (dark mode included) resolve correctly for content appended
   directly to <body>, outside the normal page-content hierarchy; this has
   nothing to do with the Analytics module itself, despite the name.

   Capabilities (superset of the old .exec-drawer, additions marked NEW):
     • overlay + click-outside dismiss
     • focus trap (Tab / Shift+Tab cycle within the panel)
     • ESC to close
     • focus moves into panel on open, restores to the trigger on close
     • mobile responsive (bottom-sheet ≤640px)
     • footer action slot + section/metric/timeline body slots
     • NEW — loading / busy / error state (setLoading, setBusy, showError)
     • NEW — unsaved-changes guard (isDirty callback, confirmed before close)
     • NEW — source-element highlight while open (sourceEl option)
     • NEW — mobile drag-handle affordance + safe-area-inset padding
     • NEW — in-place body refresh without close/reopen (refreshDrawerBody)

   Single-instance: opening a new drawer replaces any open one. Styles live
   in platform.css under `.drawer*` (renamed from `.exec-drawer*` — the old
   selector is deleted, this is the only implementation left).
   ============================================================ */

'use strict';

import { anIcon } from '../analytics/analytics-shell.js';
import { lockBodyScroll, unlockBodyScroll } from '../ui/sheet-gesture.js';

const OVERLAY_ID = 'appDrawerOverlay';
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

let _keyHandler = null;
let _lastFocus = null;
let _sourceEl = null;
let _isDirty = null; // () => boolean, current instance's unsaved-changes check
// Tracks the live overlay directly instead of relying solely on
// document.getElementById(OVERLAY_ID) — closeDrawer()'s DOM removal is
// deferred (CSS transition), so a fast close-then-open (e.g. the Option A
// reopen-after-a-sub-modal pattern) could otherwise leave two elements
// sharing the same id, with getElementById resolving to the stale one.
let _activeOverlay = null;
// Design System Program Phase 8.2 hostile-review finding: _activeOverlay
// alone only guards the "caller replaces without ever calling closeDrawer()"
// path (openDrawer while _activeOverlay is still set). It does NOT guard a
// genuine close()-then-immediately-reopen (closeDrawer() nulls _activeOverlay
// synchronously, so a second openDrawer() inside the ~260ms fade-out window
// sees no active overlay to replace and appends a second OVERLAY_ID element
// while the first is still mid-removal). Bumped on every openDrawer() call
// and captured by closeDrawer()'s deferred cleanup so a superseded close's
// eventual transitionend/timeout becomes a no-op instead of firing stale
// focus-restore/onClose side effects after a newer drawer has already opened.
let _closeSeq = 0;

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ── Slot builders (exported so consumers can compose body HTML directly) ──── */

/** Titled section block. */
export function drawerSection({ title = '', content = '' } = {}) {
  const head = title ? `<div class="drawer-sec__h">${esc(title)}</div>` : '';
  return `<section class="drawer-sec">${head}<div class="drawer-sec__b">${content}</div></section>`;
}

/** Metric grid (label/value pairs). */
export function drawerMetrics(items = []) {
  const valid = (items || []).filter(Boolean);
  if (!valid.length) return '';
  return `<div class="drawer-metrics">${valid.map((m) => `
      <div class="drawer-metric">
        <div class="drawer-metric__l">${esc(m.label)}</div>
        <div class="drawer-metric__v"${m.tone ? ` data-tone="${esc(m.tone)}"` : ''}>${m.value == null ? '—' : esc(m.value)}</div>
        ${m.sub ? `<div class="drawer-metric__s">${esc(m.sub)}</div>` : ''}
      </div>`).join('')}</div>`;
}

/** Vertical timeline rail. */
export function drawerTimeline(events = []) {
  const valid = (events || []).filter(Boolean);
  if (!valid.length) return '';
  const tones = new Set(['ok', 'info', 'warn', 'danger']);
  return `<ul class="drawer-tl">${valid.map((e) => {
    const tone = tones.has(e.tone) ? e.tone : 'info';
    return `<li class="drawer-tl__li">
        <span class="drawer-tl__rail"><span class="drawer-tl__dot drawer-tl__dot--${tone}"></span></span>
        <div class="drawer-tl__body">
          <div class="drawer-tl__top">${e.when ? `<span class="drawer-tl__when">${esc(e.when)}</span>` : ''}<span class="drawer-tl__title">${esc(e.title)}</span></div>
          ${e.desc ? `<div class="drawer-tl__d">${esc(e.desc)}</div>` : ''}
        </div>
      </li>`;
  }).join('')}</ul>`;
}

/* ── Assembly ──────────────────────────────────────────────────────────────── */

function buildFooter(actions = []) {
  const valid = (actions || []).filter(Boolean);
  if (!valid.length) return '';
  return `<div class="drawer__foot">${valid.map((a) => {
    const variant = a.variant === 'primary' ? ' drawer-btn--primary'
      : a.variant === 'danger' ? ' drawer-btn--danger' : '';
    return `<button type="button" class="drawer-btn${variant}" data-drawer-action="${esc(a.action || '')}">${esc(a.label)}</button>`;
  }).join('')}</div>`;
}

function _highlightSource(el) {
  if (!el) return;
  _sourceEl = el;
  el.classList.add('drawer-source-highlight');
}
function _clearSourceHighlight() {
  if (_sourceEl) _sourceEl.classList.remove('drawer-source-highlight');
  _sourceEl = null;
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
 * @param {Function} [p.onAction]         - (actionName, close) => void for [data-drawer-action] clicks anywhere in the panel
 * @param {Function} [p.onClose]
 * @param {Function} [p.isDirty]          - () => boolean; when true, close() asks for confirmation first
 * @param {HTMLElement} [p.sourceEl]      - element to briefly highlight while the drawer is open
 * @param {boolean} [p.loading]           - render the loading skeleton instead of `body`
 * @returns {HTMLElement|null} the overlay root (null in non-DOM env)
 */
export function openDrawer({
  title = '', subtitle = '', icon = 'drawer', body = '',
  footer = [], onAction = null, onClose = null,
  isDirty = null, sourceEl = null, loading = false,
} = {}) {
  if (typeof document === 'undefined') return null;
  // Replacing, not user-dismissing: remove any previous instance INSTANTLY
  // (no animated teardown, no onClose firing) rather than calling
  // closeDrawer(), whose removal is deferred behind a CSS transition — a
  // fast close-then-reopen (e.g. Option A's "sub-modal closes, same
  // assignment's drawer reopens" contract) could otherwise leave two
  // elements sharing OVERLAY_ID for up to ~260ms, with lookups resolving to
  // the stale one instead of the new one.
  if (_activeOverlay) {
    if (_keyHandler) { document.removeEventListener('keydown', _keyHandler); _keyHandler = null; }
    _clearSourceHighlight();
    _activeOverlay.remove();
    _activeOverlay = null;
    unlockBodyScroll();
  }
  // Invalidate any closeDrawer() still mid-fade-out and hard-remove its
  // lingering node — covers the case _activeOverlay alone can't (see the
  // _closeSeq comment above): a real close() already happened, but its
  // deferred DOM removal hasn't fired yet.
  _closeSeq++;
  const _stale = document.getElementById(OVERLAY_ID);
  if (_stale) _stale.remove();
  _lastFocus = document.activeElement;
  _isDirty = typeof isDirty === 'function' ? isDirty : null;

  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.className = 'v2-analytics-claude drawer-overlay';
  overlay.innerHTML = `
    <aside class="drawer" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="drawer__grabber" aria-hidden="true"></div>
      <header class="drawer__head">
        <div class="drawer__titles">
          <div class="drawer__title"><span class="drawer__ico" aria-hidden="true">${anIcon(icon, { size: 18 })}</span>${esc(title)}</div>
          ${subtitle ? `<div class="drawer__sub">${esc(subtitle)}</div>` : ''}
        </div>
        <button type="button" class="drawer__close" aria-label="Tutup">${anIcon('x', { size: 18 })}</button>
      </header>
      <div class="drawer__error" data-drawer-error hidden></div>
      <div class="drawer__body" data-drawer-body>${loading ? drawerLoadingSkeleton() : body}</div>
      ${buildFooter(footer)}
    </aside>`;

  const requestClose = () => {
    if (_isDirty && _isDirty()) {
      // Small inline confirmation instead of a native confirm() — keeps the
      // "calm, local, inline" bar this design system holds error/interruption
      // UI to elsewhere in the program; unsaved-changes guard only, no
      // dedicated UI beyond a native confirm for now (this phase's actual
      // consumer, Assignment Detail, has no in-drawer form fields and never
      // triggers this path — built for the Create/Edit migration to come).
      if (!confirm('Perubahan belum disimpan. Tutup tanpa menyimpan?')) return;
    }
    closeDrawer(onClose);
  };

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) { requestClose(); return; }
    if (e.target.closest('.drawer__close')) { requestClose(); return; }
    const actBtn = e.target.closest('[data-drawer-action]');
    if (actBtn && typeof onAction === 'function') {
      onAction(actBtn.getAttribute('data-drawer-action'), () => closeDrawer(onClose));
    }
  });

  document.body.appendChild(overlay);
  _activeOverlay = overlay;
  lockBodyScroll();
  if (sourceEl) _highlightSource(sourceEl);
  // Trigger the enter transition on the next frame.
  requestAnimationFrame(() => overlay.classList.add('is-open'));

  // ESC + focus trap.
  _keyHandler = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); requestClose(); return; }
    if (e.key === 'Tab') _trapTab(overlay, e);
  };
  document.addEventListener('keydown', _keyHandler);

  // Move focus into the panel.
  const first = overlay.querySelector('.drawer__close');
  if (first) first.focus();

  // Mobile swipe-to-dismiss on the grabber (vertical drag only; desktop's
  // right-slide never uses this — the grabber itself is hidden ≥641px).
  _wireSwipeDismiss(overlay, requestClose);

  return overlay;
}

/** Close + remove the drawer (short fade) and unbind handlers. */
export function closeDrawer(onClose = null) {
  if (typeof document === 'undefined') return;
  if (_keyHandler) { document.removeEventListener('keydown', _keyHandler); _keyHandler = null; }
  _clearSourceHighlight();
  _isDirty = null;
  const overlay = _activeOverlay;
  if (!overlay) return;
  _activeOverlay = null;
  overlay.classList.remove('is-open');
  // This close "owns" cleanup only until a newer openDrawer()/closeDrawer()
  // bumps _closeSeq — if that happens before this fires, a newer drawer (or
  // its own close) already handled DOM removal, and firing this one's stale
  // focus-restore/onClose would be wrong (it'd act on the NEW drawer's state).
  const mySeq = ++_closeSeq;
  const done = () => {
    // Unconditional: every openDrawer() takes one lock, so every closeDrawer()
    // must release exactly one, even when a newer drawer has since superseded
    // this close (mySeq mismatch below only guards DOM removal/focus/onClose,
    // which must not act twice or on the wrong instance).
    unlockBodyScroll();
    if (mySeq !== _closeSeq) return;
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

/** Replace the currently-open drawer's body in place (no close/reopen
 *  animation) — e.g. after an in-drawer save completes. No-op if nothing
 *  is open. */
export function refreshDrawerBody(html) {
  const body = _activeOverlay?.querySelector('[data-drawer-body]');
  if (body) body.innerHTML = html;
}

/** Loading skeleton — three pulsing lines, same visual language as the
 *  Home workspace's existing `.wsp-skeleton` treatment. */
export function drawerLoadingSkeleton() {
  return '<div class="drawer-skeleton" aria-busy="true"><div class="skel-line"></div><div class="skel-line"></div><div class="skel-line" style="width:60%"></div></div>';
}
export function setDrawerLoading(loading) {
  const body = _activeOverlay?.querySelector('[data-drawer-body]');
  if (body && loading) body.innerHTML = drawerLoadingSkeleton();
}

/** Disable/enable every interactive control in the drawer (footer + body)
 *  while an action is in flight, with an optional label swap on the
 *  triggering button. Real functional state, not the full animated
 *  idle->saving->success choreography (that's Phase 3's app-wide save-
 *  feedback machine) — this just gives that future work something real
 *  to attach to instead of nothing. */
export function setDrawerBusy(busy, { triggerSelector = null, busyLabel = null } = {}) {
  const overlay = _activeOverlay;
  if (!overlay) return;
  overlay.querySelectorAll('button, input, select, textarea').forEach((el) => { el.disabled = busy; });
  if (triggerSelector) {
    const trigger = overlay.querySelector(triggerSelector);
    if (trigger) {
      if (busy) {
        if (trigger.dataset.drawerIdleLabel == null) trigger.dataset.drawerIdleLabel = trigger.textContent;
        if (busyLabel) trigger.textContent = busyLabel;
      } else if (trigger.dataset.drawerIdleLabel != null) {
        trigger.textContent = trigger.dataset.drawerIdleLabel;
        delete trigger.dataset.drawerIdleLabel;
      }
    }
  }
}

/** Inline error region at the top of the body — cleared by passing null/''. */
export function showDrawerError(message) {
  const overlay = _activeOverlay;
  if (!overlay) return;
  const el = overlay.querySelector('[data-drawer-error]');
  if (!el) return;
  if (!message) { el.hidden = true; el.textContent = ''; return; }
  el.hidden = false;
  el.textContent = message;
}

function _trapTab(overlay, e) {
  const panel = overlay.querySelector('.drawer');
  if (!panel) return;
  const nodes = Array.from(panel.querySelectorAll(FOCUSABLE)).filter((n) => n.offsetParent !== null || n === document.activeElement);
  if (!nodes.length) return;
  const first = nodes[0], last = nodes[nodes.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

/** Vertical drag-to-dismiss on the mobile grabber only (CSS hides it
 *  ≥641px, so this listener is harmless dead weight on desktop — it just
 *  never fires because the element has zero size/is not interactable). */
function _wireSwipeDismiss(overlay, requestClose) {
  const grabber = overlay.querySelector('.drawer__grabber');
  const panel = overlay.querySelector('.drawer');
  if (!grabber || !panel) return;
  let startY = null;
  grabber.addEventListener('touchstart', (e) => { startY = e.touches[0].clientY; panel.style.transition = 'none'; }, { passive: true });
  grabber.addEventListener('touchmove', (e) => {
    if (startY == null) return;
    const dy = Math.max(0, e.touches[0].clientY - startY);
    panel.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  grabber.addEventListener('touchend', (e) => {
    if (startY == null) return;
    const dy = Math.max(0, (e.changedTouches[0]?.clientY ?? startY) - startY);
    panel.style.transition = '';
    panel.style.transform = '';
    startY = null;
    if (dy > 80) requestClose();
  });
}
