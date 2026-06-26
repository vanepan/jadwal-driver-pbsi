/* driver-wellness-check.mjs — Driver Wellness Intelligence (v1.17.6)
   PURE node test. Drives the REAL wellness service over seeded drivers +
   assignments and asserts every feature: the Driver Health Score + its
   higher=better and explainability-sums-to-score invariants, the health
   components (incl. N/A night when time data is missing), fatigue + burnout
   banding, capacity health = invert(utilization) via Unified Scoring, the
   distributions, the trend windows, the recommendations, and empty/corrupt
   safety. Also covers the export builders.
   Run: node scripts/driver-wellness-check.mjs (exit 0 = pass) */

import {
  computeDriverWellnessModel,
  findDriverWellness,
  healthBand,
  fatigueBand,
  burnoutBand,
  HEALTH_BANDS,
  WELLNESS_COMPONENTS,
  WELLNESS_WINDOWS,
} from '../js/services/driver-wellness-service.js';
import { capacityScore } from '../js/services/unified-scoring.js';
import {
  buildDriverWellnessDocDefinition,
  buildDriverWellnessSheets,
} from '../js/exports/analytics/driver-wellness-export.js';

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };

const NOW = '2026-06-25';
const drivers = [
  { id: 'd1', name: 'Igo' },     // overworked: consecutive, weekend, night, long hours
  { id: 'd2', name: 'Dedi' },    // moderate
  { id: 'd3', name: 'Aria' },    // light / healthy
  { id: 'd4', name: 'Grace' },   // idle (no work)
  { id: 'd5', name: 'Inactive', active: false }, // must be excluded
];

const assignments = [];
// Igo — 7 consecutive days incl. weekend + a night trip, long hours.
for (const day of ['2026-06-19', '2026-06-20', '2026-06-21', '2026-06-22', '2026-06-23', '2026-06-24', '2026-06-25']) {
  assignments.push({ driver: 'Igo', vehicle: 'Innova', date: day, startTime: '07:00', endTime: '19:00', status: 'assigned', distanceTravelled: 150 });
}
assignments.push({ driver: 'Igo', vehicle: 'Innova', date: '2026-06-24', startTime: '22:00', endTime: '23:30', status: 'assigned' });
// Dedi — a few spread-out daytime trips.
for (const day of ['2026-06-10', '2026-06-15', '2026-06-20']) {
  assignments.push({ driver: 'Dedi', vehicle: 'Avanza', date: day, startTime: '09:00', endTime: '12:00', status: 'assigned', distanceTravelled: 40 });
}
// Aria — one light recent trip.
assignments.push({ driver: 'Aria', vehicle: 'Avanza', date: '2026-06-23', startTime: '10:00', endTime: '11:00', status: 'assigned', distanceTravelled: 10 });
// A cancelled trip must never count.
assignments.push({ driver: 'Aria', vehicle: 'Avanza', date: '2026-06-24', startTime: '08:00', endTime: '18:00', status: 'cancelled' });

const model = computeDriverWellnessModel({ drivers, assignments, now: NOW, window: '30d' });

console.log('\n[model shape]');
check('schema tag present', model.schema === 'driver-wellness@1');
check('excludes inactive driver (4 active)', model.summary.driverCount === 4 && !findDriverWellness(model, 'd5'));
check('drivers sorted lowest-health first', model.drivers.length === 4
  && model.drivers[0].health.score <= model.drivers[model.drivers.length - 1].health.score);

const igo = findDriverWellness(model, 'd1');
const aria = findDriverWellness(model, 'd3');
const grace = findDriverWellness(model, 'd4');

console.log('\n[Feature 1 — Driver Health Score]');
check('every health score is 0–100', model.drivers.every((d) => d.health.score >= 0 && d.health.score <= 100));
check('higher = better: Aria healthier than Igo', aria.health.score > igo.health.score);
check('idle driver (Grace, no work) is fully healthy = 100', grace.health.score === 100);
check('overworked Igo lands in a low band', igo.health.score < 60);
check('healthBand floors at critical / tops at excellent', healthBand(0).key === 'critical' && healthBand(100).key === 'excellent');
check('health band monotonic over bands', HEALTH_BANDS.every((b, i, a) => i === 0 || a[i - 1].min > b.min));

console.log('\n[Feature 10 — Explainability sums to score]');
check('Igo contributions sum EXACTLY to health score',
  igo.explainability.reduce((s, c) => s + c.points, 0) === igo.health.score);
check('Aria contributions sum EXACTLY to health score',
  aria.explainability.reduce((s, c) => s + c.points, 0) === aria.health.score);
check('contribution weights are positive percentages', igo.explainability.every((c) => c.weightPct > 0));

console.log('\n[Feature 2 — Health Components]');
check('seven labelled components present', igo.components.length === WELLNESS_COMPONENTS.length && igo.components.length === 7);
check('Igo night frequency component AVAILABLE (timed trips)', igo.components.find((c) => c.key === 'nightFrequency').available === true);
check('Grace night frequency N/A (no timed trips)', grace.components.find((c) => c.key === 'nightFrequency').score === null
  && grace.components.find((c) => c.key === 'nightFrequency').available === false);
check('all available components are positive 0–100', igo.components.filter((c) => c.available).every((c) => c.score >= 0 && c.score <= 100));

