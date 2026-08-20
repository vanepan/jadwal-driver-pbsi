/* ============================================================
   ENTRY-TRANSITION.JS — Design System Program Phase 6: PBSI
   Authentication & App Entry Transition

   PURE presentation orchestration for the login→shell success
   transition and its logout inverse. Never touches Firebase, auth
   state, session storage, or permissions — callers (js/auth.js)
   supply DOM references and a completion hook; this module only
   measures rects and drives CSS transforms/opacity. Built entirely
   on the existing motion-tokens.js values — no new easing/duration
   invented, no animation library.

   playLoginSuccessTransition() must only be invoked from a genuine
   submit-success path. Session restore never opens the login modal
   at all, so it never calls this — no separate guard needed here.
   ============================================================ */

'use strict';

import { MICRO_MS, STANDARD_MS, SCENE_MS, EASE_ARRIVE, prefersReducedMotion } from './motion-tokens.js';

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hideLoginScreen(loginScreenEl) {
  if (!loginScreenEl) return;
  loginScreenEl.style.display = 'none';
  loginScreenEl.style.pointerEvents = 'none';
  loginScreenEl.style.opacity = '';
  loginScreenEl.style.transition = '';
}

/**
 * Briefly animates the shell's top-level chrome in (rail, then main area) —
 * a small, restrained stagger, not a per-widget rewrite. Only called from
 * playLoginSuccessTransition() below — session restore deliberately gets NO
 * extra reveal animation (must "feel instant for returning users"), so this
 * stays unexported/internal rather than a general-purpose entry point.
 * @param {boolean} reduce
 */
function revealShell(reduce) {
  if (reduce) return;
  const targets = [
    document.querySelector('.domshell-rail'),
    document.querySelector('.main-area'),
  ].filter(Boolean);

  targets.forEach((el, i) => {
    el.classList.add('entry-reveal');
    el.style.animationDelay = `${i * MICRO_MS}ms`;
    const cleanup = () => {
      el.classList.remove('entry-reveal');
      el.style.animationDelay = '';
    };
    el.addEventListener('animationend', cleanup, { once: true });
    // Safety net — mirrors the house SS1-failsafe pattern (index.html) so a
    // missed animationend (e.g. element removed/re-rendered mid-flight)
    // can never leave the class/inline style stuck.
    setTimeout(cleanup, STANDARD_MS + 300);
  });
}

/**
 * Card → brand-mark → shell rail logo → shell reveal.
 * @param {Object} p
 * @param {HTMLElement} p.cardBodyEl   - .login-card-body (everything but the brand row)
 * @param {HTMLElement} p.brandMarkEl  - .login-brand-crest (the login's brand-mark)
 * @param {HTMLElement} p.loginScreenEl - #modalLogin, the full-screen overlay
 * @param {() => void} [p.onDone]      - called once the login overlay is fully hidden
 *   and the shell reveal has been kicked off (fire-and-forget on the caller's side).
 */
export async function playLoginSuccessTransition({ cardBodyEl, brandMarkEl, loginScreenEl, onDone }) {
  const reduce = prefersReducedMotion();

  if (reduce || !cardBodyEl || !brandMarkEl || !loginScreenEl) {
    if (loginScreenEl) {
      loginScreenEl.style.transition = `opacity ${STANDARD_MS}ms ${EASE_ARRIVE}`;
      loginScreenEl.style.opacity = '0';
      await wait(STANDARD_MS);
    }
    hideLoginScreen(loginScreenEl);
    revealShell(reduce);
    if (typeof onDone === 'function') onDone();
    return;
  }

  const railLogo = document.querySelector('.domshell-rail-logo');
  const startRect = brandMarkEl.getBoundingClientRect();
  const railRect = railLogo ? railLogo.getBoundingClientRect() : null;
  // A non-zero-size rect is NOT sufficient on its own: .domshell-rail's
  // mobile variant (.domshell-rail--mobile-drawer) keeps real width/height
  // even while closed off-canvas (e.g. left:-320px), so a size-only check
  // treats that off-screen drawer as a valid FLIP destination. The target
  // must also actually be on-screen — confirmed via the Phase 6 end-to-end
  // verification (scratch/verify-phase6-login-success-e2e.js).
  const hasTarget = !!(railRect && railRect.width > 0 && railRect.height > 0
    && railRect.right > 0 && railRect.left < window.innerWidth
    && railRect.bottom > 0 && railRect.top < window.innerHeight);

  // Step 1 — card body recedes, the brand-mark stays put and gains focus.
  cardBodyEl.style.transition = `opacity ${STANDARD_MS}ms ${EASE_ARRIVE}`;
  cardBodyEl.style.opacity = '0';
  await wait(STANDARD_MS);

  // Step 2 — FLIP the brand-mark via a fixed-position clone: fly it to the
  // real shell rail logo (desktop/tablet) or settle it modestly in place
  // (mobile, no literal target to fly to).
  const clone = brandMarkEl.cloneNode(true);
  const dur = `${SCENE_MS}ms ${EASE_ARRIVE}`;
  clone.style.position = 'fixed';
  clone.style.left = `${startRect.left}px`;
  clone.style.top = `${startRect.top}px`;
  clone.style.width = `${startRect.width}px`;
  clone.style.height = `${startRect.height}px`;
  clone.style.margin = '0';
  clone.style.zIndex = '99998';
  clone.style.transition = ['left', 'top', 'width', 'height', 'border-radius', 'box-shadow']
    .map((prop) => `${prop} ${dur}`).join(', ');
  document.body.appendChild(clone);
  brandMarkEl.style.visibility = 'hidden';
  loginScreenEl.style.transition = `opacity ${dur}`;

  // Force a reflow so the starting styles above are committed before the
  // target styles below are applied — otherwise the browser may coalesce
  // both into one paint and skip the transition entirely.
  void clone.getBoundingClientRect();

  if (hasTarget) {
    clone.style.left = `${railRect.left}px`;
    clone.style.top = `${railRect.top}px`;
    clone.style.width = `${railRect.width}px`;
    clone.style.height = `${railRect.height}px`;
    clone.style.borderRadius = getComputedStyle(railLogo).borderRadius;
    clone.style.boxShadow = 'none';
  } else {
    clone.style.left = `${startRect.left + startRect.width * 0.15}px`;
    clone.style.top = `${Math.max(16, startRect.top - 24)}px`;
    clone.style.width = `${startRect.width * 0.7}px`;
    clone.style.height = `${startRect.height * 0.7}px`;
  }
  loginScreenEl.style.opacity = '0';

  await wait(SCENE_MS + 40);

  clone.remove();
  hideLoginScreen(loginScreenEl);
  revealShell(reduce);
  if (typeof onDone === 'function') onDone();
}

/**
 * Shell → brief exit → brand re-emphasis, played before the caller reloads
 * for logout. Always resolves (a hard timeout guarantees logout is never
 * blocked by a stalled animation — same failsafe philosophy as the SS1
 * startup timer in index.html).
 * @param {Object} p
 * @param {HTMLElement} [p.shellEl] - .app-layout
 * @returns {Promise<void>}
 */
export function playLogoutExitTransition({ shellEl } = {}) {
  const reduce = prefersReducedMotion();
  if (reduce || !shellEl) return Promise.resolve();

  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    shellEl.style.transition = `opacity ${STANDARD_MS}ms ${EASE_ARRIVE}, transform ${STANDARD_MS}ms ${EASE_ARRIVE}`;
    shellEl.style.opacity = '0.4';
    shellEl.style.transform = 'scale(.99)';
    setTimeout(finish, STANDARD_MS + 60);
  });
}
