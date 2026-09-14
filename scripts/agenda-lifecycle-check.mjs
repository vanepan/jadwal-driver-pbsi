/* agenda-lifecycle-check.mjs — pure Node unit test for
   js/agenda/agenda-lifecycle.js (V1.31 Agenda & To-Do, Phase C1)

   No Firebase, no browser, no emulator — the module under test has zero
   I/O, so this runs as a plain Node script.

   Run: node scripts/agenda-lifecycle-check.mjs (exit 0 = pass) */

import { isTaskOverdue, isEventOverdue } from '../js/agenda/agenda-lifecycle.js';

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

const T = 1_700_000_000_000; // arbitrary fixed epoch-ms anchor — no real Date.now() anywhere in this file

console.log('\n=== [A — Task overdue] ===');
check('no due date -> never overdue',
  isTaskOverdue({ status: 'not_started', dueAt: null }, T) === false);
check('future due -> not overdue',
  isTaskOverdue({ status: 'not_started', dueAt: T + 1000 }, T) === false);
check('exactly at due time -> not overdue (exclusive boundary, now > dueAt required)',
  isTaskOverdue({ status: 'not_started', dueAt: T }, T) === false);
check('after due time -> overdue',
  isTaskOverdue({ status: 'in_progress', dueAt: T - 1000 }, T) === true);
check('done before due -> not overdue',
  isTaskOverdue({ status: 'done', dueAt: T + 1000 }, T) === false);
check('done after due -> not overdue (completion suppresses overdue)',
  isTaskOverdue({ status: 'done', dueAt: T - 1000 }, T) === false);
check('reopened (done -> in_progress) while past due -> overdue again (pure recompute, no hidden state)',
  isTaskOverdue({ status: 'in_progress', dueAt: T - 1000 }, T) === true);
check("V1.31.1: soft-deleted ('deleted') task past due -> not overdue (deletion suppresses overdue, like completion)",
  isTaskOverdue({ status: 'deleted', dueAt: T - 1000 }, T) === false);

console.log('\n=== [B — Event overdue] ===');
check('scheduled before end -> not overdue',
  isEventOverdue({ status: 'scheduled', acknowledgedAt: null, endAt: T + 1000 }, T) === false);
check('exactly at end -> not overdue (exclusive boundary, now > endAt required)',
  isEventOverdue({ status: 'scheduled', acknowledgedAt: null, endAt: T }, T) === false);
check('after end -> overdue',
  isEventOverdue({ status: 'scheduled', acknowledgedAt: null, endAt: T - 1000 }, T) === true);
check('acknowledged before end -> not overdue',
  isEventOverdue({ status: 'scheduled', acknowledgedAt: '2026-01-01T00:00:00.000Z', endAt: T + 1000 }, T) === false);
check('acknowledged after end -> not overdue (acknowledgement suppresses overdue)',
  isEventOverdue({ status: 'scheduled', acknowledgedAt: '2026-01-01T00:00:00.000Z', endAt: T - 1000 }, T) === false);
check('cancelled, past end -> not overdue (only scheduled status can be overdue)',
  isEventOverdue({ status: 'cancelled', acknowledgedAt: null, endAt: T - 1000 }, T) === false);
check('missing endAt -> not overdue (defensive — nothing to compare against)',
  isEventOverdue({ status: 'scheduled', acknowledgedAt: null, endAt: null }, T) === false);

console.log('\n=== [C — defensive null-safety] ===');
check('null task -> false, no throw', isTaskOverdue(null, T) === false);
check('null event -> false, no throw', isEventOverdue(null, T) === false);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
