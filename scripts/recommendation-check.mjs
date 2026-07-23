/* recommendation-check.mjs — validates the Driver Recommendation Engine
   (v1.16.4.11-alpha.2 + v1.25.x Recovery Buffer). Run: node scripts/recommendation-check.mjs
   (exit 0 = all pass)

   Covers: the four sub-scores (availability/workload/recency/priority), schedule
   conflict detection, the weighted final score (weights sourced from the store —
   no hardcoded weights), ranking (conflicted drivers can never be #1), the
   output shape, diagnostics, and the Recovery Buffer rules (Running drivers are
   hard-excluded even as a fallback, the buffer widens a finished assignment's
   busy window, delay propagation uses the actual completedAt, and a Step-4
   fallback pick is explicitly flagged bufferSatisfied:false, never null). */

import {
  recommendDrivers,
  hasScheduleConflict,
  evaluateAvailability,
  availabilityScore,
  workloadScore,
  recencyScore,
  priorityScore,
  WORKLOAD_SCORE_BY_STATUS,
} from '../js/services/driver-recommendation-engine.js';
import { CAPACITY_STATUS } from '../js/services/driver-capacity-engine.js';
import { setScoringWeights, resetDispatchIntelligence } from '../js/stores/dispatch-intelligence-store.js';
import { resetDispatchConfig, setDispatchConfig, DEFAULT_RECOVERY_BUFFER_MINUTES } from '../js/config/dispatch-intelligence-config.js';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

