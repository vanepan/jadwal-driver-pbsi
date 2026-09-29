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

   SS17 extension — `attr` + `fallback`: originally keyed exclusively off
   `data-focus` (a dedicated attribute some modules add just for this).
   `createFocusGuard({ attr: 'agenda-action' })` instead keys off an
   attribute a module already has on its action elements (e.g.
   `data-agenda-action`/`data-drawer-action`), so re-render-heavy modules
   (js/agenda/*) can restore focus/keyboard-Tab-position to a clicked
   button or row without adding a redundant second attribute everywhere.
   `restore(root, fallback)` accepts an optional element (or a () => element
   getter) to focus when the original key no longer exists post-render
   (e.g. the acted-on row was itself the thing removed) — without a
   fallback, restore() silently no-ops in that case, same as before.
   Default `attr: 'focus'` keeps every existing call site byte-identical.

   SS18 fix — `fallback` also applies when NOTHING was captured at all
   (found via real production data: js/agenda/agenda-event-drawer.js's
   picker "Selesai" button, clicked while focus was on the picker's own
   search box — which carries `data-field`, not this guard's tracked
   attribute — capture() correctly leaves `pending` null for it, but the
   body-replacing rerender() destroys it regardless, dropping focus to
   <body> with the fallback never even attempted). A `fallback` argument's
   presence means the caller wants ONE invariant guaranteed — focus ends up
   somewhere inside `root` — regardless of whether a tracked key happened
   to be captured; restore() now checks that invariant directly
   (`!root.contains(document.activeElement)`) instead of only reacting to
   "captured a key that failed to re-resolve". Consumers that never pass a
   fallback (Petty Cash, Overtime, Engineering, Timeline, the Agenda
   workspace itself) are byte-identical — this branch is unreachable
   without one.
   ============================================================ */

'use strict';

/** Create an independent focus-preservation guard for one render loop.
 *  @param {{attr?: string}} [opts] dataset attribute (kebab-case, e.g.
 *    'agenda-action') to key capture/restore off. Defaults to 'focus'. */
export function createFocusGuard({ attr = 'focus' } = {}) {
  const prop = attr.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  let pending = null;

  return {
    /** Call BEFORE mutating the DOM (e.g. root.innerHTML = ...). */
    capture(root) {
      const el = document.activeElement;
      if (el && root && root.contains(el) && el.dataset && el.dataset[prop]) {
        pending = { key: el.dataset[prop], start: el.selectionStart, end: el.selectionEnd };
      } else {
        pending = null;
      }
    },
    /** Call AFTER mutating the DOM. Re-focuses the element carrying the
        same key and restores the caret/selection range. If that fails to
        land focus inside `root` — the key no longer exists (the acted-on
        element was itself removed), or nothing was captured to begin with
        (the focused element wasn't one this guard tracks) — focuses
        `fallback` (element or () => element) instead, when given. */
    restore(root, fallback) {
      const p = pending;
      pending = null;
      if (!root) return;
      let restored = false;
      if (p) {
        const el = root.querySelector(`[data-${attr}="${CSS.escape(p.key)}"]`);
        if (el) {
          el.focus();
          try { if (p.start != null) el.setSelectionRange(p.start, p.end); } catch (_) {}
          restored = true;
        }
      }
      if (!restored && fallback && !root.contains(document.activeElement)) {
        const target = typeof fallback === 'function' ? fallback() : fallback;
        if (target && typeof target.focus === 'function') target.focus();
      }
    },
  };
}
