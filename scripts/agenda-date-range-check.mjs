/* agenda-date-range-check.mjs — pure unit test for
   js/agenda/agenda-date-range.js (V1.31 Agenda & To-Do, Phase C3 + C4)
   Run: node scripts/agenda-date-range-check.mjs (exit 0 = pass) */

import { mondayWeekRange, monthRange, buildMonthGrid, buildWeekGrid, groupForAgendaView, resolvePresetRange, nextMonthRange } from '../js/agenda/agenda-date-range.js';

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('\n=== [A — mondayWeekRange, Monday-first per pbsi-datepicker.js convention] ===');
check('a Friday resolves to the containing Mon-Sun week', JSON.stringify(mondayWeekRange('2026-09-11')) === JSON.stringify({ start: '2026-09-07', end: '2026-09-13' }));
check('a Monday resolves to itself as the start', mondayWeekRange('2026-09-07').start === '2026-09-07');
check('a Sunday resolves to itself as the end', mondayWeekRange('2026-09-13').end === '2026-09-13');

console.log('\n=== [B — monthRange] ===');
check('September 2026 -> 09-01..09-30', JSON.stringify(monthRange('2026-09-15')) === JSON.stringify({ start: '2026-09-01', end: '2026-09-30' }));
check('February 2028 (leap) -> 02-01..02-29', monthRange('2028-02-10').end === '2028-02-29');
check('February 2026 (non-leap) -> 02-01..02-28', monthRange('2026-02-10').end === '2026-02-28');

console.log('\n=== [C — buildMonthGrid] ===');
const grid = buildMonthGrid('2026-09-15');
check('grid length is always a multiple of 7', grid.length % 7 === 0);
check('grid starts on a Monday', new Date(...grid[0].date.split('-').map((n, i) => i === 1 ? Number(n) - 1 : Number(n))).getDay() === 1);
check('grid covers every day of the target month', grid.filter((c) => c.inCurrentMonth).length === 30);

console.log('\n=== [D — buildWeekGrid] ===');
const week = buildWeekGrid('2026-09-11');
check('week grid has exactly 7 cells', week.length === 7);
check('week grid starts Monday, ends Sunday', week[0].date === '2026-09-07' && week[6].date === '2026-09-13');

console.log('\n=== [E — groupForAgendaView] ===');
const events = [
  { id: 'e1', date: '2026-09-11' },      // today
  { id: 'e2', date: '2026-09-12' },      // upcoming
  { id: 'e3', date: '2026-09-01' },      // past — must NOT appear anywhere
];
const tasks = [
  { id: 't1', dueDate: '2026-09-11' },   // today
  { id: 't2', dueDate: null },           // no due date
  { id: 't3', dueDate: '2026-09-30' },   // beyond default 14-day horizon
];
const grouped = groupForAgendaView(events, tasks, '2026-09-11');
check('today bucket has exactly the today-dated event', grouped.today.events.length === 1 && grouped.today.events[0].id === 'e1');
check('today bucket has exactly the today-due task', grouped.today.tasks.length === 1 && grouped.today.tasks[0].id === 't1');
check('a past-dated event never appears in today OR upcoming', !grouped.today.events.some((e) => e.id === 'e3') && !grouped.upcoming.some((b) => b.events.some((e) => e.id === 'e3')));
check('upcoming bucket contains the next-day event', grouped.upcoming.some((b) => b.date === '2026-09-12' && b.events.some((e) => e.id === 'e2')));
check('a task beyond the horizon is excluded from upcoming (not silently dropped from noDueDate either)', !grouped.upcoming.some((b) => b.tasks.some((t) => t.id === 't3')));
check('an undated task lands in noDueDate, not silently dropped', grouped.noDueDate.some((t) => t.id === 't2'));
check('upcoming buckets are chronologically sorted', (() => {
  const dates = grouped.upcoming.map((b) => b.date);
  return JSON.stringify(dates) === JSON.stringify([...dates].sort());
})());

console.log('\n=== [F — customizable horizon] ===');
const wideGrouped = groupForAgendaView(events, tasks, '2026-09-11', 30);
check('widening the horizon parameter now includes the previously-excluded task', wideGrouped.upcoming.some((b) => b.tasks.some((t) => t.id === 't3')));

console.log('\n=== [G — nextMonthRange, incl. year rollover] ===');
check('September 2026 -> October 2026', JSON.stringify(nextMonthRange('2026-09-15')) === JSON.stringify({ start: '2026-10-01', end: '2026-10-31' }));
check('December -> January rolls the YEAR forward', JSON.stringify(nextMonthRange('2026-12-15')) === JSON.stringify({ start: '2027-01-01', end: '2027-01-31' }));
check('next month correctly lands on a leap February', nextMonthRange('2028-01-10').end === '2028-02-29');

console.log('\n=== [H — resolvePresetRange, all 7 PDF export presets] ===');
const TODAY = '2026-09-11'; // Friday
check('this_week -> Monday-first week containing today', JSON.stringify(resolvePresetRange('this_week', TODAY)) === JSON.stringify({ start: '2026-09-07', end: '2026-09-13', label: 'Minggu ini' }));
check('next_week -> the following Monday-first week', JSON.stringify(resolvePresetRange('next_week', TODAY)) === JSON.stringify({ start: '2026-09-14', end: '2026-09-20', label: 'Minggu depan' }));
check('rolling_week -> today..today+6 (NOT Monday-aligned)', JSON.stringify(resolvePresetRange('rolling_week', TODAY)) === JSON.stringify({ start: '2026-09-11', end: '2026-09-17', label: '1 Minggu' }));
check('this_month -> full calendar month containing today', JSON.stringify(resolvePresetRange('this_month', TODAY)) === JSON.stringify({ start: '2026-09-01', end: '2026-09-30', label: 'Bulan ini' }));
check('next_month -> full calendar month after today\'s', JSON.stringify(resolvePresetRange('next_month', TODAY)) === JSON.stringify({ start: '2026-10-01', end: '2026-10-31', label: 'Bulan depan' }));
check('next_month across a year boundary', resolvePresetRange('next_month', '2026-12-20').start === '2027-01-01');
check('rolling_month -> today..today+29 (NOT calendar-aligned)', JSON.stringify(resolvePresetRange('rolling_month', TODAY)) === JSON.stringify({ start: '2026-09-11', end: '2026-10-10', label: '1 Bulan' }));
check('custom -> echoes back the given from/to verbatim', JSON.stringify(resolvePresetRange('custom', TODAY, { customFrom: '2026-01-01', customTo: '2026-01-15' })) === JSON.stringify({ start: '2026-01-01', end: '2026-01-15', label: 'Custom' }));
check('custom -> does NOT itself validate end>=start (single responsibility; caller validates)', resolvePresetRange('custom', TODAY, { customFrom: '2026-05-10', customTo: '2026-05-01' }).end === '2026-05-01');
check('custom missing customFrom/customTo throws rather than silently defaulting', (() => {
  try { resolvePresetRange('custom', TODAY, {}); return false; } catch { return true; }
})());
check('an unknown preset id throws rather than silently returning something wrong', (() => {
  try { resolvePresetRange('not-a-real-preset', TODAY); return false; } catch { return true; }
})());
check('resolvePresetRange never reads the clock itself — same todayStr always produces the same result', JSON.stringify(resolvePresetRange('this_week', TODAY)) === JSON.stringify(resolvePresetRange('this_week', TODAY)));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
