/* policy-engine-check.mjs — validates the Dispatch Intelligence Policy Engine
   (v1.17.2). Run: node scripts/policy-engine-check.mjs (exit 0 = pass)

   The Policy Engine adds NO scoring and NO analytics math — it is the single
   source of PBSI eligibility business rules that sits before every Recommendation
   Engine. These assertions pin every feature: ambulance filtering (F1), medical
   mode (F2), driver optional (F3), admin override (F4), vehicle analytics
   exclusion (F5), Akuntes analytics exclusion (F6), petty-cash suggestion
   exclusion (F7), the policy pipeline (F8), diagnostics (F9), plus the empty +
   corrupt dataset safety. */

import {
  POLICY_REASON,
  SPECIAL_CASE,
  isSpecialVehicle,
  isAkuntesRequester,
  isMedicalRequester,
  driverEligibility,
  filterDriverPool,
  filterVehiclePool,
  applyDispatchPolicy,
  applyAnalyticsPolicy,
  excludeAkuntesFromSuggestions,
  buildPolicyDiagnostics,
} from '../js/services/dispatch-policy-engine.js';
import { resetPolicyConfig, setPolicyConfig, getPolicyConfig } from '../js/config/dispatch-policy-config.js';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

resetPolicyConfig();

/* ── Fixtures ─────────────────────────────────────────────────────────── */
const vehicles = [
  { id: 'v1', name: 'Innova', capacity: 7, active: true },
  { id: 'v2', name: 'Luxio', capacity: 7, active: true },
  { id: 'v3', name: 'Hiace', capacity: 12, active: true },
  { id: 'vamb', name: 'Ambulance PBSI', capacity: 4, active: true },
];
const drivers = [
  { id: 'd1', name: 'Andi', status: 'Aktif', active: true },
  { id: 'd2', name: 'Budi', status: 'Cuti', active: true, leave: { start: '2026-06-20', end: '2026-06-30' } },
  { id: 'd3', name: 'Citra', status: 'Nonaktif', active: false },
  { id: 'd4', name: 'Dewi', archived: true },
];

/* ── Detection ────────────────────────────────────────────────────────── */
console.log('\n[Detection]');
check('isSpecialVehicle: Ambulance → true', isSpecialVehicle({ name: 'Ambulance PBSI' }) === true);
check('isSpecialVehicle: Ambulans (id spelling) → true', isSpecialVehicle({ name: 'Mobil Ambulans' }) === true);
check('isSpecialVehicle: Innova → false', isSpecialVehicle({ name: 'Innova' }) === false);
check('isSpecialVehicle: explicit special flag → true', isSpecialVehicle({ name: 'X', special: true }) === true);
check('isSpecialVehicle: type=ambulance → true', isSpecialVehicle({ name: 'X', type: 'Ambulance' }) === true);
check('isSpecialVehicle: null → false', isSpecialVehicle(null) === false);
check('isAkuntesRequester: Akuntes → true', isAkuntesRequester('Akuntes') === true);
check('isAkuntesRequester: "Tim Akuntes PBSI" → true', isAkuntesRequester('Tim Akuntes PBSI') === true);
check('isAkuntesRequester: Pelatnas → false', isAkuntesRequester('Pelatnas Cipayung') === false);
check('isAkuntesRequester: empty → false', isAkuntesRequester('') === false);
check('isMedicalRequester: "Medical Pelatnas" → true', isMedicalRequester('Medical Pelatnas') === true);
check('isMedicalRequester: unit field → true', isMedicalRequester({ name: 'Dr. Sari', unit: 'Tim Medis' }) === true);
check('isMedicalRequester: ordinary requester → false', isMedicalRequester({ name: 'Andi', unit: 'Umum' }) === false);

