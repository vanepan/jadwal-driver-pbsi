/* vehicle-recommendation-check.mjs — validates the Vehicle Recommendation Engine
   + Vehicle Capacity Engine (v1.16.4.11-alpha.3).
   Run: node scripts/vehicle-recommendation-check.mjs   (exit 0 = all pass)

   Covers the 14 required areas: single/multiple vehicles, availability conflict
   detection, over-capacity rejection, capacity-fit scoring, utilization scoring,
   health scoring, weight calculation, ranking order, tie-breakers, diagnostics
   output, recommendation persistence, weight-override behavior, and configurable
   status-band behavior. Weights are sourced from the store (no hardcoded weights). */

import {
  recommendVehicle,
  hasVehicleConflict,
  availabilityScore,
  calculateCapacityFitScore,
  calculateUtilizationScore,
  calculateHealthScore,
  UTILIZATION_SCORE_BY_STATUS,
} from '../js/services/vehicle-recommendation-engine.js';
import { calculateVehicleCapacity } from '../js/services/vehicle-capacity-engine.js';
import {
  getVehicleScoringWeights,
  setVehicleScoringWeights,
  saveVehicleRecommendation,
  getLatestVehicleRecommendation,
  resetDispatchIntelligence,
} from '../js/stores/dispatch-intelligence-store.js';
import { resetDispatchConfig, setDispatchConfig } from '../js/config/dispatch-intelligence-config.js';

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
function trip(vehicle, daysAgo, extra = {}) {
  return { vehicle, date: dateDaysAgo(daysAgo), status: 'completed', ...extra };
}
function many(vehicle, count, daysAgo) { return Array.from({ length: count }, () => trip(vehicle, daysAgo)); }

resetDispatchIntelligence();
resetDispatchConfig();

/* ── Availability sub-score ──────────────────────────────────────────── */
console.log('\n[availability]');
check('availabilityScore(false) = 100', availabilityScore(false) === 100);
check('availabilityScore(true) = 0', availabilityScore(true) === 0);

/* ── Capacity-fit scoring ────────────────────────────────────────────── */
console.log('\n[capacity fit]');
const fit = (p, c) => calculateCapacityFitScore(p, c).score;
check('7/7 (1.00) = 100', fit(7, 7) === 100);
check('9/10 (0.90) = 100', fit(9, 10) === 100);
check('8/10 (0.80) = 90', fit(8, 10) === 90);
check('7/10 (0.70) = 80', fit(7, 10) === 80);
check('6/10 (0.60) = 80', fit(6, 10) === 80);
check('5/10 (0.50) = 60', fit(5, 10) === 60);
check('3/10 (0.30) = 40', fit(3, 10) === 40);
check('1/10 (0.10) = 20', fit(1, 10) === 20);
check('over-capacity 11/10 → score 0 + overCapacity', calculateCapacityFitScore(11, 10).score === 0 && calculateCapacityFitScore(11, 10).overCapacity === true);
check('no passengers → neutral 100, not over-capacity', calculateCapacityFitScore(0, 7).score === 100 && calculateCapacityFitScore(0, 7).overCapacity === false);

/* ── Utilization scoring (reuses configurable status bands) ──────────── */
console.log('\n[utilization]');
check('util 0 = 100', calculateUtilizationScore(0) === 100);
check('util 40 = 100 (LOW ceiling)', calculateUtilizationScore(40) === 100);
check('util 41 = 80 (NORMAL)', calculateUtilizationScore(41) === 80);
check('util 75 = 80', calculateUtilizationScore(75) === 80);
check('util 76 = 40 (HIGH)', calculateUtilizationScore(76) === 40);
check('util 90 = 40', calculateUtilizationScore(90) === 40);
check('util 91 = 10 (OVERLOADED)', calculateUtilizationScore(91) === 10);
check('util 100 = 10', calculateUtilizationScore(100) === 10);
check('UTILIZATION_SCORE_BY_STATUS matches spec (100/80/40/10)',
  UTILIZATION_SCORE_BY_STATUS.LOW === 100 && UTILIZATION_SCORE_BY_STATUS.NORMAL === 80
  && UTILIZATION_SCORE_BY_STATUS.HIGH === 40 && UTILIZATION_SCORE_BY_STATUS.OVERLOADED === 10);

/* ── Health scoring ──────────────────────────────────────────────────── */
console.log('\n[health]');
check('health 100 = 100', calculateHealthScore({ healthScore: 100 }) === 100);
check('health 50 = 50', calculateHealthScore({ healthScore: 50 }) === 50);
check('health undefined → default 100', calculateHealthScore({}) === 100);
check('health raw number 80 = 80', calculateHealthScore(80) === 80);
check('health 150 clamps to 100', calculateHealthScore({ healthScore: 150 }) === 100);
check('health -5 clamps to 0', calculateHealthScore({ healthScore: -5 }) === 0);

