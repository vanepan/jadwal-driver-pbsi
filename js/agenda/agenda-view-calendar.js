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
import { formatDateShort } from './agenda-view-model.js';
import { calendarItemDisplayState } from './agenda-calendar-lifecycle.js';

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

function rangeBarsHTML(bars) {
  const shown = bars.slice(0, MAX_RANGE_BARS_PER_CELL);
  const overflow = bars.length - shown.length;
  const html = shown.map((bar) => {
    const cls = ['cal-range-bar', `cal-range-bar--${bar.state}`];
    if (bar.roundedLeft) cls.push('cal-range-bar--cap-left');
    if (bar.roundedRight) cls.push('cal-range-bar--cap-right');
    const label = bar.showLabel ? `<span class="cal-range-bar-label">${esc(truncate(bar.item.title || '', 18))}</span>` : '';
    return `<div class="${cls.join(' ')}" data-agenda-action="open-calendar:${esc(bar.item.id)}" title="${esc(bar.item.title || '')}">${label}</div>`;
  }).join('');
  return html + (overflow > 0 ? `<div class="cal-range-bar-more">+${overflow} kalender</div>` : '');
}

function monthHeaderLabel(anchorDate) {
  const [y, m] = anchorDate.split('-').map(Number);
  return `${MONTH_NAMES_ID[m - 1]} ${y}`;
}

/**
 * @param {{events: Array, tasks: Array, calendarItems: Array, mode: 'month'|'week', anchorDate: string, todayStr: string, now: number}} data
 */
export function renderCalendarHTML({ events, tasks, calendarItems = [], mode, anchorDate, todayStr, now = Date.now() }) {
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
    let anyContent = false;
    const body = cells.map(({ date }) => {
      const day = byDate.get(date) || { events: [], tasks: [] };
      const isToday = date === todayStr;
      const calItemsToday = (calendarItems || []).filter((c) => c && c.startDate && c.endDate && c.startDate <= date && date <= c.endDate);
      if (calItemsToday.length || day.events.length || day.tasks.length) anyContent = true;
      const items = [
        ...calItemsToday.map((c) => {
          const state = calendarItemDisplayState(c, now);
          return `<div class="cal-week-event cal-week-event--calendar${state === 'berlangsung' ? ' cal-week-event--calendar-active' : ''}${state === 'selesai' ? ' cal-week-event--calendar-ended' : ''}${state === 'dibatalkan' ? ' cal-week-event--calendar-cancelled' : ''}" data-agenda-action="open-calendar:${esc(c.id)}" title="${esc(c.title)}">${esc(c.title)}</div>`;
        }),
        ...day.events.map((e) => `<div class="cal-week-event" data-agenda-action="open-event:${esc(e.id)}" title="${esc(e.title)}">${esc(e.title)}</div>`),
        ...day.tasks.map((t) => `<div class="cal-week-event cal-week-event--task" data-agenda-action="open-task:${esc(t.id)}" title="${esc(t.title)}">${esc(t.title)}</div>`),
      ].join('');
      return `<div class="cal-cell${isToday ? ' cal-cell--today' : ''}" data-agenda-action="goto-day:${date}">
        <span class="cal-cell-num">${Number(date.slice(8, 10))}</span>${items}
      </div>`;
    }).join('');
    return `${nav}<div class="cal-grid cal-week-row">${body}</div>${anyContent ? '' : emptyHint}`;
  }

  const cells = buildMonthGrid(anchorDate);
  const rangeBarsByDate = assignRangeBars(cells, calendarItems, now);
  let anyContent = false;
  const body = cells.map(({ date, inCurrentMonth }) => {
    const day = byDate.get(date) || { events: [], tasks: [] };
    const isToday = date === todayStr;
    const count = day.events.length + day.tasks.length;
    const bars = rangeBarsByDate.get(date) || [];
    if (inCurrentMonth && (count || bars.length)) anyContent = true;
    const dots = [
      ...day.events.slice(0, 3).map(() => '<span class="cal-cell-dot"></span>'),
      ...day.tasks.slice(0, 3).map(() => '<span class="cal-cell-dot cal-cell-dot--task"></span>'),
    ].slice(0, 4).join('');
    return `<div class="cal-cell${inCurrentMonth ? '' : ' cal-cell--out'}${isToday ? ' cal-cell--today' : ''}" data-agenda-action="goto-day:${date}">
        <span class="cal-cell-num">${Number(date.slice(8, 10))}</span>
        <span class="cal-cell-label"><span class="cal-cell-dots">${dots}</span>${count > 4 ? `<span class="cal-cell-count">+${count - 4}</span>` : ''}</span>
        ${rangeBarsHTML(bars)}
      </div>`;
  }).join('');

  return `${nav}<div class="cal-grid">${body}</div>${anyContent ? '' : emptyHint}`;
}
