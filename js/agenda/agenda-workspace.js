/* ============================================================
   agenda-workspace.js — mount/lifecycle orchestrator
   (V1.31 Agenda & To-Do, Phase C3)

   The impure half of the split described in agenda-workspace-view.js's
   header: this file owns UI state (active mode, calendar anchor, To-Do
   filters), gathers live data from agenda-store.js/agenda-directory.js/
   agenda-permissions.js into a plain ctx object, and hands that to the
   PURE buildWorkspaceHTML(). ONE delegated click handler on the host
   (wired once at mount, never re-wired on re-render) reads
   [data-agenda-action] — mirrors js/workspace/workspace-renderer.js's
   own "one delegated handler reading the live ctx" idiom exactly.

   Lifecycle mirrors Petty Cash/Overtime/Engineering's established
   mount-once/pause-on-hide pattern (NOT plain Home's, which has no
   listeners of its own to pause) — mountAgendaWorkspace() is idempotent
   and safe to call every time Today becomes visible; closeAgendaWorkspace()
   deregisters this module's own change-listener registrations (store
   subscriptions themselves stay live for the session, matching every
   other *-store.js in this app — only the RE-RENDER registration is
   paused, avoiding wasted work on a hidden host without tearing down and
   re-establishing Firebase listeners on every Today visit, which would
   be the real "listener leak" risk §37 warns about).
   ============================================================ */

'use strict';

import { injectAgendaStyles } from './agenda-styles.js';
import {
  initAgendaStore, getVisibleEvents, getVisibleTasks, getVisibleCalendarItems,
  registerAgendaChangeListener, unregisterAgendaChangeListener,
  toggleChecklistItem, completeTask, reopenTask,
} from './agenda-store.js';
import { initAgendaDirectory, registerDirectoryChangeListener, unregisterDirectoryChangeListener } from './agenda-directory.js';
import { canSeeAgendaWorkspace, canManageSharedAgenda, canManageKabidAgenda, writableScopes } from './agenda-permissions.js';
import { buildWorkspaceHTML } from './agenda-workspace-view.js';
import { openCreateEventDrawer, openEditEventDrawer } from './agenda-event-drawer.js';
import { openCreateTaskDrawer, openEditTaskDrawer } from './agenda-task-drawer.js';
import { openCreateCalendarDrawer, openEditCalendarDrawer } from './agenda-calendar-drawer.js';
import { openAgendaExportDrawer } from './agenda-export-drawer.js';
import { todayString, offsetDate } from '../utils.js';

const HOST_ID = 'v2AgendaWorkspace';

let _mounted = false;
let _renderRegistered = false;
let _host = null;

const _state = {
  mode: 'agenda',
  calendarView: 'month',
  calendarAnchor: todayString(),
  todoFilters: { status: 'all', priority: 'all', query: '' },
};

function buildCtx() {
  return {
    events: getVisibleEvents(),
    tasks: getVisibleTasks(),
    calendarItems: getVisibleCalendarItems(),
    now: Date.now(),
    todayStr: todayString(),
    mode: _state.mode,
    calendarView: _state.calendarView,
    calendarAnchor: _state.calendarAnchor,
    todoFilters: _state.todoFilters,
    canManage: canManageSharedAgenda() || canManageKabidAgenda(),
    writableScopes: writableScopes(),
    loading: false,
    error: null,
  };
}

/** Full re-render (mode switch, drawer save, live data change). The
 *  search box's own `input` listener (wireHost()) deliberately does NOT
 *  call this — see its comment — so a live data change arriving while
 *  the user is mid-search still rebuilds the full ctx, but the search
 *  input's own value is never touched here (it's outside
 *  [data-agenda-view-root], so re-rendering the view root alone, as the
 *  search handler does, can't steal its focus either way). */
function doRender() {
  if (!_host) return;
  _host.innerHTML = buildWorkspaceHTML(buildCtx());
}

