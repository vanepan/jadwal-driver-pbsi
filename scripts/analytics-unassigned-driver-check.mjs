/* analytics-unassigned-driver-check.mjs — V1 UNASSIGNED SEMANTICS.

   Drives the REAL analytics engine (js/analytics/analytics-engine.js is PURE —
   no Firebase, no DOM) and asserts that an assignment with NO driver
   (assignment.driver === '' — the v1.27.0 Self-Drive state — or legacy
   null/undefined, or the '__none__' sentinel):

     • is NEVER a driver identity in analytics output
       (no ''/null/'Tanpa Driver'/'Self-Drive'/'__none__' in any driver list);
     • does NOT contribute to driver count, driver workload score, driver
       working hours, driver overtime, driver outside-operational-hours, or
       driver working-hour utilization;
     • does NOT distort a REAL driver's workload score (cohort max stays clean);
     • DOES still contribute to VEHICLE analytics when it has a vehicle
       (vehicleOdoList / totalKm) — driver and vehicle analytics stay
       independent;
     • leaves every metric for actual named drivers byte-identical.

   Run: node scripts/analytics-unassigned-driver-check.mjs   (exit 0 = all pass)
*/

import { computeAnalyticsModel } from '../js/analytics/analytics-engine.js';
import { isUnassignedAssignment } from '../js/utils.js';

let pass = 0, fail = 0;
const check = (n, c, detail) => {
  if (c) { pass++; console.log(`  ✓ ${n}`); }
  else { fail++; console.log(`  ✗ ${n}`); if (detail !== undefined) console.log('     ' + JSON.stringify(detail)); }
};
const near = (a, b, t = 1e-6) => Math.abs(a - b) <= t;

const iso = (date, h, m = 0) => new Date(`${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`).toISOString();
const WEEKDAY = '2026-06-22'; // Monday

/** completed assignment with real actual timestamps */
function done(id, driver, { date = WEEKDAY, sh, eh, km = 10, vehicle = 'Innova' } = {}) {
  return {
    id, driver, vehicle, date, status: 'completed',
    startTime: `${String(sh).padStart(2, '0')}:00`, endTime: `${String(eh).padStart(2, '0')}:00`,
    startedAt: iso(date, sh), completedAt: iso(date, eh),
    distanceTravelled: km, destination: 'Kantor',
  };
}
function planned(id, driver, { date = WEEKDAY, sh = 10, eh = 12, vehicle = 'Innova' } = {}) {
  return {
    id, driver, vehicle, date, status: 'assigned',
    startTime: `${String(sh).padStart(2, '0')}:00`, endTime: `${String(eh).padStart(2, '0')}:00`,
    startedAt: null, completedAt: null, distanceTravelled: null, destination: 'Kantor',
  };
}

const DRIVERS = [{ name: 'Budi', active: true }, { name: 'Andi', active: true }, { name: 'Cici', active: true }];
function ctxOf(assignments) {
  return {
    assignments, requests: [], drivers: DRIVERS, vehicles: [{ name: 'Innova' }, { name: 'Avanza' }],
    office: { workStartMins: 540, workEndMins: 1020 }, // 09:00–17:00
    filters: { dateRange: 'all', driver: '', vehicle: '', bidang: '' },
    aliases: { destinations: {}, bidang: {}, drivers: {}, vehicles: {} },
    dismissed: { destinations: {}, bidang: {}, drivers: {}, vehicles: {} },
    normalizeAssignmentStatus: (a) => a,
  };
}

/** Every place the engine can emit a driver identity. */
function allDriverIdentities(model) {
  const out = [];
  const push = (v) => { if (v !== undefined) out.push(v); };
  (model.diagnostics?.workload?.drivers || []).forEach(d => push(d.name));
  Object.keys(model.diagnostics?.workingTime?.byDriver || {}).forEach(k => push(k));
  (model.render?.driversWithTrips || []).forEach(d => push(d.displayName));
  (model.charts?.driverWorkload || []).forEach(d => push(d.displayName ?? d.name));
  (model.exportSnapshot?.driverCounts || []).forEach(d => push(d.name));
  (model.render?.driverOdoList || []).forEach(d => push(d.name));
  (model.charts?.odoDriver || []).forEach(d => push(d.name));
  push(model.kpis?.workloadTop?.name);
  push(model.kpis?.workloadLow?.name);
  push(model.diagnostics?.workload?.palingAktif?.name);
  push(model.diagnostics?.workload?.bebanTerendah?.name);
  push(model.exportSnapshot?.mostActiveDriver?.name);
  return out;
}
const FORBIDDEN = ['', 'tanpa driver', 'self-drive', 'selfdrive', '__none__', 'null', 'undefined'];
function hasFakeDriver(model) {
  return allDriverIdentities(model).some(v => {
    if (v == null) return true;
    return FORBIDDEN.includes(String(v).trim().toLowerCase());
  });
}

