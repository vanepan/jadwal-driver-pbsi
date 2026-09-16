/* ============================================================
   agenda-view-calendar.js — month/week grid view
   (V1.31 Agenda & To-Do, Phase C3)

   PURE HTML builder. Month view is deliberately dot/count-only on
   narrow viewports (CSS handles the breakpoint) — a literal event-text
   month grid does not fit 390px at readable size (flagged as a risk
   since Phase A/B, resolved here the way that risk assessment
   recommended: tap a day to see its items via the Agenda list renderer,
   not inline event text in a shrunk cell). Week view stays a real grid
   with visible labels down to mobile widths, matching Overtime's
   heatmap density precedent.

   Monday-first throughout (agenda-date-range.js's own convention,
   matching pbsi-datepicker.js's firstDayOfWeek:1).
   ============================================================ */

'use strict';

import { buildMonthGrid, buildWeekGrid, monthRange, mondayWeekRange } from './agenda-date-range.js';
import { formatDateShort, formatDateLong, eventDisplayState, taskDisplayState, formatClock, splitParticipants, priorityLabel, checklistProgress } from './agenda-view-model.js';
import { calendarItemDisplayState } from './agenda-calendar-lifecycle.js';
import { isTaskOverdue } from './agenda-lifecycle.js';
// This file stays deliberately free of any Firebase-touching import
// (agenda-directory.js, agenda-view-todo.js — both pull in agenda-store.js
// -> firebase.js transitively): scripts/agenda-week-view-check.mjs and
// scripts/agenda-calendar-range-bars-check.mjs import this module DIRECTLY
// in pure Node (no browser) and would break under Node's ESM loader the
// moment anything in this file's import graph reaches a browser-only
// (CDN https://) specifier. Username -> display name resolution is
// therefore INJECTED (an optional `resolveName` parameter, defaulting to
// identity) rather than imported — the real caller (agenda-workspace-
// view.js, which already depends on Firebase-touching sibling views) passes
// the real displayNameFor(); pure-Node callers simply see raw usernames.

const WEEKDAY_LABELS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
const MONTH_NAMES_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const MAX_RANGE_BARS_PER_CELL = 2;

function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function truncate(s, n) { return s.length > n ? `${s.slice(0, n - 1)}…` : s; }

function indexByDate(events, tasks) {
  const byDate = new Map();
  const bucket = (d) => { if (!byDate.has(d)) byDate.set(d, { events: [], tasks: [] }); return byDate.get(d); };
  for (const e of events || []) if (e && e.date) bucket(e.date).events.push(e);
  for (const t of tasks || []) if (t && t.dueDate) bucket(t.dueDate).tasks.push(t);
  return byDate;
}

/**
 * V1.31.1 — assigns each visible Calendar-item day segment to its cell,
 * clipped and capped PER WEEK ROW so a range crossing a week boundary
 * renders as one continuous bar per row, not one bar spanning a line
 * break (spec §AL: "a calendar range... must render as a range, not six
 * unrelated events"; §I: "continuous visual block where appropriate").
 * Rounded ("cap") only on the item's TRUE start/end day — a squared-off
 * edge at a row boundary is what tells the eye "this keeps going".
 * @param {Array<{date:string}>} cells flat grid cells (buildMonthGrid), a
 *   multiple of 7
 * @param {Array} calendarItems already-visible /agendaCalendars records
 * @param {number} now epoch ms, for the active/ended/cancelled state class
 * @returns {Map<string, Array<{item, roundedLeft, roundedRight, showLabel}>>}
 */
export function assignRangeBars(cells, calendarItems, now) {
  const perDate = new Map(cells.map((c) => [c.date, []]));
  if (!cells.length) return perDate;
  const gridStart = cells[0].date;
  const gridEnd = cells[cells.length - 1].date;

  for (const item of calendarItems || []) {
    if (!item || !item.startDate || !item.endDate) continue;
    if (item.endDate < gridStart || item.startDate > gridEnd) continue; // not visible in this grid at all
    for (let i = 0; i < cells.length; i += 7) {
      const rowDates = cells.slice(i, i + 7).map((c) => c.date);
      const rowStart = rowDates[0];
      const rowEnd = rowDates[rowDates.length - 1];
      const visStart = item.startDate > rowStart ? item.startDate : rowStart;
      const visEnd = item.endDate < rowEnd ? item.endDate : rowEnd;
      if (visStart > visEnd) continue;
      for (const d of rowDates) {
        if (d < visStart || d > visEnd) continue;
        perDate.get(d).push({
          item,
          state: calendarItemDisplayState(item, now),
          roundedLeft: d === item.startDate,
          roundedRight: d === item.endDate,
          showLabel: d === item.startDate || d === visStart,
        });
      }
    }
  }
  return perDate;
}

