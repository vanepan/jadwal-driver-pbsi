/* ============================================================
   agenda-pdf-view-model.js — pure PDF export view-model builder
   (V1.31 Agenda & To-Do, Phase C4)

   PURE: no Firebase, no pdfmake, no DOM. Consumes already-scoped,
   already-visible events/tasks — exactly what agenda-store.js's
   getVisibleEvents()/getVisibleTasks() already hold, the SAME
   authorization boundary the in-app UI itself uses. This module never
   fetches anything broader "then filters" — the caller must only ever
   pass what the current session is already authorized to see.

   `directory` is a plain, pre-resolved snapshot ({[username]:
   {displayName, class}}), built by the impure caller (agenda-pdf-
   export.js) via agenda-directory.js's displayNameFor()/
   resolveParticipantClass() — this file itself never touches Firebase,
   mirroring nor-document-engine.js's own pure-builder/impure-gatherer
   split.

   THE SARPRAS IDENTITY TRANSFORM (critical — see docs/AGENDA_TODO_
   PHASE_B_ARCHITECTURE_VALIDATION_v1.31.0.0.md §6.2, REVISED for this
   phase per explicit instruction: Kabid participants are shown
   individually, not collapsed to 'Kabid Sarpras' as that doc originally
   specified):
     - organizationalResponsible is ALWAYS the literal string 'SARPRAS'
       — never conditional, never derived from who actually organized it.
     - a participant/PIC/responsible classified 'sarpras' (ordinary
       Sarpras staff) is DROPPED and folded into one shared 'Tim Sarpras'
       flag — not merely relabeled: the individual identity never exists
       anywhere in the object this function returns, so no future
       template/renderer can leak it by reading a different field.
     - a participant classified 'kabid' OR 'unknown' (anyone this app's
       own classifier doesn't recognize as ordinary Sarpras staff — a
       Kabid, or any other genuinely external stakeholder) is kept
       INDIVIDUALLY, by real display name — they are named stakeholders
       an official document is supposed to credit, not staff being
       anonymized. 'unknown' defaults to "show individually" rather than
       "collapse" precisely so this transform can never silently erase a
       real person's involvement it wasn't confident enough to classify.
   ============================================================ */

'use strict';

import { isTaskOverdue, isEventOverdue } from './agenda-lifecycle.js';
import { priorityLabel, typeLabel, checklistProgress, formatClock } from './agenda-view-model.js';
import { formatDateLong } from '../utils.js';

export const ORG_NAME = 'Bidang Sarana dan Prasarana';

function displayFor(username, directory) {
  const entry = directory && directory[username];
  return (entry && entry.displayName) || username;
}

function classOf(username, directory) {
  const entry = directory && directory[username];
  return (entry && entry.class) || 'unknown';
}

/** epoch ms -> "YYYY-MM-DD" via LOCAL date fields (same convention as
 *  js/utils.js#todayString(), just applied to an INJECTED instant
 *  instead of the live clock — this is formatting, not a clock read). */
