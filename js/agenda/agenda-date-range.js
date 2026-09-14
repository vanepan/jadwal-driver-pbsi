/* ============================================================
   agenda-date-range.js — pure calendar-grid + grouping + PDF export
   date-range-preset helpers (V1.31 Agenda & To-Do, Phase C3 + C4)

   PURE: no Firebase, no DOM. Built entirely on js/utils.js's existing
   date helpers (todayString/parseLocalDate/offsetDate) — no new date
   library, per Phase A's own finding that none exists anywhere in this
   app. Two families of exports live here: the original C3
   calendar/grouping resolver (month/week grids, today-vs-upcoming
   grouping), and the C4 PDF-export date-RANGE-preset resolver
   (resolvePresetRange — Minggu ini/Bulan depan/Custom/etc.), added
   alongside rather than as a new sibling file since this module's own
   original header already named it as belonging here.
   ============================================================ */

'use strict';

import { todayString, parseLocalDate, offsetDate } from '../utils.js';

/** 1 (Mon) .. 7 (Sun) — native getDay() is 0(Sun)..6(Sat); this remaps so
 *  Monday-first math (matching pbsi-datepicker.js's firstDayOfWeek:1
 *  convention) is a single subtraction, not a special-cased branch. */
function isoWeekday(dateStr) {
  const d = parseLocalDate(dateStr).getDay();
  return d === 0 ? 7 : d;
}

/** Monday..Sunday of the week containing `dateStr`. */
export function mondayWeekRange(dateStr) {
  const wd = isoWeekday(dateStr);
  const start = offsetDate(dateStr, -(wd - 1));
  const end = offsetDate(start, 6);
  return { start, end };
}

/** 1st..last day of the calendar month containing `dateStr`. */
export function monthRange(dateStr) {
  const [y, m] = dateStr.split('-').map(Number);
  const start = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(y, m, 0).getDate(); // day 0 of next month = last day of this month
  const end = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
}

/**
 * A flat array of `{date, inCurrentMonth}` cells covering the full
 * Monday-first weeks needed to display `dateStr`'s month (always a
 * multiple of 7 — leading/trailing days from adjacent months included so
 * every week row is complete, matching every calendar grid convention).
 * @param {string} dateStr YYYY-MM-DD, any day within the target month
 * @returns {Array<{date: string, inCurrentMonth: boolean}>}
 */
export function buildMonthGrid(dateStr) {
  const { start: monthStart, end: monthEnd } = monthRange(dateStr);
  const gridStart = mondayWeekRange(monthStart).start;
  const gridEnd = mondayWeekRange(monthEnd).end;
  const cells = [];
  let cursor = gridStart;
  while (cursor <= gridEnd) {
    cells.push({ date: cursor, inCurrentMonth: cursor >= monthStart && cursor <= monthEnd });
    cursor = offsetDate(cursor, 1);
  }
  return cells;
}

/** 7 `{date}` cells, Monday..Sunday, for the week containing `dateStr`. */
export function buildWeekGrid(dateStr) {
  const { start } = mondayWeekRange(dateStr);
  return Array.from({ length: 7 }, (_, i) => ({ date: offsetDate(start, i) }));
}

/**
 * Groups events (by `.date`, the local WIB calendar date already on the
 * record) and tasks (by `.dueDate`) into Today / Upcoming buckets for the
 * default Agenda view. Undated tasks (no due date at all) go into a
 * separate `noDueDate` bucket rather than being silently dropped.
 * `upcomingDays` bounds how far ahead "Upcoming" looks (default 14) —
 * the §38 performance guidance ("prioritize current day + near upcoming")
 * implemented as a simple, adjustable parameter, not a hardcoded cutoff.
 * @param {Array} events already-scoped, already-visible event records
 * @param {Array} tasks already-scoped, already-visible task records
 * @param {string} [todayStr] injectable for testability — defaults to todayString()
 * @param {number} [upcomingDays]
 */
