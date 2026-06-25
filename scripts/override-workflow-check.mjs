/* override-workflow-check.mjs — validates the Admin Override Workflow
   (Human Decision Layer, v1.16.4.11-beta.1).
   Run: node scripts/override-workflow-check.mjs   (exit 0 = all pass)

   Covers the 9 required areas: the four outcome classifications (accepted /
   driver override / vehicle override / full override), the record builder +
   overridden flag, acceptance stats, per-driver and per-vehicle accuracy, and
   store persistence (saveOverrideLog / getOverrideLogs / getOverrideStats). */

import {
  OVERRIDE_OUTCOME,
  classifyOutcome,
  createOverrideRecord,
  computeOverrideStats,
  computeDriverAccuracy,
  computeVehicleAccuracy,
  computeAllDriverAccuracy,
  computeAllVehicleAccuracy,
} from '../js/services/override-workflow-service.js';
import {
  saveOverrideLog,
  getOverrideLogs,
  getOverrideStats,
  getDriverAccuracy,
  getVehicleAccuracy,
  resetDispatchIntelligence,
} from '../js/stores/dispatch-intelligence-store.js';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

resetDispatchIntelligence();

/* ── Classification (pure) ───────────────────────────────────────────── */
console.log('\n[classification]');
check('same driver + same vehicle → ACCEPTED', classifyOutcome('d1', 'v1', 'd1', 'v1') === OVERRIDE_OUTCOME.ACCEPTED);
check('different driver only → DRIVER_OVERRIDE', classifyOutcome('d1', 'v1', 'd2', 'v1') === OVERRIDE_OUTCOME.DRIVER_OVERRIDE);
check('different vehicle only → VEHICLE_OVERRIDE', classifyOutcome('d1', 'v1', 'd1', 'v2') === OVERRIDE_OUTCOME.VEHICLE_OVERRIDE);
check('different driver + vehicle → FULL_OVERRIDE', classifyOutcome('d1', 'v1', 'd2', 'v2') === OVERRIDE_OUTCOME.FULL_OVERRIDE);

/* ── Record builder + overridden flag ────────────────────────────────── */
console.log('\n[record builder]');
const accepted = createOverrideRecord({
  recommendationId: 'rec_1', recommendedDriverId: 'd1', recommendedVehicleId: 'v1',
  selectedDriverId: 'd1', selectedVehicleId: 'v1', dispatchScore: 94, approvedBy: 'Evan',
});
check('accepted record: outcome ACCEPTED + overridden false', accepted.outcome === OVERRIDE_OUTCOME.ACCEPTED && accepted.overridden === false);
check('accepted record carries dispatchScore + approvedBy', accepted.dispatchScore === 94 && accepted.approvedBy === 'Evan');
check('accepted record auto-timestamps (ISO)', typeof accepted.timestamp === 'string' && !Number.isNaN(Date.parse(accepted.timestamp)));

const driverOv = createOverrideRecord({
  recommendationId: 'rec_2', recommendedDriverId: 'd1', recommendedVehicleId: 'v1',
  selectedDriverId: 'd9', selectedVehicleId: 'v1', dispatchScore: 88,
  reason: 'Driver assigned to VIP task', approvedBy: 'Evan', timestamp: '2026-06-24T09:00:00Z',
});
check('driver override: outcome DRIVER_OVERRIDE + overridden true', driverOv.outcome === OVERRIDE_OUTCOME.DRIVER_OVERRIDE && driverOv.overridden === true);
check('override record preserves reason + explicit timestamp',
  driverOv.reason === 'Driver assigned to VIP task' && driverOv.timestamp === '2026-06-24T09:00:00.000Z');

const vehicleOv = createOverrideRecord({ recommendedDriverId: 'd1', recommendedVehicleId: 'v1', selectedDriverId: 'd1', selectedVehicleId: 'v2' });
check('vehicle override: outcome VEHICLE_OVERRIDE + overridden true', vehicleOv.outcome === OVERRIDE_OUTCOME.VEHICLE_OVERRIDE && vehicleOv.overridden === true);

const fullOv = createOverrideRecord({ recommendedDriverId: 'd1', recommendedVehicleId: 'v1', selectedDriverId: 'd2', selectedVehicleId: 'v2' });
check('full override: outcome FULL_OVERRIDE + overridden true', fullOv.outcome === OVERRIDE_OUTCOME.FULL_OVERRIDE && fullOv.overridden === true);

const implicitAccept = createOverrideRecord({ recommendedDriverId: 'd1', recommendedVehicleId: 'v1' });
check('unspecified selection defaults to recommendation → ACCEPTED', implicitAccept.outcome === OVERRIDE_OUTCOME.ACCEPTED && implicitAccept.selectedDriverId === 'd1' && implicitAccept.selectedVehicleId === 'v1');

