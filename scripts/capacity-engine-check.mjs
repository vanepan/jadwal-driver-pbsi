/* capacity-engine-check.mjs — validates the Driver Capacity Engine and the
   Capacity Snapshot Service (Dispatch Intelligence Foundation, v1.16.4.11-alpha.1).
   Run: node scripts/capacity-engine-check.mjs   (exit 0 = all pass)

   Covers the spec's required scenarios:
     1. No assignments            5. Overloaded utilization
     2. Low utilization           6. Available slot calculation
     3. Normal utilization        7. Status calculation (band boundaries)
     4. High utilization
   plus rolling-window counting, cancelled exclusion, monthly-capacity
   override, and the system-wide snapshot aggregation. */

import {
  calculateDriverCapacity,
  calculateUtilization,
  calculateAvailableSlots,
  calculateStatus,
  CAPACITY_STATUS,
  DEFAULT_MONTHLY_CAPACITY,
} from '../js/services/driver-capacity-engine.js';
import { generateCapacitySnapshot } from '../js/services/capacity-snapshot-service.js';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

const NOW = '2026-06-24T12:00:00';
// Build N assignments dated `offsetDays` ago for a driver, optional status.
function asg(driver, offsetDays, status = 'completed') {
  const d = new Date(`${NOW}`);
  d.setDate(d.getDate() - offsetDays);
  const date = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  return { driver, date, status };
}
function many(driver, count, offsetDays, status) {
  return Array.from({ length: count }, () => asg(driver, offsetDays, status));
}

/* ── 1. No assignments ───────────────────────────────────────────────── */
let c = calculateDriverCapacity('drv_a', [], { now: NOW });
check('no-asg totalAssignments = 0', c.totalAssignments === 0);
check('no-asg assignmentsLast30Days = 0', c.assignmentsLast30Days === 0);
check('no-asg utilization = 0', c.utilizationPercent === 0);
check('no-asg availableSlots = 50 (full)', c.availableSlots === DEFAULT_MONTHLY_CAPACITY);
check('no-asg status = LOW', c.status === CAPACITY_STATUS.LOW);

/* ── 2. Low utilization (10 / 50 = 20%) ──────────────────────────────── */
c = calculateDriverCapacity('drv_a', many('drv_a', 10, 5), { now: NOW });
check('low utilization = 20%', c.utilizationPercent === 20);
check('low status = LOW', c.status === CAPACITY_STATUS.LOW);
check('low availableSlots = 40', c.availableSlots === 40);
check('low counts in both 7d and 30d (offset 5)', c.assignmentsLast7Days === 10 && c.assignmentsLast30Days === 10);

/* ── 3. Normal utilization (30 / 50 = 60%) ───────────────────────────── */
c = calculateDriverCapacity('drv_a', many('drv_a', 30, 20), { now: NOW });
check('normal utilization = 60%', c.utilizationPercent === 60);
check('normal status = NORMAL', c.status === CAPACITY_STATUS.NORMAL);
check('normal availableSlots = 20', c.availableSlots === 20);
check('offset-20 work excluded from 7d window', c.assignmentsLast7Days === 0 && c.assignmentsLast30Days === 30);

/* ── 4. High utilization (42 / 50 = 84%) — the spec example ──────────── */
c = calculateDriverCapacity('drv_001', many('drv_001', 42, 3), { now: NOW });
check('high utilization = 84% (spec example)', c.utilizationPercent === 84);
check('high status = HIGH', c.status === CAPACITY_STATUS.HIGH);
check('high availableSlots = 8 (spec example)', c.availableSlots === 8);

/* ── 5. Overloaded utilization ───────────────────────────────────────── */
c = calculateDriverCapacity('drv_a', many('drv_a', 48, 10), { now: NOW });
check('48/50 utilization = 96%', c.utilizationPercent === 96);
check('48/50 status = OVERLOADED', c.status === CAPACITY_STATUS.OVERLOADED);
check('48/50 availableSlots = 2', c.availableSlots === 2);
c = calculateDriverCapacity('drv_a', many('drv_a', 70, 10), { now: NOW });
check('over-cap utilization caps at 100%', c.utilizationPercent === 100);
check('over-cap availableSlots floors at 0', c.availableSlots === 0);
check('over-cap totalAssignments preserved (70)', c.totalAssignments === 70);

/* ── 6. Available slot calculation (pure method) ─────────────────────── */
check('slots(0%) = 50', calculateAvailableSlots(0) === 50);
check('slots(50%) = 25', calculateAvailableSlots(50) === 25);
check('slots(84%) = 8', calculateAvailableSlots(84) === 8);
check('slots(100%) = 0', calculateAvailableSlots(100) === 0);
check('slots respects monthlyCapacity override (cap 30, 50%) = 15', calculateAvailableSlots(50, 30) === 15);

