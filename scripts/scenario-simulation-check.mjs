/* ============================================================
   scenario-simulation-check.mjs — Scenario Simulation Engine (v1.19.8)

   PURE node test (no browser, no Firebase). Proves Scenario Simulation lets an
   administrator evaluate a decision BEFORE applying it, WITHOUT ever touching
   production state. Covers:

     clone isolation (production untouched) · every scenario moves the forecast ·
     Current-vs-Simulation metrics · recommendation change detection · impact
     summary · timeline · in-memory history (undo/reset/duplicate) · determinism ·
     architectural purity (never imports a prediction engine directly).

   Run:  node scripts/scenario-simulation-check.mjs   (exit 0 = pass)
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getPrediction } from '../js/services/prediction-service.js';
import { cloneInput, findVehicle } from '../js/simulation/scenario-state.js';
import { listScenarios, getScenario } from '../js/simulation/scenario-types.js';
import { runSimulation, mostAtRiskVehicleId } from '../js/simulation/scenario-engine.js';
import { buildComparison } from '../js/simulation/scenario-comparison.js';
import { createScenarioSession } from '../js/simulation/scenario-history.js';

let fail = 0;
const check = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fail++; };
const section = (t) => console.log(`\n── ${t} ──`);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ── fixture (an at-risk Innova + a pristine Fortuner) ──────────────────────── */
const wellness = { schema: 'driver-wellness@1', drivers: [
  { driverId: 'd1', driverName: 'Igo', health: { score: 42 }, fatigue: { index: 78 }, burnout: { index: 66 }, capacityHealth: { score: 20, utilization: 88 }, recovery: { avgRestDays: 0.5, maxStreak: 9 } },
] };
const vehicles = [
  { id: 'v1', name: 'Innova', status: 'active', type: 'mobil', registration: { year: 2011 }, health: { operational: 55, legal: 60, documents: 70, overall: 60 }, taxStatus: 'due', stnkStatus: 'valid', insuranceStatus: 'valid', utilization: 80 },
  { id: 'v2', name: 'Fortuner', status: 'active', type: 'mobil', registration: { year: 2023 }, health: { operational: 95, legal: 98, documents: 100, overall: 96 }, taxStatus: 'paid', stnkStatus: 'valid', insuranceStatus: 'valid', utilization: 40 },
];
const dispatch = { summary: { utilization: 90, pending: 4 } };
const recommendation = { summary: { acceptanceRate: 72, accuracy: 80, avgConfidence: 68 } };
const finance = { summary: { balance: 400000, initial: 5000000, spent: 4600000 }, spendSeries: [900000, 1100000, 1300000, 1300000] };
const INPUT = { wellness, vehicles, dispatch, recommendation, finance };

/* Deep snapshot of the production vehicles to prove they never change. */
const PRODUCTION_SNAPSHOT = JSON.stringify(vehicles);

/* ════════════════════════════════════════════════════════════════════════════ */

section('Clone isolation — production is never touched');
const clone = cloneInput(INPUT);
check(clone !== INPUT && clone.vehicles !== INPUT.vehicles, 'cloneInput returns a fresh object + fresh vehicles array');
check(clone.vehicles[0] !== INPUT.vehicles[0], 'each cloned vehicle is a distinct object');
clone.vehicles[0].health.operational = 1; // mutate the clone hard
clone.vehicles.push({ id: 'x', name: 'x' });
check(INPUT.vehicles[0].health.operational === 55, 'mutating the clone does not reach production health');
check(INPUT.vehicles.length === 2, 'mutating the clone does not reach the production array');
check(clone.wellness === INPUT.wellness, 'read-only models are shared by reference (efficient, never mutated)');

section('Scenario catalogue');
const keys = listScenarios().map((s) => s.key);
const EXPECTED = ['maintenance-delay', 'maintenance-reschedule', 'vehicle-replacement', 'vehicle-deactivation', 'administrative-renewal', 'utilization-adjustment', 'new-vehicle'];
check(EXPECTED.every((k) => keys.includes(k)), 'all seven scenario types are registered');
check(listScenarios().every((s) => !('apply' in s)), 'listScenarios() never leaks the apply function');

section('mostAtRiskVehicleId picks the pressured unit');
check(mostAtRiskVehicleId(getPrediction(INPUT).model) === 'v1', 'the at-risk Innova is the default target');

section('Every scenario re-forecasts through the service (production untouched)');
for (const key of EXPECTED) {
  const run = runSimulation(INPUT, key, key === 'maintenance-delay' ? { days: 14 } : {});
  check(run.ok === true && run.simModel, `${key}: produced a certified simulated model`);
  check(JSON.stringify(vehicles) === PRODUCTION_SNAPSHOT, `${key}: production vehicles are byte-identical after the run`);
}

