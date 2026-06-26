/* decision-replay-check.mjs — Decision Replay & Explainable AI (v1.17.5)
   PURE node test. Drives the REAL recommendation engines to produce a dispatch
   package, then builds the Decision Replay model over it and asserts every
   feature block — proving the replay only RE-EXPRESSES the engine output (never
   recomputes a score). Also covers the override path, the export builders, and
   empty-data safety.
   Run: node scripts/decision-replay-check.mjs (exit 0 = pass) */

import { buildRecommendationPackage } from '../js/services/request-intelligence-service.js';
import { recommendDispatch } from '../js/services/dispatch-scoring-engine.js';
import { createOverrideRecord } from '../js/services/override-workflow-service.js';
import { buildScoreBreakdown, confidenceFromScore } from '../js/services/dispatch-presentation.js';
import { severityBand } from '../js/analytics/recommendation-accuracy-engine.js';
import {
  buildDecisionReplay,
  resolveReplayDiagnostics,
  OVERRIDE_OUTCOME_LABEL,
} from '../js/services/decision-replay-service.js';
import {
  buildDecisionReplayDocDefinition,
  buildDecisionReplaySheets,
} from '../js/exports/analytics/decision-replay-export.js';

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };
const approx = (a, b) => Math.abs(a - b) <= 1;

const NOW = '2026-06-25T12:00:00';
const drivers = [
  { id: 'd1', name: 'Igo' }, { id: 'd2', name: 'Dedi' },
  { id: 'd3', name: 'Aria' }, { id: 'd4', name: 'Grace' },
];
const vehicles = [
  { id: 'v1', name: 'Toyota Avanza', capacity: 7, healthScore: 100 },
  { id: 'v2', name: 'Toyota Innova', capacity: 8, healthScore: 95 },
  { id: 'v3', name: 'Toyota Hiace', capacity: 15, healthScore: 90 },
];
// Make d2/d3/d4 busier than d1 (lower recency) and give d1 a clean slate so the
// recommendation is deterministic + the ranking has real spread.
const assignments = [];
for (let i = 0; i < 5; i++) assignments.push({ driver: 'Dedi', vehicle: 'Toyota Innova', date: '2026-06-23', startTime: '08:00', endTime: '10:00', status: 'assigned' });
for (let i = 0; i < 3; i++) assignments.push({ driver: 'Aria', vehicle: 'Toyota Hiace', date: '2026-06-24', startTime: '08:00', endTime: '10:00', status: 'assigned' });
assignments.push({ driver: 'Grace', vehicle: 'Toyota Avanza', date: '2026-06-24', startTime: '08:00', endTime: '10:00', status: 'assigned' });

const request = {
  id: 'req-100', date: '2026-06-25', startTime: '13:00', endTime: '16:00',
  passengers: 4, destination: 'Bandara', requesterName: 'Bidang Umum',
  createdAt: '2026-06-25T07:00:00',
};

const pkg = buildRecommendationPackage({ request, drivers, vehicles, assignments, overrideLogs: [] }, { now: NOW });

console.log('\n[engine package]');
check('package is READY with a recommendation', pkg.state === 'READY' && !!pkg.recommendedDispatch);
const recId = { driverId: pkg.recommendedDispatch.driverId, vehicleId: pkg.recommendedDispatch.vehicleId };

// Stored recommendation (compact shape, as persisted on the request).
const dispDiag = pkg.dispatchRecommendation.diagnostics.find((d) => d.driverId === recId.driverId && d.vehicleId === recId.vehicleId);
const stored = {
  hasRecommendation: true,
  recommendedDriver: dispDiag.driverName, recommendedDriverId: recId.driverId,
  recommendedVehicle: dispDiag.vehicleName, recommendedVehicleId: recId.vehicleId,
  dispatchScore: pkg.recommendedDispatch.dispatchScore,
  generatedAt: pkg.generatedAt,
};

const model = buildDecisionReplay({
  pkg, stored, request,
  recommended: { driver: stored.recommendedDriver, vehicle: stored.recommendedVehicle },
  selection: { driver: '', vehicle: '' },
}, { now: '2026-06-25T13:30:00' });

console.log('\n[Feature 1 — Decision Replay]');
check('10 replay stages in order', model.replayStages.length === 10
  && model.replayStages[0].key === 'request'
  && model.replayStages[6].key === 'dispatchScore'
  && model.replayStages[9].key === 'decision');
check('policy stage reflects eligible counts', /lolos kebijakan/.test(model.replayStages[1].detail));
check('dispatch-score stage equals stored score', model.replayStages[6].detail.startsWith(String(stored.dispatchScore)));

console.log('\n[Feature 7 — Confidence reuse]');
const expectConf = confidenceFromScore(stored.dispatchScore);
check('confidence reuses confidenceFromScore (label)', model.confidence.label === expectConf.label);
check('confidence glyph matches', model.confidence.glyph === expectConf.glyph);
check('confidence is NOT hardcoded (score-driven)', model.confidence.score === expectConf.score);

