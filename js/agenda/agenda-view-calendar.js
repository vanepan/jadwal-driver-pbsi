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

const WEEKDAY_LABELS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
const MONTH_NAMES_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function indexByDate(events, tasks) {
  const byDate = new Map();
  const bucket = (d) => { if (!byDate.has(d)) byDate.set(d, { events: [], tasks: [] }); return byDate.get(d); };
  for (const e of events || []) if (e && e.date) bucket(e.date).events.push(e);
  for (const t of tasks || []) if (t && t.dueDate) bucket(t.dueDate).tasks.push(t);
  return byDate;
}

function monthHeaderLabel(anchorDate) {
  const [y, m] = anchorDate.split('-').map(Number);
  return `${MONTH_NAMES_ID[m - 1]} ${y}`;
}

/**
 * @param {{events: Array, tasks: Array, mode: 'month'|'week', anchorDate: string, todayStr: string}} data
 */
export function renderCalendarHTML({ events, tasks, mode, anchorDate, todayStr }) {
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

  if (mode === 'week') {
    const cells = buildWeekGrid(anchorDate);
    const body = cells.map(({ date }) => {
      const day = byDate.get(date) || { events: [], tasks: [] };
      const isToday = date === todayStr;
      const items = [
        ...day.events.map((e) => `<div class="cal-week-event" data-agenda-action="open-event:${esc(e.id)}" title="${esc(e.title)}">${esc(e.title)}</div>`),
        ...day.tasks.map((t) => `<div class="cal-week-event cal-week-event--task" data-agenda-action="open-task:${esc(t.id)}" title="${esc(t.title)}">${esc(t.title)}</div>`),
      ].join('');
      return `<div class="cal-cell${isToday ? ' cal-cell--today' : ''}" data-agenda-action="goto-day:${date}">
        <span class="cal-cell-num">${Number(date.slice(8, 10))}</span>${items}
      </div>`;
    }).join('');
    return `${nav}<div class="cal-grid cal-week-row">${body}</div>`;
  }

  const cells = buildMonthGrid(anchorDate);
  const body = cells.map(({ date, inCurrentMonth }) => {
    const day = byDate.get(date) || { events: [], tasks: [] };
    const isToday = date === todayStr;
    const count = day.events.length + day.tasks.length;
    const dots = [
      ...day.events.slice(0, 3).map(() => '<span class="cal-cell-dot"></span>'),
      ...day.tasks.slice(0, 3).map(() => '<span class="cal-cell-dot cal-cell-dot--task"></span>'),
    ].slice(0, 4).join('');
    return `<div class="cal-cell${inCurrentMonth ? '' : ' cal-cell--out'}${isToday ? ' cal-cell--today' : ''}" data-agenda-action="goto-day:${date}">
        <span class="cal-cell-num">${Number(date.slice(8, 10))}</span>
        <span class="cal-cell-label"><span class="cal-cell-dots">${dots}</span>${count > 4 ? `<span class="cal-cell-count">+${count - 4}</span>` : ''}</span>
      </div>`;
  }).join('');

  return `${nav}<div class="cal-grid">${body}</div>`;
}
