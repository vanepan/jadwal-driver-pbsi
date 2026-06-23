/* workload-check.mjs — validates the Driver Workload Intelligence engine
   (v1.16.4.8). Run: node scripts/workload-check.mjs  (exit 0 = all pass)

   Verifies the normalized composite score behaves logically across the
   scenarios the spec requires:
     • high trip / low hours      vs  low trip / high hours
     • high distance / low trip
     • no-vehicle (distance 0) still earns a non-zero Workload Score
     • indices, weights, explainability contributions, ranking, utilization. */
import { buildWorkloadModel, WORKLOAD_WEIGHTS_V1 } from '../js/analytics/engines/workload-engine.js';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}
const approx = (a, b, eps = 0.5) => Math.abs(a - b) < eps;
const byName = (m, n) => m.drivers.find((d) => d.name === n);

// ── 1. Weights sane (sum 1.0, hours dominant) ────────────────────────────
check('weights sum to 1.0', approx(WORKLOAD_WEIGHTS_V1.hours + WORKLOAD_WEIGHTS_V1.distance + WORKLOAD_WEIGHTS_V1.assignments, 1, 1e-9));
check('hours is the dominant weight', WORKLOAD_WEIGHTS_V1.hours > WORKLOAD_WEIGHTS_V1.distance && WORKLOAD_WEIGHTS_V1.distance > WORKLOAD_WEIGHTS_V1.assignments);

// ── 2. Spec example: count alone must NOT win ────────────────────────────
// Driver A: 20 asg / 40 h / 300 km   vs   Driver B: 15 asg / 90 h / 1500 km
let m = buildWorkloadModel([
  { name: 'A', completed: 20, hours: 40, distance: 300, daysWorked: 10, officeHoursPerDay: 8 },
  { name: 'B', completed: 15, hours: 90, distance: 1500, daysWorked: 10, officeHoursPerDay: 8 },
]);
check('B (more hours+km, fewer trips) outranks A', m.palingAktif.name === 'B');
check('A scores lower than B despite more assignments', byName(m, 'A').score < byName(m, 'B').score);
check('B is bebanTertinggi', m.bebanTertinggi.name === 'B');
check('A is bebanTerendah', m.bebanTerendah.name === 'A');

// ── 3. Index normalization (cohort max → 100) ────────────────────────────
check('B hoursIndex = 100 (cohort max hours)', byName(m, 'B').hoursIndex === 100);
check('B distanceIndex = 100 (cohort max km)', byName(m, 'B').distanceIndex === 100);
check('A assignmentIndex = 100 (cohort max trips)', byName(m, 'A').assignmentIndex === 100);
check('A hoursIndex ≈ 44 (40/90)', approx(byName(m, 'A').hoursIndex, 44, 1));

// ── 4. High-distance / low-trip driver still ranks high ──────────────────
m = buildWorkloadModel([
  { name: 'Hauler', completed: 5, hours: 50, distance: 2000, daysWorked: 6, officeHoursPerDay: 8 },
  { name: 'Shuttle', completed: 40, hours: 30, distance: 120, daysWorked: 8, officeHoursPerDay: 8 },
]);
check('high-distance/low-trip Hauler outranks high-count Shuttle', m.palingAktif.name === 'Hauler');

// ── 5. No-vehicle driver (distance 0) still earns a Workload Score ────────
m = buildWorkloadModel([
  { name: 'NoVeh', completed: 10, hours: 35, distance: 0, daysWorked: 5, officeHoursPerDay: 8 },
  { name: 'WithVeh', completed: 12, hours: 40, distance: 600, daysWorked: 6, officeHoursPerDay: 8 },
]);
const nv = byName(m, 'NoVeh');
check('no-vehicle driver is in the cohort', !!nv);
check('no-vehicle Workload Score > 0', nv.score > 0);
check('no-vehicle distanceIndex = 0', nv.distanceIndex === 0);
check('no-vehicle distance contribution = 0%', nv.contribution.distance === 0);
check('no-vehicle hours+assignment contributions sum to 100%', nv.contribution.hours + nv.contribution.assignments === 100);

// ── 6. Explainability contributions sum to ~100 for a normal driver ──────
const wv = byName(m, 'WithVeh');
check('contributions sum ≈ 100%', approx(wv.contribution.hours + wv.contribution.distance + wv.contribution.assignments, 100, 1.5));

// ── 7. Score is clamped 0–100 ─────────────────────────────────────────────
check('top driver score ≤ 100', m.drivers.every((d) => d.score >= 0 && d.score <= 100));

// ── 8. Per-driver utilization ─────────────────────────────────────────────
// WithVeh: 40h over 6 days × 8h = 48h available → 83%.
check('WithVeh utilization ≈ 83%', approx(wv.utilization, 83, 1));
check('utilizationRanking sorted desc by utilization', m.utilizationRanking[0].utilization >= m.utilizationRanking[m.utilizationRanking.length - 1].utilization);

// ── 9. Empty / single-driver edge cases ──────────────────────────────────
let e = buildWorkloadModel([]);
check('empty cohort → no palingAktif', e.palingAktif === null && e.drivers.length === 0);
check('empty cohort → averageScore 0', e.averageScore === 0);
let s = buildWorkloadModel([{ name: 'Solo', completed: 3, hours: 12, distance: 80, daysWorked: 2, officeHoursPerDay: 8 }]);
check('single driver → score 100 (is its own max)', s.palingAktif.score === 100);
check('single driver → bebanTerendah null (needs ≥2)', s.bebanTerendah === null);

// ── 10. Drivers with no completed work are excluded ──────────────────────
let z = buildWorkloadModel([{ name: 'Idle', completed: 0, hours: 0, distance: 0, daysWorked: 0, officeHoursPerDay: 8 }]);
check('zero-work driver excluded from cohort', z.drivers.length === 0);

console.log(`\nworkload-check: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
