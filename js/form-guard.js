/* ============================================================
   FORM-GUARD.JS — Unsaved Changes Protection

   Prevents accidental data loss in operational form modals.

   Features
   ─────────
   • Backdrop click disabled — guarded modals never close on
     an accidental click outside the form box.
   • Drag-select protection — mousedown inside + mouseup outside
     no longer closes the modal (backdrop listener removed entirely).
   • Dirty-state tracking — listens for input/change on all fields;
     programmatic .value assignments do NOT trigger these events,
     so pre-populating on open does not mark the form dirty.
   • Confirmation dialog — shown only when dirty = true and user
     triggers a close via X button, Cancel button, or ESC key.
   • Keyboard workflow — ESC → dialog → ENTER closes the form.
     TAB / SHIFT+TAB cycle focus within the dialog.
     ESC while dialog is open closes the dialog only (returns to form).
   • Focus trap — focus is locked inside the dialog while it is open.
   • Focus restore — focus returns to the triggering element when the
     dialog is dismissed without closing.
   • Accessibility — role="dialog", aria-modal, aria-labelledby.
   ============================================================ */

'use strict';

/* ── Per-form state ── */
const _state = {};           // formId → { dirty: boolean }
let _pendingCloseFn  = null; // closeFn queued after guard confirmation
let _focusOnDismiss  = null; // element to restore focus to when dialog closes without confirm
let _dialogReady     = false;

/* ════════════════════════════════════════════════════════════
   PUBLIC API
   ════════════════════════════════════════════════════════════ */

/**
 * Initialize a form guard for one modal.
 * Call once from initFormHandlers / initRequestHandlers.
 *
 * Backdrop close is disabled entirely.
 * Close button and Cancel button clicks are intercepted.
 * ESC key is handled in capture phase so it takes priority over
 * all other document keydown listeners registered earlier.
 *
 * @param {Object}   opts
 * @param {string}   opts.formId    - <form> element id
 * @param {string}   opts.overlayId - modal overlay element id
 * @param {string[]} opts.closeIds  - button ids to intercept (X, Cancel)
 * @param {Function} opts.closeFn   - the actual close function (no confirmation)
 */
export function initFormGuard({ formId, overlayId, closeIds, closeFn }) {
  _ensureDialog();
  _state[formId] = { dirty: false };

  const form    = document.getElementById(formId);
  const overlay = document.getElementById(overlayId);
  if (!form || !overlay) return;

  /* 1. Dirty tracking: any user interaction sets dirty = true.
        Programmatic .value / .checked assignments do NOT fire
        these events, so form population on open is safe.        */
  form.addEventListener('input',  () => { _state[formId].dirty = true; });
  form.addEventListener('change', () => { _state[formId].dirty = true; });

  /* 2. Backdrop: swallow clicks silently — no close at all.
        Drag-selection that ends outside the box is also a click
        on the overlay, so removing this behavior covers both.   */
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) e.stopPropagation();
  });

  /* 3. Close button + Cancel button interception.
        Original handlers have been removed from the form module;
        form-guard is the sole owner of these buttons' close logic. */
  closeIds.forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener('click', () => _guardedClose(formId, closeFn, btn));
  });

  /* 4. ESC key — capture phase ensures priority over all previously
        registered document keydown listeners (e.g. sidebar close).
        When the confirmation dialog is open the dialog handles ESC
        itself and this handler bails out early.                    */
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (overlay.style.display !== 'flex') return; // form not visible
    const dialog = _getDialog();
    if (dialog && dialog.style.display !== 'none') return; // dialog has priority
    e.preventDefault();
    e.stopImmediatePropagation(); // prevent sidebar or other ESC handlers
    _guardedClose(formId, closeFn, document.activeElement);
  }, true /* capture */);
}

/**
 * Reset dirty flag for a form.
 * Call after: form open / reset, and after a successful save.
 * @param {string} formId
 */
export function resetDirty(formId) {
  if (_state[formId]) _state[formId].dirty = false;
}

