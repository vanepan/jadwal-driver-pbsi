/* agenda-view-model-check.mjs — pure unit test for
   js/agenda/agenda-view-model.js (V1.31 Agenda & To-Do, Phase C3)
   Run: node scripts/agenda-view-model-check.mjs (exit 0 = pass) */

import {
  sortTasksByPriority, sortEventsByTime, taskDisplayState, eventDisplayState,
  checklistProgress, formatClock, splitParticipants, priorityLabel, statusLabel, typeLabel,
} from '../js/agenda/agenda-view-model.js';

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

const T = 1_700_000_000_000;

console.log('\n=== [A — priority ordering] ===');
const tasks = [
  { id: 'a', priority: 'normal', dueAt: T + 1000 },
  { id: 'b', priority: 'urgent', dueAt: T + 5000 },
  { id: 'c', priority: 'penting', dueAt: T + 1000 },
  { id: 'd', priority: 'urgent', dueAt: T },
];
const sorted = sortTasksByPriority(tasks).map((t) => t.id);
check('urgent sorts before penting sorts before normal', JSON.stringify(sorted) === JSON.stringify(['d', 'b', 'c', 'a']));
check('within the same tier, sooner due date sorts first (d before b, both urgent)', sorted.indexOf('d') < sorted.indexOf('b'));

console.log('\n=== [B — undated tasks sort last within their tier] ===');
const withUndated = sortTasksByPriority([{ id: 'x', priority: 'normal', dueAt: null }, { id: 'y', priority: 'normal', dueAt: T }]);
check('a dated task of the same priority sorts before an undated one', withUndated[0].id === 'y' && withUndated[1].id === 'x');

console.log('\n=== [C — event time ordering] ===');
const events = [{ id: 'e2', startAt: T + 5000 }, { id: 'e1', startAt: T }];
check('events sort chronologically by startAt', sortEventsByTime(events).map((e) => e.id).join(',') === 'e1,e2');

console.log('\n=== [D — task display state] ===');
check("done task -> 'done' regardless of due date", taskDisplayState({ status: 'done', dueAt: T - 1000 }, T) === 'done');
check("overdue, not-done task -> 'overdue'", taskDisplayState({ status: 'in_progress', dueAt: T - 1000 }, T) === 'overdue');
check("not-yet-due task -> its own literal status", taskDisplayState({ status: 'not_started', dueAt: T + 1000 }, T) === 'not_started');

console.log('\n=== [E — event display state] ===');
check("cancelled event -> 'cancelled' even if past end", eventDisplayState({ status: 'cancelled', endAt: T - 1000, acknowledgedAt: null }, T) === 'cancelled');
check("scheduled, past end, unacknowledged -> 'overdue'", eventDisplayState({ status: 'scheduled', endAt: T - 1000, acknowledgedAt: null }, T) === 'overdue');
check("scheduled, future -> 'scheduled'", eventDisplayState({ status: 'scheduled', endAt: T + 1000, acknowledgedAt: null }, T) === 'scheduled');

console.log('\n=== [F — checklist progress] ===');
check('counts done/total correctly', JSON.stringify(checklistProgress({ checklist: [{ done: true }, { done: false }, { done: true }] })) === JSON.stringify({ done: 2, total: 3 }));
check('empty/missing checklist -> {done:0,total:0}, no throw', JSON.stringify(checklistProgress({})) === JSON.stringify({ done: 0, total: 0 }));

console.log('\n=== [G — formatClock matches the spec\'s own example format ("14.30 WIB")] ===');
const noon30 = new Date(2026, 0, 1, 14, 30).getTime();
check('14:30 formats as "14.30 WIB" (dot separator, WIB suffix — not "14:30" or 12h)', formatClock(noon30) === '14.30 WIB');
check('null -> empty string, no throw', formatClock(null) === '');

console.log('\n=== [H — splitParticipants] ===');
const split = splitParticipants({ a: { isPic: true }, b: { isPic: false }, c: {} });
check('PIC/ordinary correctly separated', split.pic.includes('a') && !split.pic.includes('b') && split.ordinary.includes('b') && split.ordinary.includes('c'));
check('empty/missing participants -> both arrays empty, no throw', JSON.stringify(splitParticipants(undefined)) === JSON.stringify({ pic: [], ordinary: [] }));

console.log('\n=== [I — label lookups never throw on an unknown key] ===');
check('unknown priority falls back to Normal label', priorityLabel('made-up') === 'Normal');
check('unknown type falls back to Lainnya label', typeLabel('made-up') === 'Lainnya');
check('unknown status echoes the raw value (no crash)', statusLabel('made-up') === 'made-up');

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
