/* ============================================================
   TOAST.JS — Design System Program Phase 5: THE canonical toast

   ONE shared, accessible, severity-aware toast for every ephemeral
   app-wide notification. Replaces 5 independent implementations (a bare
   global `#toast` div with no severity, plus 3 bespoke per-module
   `toast()` functions in Petty Cash / Overtime / Role Management, plus
   Gudang's own `showToast()`) that had each grown its own local render
   plumbing — none of them color/icon-coded success vs error, none
   accessible. Confirmed live bug this phase fixes: Petty Cash and Gudang
   hardcoded a green checkmark icon for EVERY message, including error
   paths (`catch (err) { toast(err.message) }` rendered as if it had
   succeeded).

   Reuses the existing singleton `#toast` element (index.html) — same
   one-at-a-time, auto-dismiss behavior as before this phase, so every
   pre-existing call site keeps working unchanged unless it opts into a
   severity.
   ============================================================ */

'use strict';

import { anIcon } from '../analytics/analytics-shell.js';
import { prefersReducedMotion } from './motion-tokens.js';

const SEVERITIES = new Set(['success', 'error', 'warning', 'info']);

// Existing call sites across the app informally prefixed messages with an
// emoji as an ad-hoc severity signal (e.g. showToast('✅ Tersimpan')). Detect
// and strip it so a real anIcon() glyph replaces it instead of relying on a
// raw emoji character (continues Phase 4's no-raw-emoji icon consolidation).
const EMOJI_SEVERITY = [
  [/^\s*✅\s*/u, 'success'],
  [/^\s*❌\s*/u, 'error'],
  [/^\s*⚠️\s*/u, 'warning'],
  [/^\s*ℹ️\s*/u, 'info'],
];

const SEVERITY_ICON = {
  success: 'check',
  error: 'alert',
  warning: 'alert',
  info: 'info',
};

const TOAST_DURATION_MS = 2800;
let toastTimeout = null;
let toastPauseHandlersAttached = false;

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function scheduleAutoDismiss(toast) {
  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => { toast.style.display = 'none'; }, TOAST_DURATION_MS);
}

/** SS18 Phase E — WCAG 2.2.1 (Timing Adjustable): auto-dismissing content the
 *  user can't pause/extend is a real barrier for anyone who needs longer than
 *  2.8s to read it (a longer error message, a screen reader mid-announcement,
 *  a motor-impaired user reaching for the close button). Pauses the timer
 *  while the pointer is over the toast or focus is inside it (the close
 *  button below), resumes a fresh full duration once both let go. Attached
 *  once, lazily — `#toast` is a page-static singleton element reused for
 *  every message, so the listeners never need to be re-attached. */
function attachPauseHandlers(toast) {
  if (toastPauseHandlersAttached) return;
  toastPauseHandlersAttached = true;
  const pause = () => { if (toastTimeout) { clearTimeout(toastTimeout); toastTimeout = null; } };
  const resume = () => { if (toast.style.display !== 'none') scheduleAutoDismiss(toast); };
  toast.addEventListener('mouseenter', pause);
  toast.addEventListener('mouseleave', resume);
  toast.addEventListener('focusin', pause);
  // Only resume once focus has left the toast ENTIRELY — not just moved
  // from the message text to the close button within the same toast.
  toast.addEventListener('focusout', (e) => { if (!toast.contains(e.relatedTarget)) resume(); });
}

/**
 * Show the single shared toast notification.
 * @param {string} message
 * @param {{ severity?: 'success'|'error'|'warning'|'info' }|'success'|'error'|'warning'|'info'} [opts]
 *   Accepts either the options-object form (`{ severity: 'error' }`) or a
 *   bare severity string (`'error'`) — a pre-existing call convention found
 *   in js/app.js (12 sites, predating this module) that the options-object
 *   form alone would silently fail to recognize (a string has no `.severity`
 *   property, so severity would resolve to null and the toast would render
 *   plain). Normalizing here means every caller works, object-form callers
 *   are completely unaffected.
 */
export function showToast(message, opts = {}) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  attachPauseHandlers(toast);

  const normalizedOpts = typeof opts === 'string' ? { severity: opts } : (opts || {});
  let text = String(message == null ? '' : message);
  let severity = SEVERITIES.has(normalizedOpts.severity) ? normalizedOpts.severity : null;
  if (!severity) {
    for (const [re, sev] of EMOJI_SEVERITY) {
      if (re.test(text)) { severity = sev; text = text.replace(re, ''); break; }
    }
  }

  toast.className = severity ? `toast toast--${severity}` : 'toast';
  const body = severity
    ? `${anIcon(SEVERITY_ICON[severity], { size: 15, cls: 'toast__ico' })}<span>${esc(text)}</span>`
    : esc(text);
  // SS18 Phase E — a manual dismiss control: before this, a toast could
  // only ever go away on its own 2.8s timer, so a keyboard/screen-reader
  // user had zero way to close one early, and nothing inside it was even
  // reachable by Tab in the first place.
  toast.innerHTML = `${body}<button type="button" class="toast__close" aria-label="Tutup notifikasi">${anIcon('x', { size: 11 })}</button>`;
  toast.querySelector('.toast__close').addEventListener('click', () => {
    if (toastTimeout) { clearTimeout(toastTimeout); toastTimeout = null; }
    toast.style.display = 'none';
  });

  // role/aria-live are set per-call (not just once statically) so an error
  // toast interrupts a screen reader mid-sentence the way role="alert"
  // requires, while success/info/warning stay politely queued.
  toast.setAttribute('role', severity === 'error' ? 'alert' : 'status');
  toast.setAttribute('aria-live', severity === 'error' ? 'assertive' : 'polite');

  if (prefersReducedMotion()) toast.style.animation = 'none';
  else toast.style.animation = '';
  toast.style.display = 'block';

  scheduleAutoDismiss(toast);
}
