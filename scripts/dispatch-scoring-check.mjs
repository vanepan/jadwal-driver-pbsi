/* dispatch-scoring-check.mjs — validates the Dispatch Scoring Engine
   (v1.16.4.11-alpha.4). Run: node scripts/dispatch-scoring-check.mjs
   (exit 0 = all pass)

   Covers the 10 required areas: a valid dispatch, driver conflict, vehicle
   conflict, over-capacity vehicle, weight calculation, ranking, tie-breaker,
   diagnostics, persistence, and multiple combinations (top-3 × top-3 ≤ 9).
   The dispatch weights are sourced from the store — NO hardcoded weights. */

import {
  recommendDispatch,
  scoreDispatch,
  DISPATCH_INVALID_REASON,
} from '../js/services/dispatch-scoring-engine.js';
import {
  getDispatchScoringWeights,
  setDispatchScoringWeights,
  saveDispatchRecommendation,
  getLatestDispatchRecommendation,
  resetDispatchIntelligence,
} from '../js/stores/dispatch-intelligence-store.js';
import { resetDispatchConfig } from '../js/config/dispatch-intelligence-config.js';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

const NOW = '2026-06-24T12:00:00';
const REQUEST = { date: '2026-06-24', startTime: '08:00', endTime: '12:00', passengers: 6, destination: 'Soekarno-Hatta' };
function dateDaysAgo(days, base = NOW) {
  const d = new Date(base); d.setDate(d.getDate() - days);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function dAsg(driver, daysAgo, extra = {}) { return { driver, date: dateDaysAgo(daysAgo), status: 'completed', ...extra }; }
function manyD(driver, count, daysAgo) { return Array.from({ length: count }, () => dAsg(driver, daysAgo)); }

resetDispatchIntelligence();
resetDispatchConfig();

/* ── Weight calculation (unit) ───────────────────────────────────────── */
console.log('\n[weight calculation]');
check('scoreDispatch(100,97, 60/40) = 99', scoreDispatch(100, 97, { driver: 60, vehicle: 40 }) === 99);
check('scoreDispatch(74,88, 60/40) = 80', scoreDispatch(74, 88, { driver: 60, vehicle: 40 }) === 80);
check('scoreDispatch normalizes by ΣW (driver-only 100/0 → driver score)', scoreDispatch(74, 88, { driver: 100, vehicle: 0 }) === 74);
check('scoreDispatch zero total weight → 0', scoreDispatch(100, 100, { driver: 0, vehicle: 0 }) === 0);
check('default store dispatch weights = 60/40', JSON.stringify(getDispatchScoringWeights()) === JSON.stringify({ driver: 60, vehicle: 40 }));

/* ── Valid dispatch + multiple combinations + ranking + diagnostics ──── */
console.log('\n[valid dispatch / combinations / ranking]');
const drivers = [
  { id: 'd_andi', name: 'Andi' },  // free, no load → driverScore 100
  { id: 'd_budi', name: 'Budi' },  // free, HIGH load → driverScore 74
];
const vehicles = [
  { vehicleId: 'innova_01', name: 'Toyota Innova', capacity: 7, healthScore: 100 },  // fit 90 → 97
  { vehicleId: 'luxio_01', name: 'Daihatsu Luxio', capacity: 12, healthScore: 100 }, // fit 60 → 88
];
const assignments = [...manyD('Budi', 5, 3), ...manyD('Budi', 37, 20)]; // Budi: util 84 HIGH, 5 last7
const res = recommendDispatch({ request: REQUEST, drivers, vehicles, assignments }, { now: NOW });
const dg = (drv, veh) => res.diagnostics.find((d) => d.driverId === drv && d.vehicleId === veh);

check('output has recommendedDispatch + alternatives + diagnostics',
  !!res.recommendedDispatch && Array.isArray(res.alternatives) && Array.isArray(res.diagnostics));
check('2×2 → 4 combinations scored', res.diagnostics.length === 4);
check('recommendedDispatch = Andi + Innova, rank 1, score 99',
  res.recommendedDispatch.driverId === 'd_andi' && res.recommendedDispatch.vehicleId === 'innova_01'
  && res.recommendedDispatch.rank === 1 && res.recommendedDispatch.dispatchScore === 99);
check('Andi+Innova diagnostic: dispatch 99, driver 100, vehicle 97, valid',
  dg('d_andi', 'innova_01').dispatchScore === 99 && dg('d_andi', 'innova_01').driverScore === 100
  && dg('d_andi', 'innova_01').vehicleScore === 97 && dg('d_andi', 'innova_01').valid === true);
check('Andi+Luxio = 95 (rank 2)', dg('d_andi', 'luxio_01').dispatchScore === 95 && dg('d_andi', 'luxio_01').rank === 2);
check('Budi+Innova = 83 (rank 3)', dg('d_budi', 'innova_01').dispatchScore === 83 && dg('d_budi', 'innova_01').rank === 3);
check('Budi+Luxio = 80 (rank 4)', dg('d_budi', 'luxio_01').dispatchScore === 80 && dg('d_budi', 'luxio_01').rank === 4);
check('valid diagnostics expose empty reasons[]', res.diagnostics.every((d) => Array.isArray(d.reasons) && (d.valid ? d.reasons.length === 0 : true)));
check('result surfaces the dispatch weights used', JSON.stringify(res.weights) === JSON.stringify({ driver: 60, vehicle: 40 }));

/* ── Maximum 9 combinations (top-3 × top-3) ──────────────────────────── */
console.log('\n[max 9 combinations]');
const many4Drivers = [
  { id: 'd1', name: 'D One' }, { id: 'd2', name: 'D Two' },
  { id: 'd3', name: 'D Three' }, { id: 'd4', name: 'D Four' },
];
const many4Vehicles = [
  { vehicleId: 'v1', name: 'V One', capacity: 7, healthScore: 100 },
  { vehicleId: 'v2', name: 'V Two', capacity: 8, healthScore: 100 },
  { vehicleId: 'v3', name: 'V Three', capacity: 9, healthScore: 100 },
  { vehicleId: 'v4', name: 'V Four', capacity: 10, healthScore: 100 },
];
const cap9 = recommendDispatch({ request: REQUEST, drivers: many4Drivers, vehicles: many4Vehicles, assignments: [] }, { now: NOW });
check('4 drivers × 4 vehicles → capped at 9 combinations (top-3 × top-3)', cap9.diagnostics.length === 9);

/* ── Driver conflict ─────────────────────────────────────────────────── */
console.log('\n[driver conflict]');
const dcDrivers = [{ id: 'd_andi', name: 'Andi' }, { id: 'd_citra', name: 'Citra' }];
const dcVehicles = [{ vehicleId: 'innova_01', name: 'Toyota Innova', capacity: 7, healthScore: 100 }];
const dcAsg = [dAsg('Citra', 0, { startTime: '09:00', endTime: '11:00', status: 'assigned' })]; // Citra busy in window
const dc = recommendDispatch({ request: REQUEST, drivers: dcDrivers, vehicles: dcVehicles, assignments: dcAsg }, { now: NOW });
const dcDiag = dc.diagnostics.find((d) => d.driverId === 'd_citra');
check('Citra+Innova invalid with reason driver_conflict',
  dcDiag.valid === false && dcDiag.reasons.includes(DISPATCH_INVALID_REASON.DRIVER_CONFLICT));
check('driver-conflict combo never #1 (Andi+Innova recommended)',
  dc.recommendedDispatch.driverId === 'd_andi' && dcDiag.rank > 1);

/* ── Vehicle conflict ────────────────────────────────────────────────── */
console.log('\n[vehicle conflict]');
const vcDrivers = [{ id: 'd_andi', name: 'Andi' }];
const vcVehicles = [
  { vehicleId: 'innova_01', name: 'Toyota Innova', capacity: 7, healthScore: 100 },
  { vehicleId: 'avanza_01', name: 'Toyota Avanza', capacity: 7, healthScore: 100 },
];
const vcAsg = [dAsg('x', 0, { vehicle: 'Toyota Avanza', startTime: '09:00', endTime: '11:00', status: 'assigned' })];
const vc = recommendDispatch({ request: REQUEST, drivers: vcDrivers, vehicles: vcVehicles, assignments: vcAsg }, { now: NOW });
const vcDiag = vc.diagnostics.find((d) => d.vehicleId === 'avanza_01');
check('Andi+Avanza invalid with reason vehicle_conflict',
  vcDiag.valid === false && vcDiag.reasons.includes(DISPATCH_INVALID_REASON.VEHICLE_CONFLICT));
check('vehicle-conflict combo never #1 (Andi+Innova recommended)',
  vc.recommendedDispatch.vehicleId === 'innova_01' && vcDiag.rank > 1);

/* ── Over-capacity vehicle ───────────────────────────────────────────── */
console.log('\n[over-capacity vehicle]');
const ocVehicles = [
  { vehicleId: 'innova_01', name: 'Toyota Innova', capacity: 7, healthScore: 100 },
  { vehicleId: 'ayla_01', name: 'Daihatsu Ayla', capacity: 4, healthScore: 100 }, // 6 > 4
];
const oc = recommendDispatch({ request: REQUEST, drivers: [{ id: 'd_andi', name: 'Andi' }], vehicles: ocVehicles, assignments: [] }, { now: NOW });
const ocDiag = oc.diagnostics.find((d) => d.vehicleId === 'ayla_01');
check('Andi+Ayla invalid with reason vehicle_over_capacity',
  ocDiag.valid === false && ocDiag.reasons.includes(DISPATCH_INVALID_REASON.VEHICLE_OVER_CAPACITY));
check('over-capacity combo never #1', oc.recommendedDispatch.vehicleId === 'innova_01' && ocDiag.rank > 1);

/* ── No valid combination → recommendedDispatch null ─────────────────── */
console.log('\n[no valid dispatch]');
const none = recommendDispatch({
  request: REQUEST,
  drivers: [{ id: 'd_citra', name: 'Citra' }],
  vehicles: [{ vehicleId: 'ayla_01', name: 'Daihatsu Ayla', capacity: 4 }],
  assignments: [dAsg('Citra', 0, { startTime: '09:00', endTime: '11:00', status: 'assigned' })],
}, { now: NOW });
check('all-invalid → recommendedDispatch null', none.recommendedDispatch === null);
check('invalid combo still present in diagnostics + alternatives',
  none.diagnostics.length === 1 && none.alternatives.length === 1 && none.diagnostics[0].reasons.length >= 1);

/* ── Tie-breaker: equal dispatch score → higher driver score wins ────── */
console.log('\n[tie-breaker]');
// Anwar 100, Bima 96 (2 trips last7); Pickup cap20 → fit40 → 82, Queen cap12 → fit60 → 88.
//   Anwar+Pickup = 0.6·100 + 0.4·82 = 92.8 → 93
//   Bima +Queen  = 0.6·96  + 0.4·88 = 92.8 → 93   (tie → Anwar's higher driver score wins)
const tbDrivers = [{ id: 'd_anwar', name: 'Anwar' }, { id: 'd_bima', name: 'Bima' }];
const tbVehicles = [
  { vehicleId: 'pickup_01', name: 'Pickup', capacity: 20, healthScore: 100 },
  { vehicleId: 'queen_01', name: 'Queen', capacity: 12, healthScore: 100 },
];
const tbAsg = [dAsg('Bima', 1), dAsg('Bima', 2)]; // 2 trips last7 → recency 80, still LOW util
const tb = recommendDispatch({ request: REQUEST, drivers: tbDrivers, vehicles: tbVehicles, assignments: tbAsg }, { now: NOW });
const anwarPickup = tb.diagnostics.find((d) => d.driverId === 'd_anwar' && d.vehicleId === 'pickup_01');
const bimaQueen = tb.diagnostics.find((d) => d.driverId === 'd_bima' && d.vehicleId === 'queen_01');
check('the two combos genuinely tie at dispatch 93',
  anwarPickup.dispatchScore === 93 && bimaQueen.dispatchScore === 93);
check('tie broken by higher driver score (Anwar 100 ranks above Bima 96)',
  anwarPickup.driverScore === 100 && bimaQueen.driverScore === 96 && anwarPickup.rank < bimaQueen.rank);
check('overall #1 is Anwar+Queen (highest dispatch 95)',
  tb.recommendedDispatch.driverId === 'd_anwar' && tb.recommendedDispatch.vehicleId === 'queen_01' && tb.recommendedDispatch.dispatchScore === 95);

/* ── Weight-override behavior ─────────────────────────────────────────── */
console.log('\n[weight override]');
setDispatchScoringWeights({ driver: 100, vehicle: 0 });
const drvOnly = recommendDispatch({ request: REQUEST, drivers, vehicles, assignments }, { now: NOW });
check('driver-only weights → dispatchScore equals driverScore everywhere',
  drvOnly.diagnostics.every((d) => d.dispatchScore === d.driverScore));
check('override surfaced on result', drvOnly.weights.driver === 100 && drvOnly.weights.vehicle === 0);
resetDispatchIntelligence();
const restored = recommendDispatch({ request: REQUEST, drivers, vehicles, assignments }, { now: NOW });
check('reset restores default weights → Andi+Innova 99 again', restored.recommendedDispatch.dispatchScore === 99);

/* ── Persistence ─────────────────────────────────────────────────────── */
console.log('\n[persistence]');
saveDispatchRecommendation(res);
check('getLatestDispatchRecommendation returns the saved run', getLatestDispatchRecommendation() === res);
saveDispatchRecommendation(dc, 'req_99');
check('keyed save/read works independently', getLatestDispatchRecommendation('req_99') === dc && getLatestDispatchRecommendation() === res);
check('absent key → null', getLatestDispatchRecommendation('nope') === null);
resetDispatchIntelligence();
check('reset clears dispatch recommendations', getLatestDispatchRecommendation() === null);

/* ── Summary ─────────────────────────────────────────────────────────── */
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