/* ── A deterministic decision log ────────────────────────────────────── */
//   r1 ACCEPTED        d1/v1 → d1/v1
//   r2 ACCEPTED        d1/v1 → d1/v1
//   r3 DRIVER_OVERRIDE d1/v1 → d2/v1   (d1 dropped, v1 kept)
//   r4 VEHICLE_OVERRIDE d1/v2 → d1/v3  (d1 kept, v2 dropped)
//   r5 FULL_OVERRIDE   d3/v1 → d4/v5   (d3 dropped, v1 dropped)
const mk = (rd, rv, sd, sv) => createOverrideRecord({ recommendedDriverId: rd, recommendedVehicleId: rv, selectedDriverId: sd, selectedVehicleId: sv });
const logs = [
  mk('d1', 'v1', 'd1', 'v1'),
  mk('d1', 'v1', 'd1', 'v1'),
  mk('d1', 'v1', 'd2', 'v1'),
  mk('d1', 'v2', 'd1', 'v3'),
  mk('d3', 'v1', 'd4', 'v5'),
];

/* ── Stats calculation ───────────────────────────────────────────────── */
console.log('\n[stats]');
const stats = computeOverrideStats(logs);
check('total/accepted/overridden = 5/2/3', stats.total === 5 && stats.accepted === 2 && stats.overridden === 3);
check('acceptanceRate = 40 (2/5)', stats.acceptanceRate === 40);
const emptyStats = computeOverrideStats([]);
check('empty log → zeros + rate 0 (no divide-by-zero)', emptyStats.total === 0 && emptyStats.acceptanceRate === 0);

/* ── Driver accuracy ─────────────────────────────────────────────────── */
console.log('\n[driver accuracy]');
const d1 = computeDriverAccuracy(logs, 'd1');
check('d1: recommended 4, accepted 3, accuracy 75', d1.recommended === 4 && d1.accepted === 3 && d1.accuracy === 75);
const d3 = computeDriverAccuracy(logs, 'd3');
check('d3: recommended 1, accepted 0, accuracy 0', d3.recommended === 1 && d3.accepted === 0 && d3.accuracy === 0);
const dNone = computeDriverAccuracy(logs, 'd_unknown');
check('never-recommended driver → recommended 0, accuracy 0', dNone.recommended === 0 && dNone.accuracy === 0);
const allD = computeAllDriverAccuracy(logs);
check('computeAllDriverAccuracy sorted by recommend count (d1 first)', allD[0].driverId === 'd1' && allD[0].recommended === 4);

/* ── Vehicle accuracy ────────────────────────────────────────────────── */
console.log('\n[vehicle accuracy]');
const v1 = computeVehicleAccuracy(logs, 'v1');
check('v1: recommended 4, accepted 3, accuracy 75', v1.recommended === 4 && v1.accepted === 3 && v1.accuracy === 75);
const v2 = computeVehicleAccuracy(logs, 'v2');
check('v2: recommended 1, accepted 0, accuracy 0', v2.recommended === 1 && v2.accepted === 0 && v2.accuracy === 0);
const allV = computeAllVehicleAccuracy(logs);
check('computeAllVehicleAccuracy sorted by recommend count (v1 first)', allV[0].vehicleId === 'v1' && allV[0].recommended === 4);

/* ── Persistence (store) ─────────────────────────────────────────────── */
console.log('\n[persistence]');
resetDispatchIntelligence();
check('fresh store → empty override log + zero stats', getOverrideLogs().length === 0 && getOverrideStats().total === 0);
for (const r of logs) saveOverrideLog(r);
check('saveOverrideLog appends all records (length 5)', getOverrideLogs().length === 5);
check('getOverrideStats over store = 5/2/3, rate 40',
  getOverrideStats().total === 5 && getOverrideStats().accepted === 2 && getOverrideStats().acceptanceRate === 40);
check('getDriverAccuracy(d1) via store = 4/3/75', getDriverAccuracy('d1').accuracy === 75 && getDriverAccuracy('d1').recommended === 4);
check('getVehicleAccuracy(v1) via store = 4/3/75', getVehicleAccuracy('v1').accuracy === 75 && getVehicleAccuracy('v1').recommended === 4);
const snapshot = getOverrideLogs();
snapshot.push(mk('z', 'z', 'z', 'z'));
check('getOverrideLogs returns a copy (external mutation does not leak)', getOverrideLogs().length === 5);
resetDispatchIntelligence();
check('reset clears override log', getOverrideLogs().length === 0);

/* ── Summary ─────────────────────────────────────────────────────────── */
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