/**
 * V1.31.2 §5 — the Week view's "timed items" list for ONE day: Agenda
 * events, timed (single-day, non-all-day) Calendar items, and To-Do
 * tasks, merged and sorted chronologically — multi-day/all-day Calendar
 * items are handled SEPARATELY (assignRangeBars/rangeBarsHTML, the exact
 * same functions Month view already uses, reused not reimplemented) and
 * never appear here. Status-aware: cancelled/overdue/done get the same
 * visual language the Agenda list view (agenda-view-agenda.js) already
 * established — Week view was previously silent about all three.
 * @param {Array} events already date-bucketed for this one day
 * @param {Array} tasks already date-bucketed for this one day
 * @param {Array} timedCalendarItems single-day, non-all-day Calendar items for this one day
 * @param {number} now epoch ms
 */
export function weekTimedRowsHTML(events, tasks, timedCalendarItems, now) {
  const items = [];
  for (const e of events || []) {
    if (!e) continue;
    const state = eventDisplayState(e, now); // 'cancelled'|'overdue'|'scheduled'
    const cls = ['cal-week-event'];
    if (state === 'cancelled') cls.push('cal-week-event--cancelled');
    if (state === 'overdue') cls.push('cal-week-event--overdue');
    const time = e.allDay ? '' : `<span class="cal-week-event-time">${esc(formatClock(e.startAt))}</span>`;
    items.push({
      sortKey: e.allDay ? -1 : (e.startAt ?? Infinity),
      html: `<div class="${cls.join(' ')}" data-agenda-action="open-event:${esc(e.id)}" title="${esc(e.title)}" role="button" tabindex="0">${time}${esc(e.title)}</div>`,
    });
  }
  for (const c of timedCalendarItems || []) {
    if (!c) continue;
    const state = calendarItemDisplayState(c, now);
    const cls = ['cal-week-event', 'cal-week-event--calendar'];
    if (state === 'berlangsung') cls.push('cal-week-event--calendar-active');
    if (state === 'dibatalkan') cls.push('cal-week-event--calendar-cancelled');
    items.push({
      sortKey: c.startAt ?? Infinity,
      html: `<div class="${cls.join(' ')}" data-agenda-action="open-calendar:${esc(c.id)}" title="${esc(c.title)}" role="button" tabindex="0"><span class="cal-week-event-time">${esc(formatClock(c.startAt))}</span>${esc(c.title)}</div>`,
    });
  }
  for (const t of tasks || []) {
    if (!t) continue;
    const state = taskDisplayState(t, now); // 'done'|'overdue'|<status>
    const cls = ['cal-week-event', 'cal-week-event--task'];
    if (state === 'done') cls.push('cal-week-event--task-done');
    if (state === 'overdue') cls.push('cal-week-event--task-overdue');
    // Date-only tasks (no dueTime) sort to the bottom of the day's list —
    // they're a "sometime today" reminder, not a scheduled moment.
    const time = t.dueTime ? `<span class="cal-week-event-time">${esc(formatClock(t.dueAt))}</span>` : '';
    items.push({
      sortKey: t.dueTime ? (t.dueAt ?? Infinity) : Infinity,
      html: `<div class="${cls.join(' ')}" data-agenda-action="open-task:${esc(t.id)}" title="${esc(t.title)}" role="button" tabindex="0">${time}${esc(t.title)}</div>`,
    });
  }
  items.sort((a, b) => a.sortKey - b.sortKey);
  return items.map((i) => i.html).join('');
}