/* ══ 0 — the canonical predicate ══ */
console.log('\n[0 — canonical predicate js/utils.js#isUnassignedAssignment]');
check("'' is unassigned",        isUnassignedAssignment({ driver: '' }) === true);
check("'   ' is unassigned",     isUnassignedAssignment({ driver: '   ' }) === true);
check('null is unassigned',      isUnassignedAssignment({ driver: null }) === true);
check('undefined is unassigned', isUnassignedAssignment({ driver: undefined }) === true);
check("'__none__' is unassigned",isUnassignedAssignment({ driver: '__none__' }) === true);
check("'Budi' is NOT unassigned",isUnassignedAssignment({ driver: 'Budi' }) === false);

/* ══ 1 — the 8-case matrix ══ */
console.log('\n[1 — 8-case matrix: driver YES/NO · vehicle YES/NO]');
const matrix = computeAnalyticsModel(ctxOf([
  done('c1', 'Budi', { sh: 10, eh: 12, km: 30 }),                     // 1 named/vehicle/in-hours
  done('c4', '',     { sh: 10, eh: 12, km: 25 }),                     // 4 empty/vehicle/in-hours
  done('c5', '',     { sh: 18, eh: 21, km: 40 }),                     // 5/7 empty/vehicle/OUTSIDE hours
  done('c6', '',     { sh: 10, eh: 12, km: 15, vehicle: '' }),        // 6 empty/NO vehicle
  done('c8', 'Andi', { sh: 18, eh: 21, km: 20 }),                     // 8 named/vehicle/OUTSIDE hours
]));
const wlNames = (matrix.diagnostics.workload.drivers || []).map(d => d.name).sort();
const wtKeys = Object.keys(matrix.diagnostics.workingTime.byDriver || {}).sort();
check('workload model scores ONLY the two named drivers', JSON.stringify(wlNames) === JSON.stringify(['Andi', 'Budi']), wlNames);
check('workingTime.byDriver keyed ONLY by the two named drivers', JSON.stringify(wtKeys) === JSON.stringify(['andi', 'budi']), wtKeys);
check('no fake / empty driver identity anywhere in the model', !hasFakeDriver(matrix), allDriverIdentities(matrix));
const innova = matrix.render.vehicleOdoList.find(v => v.name === 'Innova');
check('vehicle Innova km = 30+25+40+20 = 115 (unassigned trips counted, no-vehicle one not)', innova && innova.km === 115, matrix.render.vehicleOdoList);
check('totalKm = 115 (fleet km sums by vehicle, driver-agnostic)', matrix.kpis.totalKm === 115, matrix.kpis.totalKm);
check('driverOdoList carries only the named drivers with km', matrix.render.driverOdoList.every(d => d.name === 'Budi' || d.name === 'Andi'), matrix.render.driverOdoList);

/* ══ 2 — driver COUNT regression ══ */
console.log('\n[2 — driver count: Budi + Andi + 1 unassigned → 2, never 3]');
const cnt = computeAnalyticsModel(ctxOf([
  done('b', 'Budi', { sh: 10, eh: 12 }),
  done('a', 'Andi', { sh: 10, eh: 12 }),
  done('u', '',     { sh: 10, eh: 12 }),
]));
check('render.driversWithTrips.length === 2', cnt.render.driversWithTrips.length === 2, cnt.render.driversWithTrips);
check('kpis.driversWithTrips === 2', cnt.kpis.driversWithTrips === 2, cnt.kpis.driversWithTrips);
check('kpis.activeDrivers === 3 (roster count, unaffected)', cnt.kpis.activeDrivers === 3, cnt.kpis.activeDrivers);
check('exportSnapshot.driverCounts has exactly 2 rows', cnt.exportSnapshot.driverCounts.length === 2, cnt.exportSnapshot.driverCounts);

/* ══ 3 — driver WORKLOAD regression ══ */
console.log('\n[3 — workload: Budi 2 completed + 3 unassigned → Budi.completed = 2]');
const wl = computeAnalyticsModel(ctxOf([
  done('b1', 'Budi', { sh: 9, eh: 11 }), done('b2', 'Budi', { sh: 13, eh: 15 }),
  done('u1', '', { sh: 9, eh: 11 }), done('u2', '', { sh: 13, eh: 15 }), done('u3', '', { sh: 15, eh: 16 }),
]));
const budiWl = wl.diagnostics.workload.drivers.find(d => d.name === 'Budi');
check('Budi workload entry exists with completed === 2', budiWl && budiWl.completed === 2, budiWl);
check('workload cohort has exactly 1 driver (Budi) — no empty-name entry', wl.diagnostics.workload.drivers.length === 1, wl.diagnostics.workload.drivers.map(d => d.name));
check('no "Tanpa Driver" workload of 3', !wl.diagnostics.workload.drivers.some(d => d.completed === 3), wl.diagnostics.workload.drivers);