console.log('\n[Feature 2 — Why this driver]');
check('whyDriver present with name + score', !!model.whyDriver && model.whyDriver.name === stored.recommendedDriver);
check('whyDriver score matches engine driver score', approx(model.whyDriver.score, dispDiag.driverScore));
check('whyDriver has reason checklist', model.whyDriver.reasons.length === 3 && model.whyDriver.reasons.every((r) => 'ok' in r && 'text' in r));
check('whyDriver sub-scores reused from engine breakdown', model.whyDriver.subScores.length === 4);

console.log('\n[Feature 4 — Vehicle explanation]');
check('whyVehicle present with name + score', !!model.whyVehicle && model.whyVehicle.name === stored.recommendedVehicle);
check('whyVehicle score matches engine vehicle score', approx(model.whyVehicle.score, dispDiag.vehicleScore));
check('whyVehicle has 2 checks + 4 sub-scores', model.whyVehicle.reasons.length === 2 && model.whyVehicle.subScores.length === 4);

console.log('\n[Feature 3 — Why not other drivers]');
check('whyNotDrivers has recommended winner', !!model.whyNotDrivers.recommended && model.whyNotDrivers.recommended.name === stored.recommendedDriver);
check('others exclude the winner', model.whyNotDrivers.others.every((o) => o.name !== stored.recommendedDriver));
check('each comparison has per-sub-score deltas + finalDifference', model.whyNotDrivers.others.length > 0
  && model.whyNotDrivers.others.every((o) => o.differences.length === 4 && typeof o.finalDifference === 'number'));
check('finalDifference = winnerScore − otherScore', model.whyNotDrivers.others.every((o) =>
  o.finalDifference === model.whyNotDrivers.recommended.score - o.score));

console.log('\n[Feature 4b — Why not other vehicles]');
check('whyNotVehicles winner present', !!model.whyNotVehicles.recommended && model.whyNotVehicles.recommended.name === stored.recommendedVehicle);
check('vehicle deltas computed over 4 sub-scores', model.whyNotVehicles.others.every((o) => o.differences.length === 4));

console.log('\n[Feature 5 — Score breakdown]');
const bd = buildScoreBreakdown({ driverScore: dispDiag.driverScore, vehicleScore: dispDiag.vehicleScore, dispatchScore: stored.dispatchScore }, pkg.dispatchRecommendation.weights);
check('scoreBreakdown rows total to dispatch score', model.scoreBreakdown.total === stored.dispatchScore);
check('driver+vehicle points sum to total (no drift)', model.scoreBreakdown.rows[0].points + model.scoreBreakdown.rows[1].points === stored.dispatchScore);
check('breakdown matches buildScoreBreakdown (single source)', model.scoreBreakdown.rows[0].points === bd.rows[0].points && model.scoreBreakdown.rows[1].points === bd.rows[1].points);
check('breakdown carries sub-scores for both sides', model.scoreBreakdown.subScores.driver.length === 4 && model.scoreBreakdown.subScores.vehicle.length === 4);

console.log('\n[Feature 6 — Policy explanation]');
check('policy present + reflects engine diagnostics', model.policy.present === true);
check('eligible counts match policyDiagnostics', model.policy.driverEligible === pkg.policyDiagnostics.drivers.eligible
  && model.policy.vehicleEligible === pkg.policyDiagnostics.vehicles.eligible);
check('driverRequired true (not Tanpa Driver)', model.policy.driverRequired === true && model.policy.medicalMode === false);

console.log('\n[Feature 9 — Candidate ranking]');
check('ranking mirrors dispatch diagnostics length', model.ranking.length === pkg.dispatchRecommendation.diagnostics.length);
check('rank #1 is flagged recommended', model.ranking[0].recommended === true);
check('ranking is sorted by rank ascending', model.ranking.every((r, i) => r.rank === i + 1));
check('each ranking row has expandable sub-scores', model.ranking.every((r) => typeof r.driverScore === 'number' && typeof r.vehicleScore === 'number'));
check('only one row flagged recommended', model.ranking.filter((r) => r.recommended).length === 1);

console.log('\n[Feature 8 — Override analysis: ACCEPTED]');
const accepted = buildDecisionReplay({ pkg, stored, request, recommended: { driver: stored.recommendedDriver, vehicle: stored.recommendedVehicle }, selection: { driver: stored.recommendedDriver, vehicle: stored.recommendedVehicle } });
check('same selection ⇒ not overridden', accepted.override.overridden === false && accepted.override.outcome === 'ACCEPTED');

