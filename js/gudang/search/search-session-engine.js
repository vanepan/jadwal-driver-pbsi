/* ============================================================
   SEARCH-SESSION-ENGINE.JS — Gudang Search Foundation (Phase 3, Part 2)

   Authorized by: Doc 2 §05 (Search — "behaves like Spotlight or Raycast")
   and §12 (Keyboard Experience table) · Doc 3 Ch.08 (Search Engine)

   PURPOSE: give the Spotlight/Raycast interaction model a deterministic
   shape — a pure reducer, `applySessionEvent(state, event) -> {state,
   intent}`, encoding exactly Doc 2 §12's keyboard table:

     Ctrl+K   anywhere            -> open Search
     Up/Down  any result list     -> move focus between rows
     Enter    focused row/line    -> trigger the primary action
     Tab      focused row         -> step into that row's other actions
     Esc      any active field    -> clear the input, or close and return

   (Ctrl+Enter is deliberately absent: Doc 2 §12 scopes it to Goods In /
   Out / Stock Opname, never to Search itself.)

   This is a REDUCER, not a widget: no DOM, no event listeners, no
   rendering. Gudang has no mounted screen yet for a Spotlight overlay to
   open into (Phase 1/2 built zero UI, by the same design) — Doc 4 Art.VI
   forbids building a screen ahead of the product decision that would
   host it. What Phase 3 owes the module is the deterministic BEHAVIOR a
   future screen will drive: given a key and the current state, what
   state comes next, and what (if anything) was committed. A future UI
   phase wires DOM events to `{type:'key', key, ctrlKey}` and renders
   whatever state comes back — it invents no interaction rules of its own
   (Doc 4 Art.V: "A screen displays a decision. It does not make one.").

   Fetching results is explicitly NOT this module's job (Doc 4 Art.III/IV
   — one owner per responsibility): the caller calls search-resolver.js's
   own `searchAndResolve(query)` and feeds the outcome in via a
   `resultsLoaded` event. This keeps the reducer 100% synchronous, pure,
   and Node-testable, and never duplicates what search-resolver.js already
   owns.

   Committing an action (Enter) calls action-resolver.js's `resolveAction`
   — itself inert (Doc 4 Art.IV) — and returns its outcome as `intent`.
   Whether a session closes after a successful intent is a UI policy
   decision with no ratified answer yet; this module does not guess and
   leaves `status` unchanged on Enter (Doc 4 Art.VI: never invent ahead of
   the document that should decide it).

   PURE: no DOM, no Firebase, no `window`.
   ============================================================ */

'use strict';

import { resolveAction, primaryAction } from './action-resolver.js';

/** @returns {SearchSessionState} a closed, empty session. */
export function createInitialSessionState() {
  return Object.freeze({
    status: 'closed', // 'closed' | 'open'
    query: '',
    results: [], // SearchResult[]
    focusedIndex: -1, // which result row has focus, -1 = none
    actionFocusIndex: null, // null = primary-action mode; else index into the focused row's actions[]
  });
}

function moveIndex(current, delta, length) {
  if (length <= 0) return -1;
  return (current + delta + length) % length;
}

/**
 * Apply one event to a session state. Pure — same input, same output.
 * @param {SearchSessionState} state
 * @param {{type:'open'}|{type:'close'}|{type:'resultsLoaded', query:string, results:object[]}|{type:'key', key:string, ctrlKey?:boolean}} event
 * @returns {{state:SearchSessionState, intent:?object}}
 */
export function applySessionEvent(state, event) {
  switch (event?.type) {
    case 'open':
      return { state: Object.freeze({ ...createInitialSessionState(), status: 'open' }), intent: null };
    case 'close':
      return { state: createInitialSessionState(), intent: null };
    case 'resultsLoaded': {
      const results = Array.isArray(event.results) ? event.results : [];
      return {
        state: Object.freeze({
          ...state,
          query: String(event.query ?? ''),
          results,
          focusedIndex: results.length ? 0 : -1,
          actionFocusIndex: null,
        }),
        intent: null,
      };
    }
    case 'key':
      return applyKey(state, event);
    // V1.28.0 Experience Layer — a pointer (mouse/touch) has no keyboard
    // event to synthesize, but it names the SAME state this reducer already
    // owns ("which row/action is focused"), so it gets its own event types
    // rather than the UI reaching in and mutating state directly (Doc 4
    // Art.IV: one owner). Doc 2 §05 mobile spec: "One tap primary action" —
    // 'focusIndex' + immediately committing is exactly a tap's semantics.
    case 'focusIndex': {
      const i = Number(event.index);
      if (!Number.isInteger(i) || i < 0 || i >= state.results.length) return { state, intent: null };
      return { state: Object.freeze({ ...state, focusedIndex: i, actionFocusIndex: null }), intent: null };
    }
    case 'commit': {
      const focused = state.results[state.focusedIndex];
      if (!focused) return { state, intent: null };
      const actionId = event.actionId != null ? event.actionId : primaryAction(focused);
      if (!actionId || !focused.actions.includes(actionId)) return { state, intent: null };
      return { state, intent: resolveAction(focused, actionId) };
    }
    default:
      return { state, intent: null };
  }
}

function applyKey(state, { key, ctrlKey = false }) {
  // Ctrl+K — anywhere — open Search (Doc 2 §12). Idempotent while already open.
  if (ctrlKey && (key === 'k' || key === 'K')) {
    if (state.status === 'open') return { state, intent: null };
    return { state: Object.freeze({ ...createInitialSessionState(), status: 'open' }), intent: null };
  }
  if (state.status !== 'open') return { state, intent: null };

  switch (key) {
    case 'ArrowDown':
      return {
        state: Object.freeze({ ...state, focusedIndex: moveIndex(state.focusedIndex, 1, state.results.length), actionFocusIndex: null }),
        intent: null,
      };
    case 'ArrowUp':
      return {
        state: Object.freeze({ ...state, focusedIndex: moveIndex(state.focusedIndex, -1, state.results.length), actionFocusIndex: null }),
        intent: null,
      };
    case 'Tab': {
      const focused = state.results[state.focusedIndex];
      if (!focused || focused.actions.length <= 1) return { state, intent: null }; // nothing to step into — dormant seam, not an error
      const next = state.actionFocusIndex == null ? 0 : (state.actionFocusIndex + 1) % focused.actions.length;
      return { state: Object.freeze({ ...state, actionFocusIndex: next }), intent: null };
    }
    case 'Enter': {
      const focused = state.results[state.focusedIndex];
      if (!focused) return { state, intent: null };
      const actionId = state.actionFocusIndex != null ? focused.actions[state.actionFocusIndex] : primaryAction(focused);
      if (!actionId) return { state, intent: null };
      return { state, intent: resolveAction(focused, actionId) };
    }
    case 'Escape': {
      if (state.query) {
        return { state: Object.freeze({ ...state, query: '', results: [], focusedIndex: -1, actionFocusIndex: null }), intent: null };
      }
      return { state: createInitialSessionState(), intent: null };
    }
    default:
      return { state, intent: null };
  }
}

/**
 * @typedef {Object} SearchSessionState
 * @property {'closed'|'open'} status
 * @property {string} query
 * @property {object[]} results - SearchResult[]
 * @property {number} focusedIndex
 * @property {?number} actionFocusIndex
 */