function rangeBarsHTML(bars) {
  const shown = bars.slice(0, MAX_RANGE_BARS_PER_CELL);
  const overflow = bars.length - shown.length;
  const html = shown.map((bar) => {
    const cls = ['cal-range-bar', `cal-range-bar--${bar.state}`];
    if (bar.roundedLeft) cls.push('cal-range-bar--cap-left');
    if (bar.roundedRight) cls.push('cal-range-bar--cap-right');
    const label = bar.showLabel ? `<span class="cal-range-bar-label">${esc(truncate(bar.item.title || '', 18))}</span>` : '';
    return `<div class="${cls.join(' ')}" data-agenda-action="open-calendar:${esc(bar.item.id)}" title="${esc(bar.item.title || '')}" role="button" tabindex="0">${label}</div>`;
  }).join('');
  return html + (overflow > 0 ? `<div class="cal-range-bar-more">+${overflow} kalender</div>` : '');
}

function monthHeaderLabel(anchorDate) {
  const [y, m] = anchorDate.split('-').map(Number);
  return `${MONTH_NAMES_ID[m - 1]} ${y}`;
}

const identityResolver = (u) => u;

/** SS9 R2 — Day Detail: a date-cell click sets a SELECTED date (transient
 *  UI state, never persisted) instead of switching Month<->Week; this
 *  renders that one date's Agenda + Calendar + To-Do items below the
 *  grid, filtered from the SAME already-loaded arrays the grid itself
 *  already received — no new Firebase query, no second listener, no
 *  second cache. Reuses the row visual language (cal-row/cal-todo-row/
 *  cal-pill) the Agenda List and To-Do views already established.
 *  `resolveName` is injected (see file header) rather than imported. */
function dayDetailEventRow(e, now, resolveName) {
  const { pic } = splitParticipants(e.participants);
  const picNames = pic.map(resolveName);
  const cancelled = eventDisplayState(e, now) === 'cancelled';
  return `<div class="cal-row" data-agenda-action="open-event:${esc(e.id)}" role="button" tabindex="0">
    <div class="cal-row-time">${e.allDay ? 'Sepanjang hari' : esc(formatClock(e.startAt))}</div>
    <span class="cal-row-dot" aria-hidden="true"></span>
    <div class="cal-row-body">
      <p class="cal-row-title${cancelled ? ' cal-row-title--done' : ''}">${esc(e.title)}${cancelled ? ' (Dibatalkan)' : ''}</p>
      ${picNames.length ? `<div class="cal-row-meta"><span>PIC: ${esc(picNames.join(', '))}</span></div>` : ''}
    </div>
  </div>`;
}
function dayDetailCalendarRow(c, now) {
  const cancelled = calendarItemDisplayState(c, now) === 'dibatalkan';
  return `<div class="cal-row" data-agenda-action="open-calendar:${esc(c.id)}" role="button" tabindex="0">
    <div class="cal-row-time">${c.allDay ? 'Sepanjang hari' : esc(formatClock(c.startAt))}</div>
    <span class="cal-row-dot" aria-hidden="true"></span>
    <div class="cal-row-body">
      <p class="cal-row-title${cancelled ? ' cal-row-title--done' : ''}">${esc(c.title)}${cancelled ? ' (Dibatalkan)' : ''}</p>
    </div>
  </div>`;
}
/** Mirrors agenda-view-todo.js#todoRow()'s exact markup/classes (same
 *  visual language, same data-agenda-action verbs) — not imported, for
 *  the Firebase-purity reason explained at the top of this file. */