/* ══ 4 — driver OVERTIME regression: unassigned outside-hours creates NONE ══ */
console.log('\n[4 — overtime: an unassigned outside-hours trip adds no driver overtime]');
const baseAsg = [done('n1', 'Budi', { sh: 10, eh: 12 })]; // one in-hours named trip, no overtime
const withUnassignedOT = computeAnalyticsModel(ctxOf([...baseAsg, done('x', '', { sh: 19, eh: 23, km: 50 })]));
const withoutIt        = computeAnalyticsModel(ctxOf([...baseAsg]));
check('overtimeAssignments identical with/without the unassigned outside-hours trip (0)',
  withUnassignedOT.kpis.overtimeAssignments === withoutIt.kpis.overtimeAssignments && withUnassignedOT.kpis.overtimeAssignments === 0,
  { withIt: withUnassignedOT.kpis.overtimeAssignments, without: withoutIt.kpis.overtimeAssignments });
check('totalOvertimeHours identical (0)', near(withUnassignedOT.kpis.totalOvertimeHours, withoutIt.kpis.totalOvertimeHours) && withUnassignedOT.kpis.totalOvertimeHours === 0,
  { withIt: withUnassignedOT.kpis.totalOvertimeHours, without: withoutIt.kpis.totalOvertimeHours });
check('totalActualHours identical (unassigned hours are not driver working time)',
  near(withUnassignedOT.kpis.totalActualHours, withoutIt.kpis.totalActualHours),
  { withIt: withUnassignedOT.kpis.totalActualHours, without: withoutIt.kpis.totalActualHours });
check('workingHourUtilization identical (driver-days not inflated)',
  withUnassignedOT.kpis.workingHourUtilization === withoutIt.kpis.workingHourUtilization,
  { withIt: withUnassignedOT.kpis.workingHourUtilization, without: withoutIt.kpis.workingHourUtilization });
check('no fake driver in the overtime model', !hasFakeDriver(withUnassignedOT));

/* ══ 5 — NAMED driver overtime is PRESERVED (Case 8) ══ */
console.log('\n[5 — a NAMED driver outside-hours trip still produces driver overtime]');
const namedOT = computeAnalyticsModel(ctxOf([done('a', 'Andi', { sh: 18, eh: 21, km: 20 })]));
check('overtimeAssignments === 1 for the named outside-hours trip', namedOT.kpis.overtimeAssignments === 1, namedOT.kpis.overtimeAssignments);
check('totalOvertimeHours === 3 for the named outside-hours trip', near(namedOT.kpis.totalOvertimeHours, 3), namedOT.kpis.totalOvertimeHours);
check('Andi is in workingTime.byDriver with overtimeCount 1',
  namedOT.diagnostics.workingTime.byDriver.andi && namedOT.diagnostics.workingTime.byDriver.andi.overtimeCount === 1,
  namedOT.diagnostics.workingTime.byDriver);

/* ══ 6 — an unassigned trip does not DISTORT a real driver's workload score ══ */
console.log('\n[6 — cohort max stays clean: real drivers score the same with/without a huge unassigned trip]');
const realOnly = computeAnalyticsModel(ctxOf([
  done('b', 'Budi', { sh: 9, eh: 17, km: 400 }), done('a', 'Andi', { sh: 9, eh: 11, km: 30 }),
]));
const plusMonsterUnassigned = computeAnalyticsModel(ctxOf([
  done('b', 'Budi', { sh: 9, eh: 17, km: 400 }), done('a', 'Andi', { sh: 9, eh: 11, km: 30 }),
  done('u', '', { sh: 0, eh: 23, km: 9999 }), // would dominate every cohort max if it leaked
]));
const scoreOf = (m, name) => (m.diagnostics.workload.drivers.find(d => d.name === name) || {}).score;
check('Budi workload score unchanged by the monster unassigned trip',
  scoreOf(realOnly, 'Budi') === scoreOf(plusMonsterUnassigned, 'Budi'),
  { without: scoreOf(realOnly, 'Budi'), with: scoreOf(plusMonsterUnassigned, 'Budi') });
check('Andi workload score unchanged',
  scoreOf(realOnly, 'Andi') === scoreOf(plusMonsterUnassigned, 'Andi'),
  { without: scoreOf(realOnly, 'Andi'), with: scoreOf(plusMonsterUnassigned, 'Andi') });
check('workloadAvgScore unchanged', realOnly.kpis.workloadAvgScore === plusMonsterUnassigned.kpis.workloadAvgScore,
  { without: realOnly.kpis.workloadAvgScore, with: plusMonsterUnassigned.kpis.workloadAvgScore });
check('no fake driver even with the monster unassigned trip present', !hasFakeDriver(plusMonsterUnassigned));

/* ══ 7 — the '__none__' sentinel is treated as unassigned too ══ */
console.log("[7 — a stray '__none__' driver never becomes an identity]");
const sentinel = computeAnalyticsModel(ctxOf([
  done('b', 'Budi', { sh: 10, eh: 12 }),
  done('s', '__none__', { sh: 10, eh: 12, km: 12 }),
]));
check('no "__none__" (or any fake) driver identity', !hasFakeDriver(sentinel), allDriverIdentities(sentinel));
check('only Budi is scored', JSON.stringify((sentinel.diagnostics.workload.drivers || []).map(d => d.name)) === JSON.stringify(['Budi']));

console.log(`\nanalytics-unassigned-driver-check: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