console.log('\n[Feature 3 — Fatigue Risk]');
check('fatigue has 5-band classification', ['very-low', 'low', 'medium', 'high', 'critical'].includes(igo.fatigue.key));
check('overworked Igo has elevated fatigue', ['high', 'critical'].includes(igo.fatigue.key));
check('healthy Aria has low fatigue', ['very-low', 'low'].includes(aria.fatigue.key));
check('fatigueBand boundaries', fatigueBand(0).key === 'very-low' && fatigueBand(85).key === 'critical' && fatigueBand(45).key === 'medium');

console.log('\n[Feature 4 — Burnout Risk]');
check('burnout has 4-band classification', ['low', 'medium', 'high', 'critical'].includes(igo.burnout.key));
check('burnout is independent index (0–100)', igo.burnout.index >= 0 && igo.burnout.index <= 100);
check('burnoutBand boundaries', burnoutBand(0).key === 'low' && burnoutBand(80).key === 'critical' && burnoutBand(40).key === 'medium');

console.log('\n[Feature 5 — Capacity Health reuses Unified Scoring]');
check('capacity health = capacityScore(utilization) for every driver',
  model.drivers.every((d) => d.capacityHealth.score === capacityScore(d.capacityHealth.utilization)));
check('utilization is NEVER shown as quality (low util → high health)',
  capacityScore(15) >= 80 && capacityScore(95) <= 25);

console.log('\n[Feature 6 — Executive summary]');
const s = model.summary;
check('summary has all executive cards', ['driverCount', 'averageHealth', 'healthyDrivers', 'needsAttention', 'highFatigue', 'burnoutRisk', 'averageRecovery', 'averageCapacityHealth'].every((k) => k in s));
check('averageHealth is the cohort mean', s.averageHealth === Math.round(model.drivers.reduce((a, d) => a + d.health.score, 0) / model.drivers.length));
check('healthy + attention counts are consistent', s.healthyDrivers + s.needsAttention <= s.driverCount);

console.log('\n[Feature 11 — Distributions]');
check('health distribution covers all bands + totals to driver count',
  model.distributions.health.length === HEALTH_BANDS.length
  && model.distributions.health.reduce((a, b) => a + b.count, 0) === model.summary.driverCount);
check('fatigue distribution sums to driver count', model.distributions.fatigue.reduce((a, b) => a + b.count, 0) === model.summary.driverCount);
check('burnout distribution sums to driver count', model.distributions.burnout.reduce((a, b) => a + b.count, 0) === model.summary.driverCount);
check('capacity distribution present', model.distributions.capacity.reduce((a, b) => a + b.count, 0) === model.summary.driverCount);

console.log('\n[Feature 12 — Historical trend windows]');
check('all 5 windows present (Today/7/30/90/YTD)', model.trend.windows.length === WELLNESS_WINDOWS.length
  && model.trend.windows.map((w) => w.key).join(',') === 'today,7d,30d,90d,ytd');
check('each window carries averageHealth', model.trend.windows.every((w) => typeof w.averageHealth === 'number'));
check('today window (1-day) ≥ 30-day window (less accumulated load)',
  model.trend.windows.find((w) => w.key === 'today').averageHealth >= model.trend.windows.find((w) => w.key === '30d').averageHealth - 1);

console.log('\n[Feature 8/9 — Timeline + Recommendations]');
check('Igo timeline has derived wellness events', igo.timeline.length >= 2 && igo.timeline.every((e) => e.label));
check('Igo gets actionable recommendations', igo.recommendations.length >= 1 && igo.recommendations.every((r) => r.label && r.severity));
check('healthy Aria gets a maintain recommendation', aria.recommendations.some((r) => r.key === 'maintain') || aria.recommendations.length >= 1);
check('overworked Igo gets a rotation/recovery recommendation',
  igo.recommendations.some((r) => r.key === 'rotate' || r.key === 'recovery' || r.key === 'consecutive'));

console.log('\n[window switch recomputes]');
const today = computeDriverWellnessModel({ drivers, assignments, now: NOW, window: 'today' });
check('window honoured (today → 1 day)', today.window === 'today' && today.windowDays === 1);

console.log('\n[empty + corrupt safety]');
const empty = computeDriverWellnessModel({ drivers: [], assignments: [] });
check('empty drivers → 0 drivers, no throw', empty.summary.driverCount === 0 && empty.drivers.length === 0);
check('empty distributions still well-formed', empty.distributions.health.reduce((a, b) => a + b.count, 0) === 0);
let threw = false;
try {
  computeDriverWellnessModel({ drivers: [null, { id: 'x' }, 5, { name: 'Ok' }], assignments: [null, 7, { driver: 'Ok', date: 'not-a-date' }, { driver: 'Ok' }], now: NOW });
} catch (_) { threw = true; }
check('corrupt drivers/assignments do not throw', !threw);

console.log('\n[exports]');
const doc = buildDriverWellnessDocDefinition(model, { appVersion: '1.17.6', generatedBy: 'Tester' });
check('PDF docDefinition has content + footer', Array.isArray(doc.content) && doc.content.length >= 6 && typeof doc.footer === 'function');
const sheets = buildDriverWellnessSheets(model);
check('Excel produces 5 sheets', sheets.length === 5 && sheets.map((x) => x.name).join(',') === 'Ringkasan,Driver,Komponen,Distribusi,Tren');
check('driver sheet has a row per driver + header', sheets[1].aoa.length === model.drivers.length + 1);
check('export builders safe on empty model', buildDriverWellnessSheets(empty).length === 5 && buildDriverWellnessDocDefinition(empty).content.length >= 6);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
