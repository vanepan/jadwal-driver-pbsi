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

import { groupForAgendaView, formatDateRangeLabel } from './agenda-date-range.js';
import { isTaskOverdue } from './agenda-lifecycle.js';
import { calendarItemDisplayState } from './agenda-calendar-lifecycle.js';
import {
  sortTasksByPriority, formatClock, formatDateLong,
  splitParticipants, priorityLabel, typeLabel,
} from './agenda-view-model.js';
import { displayNameFor } from './agenda-directory.js';
import { agendaIdentityColorVar } from './agenda-identity-colors.js';

function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

/** SS9 R1 — the one PIC (or organizer, if none marked PIC yet) whose
 *  color represents this event; a task's first responsible person. */
function primaryPersonUsername(record, kind) {
  if (kind === 'task') return Object.keys(record.responsible || {})[0] || null;
  const { pic } = splitParticipants(record.participants);
  return pic[0] || record.organizerUsername || null;
}
function identityDotHTML(username, colorMap) {
  if (!username) return '';
  return `<span class="cal-identity-dot" style="background:${agendaIdentityColorVar(username, colorMap)}" title="${esc(displayNameFor(username))}" aria-hidden="true"></span>`;
}

function eventRow(e, colorMap) {
  const { pic } = splitParticipants(e.participants);
  const picNames = pic.map(displayNameFor);
  const cancelled = e.status === 'cancelled';
  const dot = identityDotHTML(primaryPersonUsername(e, 'event'), colorMap);
  return `
    <div class="cal-row" data-agenda-action="open-event:${esc(e.id)}" role="button" tabindex="0">
      <div class="cal-row-time">${e.allDay ? 'Sepanjang hari' : formatClock(e.startAt)}</div>
      <span class="cal-row-dot" aria-hidden="true"></span>
      <div class="cal-row-body">
        <p class="cal-row-title${cancelled ? ' cal-row-title--done' : ''}">${dot}${esc(e.title)}${cancelled ? ' (Dibatalkan)' : ''}</p>
        <div class="cal-row-meta">
          <span>${esc(typeLabel(e.type))}</span>
          ${e.location ? `<span>${esc(e.location)}</span>` : ''}
          ${picNames.length ? `<span>PIC: ${esc(picNames.join(', '))}</span>` : ''}
          ${e.scope === 'kabid' ? '<span class="cal-pill cal-pill--kabid">Kabid</span>' : ''}
        </div>
      </div>
    </div>`;
}

/** SS9.1 R2 — a multi-day Calendar item in Daftar (previously invisible
 *  here — this view never received calendarItems before this phase).
 *  Mirrors eventRow's markup; title stays visually primary (matches
 *  eventRow's row-title), the date range is supporting metadata below it,
 *  never louder than the title. formatDateRangeLabel() returns null for
 *  a same-day item, so no redundant range is ever shown. */
function calendarRow(c, now, colorMap) {
  const cancelled = calendarItemDisplayState(c, now) === 'dibatalkan';
  const dot = identityDotHTML(primaryPersonUsername(c, 'calendar'), colorMap);
  const rangeLabel = formatDateRangeLabel(c.startDate, c.endDate);
  return `
    <div class="cal-row" data-agenda-action="open-calendar:${esc(c.id)}" role="button" tabindex="0">
      <div class="cal-row-time">${c.allDay ? 'Sepanjang hari' : formatClock(c.startAt)}</div>
      <span class="cal-row-dot" aria-hidden="true"></span>
      <div class="cal-row-body">
        <p class="cal-row-title${cancelled ? ' cal-row-title--done' : ''}">${dot}${esc(c.title)}${cancelled ? ' (Dibatalkan)' : ''}</p>
        ${rangeLabel ? `<div class="cal-row-meta"><span>${esc(rangeLabel)}</span></div>` : ''}
      </div>
    </div>`;
}