function epochToDateStr(epochMs) {
  const d = new Date(epochMs);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** One participant/PIC/responsible username list -> the transformed
 *  display the PDF may show. Sarpras staff collapse into a single shared
 *  flag (5 Sarpras staff never becomes 5 lines reading "Tim Sarpras");
 *  Kabid/unknown usernames are individually named. */
function transformPeople(usernames, directory, picSet) {
  const individuals = [];
  let hasSarprasTeam = false;
  for (const u of usernames || []) {
    const cls = classOf(u, directory);
    if (cls === 'sarpras') { hasSarprasTeam = true; continue; }
    individuals.push({
      name: displayFor(u, directory),
      isPic: !!(picSet && picSet.has(u)),
      isKabid: cls === 'kabid',
    });
  }
  return { hasSarprasTeam, individuals };
}

function transformEvent(event, directory, now) {
  const participants = event.participants || {};
  const usernames = Object.keys(participants);
  const picSet = new Set(usernames.filter((u) => participants[u] && participants[u].isPic));
  const { hasSarprasTeam, individuals } = transformPeople(usernames, directory, picSet);
  return {
    title: event.title,
    type: typeLabel(event.type),
    dateLabel: formatDateLong(event.date),
    timeLabel: event.allDay ? 'Sepanjang hari' : `${formatClock(event.startAt)} – ${formatClock(event.endAt)}`,
    location: event.location || '—',
    organizationalResponsible: 'SARPRAS',
    hasSarprasTeam,
    people: individuals,
    status: event.status === 'cancelled' ? 'cancelled' : (isEventOverdue(event, now) ? 'overdue' : 'scheduled'),
  };
}

function transformTask(task, directory, now) {
  const usernames = Object.keys(task.responsible || {});
  const { hasSarprasTeam, individuals } = transformPeople(usernames, directory, null);
  const cp = checklistProgress(task);
  return {
    title: task.title,
    dueLabel: task.dueDate ? `${formatDateLong(task.dueDate)}${task.dueTime ? ' ' + task.dueTime : ''}` : '—',
    priority: priorityLabel(task.priority),
    organizationalResponsible: 'SARPRAS',
    hasSarprasTeam,
    people: individuals,
    status: task.status === 'done' ? 'done' : (isTaskOverdue(task, now) ? 'overdue' : 'in_progress'),
    checklistLabel: cp.total ? `${cp.done}/${cp.total}` : null,
  };
}

/**
 * @param {Object} opts
 * @param {Array} opts.events already-scoped/visible /agendaEvents records
 * @param {Array} opts.tasks already-scoped/visible /agendaTasks records
 * @param {{start:string,end:string,label:string}} opts.range from resolvePresetRange()
 * @param {{mode:'agenda'|'todo'|'semua', status?:string, priority?:string}} opts.filters
 * @param {Object} opts.directory plain {[username]:{displayName,class}} snapshot
 * @param {number} opts.now epoch ms — injected (pure); drives overdue
 *   derivation AND the "generated at" label, never read internally.
 * @returns {Object} the PDF template's entire input — no individual
 *   Sarpras-staff identity exists anywhere in the returned tree.
 */
export function buildAgendaPdfViewModel({ events, tasks, range, filters, directory, now }) {
  if (!range || !range.start || !range.end) throw new Error('buildAgendaPdfViewModel: range is required');
  if (now == null) throw new Error('buildAgendaPdfViewModel: now (epoch ms) is required');

  const mode = (filters && filters.mode) || 'semua';
  const statusFilter = filters && filters.status;
  const priorityFilter = filters && filters.priority;

  const inRange = (dateStr) => !!dateStr && dateStr >= range.start && dateStr <= range.end;

  const filteredEvents = mode === 'todo' ? [] : (events || []).filter((e) => e && inRange(e.date));
  const filteredTasks = (mode === 'agenda' ? [] : (tasks || []).filter((t) => t && inRange(t.dueDate)))
    .filter((t) => {
      if (priorityFilter && priorityFilter !== 'all' && t.priority !== priorityFilter) return false;
      if (statusFilter && statusFilter !== 'all') {
        if (statusFilter === 'overdue') return isTaskOverdue(t, now);
        return t.status === statusFilter;
      }
      return true;
    });

  const agendaItems = [...filteredEvents]
    .sort((a, b) => (a.date === b.date ? (a.startAt || 0) - (b.startAt || 0) : (a.date < b.date ? -1 : 1)))
    .map((e) => transformEvent(e, directory, now));
  const taskItems = [...filteredTasks]
    .sort((a, b) => {
      const ad = a.dueDate || '9999-99-99', bd = b.dueDate || '9999-99-99';
      return ad < bd ? -1 : ad > bd ? 1 : 0;
    })
    .map((t) => transformTask(t, directory, now));

  const reportTitle = mode === 'agenda' ? 'Laporan Agenda' : mode === 'todo' ? 'Laporan To-Do' : 'Laporan Agenda & To-Do';

  return {
    org: ORG_NAME,
    reportTitle,
    dateRangeLabel: `${formatDateLong(range.start)} – ${formatDateLong(range.end)} (${range.label})`,
    generatedAtLabel: `${formatDateLong(epochToDateStr(now))}, ${formatClock(now)}`,
    mode,
    agendaItems,
    taskItems,
    summary: {
      totalEvents: agendaItems.length,
      totalTasks: taskItems.length,
      overdueTasks: taskItems.filter((t) => t.status === 'overdue').length,
      doneTasks: taskItems.filter((t) => t.status === 'done').length,
    },
  };
}
