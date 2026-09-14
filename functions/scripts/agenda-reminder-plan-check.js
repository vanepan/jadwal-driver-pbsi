'use strict';

/* agenda-reminder-plan-check.js — pure unit test for
   functions/src/agenda/reminderPlan.js (V1.31 Agenda & To-Do, Phase C2).
   No Firebase. Run: node functions/scripts/agenda-reminder-plan-check.js
   (exit 0 = pass) */

const { planForEvent, planForTask, H1_MS } = require('../src/agenda/reminderPlan');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

const T = 1_700_000_000_000;

console.log('\n=== [A — events] ===');
check('H1 is exactly startAt - 1 hour', planForEvent({ startAt: T, endAt: T + 3600000 }).h1 === T - H1_MS);
check('overdue equals endAt exactly', planForEvent({ startAt: T, endAt: T + 3600000 }).overdue === T + 3600000);
check('missing startAt -> null plan (defensive)', planForEvent({ startAt: null, endAt: T }) === null);
check('missing endAt -> null plan (defensive)', planForEvent({ startAt: T, endAt: null }) === null);
check('null event -> null plan, no throw', planForEvent(null) === null);

console.log('\n=== [B — tasks, H1 presence gated on dueTime] ===');
check("dueTime present -> plan HAS h1 (due date+time available)",
  Object.prototype.hasOwnProperty.call(planForTask({ dueAt: T, dueTime: '14:00' }), 'h1'));
check('H1 for a task is exactly dueAt - 1 hour when present', planForTask({ dueAt: T, dueTime: '14:00' }).h1 === T - H1_MS);
check("dueTime ABSENT (date-only task) -> plan has NO h1 key at all (not undefined-but-present, truly absent)",
  !Object.prototype.hasOwnProperty.call(planForTask({ dueAt: T, dueTime: null }), 'h1'));
check('overdue always present once dueAt exists, regardless of dueTime', planForTask({ dueAt: T, dueTime: null }).overdue === T);
check('missing dueAt -> null plan (defensive)', planForTask({ dueAt: null, dueTime: '09:00' }) === null);
check('null task -> null plan, no throw', planForTask(null) === null);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