section('Directional impact — a scenario moves the forecast the expected way');
const cmpDelay = buildComparison(runSimulation(INPUT, 'maintenance-delay', { days: 14 }));
const downtimeDelay = cmpDelay.metrics.find((m) => m.key === 'downtimeRisk');
check(downtimeDelay.delta > 0 && downtimeDelay.tone === 'danger', 'delaying maintenance raises downtime risk (bad)');

const cmpRenew = buildComparison(runSimulation(INPUT, 'administrative-renewal', {}));
const downtimeRenew = cmpRenew.metrics.find((m) => m.key === 'downtimeRisk');
check(downtimeRenew.delta <= 0, 'renewing documents does not worsen downtime risk');

const cmpDeact = buildComparison(runSimulation(INPUT, 'vehicle-deactivation', {}));
check(cmpDeact.metrics.find((m) => m.key === 'downtimeRisk').delta > 0, 'deactivating a vehicle raises downtime risk');

const cmpNew = buildComparison(runSimulation(INPUT, 'new-vehicle', {}));
check(cmpNew.ok === true && cmpNew.metrics.length >= 7, 'new-vehicle simulation compares the full metric set');

section('Comparison shape');
check(cmpDelay.metrics.some((m) => m.key === 'fleetHealth') && cmpDelay.metrics.some((m) => m.key === 'recommendationPriority'), 'metrics include Fleet Health … Recommendation Priority');
check(cmpDelay.metrics.every((m) => 'current' in m && 'simulated' in m && 'deltaText' in m), 'every metric shows current · simulation · difference');
check(Array.isArray(cmpDelay.timeline) && cmpDelay.timeline.length === 5, 'timeline has Today → Simulation → 7/14/30 days');
check(cmpDelay.impact && cmpDelay.impact.title.includes('ditunda'), 'impact summary describes the scenario');

section('Recommendation change detection');
check(cmpDelay.recommendationChanges.some((c) => c.vehicleId === 'v1' && c.changed.priority), 'delaying maintenance changes the target recommendation priority');
check(!!cmpDelay.byId['v1'], 'byId indexes the change for the drawer');

section('In-memory history (never persists)');
const s = createScenarioSession();
const e1 = s.push({ scenarioKey: 'maintenance-delay', params: { days: 7 }, title: 'A' });
s.push({ scenarioKey: 'new-vehicle', params: {}, title: 'B' });
check(s.size() === 2, 'session records scenarios');
const dup = s.duplicate(e1.id);
check(dup && dup.scenarioKey === 'maintenance-delay' && dup.params.days === 7, 'duplicate returns a re-runnable copy');
check(s.undo().title === 'B', 'undo removes the most recent entry');
check(s.size() === 1, 'undo shrinks the session');
s.reset();
check(s.size() === 0, 'reset clears the whole session');

section('Determinism');
check(JSON.stringify(buildComparison(runSimulation(INPUT, 'maintenance-delay', { days: 14 })).metrics)
   === JSON.stringify(buildComparison(runSimulation(INPUT, 'maintenance-delay', { days: 14 })).metrics),
  'same input + scenario ⇒ byte-identical comparison');

section('Unknown scenario degrades predictably');
const bad = runSimulation(INPUT, 'nope');
check(bad.ok === false && bad.error && bad.error.code === 'UNKNOWN_SCENARIO', 'unknown scenario returns a structured error (never throws)');

section('Architectural purity — never re-predicts, never writes production');
const pureFiles = ['scenario-state.js', 'scenario-types.js', 'scenario-comparison.js', 'scenario-history.js'];
const FORBIDDEN_ENGINE = /from\s+['"][^'"]*(prediction-engine|prediction-validator|prediction-provider)/;
for (const f of pureFiles) {
  const src = fs.readFileSync(path.join(ROOT, 'js/simulation', f), 'utf8');
  check(!FORBIDDEN_ENGINE.test(src), `js/simulation/${f} never imports a prediction engine/validator/provider`);
}
const engineSrc = fs.readFileSync(path.join(ROOT, 'js/simulation/scenario-engine.js'), 'utf8');
check(!FORBIDDEN_ENGINE.test(engineSrc), 'scenario-engine.js never imports the prediction engine/validator/provider');
check(/services\/prediction-service/.test(engineSrc), 'scenario-engine.js forecasts through the Prediction Service');

/* ════════════════════════════════════════════════════════════════════════════ */
console.log(`\n${fail === 0 ? '✅ ALL PASS' : `❌ ${fail} FAILED`}`);
process.exit(fail === 0 ? 0 : 1);