/** Mirrors js/app.js#_analyticsMotionOff() exactly — duplicated, not
 *  imported, since agenda-workspace.js has no dependency on app.js (the
 *  reverse is true: app.js imports FROM this module) and this is a
 *  two-line check, not worth inverting that boundary for. Checks both
 *  this app's manual in-UI "reduce motion" toggle (`data-anim="off"`)
 *  and the OS-level media query. */
function calendarMotionOff() {
  if (document.documentElement.getAttribute('data-anim') === 'off') return true;
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; }
}

/** V1.31.2 §4 — Month<->Week transition. Reuses this app's OWN existing
 *  pattern (js/app.js#setWorkspace()'s identical structure) rather than
 *  inventing a second transition mechanism: document.startViewTransition()
 *  snapshots the OLD `.cal-calview-region` (view-transition-name, set in
 *  agenda-workspace-view.js), runs the same synchronous doRender() the
 *  non-animated path already uses (so the DOM mutation itself, and
 *  therefore every event-handler-rewiring concern, is BYTE-IDENTICAL to
 *  the plain path — nothing new to get wrong there), then the browser
 *  cross-fades old-vs-new automatically. Falls straight through to plain
 *  doRender() — immediate, no animation — when the API is unavailable or
 *  motion is reduced, exactly like setWorkspace()'s own fallback. The
 *  `.catch(() => {})` calls mirror setWorkspace()'s own reasoning: a
 *  transition "skipped" because a rapid second toggle interrupted it is
 *  expected, benign browser behavior (AbortError), not an app error. */
function doRenderWithViewTransition() {
  if (!_host) return;
  if (typeof document.startViewTransition !== 'function' || calendarMotionOff()) { doRender(); return; }
  const transition = document.startViewTransition(() => doRender());
  transition.ready.catch(() => {});
  transition.finished.catch(() => {});
  transition.updateCallbackDone.catch((err) => console.error('[agenda-workspace] calendar view transition failed', err));
}

function shiftCalendarAnchor(days) {
  _state.calendarAnchor = offsetDate(_state.calendarAnchor, days);
}

function handleAction(action) {
  const idx = action.indexOf(':');
  const verb = idx === -1 ? action : action.slice(0, idx);
  const arg = idx === -1 ? '' : action.slice(idx + 1);

  switch (verb) {
    case 'set-mode': _state.mode = arg; doRender(); return;
    // Only an actual Month<->Week VIEW change animates — the explicit
    // Bulan/Minggu toggle, and tapping a day cell in Month view (the
    // primary real-world "Month -> Week" gesture, §O's own worked
    // example). cal-prev/next/today (same view, different anchor date
    // only) deliberately stay instant, matching §4's "no excessive
    // movement" — this is cosmetic on a genuine view switch, not a
    // blanket animate-everything change.
    case 'set-calview': _state.calendarView = arg; doRenderWithViewTransition(); return;
    case 'cal-prev': shiftCalendarAnchor(_state.calendarView === 'month' ? -30 : -7); doRender(); return;
    case 'cal-next': shiftCalendarAnchor(_state.calendarView === 'month' ? 30 : 7); doRender(); return;
    case 'cal-today': _state.calendarAnchor = todayString(); doRender(); return;
    case 'goto-day': {
      const wasMonth = _state.calendarView === 'month';
      _state.calendarAnchor = arg; _state.calendarView = 'week';
      (wasMonth ? doRenderWithViewTransition : doRender)();
      return;
    }
    case 'set-todo-status': _state.todoFilters.status = arg; doRender(); return;
    case 'set-todo-priority': _state.todoFilters.priority = arg; doRender(); return;
    case 'retry': doRender(); return;
    case 'create-event': openCreateEventDrawer({ onSaved: doRender }); return;
    case 'create-task': openCreateTaskDrawer({ onSaved: doRender }); return;
    case 'create-calendar': openCreateCalendarDrawer({ onSaved: doRender, defaultDate: _state.mode === 'calendar' ? _state.calendarAnchor : undefined }); return;
    case 'open-event': openEditEventDrawer(arg, { onSaved: doRender }); return;
    case 'open-task': openEditTaskDrawer(arg, { onSaved: doRender }); return;
    case 'open-calendar': openEditCalendarDrawer(arg, { onSaved: doRender }); return;
    case 'export-pdf': openAgendaExportDrawer({}); return;
    case 'toggle-task-done': {
      const task = getVisibleTasks().find((t) => t.id === arg);
      if (!task) return;
      (task.status === 'done' ? reopenTask(arg) : completeTask(arg)).catch((err) => console.error('[agenda-workspace] toggle done failed', err));
      return;
    }
    default: return;
  }
}

