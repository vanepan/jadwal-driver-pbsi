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

let toastTimeout = null;

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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

  const normalizedOpts = typeof opts === 'string' ? { severity: opts } : (opts || {});
  let text = String(message == null ? '' : message);
  let severity = SEVERITIES.has(normalizedOpts.severity) ? normalizedOpts.severity : null;
  if (!severity) {
    for (const [re, sev] of EMOJI_SEVERITY) {
      if (re.test(text)) { severity = sev; text = text.replace(re, ''); break; }
    }
  }

  toast.className = severity ? `toast toast--${severity}` : 'toast';
  toast.innerHTML = severity
    ? `${anIcon(SEVERITY_ICON[severity], { size: 15, cls: 'toast__ico' })}<span>${esc(text)}</span>`
    : esc(text);

  // role/aria-live are set per-call (not just once statically) so an error
  // toast interrupts a screen reader mid-sentence the way role="alert"
  // requires, while success/info/warning stay politely queued.
  toast.setAttribute('role', severity === 'error' ? 'alert' : 'status');
  toast.setAttribute('aria-live', severity === 'error' ? 'assertive' : 'polite');

  if (prefersReducedMotion()) toast.style.animation = 'none';
  else toast.style.animation = '';
  toast.style.display = 'block';

  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.style.display = 'none';
  }, 2800);
}
