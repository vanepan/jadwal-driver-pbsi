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
  initAgendaStore, getVisibleEvents, getVisibleTasks,
  registerAgendaChangeListener, unregisterAgendaChangeListener,
  toggleChecklistItem, completeTask, reopenTask,
} from './agenda-store.js';
import { initAgendaDirectory, registerDirectoryChangeListener, unregisterDirectoryChangeListener } from './agenda-directory.js';
import { canSeeAgendaWorkspace, canManageSharedAgenda, canManageKabidAgenda, writableScopes } from './agenda-permissions.js';
import { buildWorkspaceHTML } from './agenda-workspace-view.js';
import { openCreateEventDrawer, openEditEventDrawer } from './agenda-event-drawer.js';
import { openCreateTaskDrawer, openEditTaskDrawer } from './agenda-task-drawer.js';
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

function shiftCalendarAnchor(days) {
  _state.calendarAnchor = offsetDate(_state.calendarAnchor, days);
}

function handleAction(action) {
  const idx = action.indexOf(':');
  const verb = idx === -1 ? action : action.slice(0, idx);
  const arg = idx === -1 ? '' : action.slice(idx + 1);

  switch (verb) {
    case 'set-mode': _state.mode = arg; doRender(); return;
    case 'set-calview': _state.calendarView = arg; doRender(); return;
    case 'cal-prev': shiftCalendarAnchor(_state.calendarView === 'month' ? -30 : -7); doRender(); return;
    case 'cal-next': shiftCalendarAnchor(_state.calendarView === 'month' ? 30 : 7); doRender(); return;
    case 'cal-today': _state.calendarAnchor = todayString(); doRender(); return;
    case 'goto-day': _state.calendarAnchor = arg; _state.calendarView = 'week'; doRender(); return;
    case 'set-todo-status': _state.todoFilters.status = arg; doRender(); return;
    case 'set-todo-priority': _state.todoFilters.priority = arg; doRender(); return;
    case 'retry': doRender(); return;
    case 'create-event': openCreateEventDrawer({ onSaved: doRender }); return;
    case 'create-task': openCreateTaskDrawer({ onSaved: doRender }); return;
    case 'open-event': openEditEventDrawer(arg, { onSaved: doRender }); return;
    case 'open-task': openEditTaskDrawer(arg, { onSaved: doRender }); return;
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
