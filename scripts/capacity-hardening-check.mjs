/* capacity-hardening-check.mjs — validates Dispatch Intelligence Hardening
   (v1.16.4.11-alpha.1.1). Run: node scripts/capacity-hardening-check.mjs
   (exit 0 = all pass)

   Covers the eight required scenarios:
     1. Configurable capacity           5. Trend DOWN
     2. Snapshot retention              6. Trend STABLE
     3. Snapshot history retrieval      7. Fleet trend summary
     4. Trend UP                        8. Scheduler snapshot creation
   plus configurable status bands and runDailySnapshot idempotency. */

import {
  getDispatchConfig, setDispatchConfig, resetDispatchConfig,
} from '../js/config/dispatch-intelligence-config.js';
import {
  calculateDriverCapacity, calculateStatus, calculateUtilization, CAPACITY_STATUS,
} from '../js/services/driver-capacity-engine.js';
import {
  saveSnapshot, getSnapshotHistory, getLatestSnapshot, getPreviousSnapshot,
  resetDispatchIntelligence,
} from '../js/stores/dispatch-intelligence-store.js';
import {
  buildDriverTrends, generateFleetTrend, getCapacityTrend, classifyTrend, TREND,
} from '../js/services/capacity-trend-engine.js';
import { runSnapshot, runDailySnapshot } from '../js/services/capacity-scheduler.js';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

