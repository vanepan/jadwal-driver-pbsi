/* agenda-week-view-check.mjs — pure unit test for
   js/agenda/agenda-view-calendar.js#weekTimedRowsHTML() (V1.31.2 §5)

   Proves the Week view enrichment: Agenda events, timed (single-day,
   non-all-day) Calendar items, and To-Do tasks merge into ONE
   chronologically-sorted list per day; all-day Agenda events and
   date-only tasks sort to sensible ends (not scattered arbitrarily);
   and cancelled/overdue/done get the same visual status language the
   Agenda list view already had. Multi-day/all-day Calendar items are
   NOT covered here — they never reach this function at all (handled
   separately by assignRangeBars/rangeBarsHTML, already covered by
   agenda-calendar-range-bars-check.mjs).

   Run: node scripts/agenda-week-view-check.mjs (exit 0 = pass) */

import { weekTimedRowsHTML } from '../js/agenda/agenda-view-calendar.js';

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

const NOW = new Date('2026-09-15T08:00:00+07:00').getTime();
const HOUR = 3600000;

console.log('\n=== [A — chronological merge across Agenda/Calendar/To-Do, by actual time] ===');
{
  const events = [{ id: 'e1', title: 'Later Event', status: 'scheduled', allDay: false, startAt: NOW + 3 * HOUR }];
  const tasks = [{ id: 't1', title: 'Earliest Task', status: 'not_started', dueTime: '09:00', dueAt: NOW + HOUR }];
  const timedCal = [{ id: 'c1', title: 'Middle Calendar', status: 'scheduled', startAt: NOW + 2 * HOUR }];
  const html = weekTimedRowsHTML(events, tasks, timedCal, NOW);
  const order = [...html.matchAll(/data-agenda-action="(open-\w+):/g)].map((m) => m[1]);
  check('order is task, calendar, event (earliest time first, regardless of entity type)', order.join(',') === 'open-task,open-calendar,open-event');
}

console.log('\n=== [B — an all-day Agenda event sorts to the TOP; a date-only task sorts to the BOTTOM] ===');
{
  const events = [{ id: 'allday', title: 'All Day Event', status: 'scheduled', allDay: true, startAt: NOW }];
  const tasks = [
    { id: 'timed', title: 'Timed Task', status: 'not_started', dueTime: '10:00', dueAt: NOW + HOUR },
    { id: 'dateonly', title: 'Date-only Task', status: 'not_started', dueTime: null, dueAt: NOW - HOUR },
  ];
  const html = weekTimedRowsHTML(events, tasks, [], NOW);
  const order = [...html.matchAll(/data-agenda-action="open-\w+:(\w+)"/g)].map((m) => m[1]);
  check('order: allday (top) -> timed -> dateonly (bottom)', order.join(',') === 'allday,timed,dateonly');
  check('the all-day event row carries no time-prefix span at all (exact row match)', html.includes('<div class="cal-week-event" data-agenda-action="open-event:allday" title="All Day Event" role="button" tabindex="0">All Day Event</div>'));
}

console.log('\n=== [C — status language: cancelled event, overdue event, overdue task, done task] ===');
{
  const events = [
    { id: 'cancelled-e', title: 'Cancelled Event', status: 'cancelled', allDay: false, startAt: NOW + HOUR, endAt: NOW + 2 * HOUR },
    { id: 'overdue-e', title: 'Overdue Event', status: 'scheduled', allDay: false, startAt: NOW - 3 * HOUR, endAt: NOW - HOUR, acknowledgedAt: null },
  ];
  const tasks = [
    { id: 'done-t', title: 'Done Task', status: 'done', dueTime: '09:00', dueAt: NOW - HOUR },
    { id: 'overdue-t', title: 'Overdue Task', status: 'in_progress', dueTime: '09:00', dueAt: NOW - HOUR },
  ];
  const html = weekTimedRowsHTML(events, tasks, [], NOW);
  check("cancelled event gets 'cal-week-event--cancelled'", html.includes('cal-week-event cal-week-event--cancelled" data-agenda-action="open-event:cancelled-e"'));
  check("overdue event gets 'cal-week-event--overdue'", html.includes('cal-week-event--overdue" data-agenda-action="open-event:overdue-e"'));
  check("done task gets 'cal-week-event--task-done'", html.includes('cal-week-event--task-done" data-agenda-action="open-task:done-t"'));
  check("overdue task gets 'cal-week-event--task-overdue'", html.includes('cal-week-event--task-overdue" data-agenda-action="open-task:overdue-t"'));
}

console.log('\n=== [D — a timed Calendar item carries the calendar-entity class + a time prefix, distinct from Agenda/To-Do] ===');
{
  const timedCal = [{ id: 'c1', title: 'Rapat Kalender', status: 'scheduled', startAt: NOW + HOUR }];
  const html = weekTimedRowsHTML([], [], timedCal, NOW);
  check("carries 'cal-week-event--calendar'", html.includes('cal-week-event--calendar'));
  check('carries a time prefix (cal-week-event-time)', html.includes('cal-week-event-time'));
  check("clicking it targets 'open-calendar:c1', not open-event/open-task", html.includes('data-agenda-action="open-calendar:c1"'));
}

console.log('\n=== [E — defensive: null/malformed entries never throw] ===');
{
  let threw = false;
  try { weekTimedRowsHTML([null], [null], [null], NOW); } catch { threw = true; }
  check('null entries in any array do not throw', !threw);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