console.log('\n[Feature 8 — Override analysis: recorded override]');
const overrideRecord = createOverrideRecord({
  recommendationId: 'req-100',
  recommendedDriverId: stored.recommendedDriver, recommendedVehicleId: stored.recommendedVehicle,
  selectedDriverId: 'Dedi', selectedVehicleId: stored.recommendedVehicle,
  dispatchScore: stored.dispatchScore - 18, reason: 'Driver lebih familiar rute', approvedBy: 'Admin Operasi',
  timestamp: '2026-06-25T14:00:00',
});
const ovModel = buildDecisionReplay({ pkg, stored, request, recommended: { driver: stored.recommendedDriver, vehicle: stored.recommendedVehicle }, overrideRecord });
check('recorded override is decided + overridden', ovModel.override.decided && ovModel.override.overridden);
check('override outcome = DRIVER_OVERRIDE', ovModel.override.outcome === 'DRIVER_OVERRIDE');
check('override severity reuses severityBand', ovModel.override.severity === severityBand(overrideRecord.dispatchScore - stored.dispatchScore).key);
check('override captures reason + approvedBy + timestamp', ovModel.override.reason === 'Driver lebih familiar rute' && ovModel.override.approvedBy === 'Admin Operasi' && !!ovModel.override.timestamp);
check('outcome label maps to id-ID', OVERRIDE_OUTCOME_LABEL[ovModel.override.outcome] === 'Ganti Driver');
check('override appears on lifecycle timeline', ovModel.timeline.some((e) => e.key === 'overridden'));

console.log('\n[Feature 11 — Lifecycle timeline]');
check('timeline includes created + generated + viewed', model.timeline.some((e) => e.key === 'created') && model.timeline.some((e) => e.key === 'generated') && model.timeline.some((e) => e.key === 'viewed'));
check('pending request ends with "Menunggu Keputusan"', model.timeline.some((e) => e.key === 'pending' && e.done === false));
const approvedReq = { ...request, status: 'approved', approvedAt: '2026-06-25T14:05:00' };
const approvedModel = buildDecisionReplay({ pkg, stored, request: approvedReq, recommended: { driver: stored.recommendedDriver, vehicle: stored.recommendedVehicle }, overrideRecord });
check('approved request appends Disetujui + Penugasan Dibuat', approvedModel.timeline.some((e) => e.key === 'approved') && approvedModel.timeline.some((e) => e.key === 'assignment'));

console.log('\n[no-recompute invariant]');
// Re-running the engine for the SAME pairing yields the SAME scores the replay shows.
const fresh = recommendDispatch({ request: { date: request.date, startTime: request.startTime, endTime: request.endTime, passengers: request.passengers }, drivers, vehicles: vehicles.map((v) => ({ ...v, vehicleId: v.id })), assignments }, { now: NOW });
const freshTop = fresh.diagnostics.find((d) => d.driverId === recId.driverId && d.vehicleId === recId.vehicleId);
check('replay driver score == fresh engine driver score', approx(model.whyDriver.score, freshTop.driverScore));
check('replay dispatch score == stored score (historical, not recomputed)', model.recommendation.dispatchScore === stored.dispatchScore);
check('resolveReplayDiagnostics reads engine sub-scores (no calc)', resolveReplayDiagnostics(pkg, recId).driverScore === dispDiag.driverScore);

console.log('\n[Feature 12 — Export builders]');
const doc = buildDecisionReplayDocDefinition(model, { appVersion: '1.17.5', generatedBy: 'Admin' });
check('PDF docDefinition has content + A4', Array.isArray(doc.content) && doc.content.length >= 8 && doc.pageSize === 'A4');
check('PDF title is Decision Replay', doc.content[0].text.includes('Decision Replay'));
const sheets = buildDecisionReplaySheets(model);
check('Excel has Ringkasan + Replay + Peringkat + Linimasa sheets', ['Ringkasan', 'Replay', 'Peringkat', 'Linimasa'].every((n) => sheets.some((s) => s.name === n)));
check('Komposisi Skor sheet present when breakdown exists', sheets.some((s) => s.name === 'Komposisi Skor'));
check('every sheet name ≤ 31 chars (Excel limit)', sheets.every((s) => s.name.length <= 31));

console.log('\n[empty / corrupt safety]');
const empty = buildDecisionReplay({});
check('empty input → hasRecommendation false, no throw', empty.hasRecommendation === false && empty.replayStages.length === 10);
check('empty model still exports', buildDecisionReplaySheets(empty).length >= 4 && buildDecisionReplayDocDefinition(empty).content.length >= 5);
check('null pkg policy → policy.present false', empty.policy.present === false);
const corrupt = buildDecisionReplay({ pkg: { dispatchRecommendation: null, driverRecommendation: null }, stored: { hasRecommendation: true, dispatchScore: 'x' }, request: null });
check('corrupt inputs do not throw + score coerced to 0', corrupt.recommendation.dispatchScore === 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