function dayDetailTaskRow(t, now, resolveName) {
  const done = t.status === 'done';
  const overdue = !done && isTaskOverdue(t, now);
  const { done: chkDone, total: chkTotal } = checklistProgress(t);
  const responsible = Object.keys(t.responsible || {}).map(resolveName);
  const pillClass = overdue ? 'cal-pill--overdue' : done ? 'cal-pill--done' : `cal-pill--${t.priority || 'normal'}`;
  const pillText = overdue ? 'Terlewat' : done ? 'Selesai' : priorityLabel(t.priority);
  return `<div class="cal-todo-row">
    <span class="cal-checkbox" role="checkbox" aria-checked="${done}" aria-label="Tandai selesai" tabindex="0" data-agenda-action="toggle-task-done:${esc(t.id)}">${done ? '&#10003;' : ''}</span>
    <div class="cal-row-body" data-agenda-action="open-task:${esc(t.id)}" role="button" tabindex="0">
      <p class="cal-row-title${done ? ' cal-row-title--done' : ''}">${esc(t.title)}</p>
      <div class="cal-row-meta">
        <span class="cal-pill ${pillClass}">${pillText}</span>
        ${chkTotal ? `<span>${chkDone}/${chkTotal} checklist</span>` : ''}
        ${responsible.length ? `<span>${esc(responsible.join(', '))}</span>` : ''}
        ${t.scope === 'kabid' ? '<span class="cal-pill cal-pill--kabid">Kabid</span>' : ''}
      </div>
    </div>
  </div>`;
}
/** @param {{date:string, events:Array, tasks:Array, calendarItems:Array, now:number, resolveName?:(u:string)=>string}} d */
export function dayDetailHTML({ date, events, tasks, calendarItems, now, resolveName = identityResolver }) {
  const dayEvents = (events || []).filter((e) => e && e.date === date);
  const dayCalendarItems = (calendarItems || []).filter((c) => c && c.startDate && c.endDate && date >= c.startDate && date <= c.endDate);
  const dayTasks = (tasks || []).filter((t) => t && t.dueDate === date);

  if (!dayEvents.length && !dayCalendarItems.length && !dayTasks.length) {
    return `<div class="cal-daydetail-empty">Tidak ada agenda atau tugas<br>untuk tanggal ini.</div>`;
  }
  const agendaRows = [
    ...dayEvents.map((e) => ({ sortKey: e.allDay ? -1 : (e.startAt ?? Infinity), html: dayDetailEventRow(e, now, resolveName) })),
    ...dayCalendarItems.map((c) => ({ sortKey: c.allDay ? -1 : (c.startAt ?? Infinity), html: dayDetailCalendarRow(c, now) })),
  ].sort((a, b) => a.sortKey - b.sortKey).map((x) => x.html).join('');
  const todoRows = dayTasks.map((t) => dayDetailTaskRow(t, now, resolveName)).join('');

  return `
    ${agendaRows ? `<p class="cal-daylabel">Agenda</p>${agendaRows}` : ''}
    ${todoRows ? `<p class="cal-daylabel">To-Do</p>${todoRows}` : ''}`;
}

/** SS9 R2 — the currently-selected date's own detail section, appended
 *  after the grid (never inside a cell) so it works identically for
 *  Month and Week. Absent (null) selectedDate renders nothing, keeping
 *  the calendar exactly as it was before this feature when nothing has
 *  been explicitly selected. */
function selectedDateSectionHTML(selectedDate, events, tasks, calendarItems, now, resolveName) {
  if (!selectedDate) return '';
  return `<div class="cal-daydetail">
    <p class="cal-daydetail-heading">Tanggal Terpilih: ${esc(formatDateLong(selectedDate))}</p>
    ${dayDetailHTML({ date: selectedDate, events, tasks, calendarItems, now, resolveName })}
  </div>`;
}

/**
 * @param {{events: Array, tasks: Array, calendarItems: Array, mode: 'month'|'week', anchorDate: string, todayStr: string, now: number, selectedDate: ?string, resolveName?: (u:string)=>string}} data
 */
