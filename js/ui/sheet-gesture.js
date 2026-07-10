/* ============================================================
   SHEET-GESTURE.JS — Phase 11K, shared bottom-sheet swipe-to-dismiss

   ONE gesture implementation for every bottom sheet in the app (the
   "Lainnya" more-menu, Notifications, Profile, and the request-mode
   confirmation sheet) — replaces the request-mode sheet's older bespoke
   wireSwipe() and adds swipe support to the three sheets that previously
   had none. Modeled on the mobile drawer's already-proven gesture pattern
   (js/app.js, Phase 11C: drag-vs-scroll disambiguation, live-follow via
   inline transform, commit-the-state-change-before-clearing-inline-styles
   so the CSS transition never snaps), plus three capabilities no existing
   sheet had: a velocity threshold, backdrop-opacity interpolation, and a
   scroll-position gate so a sheet with its own scrollable content only
   arms the dismiss-drag once that content is already scrolled to top
   (the standard iOS/Android "nested scroll" convention).

   Pure DOM/gesture utility — no business logic, no app state beyond a
   small reference count for the shared body-scroll lock.
   ============================================================ */

'use strict';

const DRAG_SLOP = 10; // px of initial movement before committing to drag-vs-scroll

/**
 * Wire swipe-to-dismiss on a bottom sheet. Call once per sheet element
 * (idempotent per element via a WeakSet guard) — mirrors how the drawer's
 * gesture listeners and request-mode-selector's old wireSwipe() were each
 * wired once at init, not re-wired per open.
 *
 * @param {HTMLElement} sheetEl     the panel that translates/animates (e.g. .bottom-sheet, .req-sheet, .modal-box)
 * @param {HTMLElement} backdropEl  the dimmed backdrop behind it (its opacity is interpolated during drag)
 * @param {() => void} onDismiss    called once the drag commits past a threshold — should run the sheet's own existing close function
 * @param {Object} [opts]
 * @param {HTMLElement} [opts.scrollEl]        the sheet's own internal scroll container, if different from sheetEl (defaults to sheetEl)
 * @param {number} [opts.distanceThreshold]    px dragged down before a released drag commits (default 80)
 * @param {number} [opts.velocityThreshold]    px/ms at release above which a drag commits regardless of distance (default 0.5)
 */
const wiredSheets = new WeakSet();

export function wireSheetSwipeDismiss(sheetEl, backdropEl, onDismiss, opts = {}) {
  if (!sheetEl || wiredSheets.has(sheetEl)) return;
  wiredSheets.add(sheetEl);

  const scrollEl = opts.scrollEl || sheetEl;
  const distanceThreshold = opts.distanceThreshold ?? 80;
  const velocityThreshold = opts.velocityThreshold ?? 0.5;

  let startY = null;
  let startT = 0;
  let dragging = false;
  let armed = false; // true once scroll-top gate + slop are both satisfied

  sheetEl.addEventListener('touchstart', (e) => {
    startY = e.touches[0].clientY;
    startT = e.timeStamp;
    dragging = false;
    // Nested-scroll gate: only allow a dismiss-drag to arm when the sheet's
    // own scrollable content is already at the top — otherwise the touch is
    // left alone to scroll that content normally.
    armed = scrollEl.scrollTop <= 0;
  }, { passive: true });

  sheetEl.addEventListener('touchmove', (e) => {
    if (startY == null || !armed) return;
    const dy = e.touches[0].clientY - startY;
    if (!dragging) {
      if (dy < DRAG_SLOP) return; // ignore upward drags and sub-slop jitter
      dragging = true;
      sheetEl.style.transition = 'none';
      if (backdropEl) backdropEl.style.transition = 'none';
    }
    sheetEl.style.transform = `translateY(${dy}px)`;
    if (backdropEl) {
      const fade = 1 - Math.min(dy / (sheetEl.offsetHeight || 1), 1);
      backdropEl.style.opacity = String(fade);
    }
  }, { passive: true });

  sheetEl.addEventListener('touchend', (e) => {
    if (startY == null) return;
    if (dragging) {
      const t = e.changedTouches[0];
      const dy = t.clientY - startY;
      const dt = Math.max(1, e.timeStamp - startT);
      const velocity = dy / dt;
      const commit = dy > distanceThreshold || velocity > velocityThreshold;

      // Commit (or leave state as-is for a spring-back) FIRST, while the
      // inline drag transform/opacity are still in full control — so the
      // state change is invisible at this instant. Only then release the
      // inline overrides, deferred one frame, so the browser has a real
      // painted "from" position (the drag position) to interpolate from
      // via the sheet's own CSS transition — same fix as the drawer's
      // touchend in Phase 11C, generalized here.
      if (commit) onDismiss();
      requestAnimationFrame(() => {
        sheetEl.style.transition = '';
        sheetEl.style.transform = '';
        if (backdropEl) {
          backdropEl.style.transition = '';
          backdropEl.style.opacity = '';
        }
      });
    }
    startY = null;
    dragging = false;
    armed = false;
  });
}

let lockCount = 0;

/** Reference-counted body scroll lock — safe if two sheets' open/close ever overlap in timing. */
export function lockBodyScroll() {
  lockCount += 1;
  document.body.classList.add('sheet-scroll-lock');
}

export function unlockBodyScroll() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) document.body.classList.remove('sheet-scroll-lock');
}
