/* ============================================================
   MODAL-A11Y.JS — SS17: bolt-on focus trap + Escape + focus-restore
   for hand-rolled modal overlays that predate js/components/drawer.js
   and are too large/risky to migrate onto it wholesale in this phase
   (Command Palette, Notifications/Activity Log, Profile/Settings,
   the 3 legacy assignment satellite modals in js/modal.js, Engineering's
   create/report modal).

   Same algorithm js/components/drawer.js's openDrawer() already uses
   internally (identical FOCUSABLE selector, identical Tab-wrap logic,
   identical "remember what had focus, restore it on close" contract) —
   packaged for reuse instead of duplicated, per this codebase's own
   convention of each module owning a *small* version of a shared
   algorithm rather than forcing every caller onto one heavyweight
   primitive (see js/ui/focus-preserving-render.js's header re:
   engineering-center.js's own purpose-built variant).

   `overlayRef` may be the overlay element itself, OR a () => element
   getter — pass a getter for a module (e.g. Engineering's create modal)
   that replaces the overlay's DOM node on every re-render while it's
   open; the trap then always queries the CURRENT node instead of a
   stale detached one.

   SS18 — `restoreFocusTo` accepts the same element-or-getter shape. A
   plain element is captured once, at attach time — correct for a
   PERSISTENT element a re-render never touches (Command Palette's own
   trigger button, the topbar's notification bell/avatar). A () => element
   getter is resolved lazily, at release() time instead — required for a
   caller whose trigger button lives INSIDE the same subtree a full
   `root.innerHTML = ...` re-render replaces (e.g. Overtime's per-screen
   "+ Tambah .../Ubah Tarif" buttons): even the very close that ends the
   dialog re-renders that subtree, so an element reference captured at
   attach time — including the implicit default, document.activeElement —
   is already a detached, stale node by the time release() runs and would
   silently fail to refocus anything.

   Usage:
     const handle = attachModalA11y(overlayEl, { onEscape: closeFn });
     // ...later, when the modal closes:
     handle.release();
   ============================================================ */

'use strict';

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * @param {HTMLElement|(() => HTMLElement)} overlayRef
 * @param {Object} [opts]
 * @param {Function} [opts.onEscape] - called on Escape; omit if the
 *   caller already owns its own Escape handling elsewhere (avoids
 *   double-closing).
 * @param {HTMLElement|(() => HTMLElement)} [opts.initialFocus] - element to
 *   focus on attach; defaults to the first focusable node in the overlay.
 * @param {HTMLElement|(() => HTMLElement)} [opts.restoreFocusTo] - element
 *   (captured now) or getter (resolved at release() time — see header) to
 *   refocus on release(); defaults to document.activeElement at attach
 *   time (the trigger, assuming attach happens synchronously from its
 *   click/keydown).
 * @param {boolean} [opts.focusOnAttach=true] - false when the caller
 *   already owns moving focus in (e.g. its own setTimeout-based focus).
 * @param {boolean} [opts.restoreOnRelease=true] - false to skip the
 *   focus-restore step entirely (only remove the trap listener) — for a
 *   caller whose own close path already re-focuses something sensible
 *   (e.g. reopening a drawer) and where re-focusing a stale/about-to-be-
 *   removed trigger would fight that.
 * @returns {{release: () => void}}
 */
export function attachModalA11y(overlayRef, {
  onEscape = null,
  initialFocus = null,
  restoreFocusTo = null,
  focusOnAttach = true,
  restoreOnRelease = true,
} = {}) {
  const getOverlay = typeof overlayRef === 'function' ? overlayRef : () => overlayRef;
  if (!getOverlay()) return { release() {} };

  // NOT resolved yet if restoreFocusTo is a function — see header. The
  // implicit default (no restoreFocusTo given) still snapshots
  // document.activeElement as a plain element right now, unchanged from
  // the original contract.
  const lastFocusRef = restoreOnRelease ? (restoreFocusTo || document.activeElement) : null;

  const focusables = () => {
    const el = getOverlay();
    if (!el) return [];
    return Array.from(el.querySelectorAll(FOCUSABLE)).filter((n) => n.offsetParent !== null || n === document.activeElement);
  };

  if (focusOnAttach) {
    const toFocus = (typeof initialFocus === 'function' ? initialFocus() : initialFocus) || focusables()[0];
    if (toFocus && typeof toFocus.focus === 'function') toFocus.focus();
  }

  const onKeydown = (e) => {
    if (e.key === 'Escape') { if (typeof onEscape === 'function') onEscape(); return; }
    if (e.key !== 'Tab') return;
    const nodes = focusables();
    if (!nodes.length) return;
    const first = nodes[0], last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  document.addEventListener('keydown', onKeydown);

  return {
    release() {
      document.removeEventListener('keydown', onKeydown);
      if (!lastFocusRef) return;
      const target = typeof lastFocusRef === 'function' ? lastFocusRef() : lastFocusRef;
      if (target && typeof target.focus === 'function') { try { target.focus(); } catch (_) {} }
    },
  };
}
