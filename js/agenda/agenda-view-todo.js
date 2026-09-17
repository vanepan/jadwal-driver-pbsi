/* ============================================================
   agenda-view-todo.js — To-Do list view (V1.31 Agenda & To-Do, Phase C3)

   PURE HTML builder. Answers "what needs to be done?" — task-only,
   checkbox-driven, checklist progress visible inline. Filtering
   (status/priority) is applied by the caller (agenda-workspace.js) before
   this function ever sees the array — this file only presents.
   ============================================================ */

'use strict';

import { isTaskOverdue } from './agenda-lifecycle.js';
import { sortTasksByPriority, priorityLabel, statusLabel, checklistProgress, formatDateShort, splitParticipants } from './agenda-view-model.js';
import { displayNameFor } from './agenda-directory.js';

function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function todoRow(t, now, colorMap) {
  const done = t.status === 'done';
  const overdue = !done && isTaskOverdue(t, now);
  const { done: chkDone, total: chkTotal } = checklistProgress(t);
  const responsibleUsernames = Object.keys(t.responsible || {});
  const responsible = responsibleUsernames.map(displayNameFor);
  const pillClass = overdue ? 'cal-pill--overdue' : done ? 'cal-pill--done' : `cal-pill--${t.priority || 'normal'}`;
  const pillText = overdue ? 'Terlewat' : done ? 'Selesai' : priorityLabel(t.priority);
  return `
    <div class="cal-todo-row">
      <span class="cal-checkbox" role="checkbox" aria-checked="${done}" aria-label="Tandai selesai" tabindex="0" data-agenda-action="toggle-task-done:${esc(t.id)}">${done ? '&#10003;' : ''}</span>
      <div class="cal-row-body" data-agenda-action="open-task:${esc(t.id)}" role="button" tabindex="0">
        <p class="cal-row-title${done ? ' cal-row-title--done' : ''}">${esc(t.title)}</p>
        <div class="cal-row-meta">
          <span class="cal-pill ${pillClass}">${pillText}</span>
          ${t.dueDate ? `<span>${esc(formatDateShort(t.dueDate))}${t.dueTime ? ' · ' + esc(t.dueTime) : ''}</span>` : ''}
          ${chkTotal ? `<span>${chkDone}/${chkTotal} checklist</span>` : ''}
          ${responsible.length ? `<span>${esc(responsible.join(', '))}</span>` : ''}
          ${t.scope === 'kabid' ? '<span class="cal-pill cal-pill--kabid">Kabid</span>' : ''}
        </div>
      </div>
    </div>`;
}

/**
 * @param {{tasks: Array, now: number, colorMap?: Record<string,string>}} data already filtered by the caller
 */
export function renderTodoListHTML({ tasks, now, colorMap = {} }) {
  if (!tasks || !tasks.length) {
    return `<div class="cal-empty"><div class="cal-empty-title">Belum ada tugas</div><div class="cal-empty-sub">Tugas yang dibuat akan muncul di sini.</div></div>`;
  }
  return sortTasksByPriority(tasks).map((t) => todoRow(t, now, colorMap)).join('');
}
