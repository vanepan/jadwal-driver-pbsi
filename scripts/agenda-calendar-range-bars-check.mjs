/* agenda-calendar-range-bars-check.mjs — pure Node unit test for
   js/agenda/agenda-view-calendar.js#assignRangeBars() (V1.31.1 "Agenda,
   Kalender & To-Do")

   No Firebase, no DOM, no browser — assignRangeBars() is pure grid math
   over buildMonthGrid()'s real output. Verifies the "one continuous range
   per item, capped only at its true start/end, clipped/segmented per
   week row" contract that renders as an unbroken visual block in the
   Month view (spec §AL/§I).

   Run: node scripts/agenda-calendar-range-bars-check.mjs (exit 0 = pass) */

import { buildMonthGrid } from '../js/agenda/agenda-date-range.js';
import { assignRangeBars } from '../js/agenda/agenda-view-calendar.js';

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

const NOW = new Date('2026-09-15T00:00:00+07:00').getTime();
// September 2026's Monday-first grid: Mon 2026-08-31 .. Sun 2026-10-04,
// in 7-day rows. Row containing 15 Sep = Mon 14 Sep .. Sun 20 Sep (verified
// 15 Sep 2026 is a Tuesday) — the Sirnas example fits entirely in ONE row.
const cells = buildMonthGrid('2026-09-15');

function scheduledItem(id, startDate, endDate, overrides = {}) {
  return { id, title: `Item ${id}`, status: 'scheduled', startDate, endDate, ...overrides };
}

console.log('\n=== [A — single-day item] ===');
{
  const bars = assignRangeBars(cells, [scheduledItem('single', '2026-09-15', '2026-09-15')], NOW);
  const day15 = bars.get('2026-09-15');
  check('exactly one bar on its own day', day15.length === 1);
  check('capped on BOTH sides (single-day = true start AND true end)', day15[0].roundedLeft === true && day15[0].roundedRight === true);
  check('an adjacent day has no bar at all', bars.get('2026-09-14').length === 0 && bars.get('2026-09-16').length === 0);
}

console.log('\n=== [B — multi-day item entirely within ONE week row (the Sirnas example, 15-20 Sep, fits Mon 14 - Sun 20) ===');
{
  const bars = assignRangeBars(cells, [scheduledItem('sirnas', '2026-09-15', '2026-09-20')], NOW);
  check('true start day (15) IS the row-start too -> capped left, not right', bars.get('2026-09-15')[0].roundedLeft === true && bars.get('2026-09-15')[0].roundedRight === false);
  check('a middle day (17) is capped on NEITHER side (continuous bar)', bars.get('2026-09-17')[0].roundedLeft === false && bars.get('2026-09-17')[0].roundedRight === false);
  check('true end day (20) -> capped right, not left', bars.get('2026-09-20')[0].roundedLeft === false && bars.get('2026-09-20')[0].roundedRight === true);
  check('label shown only on the true start day, not on middle/end days', bars.get('2026-09-15')[0].showLabel === true && bars.get('2026-09-17')[0].showLabel === false && bars.get('2026-09-20')[0].showLabel === false);
  check('a day just before the range (14) has no bar', bars.get('2026-09-14').length === 0);
  check('a day just after the range (21) has no bar', bars.get('2026-09-21').length === 0);
}

console.log('\n=== [C — multi-day item CROSSING a week-row boundary (19 Sep Sat -> 22 Sep Tue: row1 ends Sun 20, row2 starts Mon 21)] ===');
{
  const bars = assignRangeBars(cells, [scheduledItem('crosses', '2026-09-19', '2026-09-22')], NOW);
  check('day 19 (true start, mid-row) -> capped left only', bars.get('2026-09-19')[0].roundedLeft === true && bars.get('2026-09-19')[0].roundedRight === false);
  check("day 20 (row1's LAST day, but NOT the item's true end) -> capped on NEITHER side — squared off, signaling continuation into next row", bars.get('2026-09-20')[0].roundedLeft === false && bars.get('2026-09-20')[0].roundedRight === false);
  check("day 21 (row2's FIRST day, but NOT the item's true start) -> capped on NEITHER side either — the visual continuation from the previous row", bars.get('2026-09-21')[0].roundedLeft === false && bars.get('2026-09-21')[0].roundedRight === false);
  check('day 22 (true end) -> capped right only', bars.get('2026-09-22')[0].roundedLeft === false && bars.get('2026-09-22')[0].roundedRight === true);
  check('label re-shown at day 21 — the start of the NEW row this item continues into (so a viewer never sees an unlabeled bar with no way to identify it)', bars.get('2026-09-21')[0].showLabel === true);
  check('label NOT re-shown at day 20 (still the same row as day 19, where it was already labeled)', bars.get('2026-09-20')[0].showLabel === false);
}

console.log('\n=== [D — item fully outside the visible grid] ===');
{
  const bars = assignRangeBars(cells, [scheduledItem('outside', '2025-01-01', '2025-01-05')], NOW);
  const anyBars = [...bars.values()].some((arr) => arr.length > 0);
  check('produces zero bars anywhere in this grid', anyBars === false);
}

console.log('\n=== [E — item spanning past BOTH grid edges (clipped on both sides, capped on neither)] ===');
{
  const gridStart = cells[0].date;
  const gridEnd = cells[cells.length - 1].date;
  const bars = assignRangeBars(cells, [scheduledItem('huge', '2020-01-01', '2030-01-01')], NOW);
  check('the grid-start cell has a bar, NOT capped left (true start is long before this grid)', bars.get(gridStart)[0].roundedLeft === false);
  check('the grid-end cell has a bar, NOT capped right (true end is long after this grid)', bars.get(gridEnd)[0].roundedRight === false);
}

console.log('\n=== [F — overflow beyond MAX_RANGE_BARS_PER_CELL (2) on one day] ===');
{
  const items = [
    scheduledItem('ov1', '2026-09-16', '2026-09-16'),
    scheduledItem('ov2', '2026-09-16', '2026-09-16'),
    scheduledItem('ov3', '2026-09-16', '2026-09-16'),
  ];
  const bars = assignRangeBars(cells, items, NOW);
  check('all 3 items are tracked in the data (overflow trimming happens at render time, not here)', bars.get('2026-09-16').length === 3);
}

console.log('\n=== [G — cancelled item still gets a bar, just with the "dibatalkan" state (never silently dropped from the grid) ===');
{
  const bars = assignRangeBars(cells, [scheduledItem('cancelled1', '2026-09-15', '2026-09-15', { status: 'cancelled' })], NOW);
  check("state is 'dibatalkan'", bars.get('2026-09-15')[0].state === 'dibatalkan');
}

console.log('\n=== [H — defensive: item missing startDate/endDate is skipped, no throw] ===');
{
  let threw = false;
  let bars;
  try { bars = assignRangeBars(cells, [{ id: 'bad', title: 'x', status: 'scheduled' }], NOW); }
  catch { threw = true; }
  check('does not throw', threw === false);
  check('produces zero bars for the malformed item', bars && [...bars.values()].every((arr) => arr.length === 0));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
