/* ============================================================
   FOCUS-PRESERVING-RENDER.JS — shared focus-capture/restore for
   full-innerHTML-replace render loops

   Every embedded platform module (Petty Cash, Engineering, Overtime)
   renders by replacing a root container's entire innerHTML on state
   change. For fields that must show LIVE results while the user types
   (search/filter boxes), that re-render would normally destroy the
   focused input. This module captures the focused [data-focus]
   element's key + selection range before the DOM is replaced, and
   restores focus (and caret position) to the new element carrying the
   same data-focus key afterward.

   ROOT CAUSE THIS GUARDS AGAINST (found in Overtime Management v1.25.2,
   2026-07-16 — js/overtime/overtime-center.js): binding a SECOND event
   type (e.g. 'change') to the SAME render()-triggering handler as
   'input', on the same delegated root, causes a reentrant render.
   Removing a focused, edited form control from the DOM (as part of the
   render) synchronously fires an implicit 'change' event on it — if
   that ALSO triggers render() before the outer render's DOM mutation
   has finished, the browser throws (Chrome:
   "Failed to set the innerHTML property... moved in a 'blur' event
   handler") and focus is lost to <body>, requiring the user to click
   back in after every character.

   THE ACTUAL FIX is architectural, not just this capture/restore guard:
   plain form fields (name, amount, note, ...) should update state
   WITHOUT calling render() at all — the native input already shows the
   typed character, so there is nothing to re-render until the next
   structural change (opening/closing a modal, a save, a realtime echo).
   This is the pattern petty-cash-center.js's onInput already documents
   ("A full render() here would replace the focused <input>, destroying
   its native focus and caret on every keystroke") and
   engineering-center.js's onInput already follows silently. Only
   search/filter inputs that must show live-filtered results — and any
   <select> that must immediately refresh dependent content — should
   call render() on every change, and ONLY through the SAME single event
   type (never both 'input' and 'change' bound to one render-triggering
   handler for the same delegated root).

   Usage:
     const focusGuard = createFocusGuard();
     function render() {
       focusGuard.capture(root);
       root.innerHTML = shell();
       focusGuard.restore(root);
     }

   Each call site owns an independent guard instance (no shared module
   state across modules), matching the store/service/center convention
   of never sharing mutable state across unrelated domains.
   ============================================================ */

'use strict';

/** Create an independent focus-preservation guard for one render loop. */
export function createFocusGuard() {
  let pending = null;

  return {
    /** Call BEFORE mutating the DOM (e.g. root.innerHTML = ...). */
    capture(root) {
      const el = document.activeElement;
      if (el && root && root.contains(el) && el.dataset && el.dataset.focus) {
        pending = { key: el.dataset.focus, start: el.selectionStart, end: el.selectionEnd };
      } else {
        pending = null;
      }
    },
    /** Call AFTER mutating the DOM. Re-focuses the element carrying the
        same data-focus key and restores the caret/selection range. */
    restore(root) {
      if (!pending || !root) { pending = null; return; }
      const el = root.querySelector(`[data-focus="${CSS.escape(pending.key)}"]`);
      if (el) {
        el.focus();
        try { if (pending.start != null) el.setSelectionRange(pending.start, pending.end); } catch (_) {}
      }
      pending = null;
    },
  };
}