/* ════════════════════════════════════════════════════════════
   PRIVATE
   ════════════════════════════════════════════════════════════ */

function _guardedClose(formId, closeFn, triggerEl) {
  if (!_state[formId]?.dirty) {
    // Clean form — close immediately, no dialog.
    closeFn();
    return;
  }
  // Dirty form — remember context and show the confirmation dialog.
  _focusOnDismiss  = triggerEl instanceof Element ? triggerEl : document.activeElement;
  _pendingCloseFn  = closeFn;
  _showDialog();
}

function _getDialog() {
  return document.getElementById('modalFormGuardDialog');
}

function _showDialog() {
  const dialog = _getDialog();
  if (!dialog) return;
  dialog.style.display = 'flex';
  // Default focus: "Ya, Tutup" — enables ESC → ENTER power-user workflow.
  requestAnimationFrame(() => {
    document.getElementById('formGuardConfirm')?.focus();
  });
}

function _hideDialog(restoreFocus) {
  const dialog = _getDialog();
  if (!dialog) return;
  dialog.style.display = 'none';
  if (restoreFocus && _focusOnDismiss) {
    try { _focusOnDismiss.focus(); } catch (_) {}
  }
  _pendingCloseFn = null;
  _focusOnDismiss = null;
}

/**
 * Focus trap + keyboard handler attached to the dialog element.
 * TAB / SHIFT+TAB cycle focus among the dialog's buttons.
 * ESC closes the dialog and returns focus to the form (no close).
 */
function _trapFocus(e) {
  const dialog = _getDialog();
  if (!dialog) return;

  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation(); // prevent form-guard's document ESC handler
    _hideDialog(true);   // dismiss dialog, return to editing
    return;
  }

  if (e.key === 'Tab') {
    e.preventDefault();
    const focusable = [...dialog.querySelectorAll('button:not([disabled])')];
    if (!focusable.length) return;
    const cur  = focusable.indexOf(document.activeElement);
    const next = e.shiftKey
      ? (cur - 1 + focusable.length) % focusable.length
      : (cur + 1) % focusable.length;
    focusable[next].focus();
  }
}

/**
 * Inject the confirmation dialog into the DOM once.
 * Wires up confirm / cancel / focus-trap listeners.
 */
function _ensureDialog() {
  if (_dialogReady) return;
  _dialogReady = true;

  const wrap = document.createElement('div');
  wrap.id = 'modalFormGuardDialog';
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-modal', 'true');
  wrap.setAttribute('aria-labelledby', 'formGuardTitle');
  wrap.style.display = 'none';
  wrap.innerHTML = `
    <div class="form-guard-box">
      <h3 class="form-guard-title" id="formGuardTitle">Perubahan Belum Disimpan</h3>
      <p class="form-guard-msg">Anda memiliki perubahan yang belum disimpan.<br>Tutup form dan buang perubahan?</p>
      <div class="form-guard-actions">
        <button class="btn-danger  form-guard-btn" id="formGuardConfirm">Ya, Tutup</button>
        <button class="btn-secondary form-guard-btn" id="formGuardCancel">Tetap Edit</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);

  /* Focus trap: attached to the dialog wrapper so it catches
     keydown events from any button inside it via bubbling.     */
  wrap.addEventListener('keydown', _trapFocus);

  /* Confirm — discard changes and close the form */
  document.getElementById('formGuardConfirm')?.addEventListener('click', () => {
    const fn = _pendingCloseFn;
    _hideDialog(false); // form is closing — no focus restore needed
    if (fn) {
      fn();
      // Clear dirty flag for all guarded forms after a confirmed close.
      Object.keys(_state).forEach(k => { _state[k].dirty = false; });
    }
  });

  /* Cancel — stay in the form, restore focus to the trigger element */
  document.getElementById('formGuardCancel')?.addEventListener('click', () => {
    _hideDialog(true);
  });
}

console.info('Form-guard module loaded');