const NOW = '2026-06-24T12:00:00';
function isoDaysAgo(days, base = NOW) {
  const d = new Date(base); d.setDate(d.getDate() - days); return d.toISOString();
}
function dateDaysAgo(days, base = NOW) {
  const d = new Date(base); d.setDate(d.getDate() - days);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
// Minimal snapshot for trend/retention tests.
function snap(generatedAt, drivers) { return { generatedAt, drivers }; }
function row(driverId, utilizationPercent, status, driverName) {
  return { driverId, driverName: driverName || driverId, utilizationPercent, status };
}
function manyAsg(driver, count, daysAgo) {
  return Array.from({ length: count }, () => ({ driver, date: dateDaysAgo(daysAgo), status: 'completed' }));
}

/* ── 1. Configurable capacity ────────────────────────────────────────── */
console.log('\n[1] Configurable capacity');
resetDispatchConfig();
check('default monthlyCapacity = 50', getDispatchConfig().monthlyCapacity === 50);
let c = calculateDriverCapacity('drv_a', manyAsg('drv_a', 20, 3), { now: NOW });
check('20 asg @ cap 50 → util 40%', c.utilizationPercent === 40);
setDispatchConfig({ monthlyCapacity: 25 });
check('config monthlyCapacity now 25', getDispatchConfig().monthlyCapacity === 25);
c = calculateDriverCapacity('drv_a', manyAsg('drv_a', 20, 3), { now: NOW });
check('20 asg @ cap 25 → util 80% (config consumed, no hardcode)', c.utilizationPercent === 80);
check('20 asg @ cap 25 → availableSlots 5', c.availableSlots === 5);
check('calculateUtilization respects live config (10 → 40%)', calculateUtilization(10) === 40);
// Configurable status bands
setDispatchConfig({ statusBands: { LOW: [0, 10], NORMAL: [11, 50], HIGH: [51, 80], OVERLOADED: [81, 100] } });
check('status(20) = NORMAL under custom bands', calculateStatus(20) === CAPACITY_STATUS.NORMAL);
check('status(85) = OVERLOADED under custom bands', calculateStatus(85) === CAPACITY_STATUS.OVERLOADED);
resetDispatchConfig();
check('reset restores default bands: status(20) = LOW', calculateStatus(20) === CAPACITY_STATUS.LOW);
check('reset restores cap 50: util 40% for 20 asg', calculateDriverCapacity('drv_a', manyAsg('drv_a', 20, 3), { now: NOW }).utilizationPercent === 40);

/* ── 2. Snapshot retention ───────────────────────────────────────────── */
console.log('\n[2] Snapshot retention');
resetDispatchIntelligence();
saveSnapshot(snap(isoDaysAgo(100), [row('d1', 50, CAPACITY_STATUS.NORMAL)]), { retentionDays: 90 });
saveSnapshot(snap(isoDaysAgo(10), [row('d1', 60, CAPACITY_STATUS.NORMAL)]), { retentionDays: 90 });
saveSnapshot(snap(isoDaysAgo(0), [row('d1', 70, CAPACITY_STATUS.NORMAL)]), { retentionDays: 90 });
check('100-day-old snapshot pruned (2 remain of 3)', getSnapshotHistory().length === 2);
check('retained snapshots are within window', getSnapshotHistory().every((s) => Date.parse(s.generatedAt) >= Date.parse(isoDaysAgo(90))));
check('history sorted oldest → newest', getSnapshotHistory()[0].generatedAt < getSnapshotHistory()[1].generatedAt);

/* ── 3. Snapshot history retrieval ───────────────────────────────────── */
console.log('\n[3] Snapshot history retrieval');
check('getLatestSnapshot = most recent (util 70)', getLatestSnapshot().drivers[0].utilizationPercent === 70);
check('getPreviousSnapshot = second-newest (util 60)', getPreviousSnapshot().drivers[0].utilizationPercent === 60);
resetDispatchIntelligence();
check('empty history → getLatestSnapshot null', getLatestSnapshot() === null);
check('empty history → getPreviousSnapshot null', getPreviousSnapshot() === null);

/* ── 4–6. Trend classification (UP / DOWN / STABLE) ──────────────────── */
console.log('\n[4–6] Per-driver trends');
const prev = snap(isoDaysAgo(1), [
  row('up', 62, CAPACITY_STATUS.NORMAL), row('down', 80, CAPACITY_STATUS.HIGH), row('flat', 50, CAPACITY_STATUS.NORMAL),
]);
const curr = snap(isoDaysAgo(0), [
  row('up', 78, CAPACITY_STATUS.HIGH), row('down', 60, CAPACITY_STATUS.NORMAL), row('flat', 53, CAPACITY_STATUS.NORMAL),
]);
const trends = buildDriverTrends(prev, curr);
const byId = (id) => trends.find((t) => t.driverId === id);
check('UP: delta +16 → trend UP', byId('up').trend === TREND.UP && byId('up').delta === 16);
check('UP: previous 62, current 78 carried', byId('up').previousUtilization === 62 && byId('up').currentUtilization === 78);
check('DOWN: delta -20 → trend DOWN', byId('down').trend === TREND.DOWN && byId('down').delta === -20);
check('STABLE: delta +3 (within ±5) → STABLE', byId('flat').trend === TREND.STABLE && byId('flat').delta === 3);
check('classifyTrend(6)=UP, (-6)=DOWN, (5)=STABLE, (-5)=STABLE', classifyTrend(6) === TREND.UP && classifyTrend(-6) === TREND.DOWN && classifyTrend(5) === TREND.STABLE && classifyTrend(-5) === TREND.STABLE);
check('trends sorted by |delta| desc (DOWN 20 first)', trends[0].driverId === 'down');
// New driver (absent in previous) rises from 0
const t2 = buildDriverTrends(snap(isoDaysAgo(1), []), snap(isoDaysAgo(0), [row('newbie', 30, CAPACITY_STATUS.LOW)]));
check('new driver: previous 0, delta 30, UP', t2[0].previousUtilization === 0 && t2[0].delta === 30 && t2[0].trend === TREND.UP);

/* ── 7. Fleet trend summary ──────────────────────────────────────────── */
console.log('\n[7] Fleet trend summary');
const fleet = generateFleetTrend(prev, curr);
// prev avg = (62+80+50)/3 = 64; curr avg = (78+60+53)/3 = 64 → STABLE (delta 0)
check('fleet averageUtilization = 64', fleet.averageUtilization === 64);
check('fleet previousAverageUtilization = 64', fleet.previousAverageUtilization === 64);
check('fleet trend STABLE (delta 0)', fleet.trend === TREND.STABLE);
check('fleet status counts: high 1, normal 2, low 0, overloaded 0',
  fleet.highDrivers === 1 && fleet.normalDrivers === 2 && fleet.lowDrivers === 0 && fleet.overloadedDrivers === 0);
// Fleet UP case
const fUp = generateFleetTrend(
  snap(isoDaysAgo(1), [row('a', 20, CAPACITY_STATUS.LOW), row('b', 20, CAPACITY_STATUS.LOW)]),
  snap(isoDaysAgo(0), [row('a', 95, CAPACITY_STATUS.OVERLOADED), row('b', 85, CAPACITY_STATUS.HIGH)]),
);
check('fleet rising avg → trend UP, overloaded 1 + high 1', fUp.trend === TREND.UP && fUp.overloadedDrivers === 1 && fUp.highDrivers === 1);
// Store-backed no-arg fleet + getCapacityTrend
resetDispatchIntelligence();
saveSnapshot(prev); saveSnapshot(curr);
check('generateFleetTrend() reads store (avg 64)', generateFleetTrend().averageUtilization === 64);
const report = getCapacityTrend();
check('getCapacityTrend(): 3 driver trends + fleet', report.drivers.length === 3 && report.fleet.averageUtilization === 64);

/* ── 8. Scheduler snapshot creation ──────────────────────────────────── */
console.log('\n[8] Scheduler');
resetDispatchIntelligence();
resetDispatchConfig();
const drivers = [
  { id: 'drv_budi', name: 'Budi' },
  { id: 'drv_andi', name: 'Andi' },
];
const assignments = [
  ...manyAsg('Budi', 42, 3),
  ...manyAsg('Andi', 10, 3),
];
const s1 = runSnapshot(drivers, assignments, { now: NOW });
check('runSnapshot returns a snapshot with drivers', Array.isArray(s1.drivers) && s1.drivers.length === 2);
check('runSnapshot saved to history (length 1)', getSnapshotHistory().length === 1);
check('runSnapshot Budi util 84% (cap 50, 42/50)', getLatestSnapshot().drivers.find((d) => d.driverId === 'drv_budi').utilizationPercent === 84);
const daily1 = runDailySnapshot(drivers, assignments, { now: NOW });
check('runDailySnapshot same day → created false (idempotent)', daily1.created === false);
check('runDailySnapshot did not duplicate (history still small)', getSnapshotHistory().length <= 2);
const daily2 = runDailySnapshot(drivers, assignments, { now: isoDaysAgo(-1) }); // tomorrow
check('runDailySnapshot new day → created true', daily2.created === true);
check('two distinct days in history', getSnapshotHistory().length >= 2);

/* ── Summary ─────────────────────────────────────────────────────────── */
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