/* ── Driver eligibility ───────────────────────────────────────────────── */
console.log('\n[Driver eligibility]');
check('Aktif driver eligible', driverEligibility(drivers[0]).eligible === true);
check('Cuti driver → ON_LEAVE', driverEligibility(drivers[1]).reason === POLICY_REASON.DRIVER_ON_LEAVE);
check('Nonaktif driver → DISABLED', driverEligibility(drivers[2]).reason === POLICY_REASON.DRIVER_DISABLED);
check('Archived driver → DISABLED', driverEligibility(drivers[3]).reason === POLICY_REASON.DRIVER_DISABLED);

/* ── Feature 1 — Special Vehicle Policy ───────────────────────────────── */
console.log('\n[Feature 1 — Special Vehicle Policy]');
let vp = filterVehiclePool(vehicles, {});
check('ambulance filtered from normal pool', vp.eligible.length === 3 && !vp.eligible.some((v) => v.id === 'vamb'));
check('ambulance recorded as filtered w/ reason', vp.filtered.length === 1 && vp.filtered[0].reason === POLICY_REASON.AMBULANCE_NOT_REQUESTED);
check('specialCase NONE in normal mode', vp.specialCase === SPECIAL_CASE.NONE);
vp = filterVehiclePool(vehicles, { ambulanceRequested: true });
check('ambulance allowed when explicitly requested', vp.eligible.length === 4 && vp.eligible.some((v) => v.id === 'vamb'));
check('specialCase AMBULANCE_OVERRIDE when requested', vp.specialCase === SPECIAL_CASE.AMBULANCE_OVERRIDE);

/* ── Feature 2 — Medical Request Mode ─────────────────────────────────── */
console.log('\n[Feature 2 — Medical Request Mode]');
vp = filterVehiclePool(vehicles, { medicalMode: true });
check('medical mode → ambulance only', vp.eligible.length === 1 && vp.eligible[0].id === 'vamb');
check('medical mode → non-ambulance all filtered', vp.filtered.length === 3 && vp.filtered.every((f) => f.reason === POLICY_REASON.MEDICAL_NON_AMBULANCE));
check('medical mode specialCase', vp.specialCase === SPECIAL_CASE.MEDICAL_MODE);

/* ── Feature 3 — Driver Optional Request ──────────────────────────────── */
console.log('\n[Feature 3 — Driver Optional Request]');
let dp = filterDriverPool(drivers, { driverOptional: true });
check('driverOptional → pool empty', dp.eligible.length === 0);
check('driverOptional → skipped flag', dp.skipped === true);
check('driverOptional → every driver filtered DRIVER_OPTIONAL', dp.filtered.length === 4 && dp.filtered.every((f) => f.reason === POLICY_REASON.DRIVER_OPTIONAL));
dp = filterDriverPool(drivers, {});
check('normal mode → only Aktif driver eligible', dp.eligible.length === 1 && dp.eligible[0].id === 'd1');
check('normal mode → 3 drivers filtered (leave/disabled)', dp.filtered.length === 3);

/* ── Feature 4 — Admin Override Policy ────────────────────────────────── */
console.log('\n[Feature 4 — Admin Override Policy]');
dp = filterDriverPool(drivers, { adminOverride: true });
check('admin override → all drivers eligible (incl leave/disabled)', dp.eligible.length === 4 && dp.filtered.length === 0);
vp = filterVehiclePool(vehicles, { adminOverride: true });
check('admin override → all vehicles eligible (incl ambulance)', vp.eligible.length === 4 && vp.filtered.length === 0);
check('admin override → specialCase ADMIN_OVERRIDE', vp.specialCase === SPECIAL_CASE.ADMIN_OVERRIDE);
// override beats medical/optional too
check('admin override beats driverOptional', filterDriverPool(drivers, { adminOverride: true, driverOptional: true }).eligible.length === 4);
check('admin override beats medicalMode', filterVehiclePool(vehicles, { adminOverride: true, medicalMode: true }).eligible.length === 4);