function wireHost(host) {
  host.addEventListener('click', (e) => {
    const el = e.target.closest('[data-agenda-action]');
    if (el) { handleAction(el.getAttribute('data-agenda-action')); return; }
  });
  // V1.31.2 §18 (accessibility) — the Calendar grid's day cells, range
  // bars, and Week timed-item rows carry role="button"/tabindex="0" (this
  // phase's own fix — they previously had neither), and the To-Do
  // checkbox already carried role="checkbox" but no tabindex at all (also
  // fixed this phase). A bare div/span gets no native Enter/Space
  // activation from the browser the way a real <button>/<input> would.
  // Mirrors the SAME [data-agenda-action] the click handler above already
  // reads — one delegated listener, same dispatch, no second action
  // system. Real <button> elements elsewhere in this view (toolbar,
  // filter chips) already get Enter/Space for free and are unaffected —
  // the browser's own default handling fires their own click first,
  // before this handler ever sees the key.
  host.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const el = e.target.closest('[data-agenda-action][role="button"], [data-agenda-action][role="checkbox"]');
    if (!el) return;
    e.preventDefault();
    handleAction(el.getAttribute('data-agenda-action'));
  });
  host.addEventListener('input', (e) => {
    if (e.target.matches('[data-agenda-search]')) {
      _state.todoFilters.query = e.target.value;
      // Search filtering re-renders the view root only (not the header the
      // search input itself lives in) to avoid stealing focus mid-typing —
      // same Focus-Preserving discipline as the drawers.
      const viewRoot = host.querySelector('[data-agenda-view-root]');
      if (viewRoot) {
        const ctx = buildCtx();
        // Rebuild just the inner content by re-invoking the same pure
        // function and swapping only the view-root's children.
        const tmp = document.createElement('div');
        tmp.innerHTML = buildWorkspaceHTML(ctx);
        const freshRoot = tmp.querySelector('[data-agenda-view-root]');
        if (freshRoot) viewRoot.innerHTML = freshRoot.innerHTML;
      }
    }
  });
}

/** Idempotent — safe to call on every Today visit. */
export function mountAgendaWorkspace() {
  if (!canSeeAgendaWorkspace()) return;
  injectAgendaStyles();
  _host = document.getElementById(HOST_ID);
  if (!_host) return;
  if (!_mounted) {
    _mounted = true;
    wireHost(_host);
    initAgendaStore();
    initAgendaDirectory();
  }
  if (!_renderRegistered) {
    _renderRegistered = true;
    registerAgendaChangeListener(doRender);
    registerDirectoryChangeListener(doRender);
  }
  doRender();
}

/** Pauses re-rendering while Today is hidden — mirrors closePettyCashCenter()/
 *  closeOvertimeCenter()/closeEngineering()'s "pause live re-render" idiom.
 *  Does NOT tear down the underlying Firebase subscriptions (agenda-store.js
 *  keeps those alive for the session, same as every other *-store.js). */
export function closeAgendaWorkspace() {
  if (_renderRegistered) {
    unregisterAgendaChangeListener(doRender);
    unregisterDirectoryChangeListener(doRender);
    _renderRegistered = false;
  }
}

export function isAgendaWorkspaceVisible() {
  return canSeeAgendaWorkspace();
}