const NOW = '2026-06-24T12:00:00';
const REQUEST = { date: '2026-06-24', startTime: '08:00', endTime: '12:00', passengers: 4, destination: 'Soekarno-Hatta' };
function dateDaysAgo(days, base = NOW) {
  const d = new Date(base); d.setDate(d.getDate() - days);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function asg(driver, daysAgo, extra = {}) {
  return { driver, date: dateDaysAgo(daysAgo), status: 'completed', ...extra };
}
function many(driver, count, daysAgo) { return Array.from({ length: count }, () => asg(driver, daysAgo)); }

resetDispatchIntelligence();
resetDispatchConfig();

/* ── Sub-score units ─────────────────────────────────────────────────── */
console.log('\n[sub-scores]');
check('availabilityScore(false) = 100', availabilityScore(false) === 100);
check('availabilityScore(true) = 0', availabilityScore(true) === 0);
check('workload LOW = 100', workloadScore(CAPACITY_STATUS.LOW) === 100);
check('workload NORMAL = 80', workloadScore(CAPACITY_STATUS.NORMAL) === 80);
check('workload HIGH = 40', workloadScore(CAPACITY_STATUS.HIGH) === 40);
check('workload OVERLOADED = 10', workloadScore(CAPACITY_STATUS.OVERLOADED) === 10);
check('recency 0 trips = 100', recencyScore(0) === 100);
check('recency 1 trip = 80', recencyScore(1) === 80);
check('recency 3 trips = 80', recencyScore(3) === 80);
check('recency 4 trips = 60', recencyScore(4) === 60);
check('recency 6 trips = 60', recencyScore(6) === 60);
check('recency 7 trips = 20', recencyScore(7) === 20);
check('recency 20 trips = 20', recencyScore(20) === 20);
check('priorityScore = 100 (foundation)', priorityScore() === 100);

/* ── Schedule conflict detection ─────────────────────────────────────── */
console.log('\n[conflict detection]');
check('overlap 09:00-11:00 vs 08:00-12:00 → conflict',
  hasScheduleConflict([asg('x', 0, { startTime: '09:00', endTime: '11:00', status: 'assigned' })], REQUEST));
check('adjacent 12:00-14:00 vs 08:00-12:00 → no conflict',
  !hasScheduleConflict([asg('x', 0, { startTime: '12:00', endTime: '14:00', status: 'assigned' })], REQUEST));
check('different date → no conflict',
  !hasScheduleConflict([asg('x', 1, { startTime: '09:00', endTime: '11:00', status: 'assigned' })], REQUEST));
check('fullDay same date → conflict',
  hasScheduleConflict([asg('x', 0, { fullDay: true, status: 'assigned' })], REQUEST));
check('cancelled overlapping assignment → no conflict',
  !hasScheduleConflict([asg('x', 0, { startTime: '09:00', endTime: '11:00', status: 'cancelled' })], REQUEST));

/* ── Full recommendation: ranking + weighted score + diagnostics ─────── */
console.log('\n[recommendation ranking]');
const drivers = [
  { id: 'drv_a', name: 'Andi' },   // free, no load → best
  { id: 'drv_b', name: 'Budi' },   // free, high load → mid
  { id: 'drv_c', name: 'Citra' },  // conflict on the request window
];
const assignments = [
  // Budi: 42 in last30 (util 84 → HIGH workload 40), 5 in last7 (recency 60)
  ...many('Budi', 5, 3),
  ...many('Budi', 37, 20),
  // Citra: a conflicting trip in the request window + light load otherwise
  asg('Citra', 0, { startTime: '09:00', endTime: '11:00', status: 'assigned' }),
];
const res = recommendDrivers(REQUEST, drivers, assignments, { now: NOW });

check('output has recommendedDriver + alternatives + diagnostics',
  !!res.recommendedDriver && Array.isArray(res.alternatives) && Array.isArray(res.diagnostics));
check('recommendedDriver is Andi, rank 1, score 100',
  res.recommendedDriver.driverId === 'drv_a' && res.recommendedDriver.rank === 1 && res.recommendedDriver.score === 100);
const diag = (id) => res.diagnostics.find((d) => d.driverId === id);
check('Andi breakdown 100/100/100/100', JSON.stringify(diag('drv_a').breakdown) === JSON.stringify({ availability: 100, workload: 100, recency: 100, priority: 100 }));
check('Budi breakdown 100/40/60/100 → score 74',
  diag('drv_b').breakdown.workload === 40 && diag('drv_b').breakdown.recency === 60 && diag('drv_b').score === 74);
check('Budi is rank 2 (alternative)', diag('drv_b').rank === 2 && res.alternatives.some((a) => a.driverId === 'drv_b' && a.rank === 2));
check('Citra is conflicted (availability 0, available:false)',
  diag('drv_c').breakdown.availability === 0 && diag('drv_c').available === false && diag('drv_c').conflict === true);
check('Citra appears in diagnostics but is NOT recommendedDriver',
  !!diag('drv_c') && res.recommendedDriver.driverId !== 'drv_c');
check('Citra ranks last (after both available drivers)', diag('drv_c').rank === 3);

/* ── Guard: a conflicted driver with a HIGHER raw score still loses #1 ──
   The request is 4 days in the FUTURE relative to "now", so Strong's blocking
   trip (on the request date) does NOT count as recent load — leaving Strong
   with a pristine 60 raw vs overloaded Weak's 57, yet Weak (available) wins #1. */
console.log('\n[conflict guard]');
const GUARD_NOW = '2026-06-20T12:00:00';
const GUARD_REQUEST = { date: '2026-06-24', startTime: '08:00', endTime: '12:00' };
function gDate(days) {
  const d = new Date(GUARD_NOW); d.setDate(d.getDate() - days);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
const guardDrivers = [
  { id: 'drv_weak', name: 'Weak' },    // available but overloaded → score 57
  { id: 'drv_strong', name: 'Strong' }, // conflicted but otherwise pristine → score 60
];
const guardAsg = [
  // Weak: 48 in last30 (util 96 → OVERLOADED 10), 7 in last7 (recency 20)
  ...Array.from({ length: 7 }, () => ({ driver: 'Weak', date: gDate(2), status: 'completed' })),
  ...Array.from({ length: 41 }, () => ({ driver: 'Weak', date: gDate(20), status: 'completed' })),
  // Strong: a single conflicting trip on the FUTURE request date (no recent load)
  { driver: 'Strong', date: '2026-06-24', startTime: '08:30', endTime: '10:00', status: 'assigned' },
];
const guard = recommendDrivers(GUARD_REQUEST, guardDrivers, guardAsg, { now: GUARD_NOW });
const gWeak = guard.diagnostics.find((d) => d.driverId === 'drv_weak');
const gStrong = guard.diagnostics.find((d) => d.driverId === 'drv_strong');
check('Strong (conflicted) has higher raw score than Weak (available)', gStrong.score > gWeak.score);
check('recommendedDriver is the AVAILABLE Weak, not higher-scoring Strong', guard.recommendedDriver.driverId === 'drv_weak');
check('Weak ranks #1 despite lower score (available-first)', gWeak.rank === 1 && gStrong.rank === 2);

/* ── Recovery Buffer: sole non-running conflicted driver → Step 4 fallback ── */
console.log('\n[recovery buffer — fallback pick, never null]');
const soleConflicted = recommendDrivers(REQUEST, [{ id: 'drv_c', name: 'Citra' }],
  [asg('Citra', 0, { startTime: '09:00', endTime: '11:00', status: 'assigned' })], { now: NOW });
check('sole conflicted (non-running) driver → still selected as the Step-4 fallback, not null',
  soleConflicted.recommendedDriver !== null && soleConflicted.recommendedDriver.driverId === 'drv_c');
check('fallback pick is explicitly marked bufferSatisfied:false (never pretend availability)',
  soleConflicted.recommendedDriver.bufferSatisfied === false);
check('conflicted driver still present in diagnostics',
  soleConflicted.alternatives.length === 0 && soleConflicted.diagnostics.length === 1);

/* ── Running driver: never selectable, not even as a Step-4 fallback ─────── */
console.log('\n[recovery buffer — Running hard-exclusion]');
const soleRunning = recommendDrivers(REQUEST, [{ id: 'drv_r', name: 'Rudi' }],
  [asg('Rudi', 0, { startTime: '06:00', endTime: '09:00', status: 'started' })], { now: NOW });
check('sole Running driver → recommendedDriver null (never fabricated)',
  soleRunning.recommendedDriver === null);
check('Running driver still visible in diagnostics, flagged running:true',
  soleRunning.diagnostics.length === 1 && soleRunning.diagnostics[0].running === true);

const withRunningAndFree = recommendDrivers(REQUEST,
  [{ id: 'drv_run', name: 'Rudi' }, { id: 'drv_free', name: 'Fajar' }],
  [asg('Rudi', 0, { startTime: '06:00', endTime: '09:00', status: 'started' })], { now: NOW });
check('an available alternative is recommended over a Running driver',
  withRunningAndFree.recommendedDriver.driverId === 'drv_free');
check('the Running driver ranks last (below the available driver)',
  withRunningAndFree.diagnostics.find((d) => d.driverId === 'drv_run').rank === 2);

/* ── Default buffer + widened busy window (the original bug this fixes) ──── */
console.log('\n[recovery buffer — 60-minute default widens the busy window]');
check('DEFAULT_RECOVERY_BUFFER_MINUTES is 60', DEFAULT_RECOVERY_BUFFER_MINUTES === 60);
const justEnded = evaluateAvailability(
  [{ driver: 'x', date: '2026-06-24', startTime: '09:00', endTime: '11:00', status: 'completed' }],
  { date: '2026-06-24', startTime: '11:00', endTime: '13:00' }, 60);
check('starting exactly at the previous assignment\'s planned end is now a buffer conflict (was the bug)',
  justEnded.conflict === true && justEnded.availabilityMinutes === 12 * 60);
const clearedBuffer = evaluateAvailability(
  [{ driver: 'x', date: '2026-06-24', startTime: '09:00', endTime: '11:00', status: 'completed' }],
  { date: '2026-06-24', startTime: '12:00', endTime: '13:00' }, 60);
check('no conflict once the full buffer has elapsed', clearedBuffer.conflict === false);

/* ── Delay propagation: a late completion uses the ACTUAL end, not the plan ── */
console.log('\n[recovery buffer — delay propagation]');
const plannedEndTs = new Date('2026-06-24T11:00:00').getTime();
const actualLateEndTs = new Date('2026-06-24T11:45:00').getTime(); // ran 45 min over
const delayed = evaluateAvailability(
  [{ driver: 'x', date: '2026-06-24', startTime: '09:00', endTime: '11:00', status: 'completed', completedAt: actualLateEndTs }],
  { date: '2026-06-24', startTime: '12:00', endTime: '13:00' }, 60);
check('a delayed completion pushes Availability Time from the ACTUAL end (completedAt), not the plan',
  delayed.conflict === true && delayed.availabilityMinutes === (11 * 60 + 45 + 60));
const onTime = evaluateAvailability(
  [{ driver: 'x', date: '2026-06-24', startTime: '09:00', endTime: '11:00', status: 'completed', completedAt: plannedEndTs }],
  { date: '2026-06-24', startTime: '12:00', endTime: '13:00' }, 60);
check('an on-time completion (completedAt == plan) behaves exactly like the plan', onTime.conflict === false);

/* ── The buffer is CENTRALIZED (dispatch-intelligence-config.js) — changing it
   there, not a literal at the call site, is what changes recommendDrivers(). */
console.log('\n[recovery buffer — centralized config, not hardcoded]');
setDispatchConfig({ recoveryBufferMinutes: 0 });
const noBufferConfigured = recommendDrivers(
  { date: '2026-06-24', startTime: '11:00', endTime: '13:00' },
  [{ id: 'drv_c', name: 'Citra' }],
  [asg('Citra', 0, { startTime: '09:00', endTime: '11:00', status: 'assigned' })],
  { now: NOW });
check('recoveryBufferMinutes:0 via setDispatchConfig() removes the buffer conflict (no override option passed)',
  noBufferConfigured.recommendedDriver.bufferSatisfied === true);
resetDispatchConfig();

/* ── Weights sourced from the store (NO hardcoded weights) ───────────── */
console.log('\n[store weights]');
const baseScore = recommendDrivers(REQUEST, drivers, assignments, { now: NOW }).diagnostics.find((d) => d.driverId === 'drv_b').score;
check('default-weights Budi score = 74', baseScore === 74);
setScoringWeights({ availability: 0, workload: 0, recency: 0, priority: 100 });
const allPriority = recommendDrivers(REQUEST, drivers, assignments, { now: NOW });
check('priority-only weights → every score = 100 (priority sub-score)',
  allPriority.diagnostics.every((d) => d.score === 100));
check('priority-only weights surfaced on result', allPriority.weights.priority === 100 && allPriority.weights.availability === 0);
resetDispatchIntelligence();
const restored = recommendDrivers(REQUEST, drivers, assignments, { now: NOW }).diagnostics.find((d) => d.driverId === 'drv_b').score;
check('reset restores default weights → Budi score 74 again', restored === 74);

/* ── WORKLOAD map sanity ─────────────────────────────────────────────── */
check('WORKLOAD_SCORE_BY_STATUS matches spec (100/80/40/10)',
  WORKLOAD_SCORE_BY_STATUS.LOW === 100 && WORKLOAD_SCORE_BY_STATUS.NORMAL === 80
  && WORKLOAD_SCORE_BY_STATUS.HIGH === 40 && WORKLOAD_SCORE_BY_STATUS.OVERLOADED === 10);

/* ── Summary ─────────────────────────────────────────────────────────── */
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