function taskRow(t, now, colorMap) {
  const overdue = isTaskOverdue(t, now);
  const pillClass = overdue ? 'cal-pill--overdue' : `cal-pill--${t.priority || 'normal'}`;
  const pillText = overdue ? 'Terlewat' : priorityLabel(t.priority);
  const dot = identityDotHTML(primaryPersonUsername(t, 'task'), colorMap);
  return `
    <div class="cal-row" data-agenda-action="open-task:${esc(t.id)}" role="button" tabindex="0">
      <div class="cal-row-time"></div>
      <span class="cal-row-dot cal-row-dot--task" aria-hidden="true"></span>
      <div class="cal-row-body">
        <p class="cal-row-title">${dot}${esc(t.title)}</p>
        <div class="cal-row-meta">
          <span class="cal-pill ${pillClass}">${pillText}</span>
          ${t.scope === 'kabid' ? '<span class="cal-pill cal-pill--kabid">Kabid</span>' : ''}
        </div>
      </div>
    </div>`;
}

/** SS9.1 R2 — events + calendar items for one day/bucket, time-interleaved
 *  (all-day floats first), mirroring agenda-view-calendar.js#dayDetailHTML's
 *  own sortKey convention exactly, so Daftar and Day Detail read
 *  consistently instead of each inventing their own order. Rendered
 *  before tasks, same as that panel's Agenda-then-To-Do split. */
function agendaEntriesHTML(events, calendarItems, now, colorMap) {
  return [
    ...(events || []).map((e) => ({ sortKey: e.allDay ? -1 : (e.startAt ?? Infinity), html: eventRow(e, colorMap) })),
    ...(calendarItems || []).map((c) => ({ sortKey: c.allDay ? -1 : (c.startAt ?? Infinity), html: calendarRow(c, now, colorMap) })),
  ].sort((a, b) => a.sortKey - b.sortKey).map((x) => x.html).join('');
}

/**
 * @param {{events: Array, tasks: Array, calendarItems?: Array, now: number, todayStr: string, colorMap?: Record<string,string>}} data
 */
export function renderAgendaListHTML({ events, tasks, calendarItems = [], now, todayStr, colorMap = {} }) {
  const grouped = groupForAgendaView(events, tasks, todayStr, 14, calendarItems);

  // Overdue tasks belong in "Today" regardless of their literal due date —
  // the Agenda view's job is "what do I need to act on today", which
  // includes anything already overdue (documented in agenda-date-range.js
  // itself; this is the caller applying that documented behavior).
  const overdueElsewhere = tasks.filter((t) => isTaskOverdue(t, now) && t.dueDate !== todayStr);
  const todayTasks = sortTasksByPriority([...grouped.today.tasks, ...overdueElsewhere]);
  const todayAgenda = agendaEntriesHTML(grouped.today.events, grouped.today.calendarItems, now, colorMap);

  const todaySection = (todayAgenda || todayTasks.length)
    ? `<div class="cal-daygroup">
        <p class="cal-daylabel">Hari Ini</p>
        ${todayAgenda}
        ${todayTasks.map((t) => taskRow(t, now, colorMap)).join('')}
      </div>`
    : `<div class="cal-empty"><div class="cal-empty-title">Tidak ada agenda hari ini</div><div class="cal-empty-sub">Semua agenda dan tugas untuk hari ini sudah selesai, atau belum ada yang dijadwalkan.</div></div>`;

  const upcomingSections = grouped.upcoming.map((bucket) => `
    <div class="cal-daygroup">
      <p class="cal-daylabel">${esc(formatDateLong(bucket.date))}</p>
      ${agendaEntriesHTML(bucket.events, bucket.calendarItems, now, colorMap)}
      ${sortTasksByPriority(bucket.tasks).map((t) => taskRow(t, now, colorMap)).join('')}
    </div>`).join('');

  const noDueDateSection = grouped.noDueDate.length
    ? `<div class="cal-daygroup">
        <p class="cal-daylabel">Tanpa Tenggat</p>
        ${sortTasksByPriority(grouped.noDueDate).map((t) => taskRow(t, now, colorMap)).join('')}
      </div>`
    : '';

  return `
    ${todaySection}
    ${upcomingSections ? `<p class="cal-daylabel" style="margin-top:24px;opacity:.7">Akan Datang</p>${upcomingSections}` : ''}
    ${noDueDateSection}`;
}
