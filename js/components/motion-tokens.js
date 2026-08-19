/* ============================================================
   MOTION-TOKENS.JS — Design System Program Phase 3

   The app's first genuinely shared, app-wide motion token set (not scoped
   to one module). Values match the Design System Program's own specified
   motion language verbatim — micro/standard/scene tiers + one arrival
   easing — rather than inventing new arbitrary numbers.

   A small, deliberate seed for the roadmap's future Phase 8 (app-wide
   motion system), not a replacement for it: existing per-module motion
   (js/widgets/executive/motion-profiles.js, the Phase 2 drawer's own
   --drawer-dur/--drawer-ease CSS custom properties) is untouched — this
   file is additive, consumed by Phase 3's save-feedback primitive only.
   ============================================================ */

'use strict';

export const MICRO_MS = 120;
export const STANDARD_MS = 240;
export const SCENE_MS = 550;
export const EASE_ARRIVE = 'cubic-bezier(.16,1,.3,1)';

/** Same contract as js/widgets/executive/index.js's motionOff() — duplicated
 *  rather than imported, since a js/components/ primitive shouldn't depend
 *  on a feature-specific Executive module. data-anim="off" is the app's own
 *  manual override switch; prefers-reduced-motion is the OS-level one. */
export function prefersReducedMotion() {
  if (typeof document === 'undefined') return true;
  if (document.documentElement.getAttribute('data-anim') === 'off') return true;
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; }
}