export function groupForAgendaView(events, tasks, todayStr = todayString(), upcomingDays = 14) {
  const horizon = offsetDate(todayStr, upcomingDays);
  const today = { events: [], tasks: [] };
  const upcoming = new Map(); // date -> {events:[], tasks:[]}
  const noDueDate = [];

  const bucketFor = (date) => {
    if (!upcoming.has(date)) upcoming.set(date, { date, events: [], tasks: [] });
    return upcoming.get(date);
  };

  for (const e of events || []) {
    if (!e || !e.date) continue;
    if (e.date === todayStr) today.events.push(e);
    else if (e.date > todayStr && e.date <= horizon) bucketFor(e.date).events.push(e);
  }
  for (const t of tasks || []) {
    if (!t) continue;
    if (!t.dueDate) { noDueDate.push(t); continue; }
    if (t.dueDate === todayStr) today.tasks.push(t);
    else if (t.dueDate > todayStr && t.dueDate <= horizon) bucketFor(t.dueDate).tasks.push(t);
    // A task due in the PAST (overdue, not today) still belongs in Today's
    // attention set — the Agenda view's own renderer folds overdue items
    // into the Today section regardless of their literal dueDate, since
    // "what do I need to act on today" (the view's stated job) includes
    // anything already overdue. Handled by the caller via isTaskOverdue(),
    // not duplicated here — this function only groups by literal date.
  }

  const upcomingDates = [...upcoming.keys()].sort();
  return {
    today,
    upcoming: upcomingDates.map((d) => upcoming.get(d)),
    noDueDate,
  };
}

/* ── PDF export date-range presets (Phase C4) ────────────────────────── */

export const AGENDA_REPORT_PRESETS = [
  'this_week', 'next_week', 'rolling_week', 'this_month', 'next_month', 'rolling_month', 'custom',
];

const PRESET_LABELS = {
  this_week: 'Minggu ini', next_week: 'Minggu depan', rolling_week: '1 Minggu',
  this_month: 'Bulan ini', next_month: 'Bulan depan', rolling_month: '1 Bulan',
  custom: 'Custom',
};

export function presetLabel(preset) { return PRESET_LABELS[preset] || preset; }

/** 1st..last day of the calendar month immediately AFTER the month
 *  containing `dateStr` — extends monthRange()'s own "day 0 of next
 *  month" trick one month further rather than approximating with a
 *  ±30-day offset (agenda-workspace.js's calendar-nav shortcut is fine
 *  for re-deriving "which month is this roughly in", but wrong here: a
 *  report needs the FULL next calendar month, not a 30-day window). */
export function nextMonthRange(dateStr) {
  const [y, m] = dateStr.split('-').map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  const start = `${ny}-${String(nm).padStart(2, '0')}-01`;
  const lastDay = new Date(ny, nm, 0).getDate();
  const end = `${ny}-${String(nm).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
}

/**
 * Resolves one of the 7 PDF export date-range presets to a concrete
 * {start, end} (both YYYY-MM-DD, inclusive). PURE — never reads
 * Date.now()/new Date() for "now"; `todayStr` is always the caller's
 * responsibility (defaults to todayString() only as the one injectable
 * top-level entry point, mirroring groupForAgendaView()'s own
 * convention above).
 *
 * 'this_week'/'next_week' are Monday-first calendar weeks (mondayWeekRange).
 * 'this_month'/'next_month' are full calendar months (monthRange/nextMonthRange).
 * 'rolling_week'/'rolling_month' are deliberately DIFFERENT from their
 * calendar-aligned siblings — a rolling N-day window starting today
 * (today..today+6 / today..today+29) — matching the brief's own
 * distinct "Minggu ini" vs "1 minggu" / "Bulan ini" vs "1 bulan" labels.
 * 'custom' requires both customFrom/customTo (YYYY-MM-DD) and does NOT
 * validate end>=start itself (single responsibility) — callers validate
 * with js/validation.js#validateDateRange before/instead of trusting this.
 * @param {string} preset one of AGENDA_REPORT_PRESETS
 * @param {string} [todayStr] injectable — defaults to todayString()
 * @param {{customFrom?: string, customTo?: string}} [custom]
 * @returns {{start: string, end: string, label: string}}
 */
export function resolvePresetRange(preset, todayStr = todayString(), custom = {}) {
  switch (preset) {
    case 'this_week': return { ...mondayWeekRange(todayStr), label: PRESET_LABELS.this_week };
    case 'next_week': return { ...mondayWeekRange(offsetDate(todayStr, 7)), label: PRESET_LABELS.next_week };
    case 'rolling_week': return { start: todayStr, end: offsetDate(todayStr, 6), label: PRESET_LABELS.rolling_week };
    case 'this_month': return { ...monthRange(todayStr), label: PRESET_LABELS.this_month };
    case 'next_month': return { ...nextMonthRange(todayStr), label: PRESET_LABELS.next_month };
    case 'rolling_month': return { start: todayStr, end: offsetDate(todayStr, 29), label: PRESET_LABELS.rolling_month };
    case 'custom': {
      if (!custom.customFrom || !custom.customTo) {
        throw new Error('resolvePresetRange: "custom" requires both customFrom and customTo');
      }
      return { start: custom.customFrom, end: custom.customTo, label: PRESET_LABELS.custom };
    }
    default:
      throw new Error(`resolvePresetRange: unknown preset "${preset}"`);
  }
}
