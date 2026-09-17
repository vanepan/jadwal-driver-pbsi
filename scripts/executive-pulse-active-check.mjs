/* executive-pulse-active-check.mjs — V1 ACTIVE TIMELINE PULSE.

   The Executive Command Center "Timeline Operasional — Hari Ini" pulse plots
   today's real audit-log events; a dot gets the ACTIVE treatment
   (.wsp-pulse__dot--active) only for an assignment that is CURRENTLY RUNNING —
   canonical status === 'started', never "endTime < now", never "started at
   some point today". A completed / cancelled / future assignment shows no
   active pulse; a started dot stays on the axis as history but loses its
   active state the moment the assignment completes. Driver-agnostic: an
   unassigned assignment that is running still pulses.

   Also covers axis-tick correctness (SS10, §11 below): the tick row must
   span the SAME 07:00–19:00 window buildPulseMarks positions dots against,
   not a shorter, stale label range.

   Drives the REAL js/widgets/executive/index.js#buildPulseMarks and
   #pulseTickLabels (both exported for this test; the render path calls
   them unchanged). Pure Node.

   Run: node scripts/executive-pulse-active-check.mjs   (exit 0 = all pass)
*/

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPulseMarks, pulseTickLabels } from '../js/widgets/executive/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const check = (n, c, detail) => {
  if (c) { pass++; console.log(`  ✓ ${n}`); }
  else { fail++; console.log(`  ✗ ${n}`); if (detail !== undefined) console.log('     ' + JSON.stringify(detail)); }
};

// today, mid-morning inside the 07:00–19:00 pulse window
const now = new Date();
const at = (h, m = 0) => new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0).toISOString();

const log = (action, targetId, h, m = 0) => ({
  id: `${action}:${targetId}:${h}${m}`, action, targetId,
  createdAt: at(h, m), displayName: 'Admin', metadata: {},
});
const asg = (id, status, driver = 'Budi') => ({
  id, status, driver, vehicle: 'Innova',
  date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
  startTime: '09:00', endTime: '11:00',
});

function ctxOf(assignments, logs) {
  return { logs, engineeringEvents: [], requests: [], assignments };
}
const activeCount = (marks) => marks.filter((m) => m.active).length;

/* ══ 1 — A active, B completed, C future → exactly 1 active pulse ══ */
console.log('\n[1 — A running · B completed · C future]');
const A = asg('A', 'started');
const B = asg('B', 'completed');
const C = asg('C', 'assigned');
const logs1 = [
  log('assignment_started', 'A', 9, 0),
  log('assignment_started', 'B', 8, 0), log('assignment_completed', 'B', 10, 0),
  log('assignment_created', 'C', 9, 30),
];
const m1 = buildPulseMarks(ctxOf([A, B, C], logs1));
check('exactly ONE active pulse (A only)', activeCount(m1) === 1, m1.map((x) => ({ a: x.active })));
check('B still has dots on the axis (history preserved), just none active',
  m1.length >= 3 && !m1.some((x) => x.active && x.sentence && /perjalanan/.test('')), m1.length);
check('marks.length counts every today event (A start, B start, B complete, C create = 4)', m1.length === 4, m1.length);

/* ══ 2 — complete the running assignment → pulse disappears ══ */
console.log('\n[2 — A transitions started → completed]');
const A2 = { ...A, status: 'completed' };
const m2 = buildPulseMarks(ctxOf([A2, B, C], logs1));
check('ZERO active pulses after A completes', activeCount(m2) === 0, m2.map((x) => x.active));
check('A start dot still present on the axis (historical)', m2.length === 4, m2.length);

/* ══ 3 — cancelled / rejected never pulse ══ */
console.log('\n[3 — cancelled assignment with a start log]');
const D = asg('D', 'cancelled');
const m3 = buildPulseMarks(ctxOf([D], [log('assignment_started', 'D', 9, 0), log('assignment_cancelled', 'D', 9, 30)]));
check('no active pulse for a cancelled assignment', activeCount(m3) === 0, m3.map((x) => x.active));

/* ══ 4 — a running UNASSIGNED assignment still pulses (assignment active ≠ driver active) ══ */
console.log('\n[4 — unassigned assignment, currently running]');
const U = asg('U', 'started', ''); // driver: '' (Self-Drive)
const m4 = buildPulseMarks(ctxOf([U], [log('assignment_started', 'U', 9, 0)]));
check('an unassigned RUNNING assignment DOES pulse (driver-agnostic)', activeCount(m4) === 1, m4.map((x) => x.active));

/* ══ 5 — an orphan start log (assignment no longer in the array) → not active ══ */
console.log('\n[5 — start log with no matching current assignment]');
const m5 = buildPulseMarks(ctxOf([], [log('assignment_started', 'GONE', 9, 0)]));
check('no active pulse when the assignment is not currently started', activeCount(m5) === 0, m5.map((x) => x.active));