/* ── Feature 8 — Policy Pipeline ──────────────────────────────────────── */
console.log('\n[Feature 8 — Policy Pipeline]');
let result = applyDispatchPolicy({ drivers, vehicles, context: {} });
check('pipeline returns eligible drivers (filtered)', result.drivers.length === 1);
check('pipeline returns eligible vehicles (no ambulance)', result.vehicles.length === 3);
check('pipeline driverSkipped false by default', result.driverSkipped === false);
check('pipeline drivers never include ambulance filter reasons', !('vehicle' in (result.drivers[0] || {})));
result = applyDispatchPolicy({ drivers, vehicles, context: { driverOptional: true, medicalMode: true } });
check('pipeline driverOptional → skipped + empty drivers', result.driverSkipped === true && result.drivers.length === 0);
check('pipeline medicalMode → ambulance-only vehicles', result.vehicles.length === 1 && result.vehicles[0].id === 'vamb');

/* ── Feature 5 / 6 — Analytics exclusion ──────────────────────────────── */
console.log('\n[Feature 5/6 — Analytics exclusion]');
const aRequests = [
  { id: 'r1', requesterName: 'Pelatnas Cipayung' },
  { id: 'r2', requesterName: 'Akuntes' },
  { id: 'r3', requesterName: 'Bidang Sarpras' },
];
const aAssignments = [
  { id: 'a1', vehicle: 'Innova', pic: 'Pelatnas Cipayung' },
  { id: 'a2', vehicle: 'Ambulance PBSI', pic: 'Medical Pelatnas' },
  { id: 'a3', vehicle: 'Hiace', pic: 'Akuntes' },
];
const aLogs = [
  { recommendationId: 'r1', recommendedVehicleId: 'v1', recommendedDriverId: 'd1', outcome: 'ACCEPTED' },
  { recommendationId: 'r2', recommendedVehicleId: 'v2', recommendedDriverId: 'd1', outcome: 'ACCEPTED' }, // akuntes request
  { recommendationId: 'r3', recommendedVehicleId: 'vamb', recommendedDriverId: 'd1', outcome: 'ACCEPTED' }, // ambulance rec
];
const ap = applyAnalyticsPolicy({ vehicles, requests: aRequests, assignments: aAssignments, overrideLogs: aLogs });
check('F5 ambulance dropped from vehicle registry', ap.vehicles.length === 3 && !ap.vehicles.some((v) => v.id === 'vamb'));
check('F6 akuntes request dropped', ap.requests.length === 2 && !ap.requests.some((r) => r.requesterName === 'Akuntes'));
check('F5/F6 ambulance + akuntes assignments dropped', ap.assignments.length === 1 && ap.assignments[0].id === 'a1');
check('F5 ambulance-recommended log dropped', !ap.overrideLogs.some((l) => l.recommendedVehicleId === 'vamb'));
check('F6 akuntes-request log dropped', !ap.overrideLogs.some((l) => l.recommendationId === 'r2'));
check('F5/F6 only the clean log survives', ap.overrideLogs.length === 1 && ap.overrideLogs[0].recommendationId === 'r1');
check('diagnostics count excluded ambulance vehicles', ap.diagnostics.ambulanceVehiclesExcluded === 1);
check('diagnostics count excluded akuntes requests', ap.diagnostics.akuntesRequestsExcluded === 1);
check('diagnostics count excluded assignments', ap.diagnostics.assignmentsExcluded === 2);
check('diagnostics count excluded logs', ap.diagnostics.overrideLogsExcluded === 2);
// Operational data is NOT mutated — originals untouched (no deletion).
check('analytics policy never deletes operational data', aRequests.length === 3 && aAssignments.length === 3 && aLogs.length === 3);