/* ── Vehicle Capacity Engine: trip count + utilization + status ──────── */
console.log('\n[vehicle capacity engine]');
const capAsg = [...many('Toyota Innova', 5, 3), ...many('Toyota Innova', 37, 20), trip('Toyota Innova', 100)];
const cap = calculateVehicleCapacity('innova_01', capAsg, { now: NOW, identities: ['innova_01', 'toyota innova'] });
check('totalTrips counts all non-cancelled (43)', cap.totalTrips === 43);
check('assignmentsLast7Days = 5', cap.assignmentsLast7Days === 5);
check('assignmentsLast30Days = 42 (util 84 → HIGH)', cap.assignmentsLast30Days === 42 && cap.utilizationPercent === 84 && cap.status === 'HIGH');

/* ── Conflict detection ──────────────────────────────────────────────── */
console.log('\n[conflict detection]');
check('overlap 09:00-11:00 vs 08:00-12:00 → conflict',
  hasVehicleConflict([trip('x', 0, { startTime: '09:00', endTime: '11:00', status: 'assigned' })], REQUEST));
check('adjacent 12:00-14:00 → no conflict',
  !hasVehicleConflict([trip('x', 0, { startTime: '12:00', endTime: '14:00', status: 'assigned' })], REQUEST));
check('different date → no conflict',
  !hasVehicleConflict([trip('x', 1, { startTime: '09:00', endTime: '11:00', status: 'assigned' })], REQUEST));
check('fullDay same date → conflict',
  hasVehicleConflict([trip('x', 0, { fullDay: true, status: 'assigned' })], REQUEST));
check('cancelled overlapping assignment → no conflict',
  !hasVehicleConflict([trip('x', 0, { startTime: '09:00', endTime: '11:00', status: 'cancelled' })], REQUEST));

/* ── Single vehicle ──────────────────────────────────────────────────── */
console.log('\n[single vehicle]');
const single = recommendVehicle(REQUEST, [{ vehicleId: 'innova_01', name: 'Toyota Innova', capacity: 7, healthScore: 100 }], [], { now: NOW });
check('single free fitting vehicle is recommended rank 1', single.recommendedVehicle && single.recommendedVehicle.vehicleId === 'innova_01' && single.recommendedVehicle.rank === 1);
check('single vehicle score = 97 (free/fit 90/util 100/health 100)', single.recommendedVehicle.score === 97);
check('single vehicle has no alternatives', single.alternatives.length === 0);

/* ── Multiple vehicles: ranking + weighted score + diagnostics ──────── */
console.log('\n[multiple vehicles / ranking]');
const vehicles = [
  { vehicleId: 'innova_01', name: 'Toyota Innova', capacity: 7, healthScore: 100 },   // free, fit 90 → 97 (best)
  { vehicleId: 'luxio_01', name: 'Daihatsu Luxio', capacity: 12, healthScore: 100 },  // free, fit 60 → 88
  { vehicleId: 'avanza_01', name: 'Toyota Avanza', capacity: 7, healthScore: 100 },   // conflicted → 57, never #1
  { vehicleId: 'ayla_01', name: 'Daihatsu Ayla', capacity: 4, healthScore: 100 },     // over-capacity (6>4) → blocked
];
const assignments = [
  trip('Toyota Avanza', 0, { startTime: '09:00', endTime: '11:00', status: 'assigned' }), // conflict in window
];
const res = recommendVehicle(REQUEST, vehicles, assignments, { now: NOW });
const diag = (id) => res.diagnostics.find((d) => d.vehicleId === id);

check('output has recommendedVehicle + alternatives + diagnostics',
  !!res.recommendedVehicle && Array.isArray(res.alternatives) && Array.isArray(res.diagnostics));
check('recommendedVehicle is Innova, rank 1, score 97',
  res.recommendedVehicle.vehicleId === 'innova_01' && res.recommendedVehicle.rank === 1 && res.recommendedVehicle.score === 97);
check('Innova breakdown 100/90/100/100', JSON.stringify(diag('innova_01').breakdown) === JSON.stringify({ availability: 100, capacityFit: 90, utilization: 100, health: 100 }));
check('Luxio rank 2, score 88 (fit 60)', diag('luxio_01').rank === 2 && diag('luxio_01').score === 88);
check('Avanza conflicted (availability 0, available:false, score 57)',
  diag('avanza_01').breakdown.availability === 0 && diag('avanza_01').available === false && diag('avanza_01').score === 57);
check('Ayla over-capacity flagged (capacityFit 0, overCapacity:true)',
  diag('ayla_01').breakdown.capacityFit === 0 && diag('ayla_01').overCapacity === true);
check('conflicted + over-capacity vehicles never rank #1',
  diag('avanza_01').rank > 1 && diag('ayla_01').rank > 1);
check('diagnostics expose full breakdown + flags',
  diag('innova_01').breakdown && diag('innova_01').conflict === false && typeof diag('innova_01').occupancyRatio === 'number' && typeof diag('innova_01').utilizationPercent === 'number');

