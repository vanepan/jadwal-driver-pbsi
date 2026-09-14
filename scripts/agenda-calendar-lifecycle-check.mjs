/* agenda-calendar-lifecycle-check.mjs — pure Node unit test for
   js/agenda/agenda-calendar-lifecycle.js (V1.31.1 "Agenda, Kalender & To-Do")

   No Firebase, no browser, no emulator — the module under test has zero
   I/O, so this runs as a plain Node script. Mirrors
   scripts/agenda-lifecycle-check.mjs's own shape.

   Run: node scripts/agenda-calendar-lifecycle-check.mjs (exit 0 = pass) */

import { calendarItemDisplayState, calendarStateLabel, isCalendarItemActive } from '../js/agenda/agenda-calendar-lifecycle.js';

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

const T = 1_700_000_000_000; // arbitrary fixed epoch-ms anchor
const DAY = 24 * 60 * 60 * 1000;

console.log('\n=== [A — range-derived display state, never "overdue"/"Terlewat"] ===');
check('before startAt -> terjadwal',
  calendarItemDisplayState({ status: 'scheduled', startAt: T + DAY, endAt: T + 5 * DAY }, T) === 'terjadwal');
check('between startAt and endAt -> berlangsung',
  calendarItemDisplayState({ status: 'scheduled', startAt: T - DAY, endAt: T + 5 * DAY }, T) === 'berlangsung');
check('exactly at startAt -> berlangsung (inclusive start boundary)',
  calendarItemDisplayState({ status: 'scheduled', startAt: T, endAt: T + 5 * DAY }, T) === 'berlangsung');
check('exactly at endAt -> berlangsung (inclusive end boundary — still active on its last day)',
  calendarItemDisplayState({ status: 'scheduled', startAt: T - 5 * DAY, endAt: T }, T) === 'berlangsung');
check('long after endAt -> selesai, NEVER "overdue"/"Terlewat" (the whole point of this module)',
  calendarItemDisplayState({ status: 'scheduled', startAt: T - 10 * DAY, endAt: T - 5 * DAY }, T) === 'selesai');
check('multi-day range, day 2 of 6 (the Sirnas example) -> berlangsung, not terjadwal/selesai',
  calendarItemDisplayState({ status: 'scheduled', startAt: T, endAt: T + 5 * DAY }, T + DAY) === 'berlangsung');

console.log('\n=== [B — explicit lifecycle states override range derivation] ===');
check('cancelled, even mid-range -> dibatalkan, not berlangsung',
  calendarItemDisplayState({ status: 'cancelled', startAt: T - DAY, endAt: T + DAY }, T) === 'dibatalkan');
check('deleted -> dihapus (defensive; deleted items are filtered upstream before reaching a view)',
  calendarItemDisplayState({ status: 'deleted', startAt: T - DAY, endAt: T + DAY }, T) === 'dihapus');

console.log('\n=== [C — missing endAt/startAt] ===');
check('missing startAt, missing endAt -> berlangsung (nothing to compare against, defaults to active)',
  calendarItemDisplayState({ status: 'scheduled', startAt: null, endAt: null }, T) === 'berlangsung');
check('missing endAt, past startAt -> berlangsung (no end bound to have passed)',
  calendarItemDisplayState({ status: 'scheduled', startAt: T - DAY, endAt: null }, T) === 'berlangsung');

console.log('\n=== [D — labels] ===');
check("calendarStateLabel('terjadwal') === 'Terjadwal'", calendarStateLabel('terjadwal') === 'Terjadwal');
check("calendarStateLabel('berlangsung') === 'Berlangsung'", calendarStateLabel('berlangsung') === 'Berlangsung');
check("calendarStateLabel('selesai') === 'Selesai'", calendarStateLabel('selesai') === 'Selesai');
check("calendarStateLabel('dibatalkan') === 'Dibatalkan'", calendarStateLabel('dibatalkan') === 'Dibatalkan');
check("calendarStateLabel('dihapus') === 'Dihapus'", calendarStateLabel('dihapus') === 'Dihapus');
check('unknown state falls back to itself (defensive)', calendarStateLabel('mystery') === 'mystery');

console.log('\n=== [E — isCalendarItemActive] ===');
check('active mid-range -> true',
  isCalendarItemActive({ status: 'scheduled', startAt: T - DAY, endAt: T + DAY }, T) === true);
check('not yet started -> false',
  isCalendarItemActive({ status: 'scheduled', startAt: T + DAY, endAt: T + 5 * DAY }, T) === false);
check('cancelled mid-range -> false',
  isCalendarItemActive({ status: 'cancelled', startAt: T - DAY, endAt: T + DAY }, T) === false);

console.log('\n=== [F — defensive null-safety] ===');
check('null item -> terjadwal, no throw', calendarItemDisplayState(null, T) === 'terjadwal');

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