/* ── Feature 7 — Petty Cash suggestion exclusion ──────────────────────── */
console.log('\n[Feature 7 — Petty Cash suggestion exclusion]');
const sugg = ['Pelatnas Cipayung', 'Akuntes', 'Bidang Sarpras', { name: 'Akuntes' }];
const filteredSugg = excludeAkuntesFromSuggestions(sugg);
check('akuntes (string) removed from suggestions', !filteredSugg.includes('Akuntes'));
check('akuntes (object) removed from suggestions', !filteredSugg.some((c) => c && c.name === 'Akuntes'));
check('non-akuntes suggestions preserved', filteredSugg.length === 2);

/* ── Feature 9 — Diagnostics ──────────────────────────────────────────── */
console.log('\n[Feature 9 — Diagnostics]');
const diag = applyDispatchPolicy({ drivers, vehicles, context: {} }).diagnostics;
check('driver diagnostics eligible/filtered counts', diag.drivers.eligible === 1 && diag.drivers.filtered === 3);
check('driver diagnostics reason tally (leave + disabled)', diag.drivers.reasons[POLICY_REASON.DRIVER_ON_LEAVE] === 1 && diag.drivers.reasons[POLICY_REASON.DRIVER_DISABLED] === 2);
check('vehicle diagnostics eligible/filtered counts', diag.vehicles.eligible === 3 && diag.vehicles.filtered === 1);
check('vehicle diagnostics specialCase', diag.vehicles.specialCase === SPECIAL_CASE.NONE);
check('diagnostics echo context flags', diag.context.medicalMode === false && diag.context.adminOverride === false);
const diag2 = buildPolicyDiagnostics(
  filterDriverPool(drivers, { driverOptional: true }),
  filterVehiclePool(vehicles, { medicalMode: true }),
  { driverOptional: true, medicalMode: true },
);
check('diagnostics reflect driverOptional skip', diag2.drivers.skipped === true);
check('diagnostics reflect medical specialCase', diag2.vehicles.specialCase === SPECIAL_CASE.MEDICAL_MODE);

/* ── Empty + corrupt datasets ─────────────────────────────────────────── */
console.log('\n[Empty + corrupt datasets]');
check('empty drivers safe', filterDriverPool([], {}).eligible.length === 0);
check('empty vehicles safe', filterVehiclePool([], {}).eligible.length === 0);
check('null input safe (drivers)', filterDriverPool(null, {}).eligible.length === 0);
check('null input safe (vehicles)', filterVehiclePool(undefined, {}).eligible.length === 0);
check('applyDispatchPolicy with no args safe', applyDispatchPolicy().drivers.length === 0);
check('applyAnalyticsPolicy with no args safe', applyAnalyticsPolicy().vehicles.length === 0);
const corruptV = [null, 42, { name: 'Innova' }, { name: 'Ambulance' }, 'string', {}];
check('corrupt vehicle list filtered safely', filterVehiclePool(corruptV, {}).eligible.length === 2); // Innova + {} (no name)
const corruptD = [null, { status: 'Aktif', name: 'OK' }, 7, undefined];
check('corrupt driver list filtered safely', filterDriverPool(corruptD, {}).eligible.length === 1);
check('applyAnalyticsPolicy tolerates corrupt arrays', applyAnalyticsPolicy({ vehicles: corruptV, requests: [null, 1], assignments: [null], overrideLogs: [null, 'x'] }).overrideLogs.length === 0);

/* ── Config override ──────────────────────────────────────────────────── */
console.log('\n[Config override]');
setPolicyConfig({ specialVehicleTokens: ['truk-pemadam'] });
check('config override retargets special-vehicle detection', isSpecialVehicle({ name: 'Truk-Pemadam 1' }) === true && isSpecialVehicle({ name: 'Ambulance' }) === false);
resetPolicyConfig();
check('reset restores default ambulance detection', isSpecialVehicle({ name: 'Ambulance' }) === true);

/* ── Summary ──────────────────────────────────────────────────────────── */
console.log(`\n${'─'.repeat(48)}`);
console.log(`Policy Engine: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