/* ── 7. Status calculation (band boundaries) ─────────────────────────── */
check('status(0) = LOW', calculateStatus(0) === CAPACITY_STATUS.LOW);
check('status(40) = LOW (upper LOW edge)', calculateStatus(40) === CAPACITY_STATUS.LOW);
check('status(41) = NORMAL (lower NORMAL edge)', calculateStatus(41) === CAPACITY_STATUS.NORMAL);
check('status(75) = NORMAL (upper NORMAL edge)', calculateStatus(75) === CAPACITY_STATUS.NORMAL);
check('status(76) = HIGH (lower HIGH edge)', calculateStatus(76) === CAPACITY_STATUS.HIGH);
check('status(90) = HIGH (upper HIGH edge)', calculateStatus(90) === CAPACITY_STATUS.HIGH);
check('status(91) = OVERLOADED (lower OVERLOADED edge)', calculateStatus(91) === CAPACITY_STATUS.OVERLOADED);
check('status(100) = OVERLOADED', calculateStatus(100) === CAPACITY_STATUS.OVERLOADED);

/* ── Utilization method + monthly-capacity override ──────────────────── */
check('utilization(25) = 50%', calculateUtilization(25) === 50);
check('utilization(60) caps at 100%', calculateUtilization(60) === 100);
check('utilization(15, cap 30) = 50%', calculateUtilization(15, 30) === 50);

/* ── Cancelled assignments are excluded from every count ─────────────── */
c = calculateDriverCapacity('drv_a', [
  ...many('drv_a', 5, 2, 'completed'),
  ...many('drv_a', 3, 2, 'cancelled'),
], { now: NOW });
check('cancelled excluded from total', c.totalAssignments === 5);
check('cancelled excluded from 30d', c.assignmentsLast30Days === 5);

/* ── Future-dated assignments: total only, not in windows ────────────── */
c = calculateDriverCapacity('drv_a', [
  ...many('drv_a', 4, 2),    // past
  ...many('drv_a', 6, -5),   // 5 days in the future
], { now: NOW });
check('future asg counted in total (10)', c.totalAssignments === 10);
check('future asg excluded from 30d window (4)', c.assignmentsLast30Days === 4);

/* ── Identity matching: a.driver name vs driverId, + aliases ─────────── */
c = calculateDriverCapacity('drv_001', [
  { driver: 'drv_001', date: '2026-06-23', status: 'completed' },
  { driver: 'Budi', date: '2026-06-23', status: 'completed' },   // alias
  { driver: 'someone_else', date: '2026-06-23', status: 'completed' },
], { now: NOW, aliases: ['Budi'] });
check('matches by driverId and alias, ignores others', c.totalAssignments === 2);

/* ── System-wide snapshot aggregation ────────────────────────────────── */
const drivers = [
  { id: 'drv_budi', name: 'Budi', legacyNames: ['Budi S'] },
  { id: 'drv_andi', name: 'Andi' },
  { id: 'drv_idle', name: 'Idle Joe' },
];
const assignments = [
  ...many('Budi', 42, 3).map((a) => ({ ...a, driver: 'Budi' })),
  ...many('Budi S', 4, 3).map((a) => ({ ...a, driver: 'Budi S' })),    // legacy name → same driver
  ...many('Andi', 10, 3).map((a) => ({ ...a, driver: 'Andi' })),
];
const snap = generateCapacitySnapshot(drivers, assignments, { now: NOW });
check('snapshot has generatedAt', typeof snap.generatedAt === 'string' && snap.generatedAt.includes('T'));
check('snapshot covers all 3 drivers', snap.drivers.length === 3);
const budi = snap.drivers.find((d) => d.driverId === 'drv_budi');
check('Budi aggregates legacy name (46 → 92% util)', budi.assignmentsLast30Days === 46 && budi.utilizationPercent === 92);
check('Budi status OVERLOADED', budi.status === CAPACITY_STATUS.OVERLOADED);
check('snapshot sorted by utilization desc', snap.drivers[0].utilizationPercent >= snap.drivers[snap.drivers.length - 1].utilizationPercent);
const idle = snap.drivers.find((d) => d.driverId === 'drv_idle');
check('idle driver present with 0 util / LOW', idle.utilizationPercent === 0 && idle.status === CAPACITY_STATUS.LOW);
check('summary byStatus counts OVERLOADED ≥ 1', snap.summary.byStatus.OVERLOADED >= 1);
check('summary totalDrivers = 3', snap.summary.totalDrivers === 3);
check('includeInactive:false drops the idle driver', generateCapacitySnapshot(drivers, assignments, { now: NOW, includeInactive: false }).drivers.length === 2);

/* ── Summary ─────────────────────────────────────────────────────────── */
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
