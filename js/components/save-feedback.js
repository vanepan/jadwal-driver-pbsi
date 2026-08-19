/* ============================================================
   SAVE-FEEDBACK.JS — Design System Program Phase 3: THE canonical
   save-feedback state machine

   ONE shared idle -> saving -> success/error driver for every real async
   save/commit operation in the app. Container-agnostic — works inside
   legacy modals (#modalForm, #modalApproveRequest) and inline SPA-style
   panels (Petty Cash) alike; the button element is the only thing it needs.

   PURE presentation + lifecycle orchestration. It never knows what is
   being saved, never talks to Firebase itself, never decides validation or
   permissions — callers supply `operation` (the real async call) and this
   module only manages: duplicate-submission prevention, visual state,
   disabled/busy behavior, the success/error presentation, and
   accessibility state. The CORE PRINCIPLE this whole phase exists for:
   SUCCESS is only ever entered after `operation()` resolves {ok:true} —
   never optimistic, never shown before persistence is confirmed.
   ============================================================ */

'use strict';

import { SCENE_MS, prefersReducedMotion } from './motion-tokens.js';
import { anIcon } from '../analytics/analytics-shell.js';

const SPINNER_SVG = '<svg class="sf-icon sf-icon--spin" width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="6.25" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="26 39"/></svg>';
const CHECK_SVG = '<svg class="sf-icon sf-icon--check" width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3.5 8.6L6.6 11.7L12.5 4.8" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function clearError(errorRegion, button) {
  if (!errorRegion) return;
  errorRegion.hidden = true;
  errorRegion.textContent = '';
  if (button) button.removeAttribute('aria-describedby');
}

function showError(errorRegion, button, err) {
  const msg = (err && err.message) || 'Gagal menyimpan. Silakan coba lagi.';
  if (!errorRegion) return;
  if (!errorRegion.id) errorRegion.id = `sf-err-${Math.random().toString(36).slice(2, 9)}`;
  errorRegion.hidden = false;
  // Design System Program Phase 5 — an anIcon('alert') glyph, matching
  // renderAnalyticsErrorState's existing treatment (js/analytics/
  // analytics-shell.js). innerHTML is safe here: the icon is a fixed SVG
  // literal and `msg` renders inside a plain <span> textContent, never
  // interpolated as markup.
  errorRegion.innerHTML = '';
  const iconSpan = document.createElement('span');
  iconSpan.innerHTML = anIcon('alert', { size: 14 });
  iconSpan.style.cssText = 'display:inline-flex;vertical-align:-2px;margin-right:5px;';
  const textSpan = document.createElement('span');
  textSpan.textContent = msg;
  errorRegion.append(iconSpan, textSpan);
  errorRegion.setAttribute('role', 'alert');
  button.setAttribute('aria-describedby', errorRegion.id);
}

function _resetIdle(button, idleHTML, lockTargets) {
  button.innerHTML = idleHTML;
  button.style.minWidth = '';
  button.removeAttribute('aria-busy');
  delete button.dataset.sfState;
  button.classList.remove('sf-btn');
  lockTargets.forEach((el) => { if (el) el.disabled = false; });
}

function applyPulse(el, reduce) {
  el.classList.add('sf-pulse');
  if (reduce) { el.classList.remove('sf-pulse'); return; }
  const done = () => el.classList.remove('sf-pulse');
  el.addEventListener('animationend', done, { once: true });
  setTimeout(done, SCENE_MS + 200); // fallback safety, mirrors the drawer primitive's teardown-safety pattern
}

/**
 * Drive one real async save operation through idle -> saving -> success/error.
 *
 * @param {Object} p
 * @param {HTMLButtonElement} p.button      - the trigger element (required)
 * @param {() => Promise<{ok:boolean, error?:Error, [k:string]:any}>} p.operation
 *   the REAL Firebase/service call. Must resolve, never throw uncaught (a
 *   thrown/rejected operation is treated as {ok:false, error}).
 * @param {HTMLElement[]} [p.alsoDisable]   - other controls to lock during saving (Cancel, form fields)
 * @param {HTMLElement} [p.errorRegion]     - element to receive the inline error message
 * @param {string} [p.savingLabel]          - optional label swap while saving/success (else keeps idle label)
 * @param {(result:Object) => (void|Promise<void>)} [p.onSuccess] - fires AFTER the success beat settles
 * @param {(error:Error) => void} [p.onError]
 * @param {() => (HTMLElement|null)} [p.pulseTarget] - resolved AFTER onSuccess (post re-render), pulsed once
 * @returns {Promise<{ok:boolean, error?:Error}|undefined>} undefined if a duplicate call was ignored
 */
export async function runSaveFeedback({
  button, operation, alsoDisable = [], errorRegion = null,
  savingLabel = null, onSuccess = null, onError = null, pulseTarget = null,
} = {}) {
  if (!button || typeof operation !== 'function') throw new Error('runSaveFeedback requires { button, operation }');
  // Duplicate-submission guard — checked+set synchronously, before anything
  // else, so two rapid clicks can never both pass this line.
  if (button.dataset.sfBusy === '1') return undefined;
  button.dataset.sfBusy = '1';

  const reduce = prefersReducedMotion();
  const idleHTML = button.innerHTML;
  const idleLabel = button.textContent;
  const label = savingLabel || idleLabel;
  const lockTargets = [button, ...alsoDisable.filter(Boolean)];

  const rect = button.getBoundingClientRect();
  button.style.minWidth = `${Math.ceil(rect.width)}px`;
  button.classList.add('sf-btn');
  clearError(errorRegion, button);

  // SAVING
  button.dataset.sfState = 'saving';
  button.setAttribute('aria-busy', 'true');
  lockTargets.forEach((el) => { el.disabled = true; });
  button.innerHTML = `${SPINNER_SVG}<span class="sf-btn__label">${esc(label)}</span>`;

  let result;
  try {
    result = await operation();
  } catch (err) {
    result = { ok: false, error: err };
  }

  if (result && result.ok) {
    // SUCCESS — only ever reached here, after operation() genuinely resolved ok.
    button.dataset.sfState = 'success';
    button.innerHTML = `${CHECK_SVG}<span class="sf-btn__label">${esc(label)}</span>`;
    if (!reduce) await wait(SCENE_MS);
    if (typeof onSuccess === 'function') { try { await onSuccess(result); } catch (_) {} }
    _resetIdle(button, idleHTML, lockTargets);
    if (typeof pulseTarget === 'function') {
      const el = pulseTarget();
      if (el) applyPulse(el, reduce);
    }
  } else {
    // ERROR — reverts to actionable immediately; never leaves the user stuck.
    const err = (result && result.error) || new Error('Gagal menyimpan.');
    _resetIdle(button, idleHTML, lockTargets);
    showError(errorRegion, button, err);
    if (typeof onError === 'function') { try { onError(err); } catch (_) {} }
  }

  delete button.dataset.sfBusy;
  return result;
}
