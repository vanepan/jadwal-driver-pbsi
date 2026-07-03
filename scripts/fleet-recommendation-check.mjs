/* ============================================================
   fleet-recommendation-check.mjs — Fleet Recommendation Engine (v1.19.7)

   PURE node test (no browser, no Firebase). Proves the Recommendation layer
   transforms a CERTIFIED prediction into operational, explainable recommendations
   WITHOUT ever recomputing or duplicating prediction logic. Covers:

     priority + timeline mapping · enriched recommendation shape (non-generic) ·
     fleet ranking · board buckets · priority timeline grouping · decision
     support · positive no-recommendation state · determinism + memoization ·
     architectural purity (never imports a prediction engine/service).

   Run:  node scripts/fleet-recommendation-check.mjs   (exit 0 = pass)
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getPrediction } from '../js/services/prediction-service.js';
import {
  priorityFor, priorityRank, timelineFor, PRIORITY_LEVELS, TIMELINE_BUCKETS,
} from '../js/recommendation/recommendation-priority.js';
import {
  buildVehicleRecommendation, buildFleetRecommendations, fleetOptimizations,
  allRecommendations, RECOMMENDATION_SOURCE, CATEGORIES,
} from '../js/recommendation/fleet-recommendation-engine.js';
import {
  recommendationBoard, recommendationTimeline, decisionSupport, noRecommendationState,
} from '../js/recommendation/recommendation-summary.js';

let fail = 0;
const check = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fail++; };
const section = (t) => console.log(`\n── ${t} ──`);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NOW = '2026-07-03T08:00:00.000Z';

/* ── the same rich fixture the engine/validator/service checks use ──────────── */
const wellness = {
  schema: 'driver-wellness@1',
  drivers: [
    { driverId: 'd1', driverName: 'Igo', health: { score: 42 }, fatigue: { index: 78 }, burnout: { index: 66 }, capacityHealth: { score: 20, utilization: 88 }, recovery: { avgRestDays: 0.5, maxStreak: 9 } },
    { driverId: 'd2', driverName: 'Bayu', health: { score: 91 }, fatigue: { index: 12 }, burnout: { index: 8 }, capacityHealth: { score: 90, utilization: 22 }, recovery: { avgRestDays: 3, maxStreak: 2 } },
  ],
};
const vehicles = [
  { id: 'v1', name: 'Innova', status: 'active', type: 'mobil', registration: { year: 2011 }, health: { operational: 35, legal: 40, documents: 55, overall: 43 }, taxStatus: 'overdue', stnkStatus: 'expired', insuranceStatus: 'valid', utilization: 92 },
  { id: 'v2', name: 'Fortuner', status: 'active', type: 'mobil', registration: { year: 2023 }, health: { operational: 95, legal: 98, documents: 100, overall: 96 }, taxStatus: 'paid', stnkStatus: 'valid', insuranceStatus: 'valid', utilization: 40 },
];
const dispatch = { summary: { utilization: 90, pending: 4 } };
const recommendation = { summary: { acceptanceRate: 72, accuracy: 80, avgConfidence: 68 } };
const finance = { summary: { balance: 400000, initial: 5000000, spent: 4600000 }, spendSeries: [900000, 1100000, 1300000, 1300000] };
const FULL = { now: NOW, wellness, vehicles, dispatch, recommendation, finance };

const result = getPrediction(FULL);
const model = result.model;

/* ════════════════════════════════════════════════════════════════════════════ */

section('Certified model prerequisite');
check(result.ok === true && result.certified === true, 'fixture produces a certified prediction model');
check(Array.isArray(model.vehicles) && model.vehicles.length === 2, 'model carries the 2 vehicle projections');

section('Priority + timeline mapping (pure grammar)');
check(PRIORITY_LEVELS.length === 5, 'five priority levels');
check(priorityFor('CRITICAL', true).key === 'critical', 'CRITICAL → critical');
check(priorityFor('HIGH', true).key === 'high', 'HIGH → high');
check(priorityFor('ELEVATED', true).key === 'medium', 'ELEVATED → medium');
check(priorityFor('LOW', true).key === 'informational', 'LOW → informational');
check(priorityFor('CRITICAL', false).key === 'informational', 'non-actionable is always informational');
check(['danger', 'danger', 'warn', 'info', 'ok'].every((t, i) => PRIORITY_LEVELS[i].tone === t), 'priorities reuse existing Executive tones (no new palette)');
check(priorityRank('critical') === 0 && priorityRank('informational') === 4, 'priorityRank orders most-urgent first');
check(TIMELINE_BUCKETS.length === 5, 'five execution windows');
check(timelineFor('CRITICAL', 'maintenance').key === 'immediate', 'critical maintenance → immediate');
check(timelineFor('CRITICAL', 'availability').key === 'today', 'critical (non-maint) → today');
check(timelineFor('HIGH', 'maintenance').key === 'this-week', 'HIGH → this-week');
check(timelineFor('ELEVATED', 'x').key === 'next-week', 'ELEVATED → next-week');
check(timelineFor('LOW', 'x').key === 'later', 'LOW → later');