/* ── Availability conflict / over-capacity rejection (only candidate) ── */
console.log('\n[rejection paths]');
const onlyConflict = recommendVehicle(REQUEST, [{ vehicleId: 'avanza_01', name: 'Toyota Avanza', capacity: 7 }],
  [trip('Toyota Avanza', 0, { startTime: '09:00', endTime: '11:00', status: 'assigned' })], { now: NOW });
check('all conflicted → recommendedVehicle null', onlyConflict.recommendedVehicle === null);
check('conflicted vehicle still in alternatives + diagnostics', onlyConflict.alternatives.length === 1 && onlyConflict.diagnostics.length === 1);
const onlyOver = recommendVehicle(REQUEST, [{ vehicleId: 'ayla_01', name: 'Daihatsu Ayla', capacity: 4 }], [], { now: NOW });
check('only over-capacity vehicle → recommendedVehicle null', onlyOver.recommendedVehicle === null && onlyOver.diagnostics[0].overCapacity === true);

/* ── Tie-breakers ────────────────────────────────────────────────────── */
console.log('\n[tie-breakers]');
// Equal final score (88), different capacityFit → better fit wins.
const tieFit = recommendVehicle(REQUEST, [
  { vehicleId: 'fit_lo', name: 'Big Van', capacity: 12, healthScore: 100 },  // fit 60, health 100 → 88
  { vehicleId: 'fit_hi', name: 'Snug Car', capacity: 7, healthScore: 10 },   // fit 90, health 10  → 88
], [], { now: NOW });
check('equal score → better capacity fit ranks first',
  tieFit.diagnostics.find((d) => d.vehicleId === 'fit_hi').score === 88
  && tieFit.diagnostics.find((d) => d.vehicleId === 'fit_lo').score === 88
  && tieFit.recommendedVehicle.vehicleId === 'fit_hi');
// Fully identical → alphabetical name.
const tieName = recommendVehicle(REQUEST, [
  { vehicleId: 'z1', name: 'Zeta', capacity: 7, healthScore: 100 },
  { vehicleId: 'a1', name: 'Alpha', capacity: 7, healthScore: 100 },
], [], { now: NOW });
check('full tie → alphabetical name ranks first (Alpha before Zeta)', tieName.recommendedVehicle.vehicleId === 'a1');

/* ── Weight calculation + store-sourced weights (no hardcoded) ──────── */
console.log('\n[weights]');
check('default vehicle weights = 40/30/20/10',
  JSON.stringify(getVehicleScoringWeights()) === JSON.stringify({ availability: 40, capacityFit: 30, utilization: 20, health: 10 }));
check('result surfaces the weights used', JSON.stringify(res.weights) === JSON.stringify({ availability: 40, capacityFit: 30, utilization: 20, health: 10 }));

/* ── Weight-override behavior ─────────────────────────────────────────── */
console.log('\n[weight override]');
setVehicleScoringWeights({ availability: 0, capacityFit: 0, utilization: 0, health: 100 });
const healthOnly = recommendVehicle(REQUEST, vehicles, assignments, { now: NOW });
check('health-only weights → every score equals healthScore (100)',
  healthOnly.diagnostics.every((d) => d.score === d.healthScore));
check('override surfaced on result', healthOnly.weights.health === 100 && healthOnly.weights.availability === 0);
resetDispatchIntelligence();
const restored = recommendVehicle(REQUEST, vehicles, assignments, { now: NOW });
check('reset restores default weights → Innova score 97 again', restored.diagnostics.find((d) => d.vehicleId === 'innova_01').score === 97);

/* ── Configurable status-band behavior ───────────────────────────────── */
console.log('\n[configurable status bands]');
check('util 84 → 40 (HIGH) under default bands', calculateUtilizationScore(84) === 40);
setDispatchConfig({ statusBands: { LOW: [0, 90], NORMAL: [91, 95], HIGH: [96, 98], OVERLOADED: [99, 100] } });
check('util 84 → 100 (LOW) after widening LOW band', calculateUtilizationScore(84) === 100);
resetDispatchConfig();
check('util 84 → 40 again after reset', calculateUtilizationScore(84) === 40);

/* ── Recommendation persistence ──────────────────────────────────────── */
console.log('\n[persistence]');
saveVehicleRecommendation(res);
check('getLatestVehicleRecommendation returns the saved run', getLatestVehicleRecommendation() === res);
saveVehicleRecommendation(single, 'req_42');
check('keyed save/read works independently', getLatestVehicleRecommendation('req_42') === single && getLatestVehicleRecommendation() === res);
check('absent key → null', getLatestVehicleRecommendation('nope') === null);
resetDispatchIntelligence();
check('reset clears vehicle recommendations', getLatestVehicleRecommendation() === null);

/* ── Summary ─────────────────────────────────────────────────────────── */
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