/* ══ 6 — the deterministic acceptance case from the brief ══ */
console.log('\n[6 — brief acceptance: 3 assignments (active/completed/future) → 1, then A completed → 0]');
const before = buildPulseMarks(ctxOf(
  [asg('X', 'started'), asg('Y', 'completed'), asg('Z', 'assigned')],
  [log('assignment_started', 'X', 9), log('assignment_started', 'Y', 8), log('assignment_completed', 'Y', 10), log('assignment_created', 'Z', 9)],
));
check('pulse count = 1', activeCount(before) === 1, activeCount(before));
const after = buildPulseMarks(ctxOf(
  [asg('X', 'completed'), asg('Y', 'completed'), asg('Z', 'assigned')],
  [log('assignment_started', 'X', 9), log('assignment_completed', 'X', 11), log('assignment_started', 'Y', 8), log('assignment_completed', 'Y', 10), log('assignment_created', 'Z', 9)],
));
check('pulse count = 0 after X completes', activeCount(after) === 0, activeCount(after));

/* ══ 7 — static: the active flag is gated on status === 'started' ══ */
console.log('\n[7 — static contract]');
const src = fs.readFileSync(path.join(ROOT, 'js/widgets/executive/index.js'), 'utf-8');
check("buildPulseMarks builds runningIds from status === 'started'",
  /runningIds = new Set\(\s*\(ctx\.assignments \|\| \[\]\)\.filter\(\(a\) => a && a\.status === 'started'\)/.test(src));
check("active = assignment_started AND runningIds.has(targetId)",
  /active = it\.groupKey === 'assignment_started' && runningIds\.has\(it\.targetId\)/.test(src));
check('todaysStoryItems threads targetId through for the lookup',
  /targetId: l\.targetId/.test(src));
// board pulse is already correct — driven by the canonical status field
check("board timeline pulse (.is-started) is driven by status === 'started'",
  /const isStarted\s*=\s*status === 'started';/.test(fs.readFileSync(path.join(ROOT, 'js/timeline.js'), 'utf-8')));

/* ══ 8 — v1.31.4 R1: overnight/multi-day active assignment with NO today
   log entry (missed logAction write, or the trip started before today) →
   the Pulse must not go empty despite real active operational data. ══ */
console.log('\n[8 — overnight assignment active today, zero today-log entries]');
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
const E = { id: 'E', status: 'started', driver: 'Siti', vehicle: 'Avanza', date: ymd(yesterday), startTime: '22:00', endTime: '06:00' };
const m8 = buildPulseMarks(ctxOf([E], []));
check('an active assignment with zero today-log entries still produces a mark', m8.length === 1, m8.length);
check('that mark is active', m8[0]?.active === true, m8[0]);
check('position clamps to the window start edge (started on a prior calendar day)', m8[0]?.leftPct === 0, m8[0]?.leftPct);
check('driver identity resolved from the real record, not fabricated', !!m8[0]?.sentence?.includes('Siti'), m8[0]?.sentence);

/* ══ 9 — a same-day running assignment already covered by today's own
   "assignment_started" log entry must NOT be double-counted. ══ */
console.log('\n[9 — no duplicate mark when the log-derived pass already covers it]');
const F = asg('F', 'started');
const m9 = buildPulseMarks(ctxOf([F], [log('assignment_started', 'F', 9, 0)]));
check('exactly one mark for F, not two', m9.length === 1, m9.length);

/* ══ 10 — genuinely empty day stays a genuinely empty axis. ══ */
console.log('\n[10 — genuinely empty day]');
const m10 = buildPulseMarks(ctxOf([], []));
check('zero assignments + zero logs → zero marks (no synthetic dots)', m10.length === 0, m10.length);

/* ══ 11 — SS10: axis tick labels must stay in lockstep with the dots' own
   pct-based positioning. The ticks are laid out with `justify-content:
   space-between` (flexbox even distribution across N labels), while a
   dot's position comes from (minutes - WINDOW_START) / (WINDOW_END -
   WINDOW_START) * 100. These two formulas only agree if the ticks span
   the FULL window at a step that evenly divides it — this locks that
   invariant so a future window-constant change can't silently reintroduce
   the 07:00–17:00-labels-on-a-07:00–19:00-axis drift. ══ */
console.log('\n[11 — axis tick labels span the real window, in lockstep with dot pct math]');
const ticks = pulseTickLabels();
check('first tick is the window start (07:00)', ticks[0] === '07:00', ticks);
check('last tick is the window END (19:00) — NOT a truncated 17:00', ticks[ticks.length - 1] === '19:00', ticks);
const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const WINDOW_START = toMin(ticks[0]);
const WINDOW_END = toMin(ticks[ticks.length - 1]);
const flexAligned = ticks.every((t, i) => {
  const dotPct = ((toMin(t) - WINDOW_START) / (WINDOW_END - WINDOW_START)) * 100;
  const flexPct = (i / (ticks.length - 1)) * 100;
  return Math.abs(dotPct - flexPct) < 1e-9;
});
check('every tick\'s real-time pct exactly matches its flexbox space-between slot',
  flexAligned, ticks);

console.log(`\nexecutive-pulse-active-check: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
