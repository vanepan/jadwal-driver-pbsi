/* ============================================================
   agenda-view-agenda.js — default "what's happening / what needs
   attention" list view (V1.31 Agenda & To-Do, Phase C3)

   PURE HTML builder — no DOM mutation, no Firebase. Takes already-
   filtered, already-scoped data from agenda-workspace.js. Answers the
   product's own stated question for this mode ("What is happening?"),
   per docs/AGENDA_TODO_DISCOVERY_REPORT_v1.31.0.0.md's Model 1 framing —
   deliberately NOT a Google-Calendar-style exhaustive listing.
   ============================================================ */

'use strict';

import { groupForAgendaView } from './agenda-date-range.js';
import { isTaskOverdue } from './agenda-lifecycle.js';
import {
  sortEventsByTime, sortTasksByPriority, formatClock, formatDateLong,
  splitParticipants, priorityLabel, typeLabel,
} from './agenda-view-model.js';
import { displayNameFor } from './agenda-directory.js';

function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function eventRow(e) {
  const { pic } = splitParticipants(e.participants);
  const picNames = pic.map(displayNameFor);
  const cancelled = e.status === 'cancelled';
  return `
    <div class="cal-row" data-agenda-action="open-event:${esc(e.id)}" role="button" tabindex="0">
      <div class="cal-row-time">${e.allDay ? 'Sepanjang hari' : formatClock(e.startAt)}</div>
      <span class="cal-row-dot" aria-hidden="true"></span>
      <div class="cal-row-body">
        <p class="cal-row-title${cancelled ? ' cal-row-title--done' : ''}">${esc(e.title)}${cancelled ? ' (Dibatalkan)' : ''}</p>
        <div class="cal-row-meta">
          <span>${esc(typeLabel(e.type))}</span>
          ${e.location ? `<span>${esc(e.location)}</span>` : ''}
          ${picNames.length ? `<span>PIC: ${esc(picNames.join(', '))}</span>` : ''}
          ${e.scope === 'kabid' ? '<span class="cal-pill cal-pill--kabid">Kabid</span>' : ''}
        </div>
      </div>
    </div>`;
}

function taskRow(t, now) {
  const overdue = isTaskOverdue(t, now);
  const pillClass = overdue ? 'cal-pill--overdue' : `cal-pill--${t.priority || 'normal'}`;
  const pillText = overdue ? 'Terlewat' : priorityLabel(t.priority);
  return `
    <div class="cal-row" data-agenda-action="open-task:${esc(t.id)}" role="button" tabindex="0">
      <div class="cal-row-time"></div>
      <span class="cal-row-dot cal-row-dot--task" aria-hidden="true"></span>
      <div class="cal-row-body">
        <p class="cal-row-title">${esc(t.title)}</p>
        <div class="cal-row-meta">
          <span class="cal-pill ${pillClass}">${pillText}</span>
          ${t.scope === 'kabid' ? '<span class="cal-pill cal-pill--kabid">Kabid</span>' : ''}
        </div>
      </div>
    </div>`;
}

/**
 * @param {{events: Array, tasks: Array, now: number, todayStr: string}} data
 */
export function renderAgendaListHTML({ events, tasks, now, todayStr }) {
  const grouped = groupForAgendaView(events, tasks, todayStr);

  // Overdue tasks belong in "Today" regardless of their literal due date —
  // the Agenda view's job is "what do I need to act on today", which
  // includes anything already overdue (documented in agenda-date-range.js
  // itself; this is the caller applying that documented behavior).
  const overdueElsewhere = tasks.filter((t) => isTaskOverdue(t, now) && t.dueDate !== todayStr);
  const todayTasks = sortTasksByPriority([...grouped.today.tasks, ...overdueElsewhere]);
  const todayEvents = sortEventsByTime(grouped.today.events);

  const todaySection = (todayEvents.length || todayTasks.length)
    ? `<div class="cal-daygroup">
        <p class="cal-daylabel">Hari Ini</p>
        ${todayEvents.map(eventRow).join('')}
        ${todayTasks.map((t) => taskRow(t, now)).join('')}
      </div>`
    : `<div class="cal-empty"><div class="cal-empty-title">Tidak ada agenda hari ini</div><div class="cal-empty-sub">Semua agenda dan tugas untuk hari ini sudah selesai, atau belum ada yang dijadwalkan.</div></div>`;

  const upcomingSections = grouped.upcoming.map((bucket) => `
    <div class="cal-daygroup">
      <p class="cal-daylabel">${esc(formatDateLong(bucket.date))}</p>
      ${sortEventsByTime(bucket.events).map(eventRow).join('')}
      ${sortTasksByPriority(bucket.tasks).map((t) => taskRow(t, now)).join('')}
    </div>`).join('');

  const noDueDateSection = grouped.noDueDate.length
    ? `<div class="cal-daygroup">
        <p class="cal-daylabel">Tanpa Tenggat</p>
        ${sortTasksByPriority(grouped.noDueDate).map((t) => taskRow(t, now)).join('')}
      </div>`
    : '';

  return `
    ${todaySection}
    ${upcomingSections ? `<p class="cal-daylabel" style="margin-top:24px;opacity:.7">Akan Datang</p>${upcomingSections}` : ''}
    ${noDueDateSection}`;
}