export function renderCalendarHTML({ events, tasks, calendarItems = [], mode, anchorDate, todayStr, now = Date.now(), selectedDate = null, resolveName = identityResolver }) {
  const byDate = indexByDate(events, tasks);
  const range = mode === 'month' ? monthRange(anchorDate) : mondayWeekRange(anchorDate);
  const label = mode === 'month'
    ? monthHeaderLabel(anchorDate)
    : `${formatDateShort(range.start)} – ${formatDateShort(range.end)}`;

  const nav = `
    <div class="cal-header" style="margin-bottom:10px">
      <div>
        <button type="button" class="cal-btn cal-btn--ghost cal-btn--sm" data-agenda-action="cal-prev" aria-label="Sebelumnya">&larr;</button>
        <strong style="margin:0 8px">${esc(label)}</strong>
        <button type="button" class="cal-btn cal-btn--ghost cal-btn--sm" data-agenda-action="cal-next" aria-label="Berikutnya">&rarr;</button>
      </div>
      <button type="button" class="cal-btn cal-btn--sm" data-agenda-action="cal-today">Hari Ini</button>
    </div>
    <div class="cal-grid-head">${WEEKDAY_LABELS.map((w) => `<span>${w}</span>`).join('')}</div>`;

  const emptyHint = `<div class="cal-empty-hint">Belum ada kegiatan kalender pada periode ini.</div>`;

  if (mode === 'week') {
    const cells = buildWeekGrid(anchorDate);
    // V1.31.2 §5 — split Calendar items into the two areas the spec asks
    // for: all-day/multi-day commitments get their own dedicated band
    // (assignRangeBars/rangeBarsHTML — the EXACT functions Month view
    // already uses, reused not reimplemented, so a range crossing this
    // week keeps the identical continuous-bar/cap-only-at-true-start-end
    // treatment); a timed, single-day Calendar item joins the "timed
    // items" list below instead, sorted alongside Agenda events and
    // To-Do tasks by actual time-of-day.
    const rangeCalendarItems = (calendarItems || []).filter((c) => c && c.startDate && c.endDate && (c.allDay || c.startDate !== c.endDate));
    const timedCalendarItems = (calendarItems || []).filter((c) => c && c.startDate && c.endDate && !c.allDay && c.startDate === c.endDate);
    const rangeBarsByDate = assignRangeBars(cells, rangeCalendarItems, now);
    let anyContent = false;
    const body = cells.map(({ date }) => {
      const day = byDate.get(date) || { events: [], tasks: [] };
      const isToday = date === todayStr;
      const isSelected = date === selectedDate;
      const bars = rangeBarsByDate.get(date) || [];
      const timedToday = timedCalendarItems.filter((c) => c.startDate === date);
      if (bars.length || day.events.length || day.tasks.length || timedToday.length) anyContent = true;
      const alldayBand = bars.length ? `<div class="cal-week-allday">${rangeBarsHTML(bars)}</div>` : '';
      const timedRows = weekTimedRowsHTML(day.events, day.tasks, timedToday, now);
      return `<div class="cal-cell${isToday ? ' cal-cell--today' : ''}${isSelected ? ' cal-cell--selected' : ''}" data-agenda-action="goto-day:${date}" role="button" tabindex="0" aria-pressed="${isSelected}" aria-label="${esc(date)}">
        <span class="cal-cell-num">${Number(date.slice(8, 10))}</span>
        ${alldayBand}
        <div class="cal-week-timed">${timedRows}</div>
      </div>`;
    }).join('');
    return `${nav}<div class="cal-grid cal-week-row">${body}</div>${anyContent ? '' : emptyHint}${selectedDateSectionHTML(selectedDate, events, tasks, calendarItems, now, resolveName)}`;
  }

  const cells = buildMonthGrid(anchorDate);
  const rangeBarsByDate = assignRangeBars(cells, calendarItems, now);
  let anyContent = false;
  const body = cells.map(({ date, inCurrentMonth }) => {
    const day = byDate.get(date) || { events: [], tasks: [] };
    const isToday = date === todayStr;
    const isSelected = date === selectedDate;
    const count = day.events.length + day.tasks.length;
    const bars = rangeBarsByDate.get(date) || [];
    if (inCurrentMonth && (count || bars.length)) anyContent = true;
    const dots = [
      ...day.events.slice(0, 3).map(() => '<span class="cal-cell-dot"></span>'),
      ...day.tasks.slice(0, 3).map(() => '<span class="cal-cell-dot cal-cell-dot--task"></span>'),
    ].slice(0, 4).join('');
    return `<div class="cal-cell${inCurrentMonth ? '' : ' cal-cell--out'}${isToday ? ' cal-cell--today' : ''}${isSelected ? ' cal-cell--selected' : ''}" data-agenda-action="goto-day:${date}" role="button" tabindex="0" aria-pressed="${isSelected}" aria-label="${esc(date)}">
        <span class="cal-cell-num">${Number(date.slice(8, 10))}</span>
        <span class="cal-cell-label"><span class="cal-cell-dots">${dots}</span>${count > 4 ? `<span class="cal-cell-count">+${count - 4}</span>` : ''}</span>
        ${rangeBarsHTML(bars)}
      </div>`;
  }).join('');

  return `${nav}<div class="cal-grid">${body}</div>${anyContent ? '' : emptyHint}${selectedDateSectionHTML(selectedDate, events, tasks, calendarItems, now, resolveName)}`;
}
