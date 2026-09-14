/* ============================================================
   agenda-workspace-view.js — PURE shell renderer
   (V1.31 Agenda & To-Do, Phase C3)

   buildWorkspaceHTML(ctx) is a pure function of its input — no Firebase,
   no module-level state, no side effects — deliberately mirroring
   js/workspace/workspace-renderer.js's split (a pure render layer the
   orchestrator in agenda-workspace.js feeds real data into). This is
   what scripts/agenda-workspace-render-check.mjs drives directly with a
   synthetic ctx, the same technique domain-shell-overtime-render-check.mjs
   already established for testing this app's shell components without
   booting the full app.js/Firebase-auth boot sequence.

   ctx shape: { events, tasks, now, todayStr, mode, calendarView,
     calendarAnchor, todoFilters:{status,priority,query}, canManage:bool,
     writableScopes:[], loading:bool, error:string|null }
   ============================================================ */

'use strict';

import { renderAgendaListHTML } from './agenda-view-agenda.js';
import { renderCalendarHTML } from './agenda-view-calendar.js';
import { renderTodoListHTML } from './agenda-view-todo.js';
import { isTaskOverdue } from './agenda-lifecycle.js';
import { anIcon } from '../analytics/analytics-shell.js';

function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// Exported (Phase C4) so agenda-export-drawer.js's own status/priority
// filter chips use the exact same vocabulary/labels as the To-Do view's —
// one shared list, never a second one that could quietly drift.
export const STATUS_FILTERS = [
  { key: 'all', label: 'Semua' },
  { key: 'not_started', label: 'Belum Mulai' },
  { key: 'in_progress', label: 'Dalam Proses' },
  { key: 'done', label: 'Selesai' },
  { key: 'overdue', label: 'Terlewat' },
];
export const PRIORITY_FILTERS = [
  { key: 'all', label: 'Semua' },
  { key: 'urgent', label: 'Urgent' },
  { key: 'penting', label: 'Penting' },
  { key: 'normal', label: 'Normal' },
];

function applyTodoFilters(tasks, filters, now) {
  const q = (filters.query || '').trim().toLowerCase();
  return (tasks || []).filter((t) => {
    if (q && !(t.title || '').toLowerCase().includes(q) && !(t.description || '').toLowerCase().includes(q)) return false;
    if (filters.priority && filters.priority !== 'all' && t.priority !== filters.priority) return false;
    if (filters.status && filters.status !== 'all') {
      if (filters.status === 'overdue') { if (!isTaskOverdue(t, now)) return false; }
      else if (t.status !== filters.status) return false;
    }
    return true;
  });
}

function modeSwitcher(mode) {
  const modes = [['agenda', 'Agenda'], ['calendar', 'Kalender'], ['todo', 'To-Do']];
  return `<div class="cal-modeswitch" role="tablist" aria-label="Tampilan Agenda">
    ${modes.map(([k, label]) => `<button type="button" role="tab" aria-selected="${mode === k}" data-agenda-action="set-mode:${k}">${label}</button>`).join('')}
  </div>`;
}

// One right-aligned action cluster: Export PDF always (anyone who can see
// the workspace can export it), then + Agenda/+ Tugas when the session can
// write to at least one scope. Previously Export PDF rendered as its own
// separate .cal-header-actions flex child — under .cal-header's
// justify-content:space-between that put it stranded in the middle of the
// toolbar instead of grouped with the create actions on the right.
function toolbarActions(canManage, writableScopes) {
  const exportBtn = `<button type="button" class="cal-btn cal-btn--sm cal-export-btn" data-agenda-action="export-pdf" title="Ekspor Agenda &amp; To-Do ke PDF">${anIcon('download', { size: 14 })}<span>Export PDF</span><svg class="cal-export-caret" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>`;
  const createBtns = (canManage && writableScopes.length)
    ? `<button type="button" class="cal-btn cal-btn--sm" data-agenda-action="create-event">+ Agenda</button>
    <button type="button" class="cal-btn cal-btn--sm" data-agenda-action="create-task">+ Tugas</button>`
    : '';
  return `<div class="cal-header-actions">${exportBtn}${createBtns}</div>`;
}

/** @param {Object} ctx see file header */
export function buildWorkspaceHTML(ctx) {
  if (ctx.loading) {
    return shell(ctx, `<div class="cal-skeleton"></div><div class="cal-skeleton"></div><div class="cal-skeleton" style="width:70%"></div>`);
  }
  if (ctx.error) {
    return shell(ctx, `<div class="cal-error">${esc(ctx.error)}<div style="margin-top:10px"><button type="button" class="cal-btn cal-btn--sm" data-agenda-action="retry">Coba Lagi</button></div></div>`);
  }

  let inner;
  if (ctx.mode === 'calendar') {
    inner = renderCalendarHTML({ events: ctx.events, tasks: ctx.tasks, mode: ctx.calendarView, anchorDate: ctx.calendarAnchor, todayStr: ctx.todayStr });
    inner = `<div class="cal-filters" role="tablist" aria-label="Tampilan Kalender">
        ${['month', 'week'].map((v) => `<button type="button" class="cal-chip" role="tab" aria-pressed="${ctx.calendarView === v}" data-agenda-action="set-calview:${v}">${v === 'month' ? 'Bulan' : 'Minggu'}</button>`).join('')}
      </div>${inner}`;
  } else if (ctx.mode === 'todo') {
    const filtered = applyTodoFilters(ctx.tasks, ctx.todoFilters, ctx.now);
    inner = `
      <div class="cal-filters" role="group" aria-label="Filter status">
        ${STATUS_FILTERS.map((f) => `<button type="button" class="cal-chip" aria-pressed="${ctx.todoFilters.status === f.key}" data-agenda-action="set-todo-status:${f.key}">${f.label}</button>`).join('')}
      </div>
      <div class="cal-filters" role="group" aria-label="Filter prioritas">
        ${PRIORITY_FILTERS.map((f) => `<button type="button" class="cal-chip" aria-pressed="${ctx.todoFilters.priority === f.key}" data-agenda-action="set-todo-priority:${f.key}">${f.label}</button>`).join('')}
      </div>
      ${renderTodoListHTML({ tasks: filtered, now: ctx.now })}`;
  } else {
    inner = renderAgendaListHTML({ events: ctx.events, tasks: ctx.tasks, now: ctx.now, todayStr: ctx.todayStr });
  }

  return shell(ctx, inner);
}

function shell(ctx, inner) {
  return `
    <div class="cal-header">
      <div>
        <p class="cal-title">Agenda &amp; To-Do</p>
        <p class="cal-subtitle">Apa yang terjadi dan apa yang perlu dikerjakan</p>
      </div>
      ${modeSwitcher(ctx.mode)}
    </div>
    <div class="cal-header" style="margin-bottom:12px">
      <input type="search" class="cal-form-input" style="max-width:280px" placeholder="Cari agenda atau tugas…" value="${esc(ctx.todoFilters.query || '')}" data-agenda-search>
      ${toolbarActions(ctx.canManage, ctx.writableScopes)}
    </div>
    <div data-agenda-view-root>${inner}</div>`;
}

export { applyTodoFilters };