section('Enriched recommendation shape (never generic)');
const innova = model.vehicles.find((v) => v.name === 'Innova');
const fortuner = model.vehicles.find((v) => v.name === 'Fortuner');
const recI = buildVehicleRecommendation(innova);
const recF = buildVehicleRecommendation(fortuner);
const REQUIRED = ['id', 'vehicleId', 'vehicleName', 'category', 'categoryLabel', 'title', 'priority', 'confidence', 'reason', 'expectedBenefit', 'estimatedImpact', 'predictionRef', 'timeline', 'operationalNotes', 'dependencies', 'source'];
check(REQUIRED.every((k) => k in recI), 'recommendation carries every required field');
check(!!CATEGORIES[recI.category], 'category is one of the defined categories');
check(recI.title.includes('Innova'), 'title is operational + names the vehicle (not generic)');
check(!/^Pantau kendaraan\.?$|^Observe/i.test(recI.title), 'title is not a generic "monitor/observe" line');
check(recI.priority && typeof recI.priority.rank === 'number', 'priority is a full level object');
check(recI.confidence && typeof recI.confidence.score === 'number', 'confidence reuses the certified score');
check(recI.predictionRef && recI.predictionRef.level && recI.predictionRef.window, 'predictionRef references the prediction (level + window)');
check(recI.expectedBenefit && recI.expectedBenefit.length > 5, 'expected benefit is stated');
check(recI.source === RECOMMENDATION_SOURCE && RECOMMENDATION_SOURCE.length === 3, 'recommendation source identifies Service · Explainability · Model');
check(recI.actionable === true, 'the at-risk vehicle yields an actionable recommendation');
check(recF.category === 'none' && recF.actionable === false, 'the healthy vehicle yields a positive No-Action recommendation');
check(recF.priority.key === 'informational', 'healthy recommendation is informational priority');
check(Object.isFrozen(recI), 'recommendation is frozen');

section('Fleet ranking');
const fleet = buildFleetRecommendations(model);
check(fleet.length === 2, 'one recommendation per vehicle');
check(fleet[0].rank <= fleet[1].rank, 'fleet recommendations are ranked most-urgent first');
check(fleet[0].vehicleName === 'Innova', 'the at-risk vehicle ranks first');

section('Board buckets');
const board = recommendationBoard(model);
check(board.critical.length + board.upcoming.length + board.healthy.length === fleet.length, 'every vehicle lands in exactly one bucket');
check(board.healthy.some((r) => r.vehicleName === 'Fortuner'), 'the healthy vehicle is in the Healthy bucket');
check(board.completed.length === 0 && board.counts.completed === 0, 'completed is honestly empty (not fabricated)');
check(board.isHealthyFleet === (board.critical.length === 0 && board.upcoming.length === 0), 'isHealthyFleet reflects pending actions');
check(typeof board.counts.total === 'number', 'board exposes counts');

section('Priority timeline grouping');
const tl = recommendationTimeline(model);
check(tl.length === 5, 'timeline returns every execution window');
check(tl.every((b, i) => b.order === i), 'windows are in canonical order');
const tlTotal = tl.reduce((n, b) => n + b.recs.length, 0);
const actionableCount = fleet.filter((r) => r.actionable && r.category !== 'none').length + fleetOptimizations(model).length;
check(tlTotal === actionableCount, 'every actionable recommendation appears in exactly one window');

section('Executive decision support');
const ds = decisionSupport(model);
check(Array.isArray(ds) && ds.length >= 1, 'decision support returns insights');
check(ds[0].key === 'highestPriority', 'first insight is the highest-priority recommendation');
check(ds.every((i) => 'title' in i && 'value' in i && 'detail' in i), 'insights carry the ExecutiveInsightCards shape');

section('No-recommendation state (positive)');
const none = noRecommendationState(model);
check(typeof none.healthy === 'boolean', 'no-recommendation state reports fleet health');
check(Array.isArray(none.messages) && none.messages.length >= 1, 'positive enterprise messaging present');

/* Healthy-fleet scenario: only the pristine vehicle → no action required. */
const HEALTHY = { now: NOW, wellness, vehicles: [vehicles[1]], dispatch, recommendation, finance };
const healthyModel = getPrediction(HEALTHY).model;
if (healthyModel && Array.isArray(healthyModel.vehicles) && healthyModel.vehicles.length) {
  const hb = recommendationBoard(healthyModel);
  check(hb.isHealthyFleet === true, 'an all-healthy fleet reports isHealthyFleet=true');
  check(noRecommendationState(healthyModel).healthy === true, 'no-recommendation state activates for a healthy fleet');
}

section('Determinism + memoization');
check(buildFleetRecommendations(model) === buildFleetRecommendations(model), 'fleet recommendations are memoized on the frozen model (same reference)');
check(buildVehicleRecommendation(innova) === buildVehicleRecommendation(innova), 'per-vehicle recommendation is memoized on the frozen projection');
check(JSON.stringify(allRecommendations(model)) === JSON.stringify(allRecommendations(getPrediction(FULL).model)), 'same input ⇒ byte-identical recommendations');

section('Architectural purity — never re-predicts');
const files = [
  'js/recommendation/recommendation-priority.js',
  'js/recommendation/fleet-recommendation-engine.js',
  'js/recommendation/recommendation-summary.js',
];
const FORBIDDEN = /from\s+['"][^'"]*(prediction-engine|prediction-validator|prediction-provider|services\/prediction-service)/;
for (const f of files) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  check(!FORBIDDEN.test(src), `${f} never imports a prediction engine/validator/provider/service`);
}

/* ════════════════════════════════════════════════════════════════════════════ */
console.log(`\n${fail === 0 ? '✅ ALL PASS' : `❌ ${fail} FAILED`}`);
process.exit(fail === 0 ? 0 : 1);
