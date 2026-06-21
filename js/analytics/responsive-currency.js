/* ============================================================
   RESPONSIVE-CURRENCY.JS — container-aware currency sizing (v1.15.3)

   Phase A1 of the Executive Analytics hardening. Currency cells produced by
   renderResponsiveCurrency() (analytics-shell.js) carry four representations as
   data-* attributes. This module measures each cell's ACTUAL container width
   with a ResizeObserver and swaps the visible text to the widest form that fits
   — independent of the viewport, so it stays correct under DevTools, split-
   screen, foldables and tablet landscape where viewport ≠ available card width.

   No calculations, no currency logic — purely picks a pre-rendered string.
   Tiers (container content-box width):
     ≥240px → full     "Rp 10.000.000"
     180–240 → rp       "Rp 10 Jt"
     130–180 → jt       "10 Jt"
     <130    → tight    "10Jt"
   ============================================================ */

'use strict';

/** One ResizeObserver per root (executive view, etc.), so re-renders rebind cleanly. */
const _observers = new WeakMap();

function tierKey(width) {
  if (width >= 240) return 'curFull';
  if (width >= 180) return 'curRp';
  if (width >= 130) return 'curJt';
  return 'curTight';
}

/** Set a currency cell's text to the form matching its container width. */
function applyTier(cell, width) {
  if (!width) return; // pre-layout / hidden → keep the full default, don't flash "10Jt"
  const next = cell.dataset[tierKey(width)];
  if (next != null && cell.textContent !== next) cell.textContent = next;
}

/**
 * Bind (or rebind) container-aware sizing for every `.an-cur` under `root`.
 * Idempotent per root: a prior observer is disconnected first, so calling this
 * after each render is safe and leak-free. No-op (full value stays) when
 * ResizeObserver is unavailable.
 * @param {Element|null} root
 */
export function bindResponsiveCurrency(root) {
  if (!root || typeof ResizeObserver === 'undefined') return;

  const prev = _observers.get(root);
  if (prev) prev.disconnect();

  const ro = new ResizeObserver(entries => {
    for (const entry of entries) {
      const cell = entry.target.querySelector(':scope > .an-cur');
      if (cell) applyTier(cell, entry.contentRect.width);
    }
  });

  root.querySelectorAll('.an-cur').forEach(cell => {
    const container = cell.parentElement;
    if (!container) return;
    ro.observe(container);
    applyTier(cell, container.clientWidth); // immediate first pass (pre-observer-callback)
  });

  _observers.set(root, ro);
}

/** Release the observer for a root (call on view close). */
export function unbindResponsiveCurrency(root) {
  if (!root) return;
  const ro = _observers.get(root);
  if (ro) { ro.disconnect(); _observers.delete(root); }
}
