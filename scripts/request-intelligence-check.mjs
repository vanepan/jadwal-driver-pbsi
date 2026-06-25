/* request-intelligence-check.mjs — validates the Request Auto-Fill Intelligence
   service (v1.16.4.11-beta.2). Run: node scripts/request-intelligence-check.mjs
   (exit 0 = all pass)

   Covers the 7 required areas: request readiness, missing fields, recommendation
   generation (reusing the Dispatch Scoring Engine — no logic dup), the
   no-recommendation path, acceptance-risk banding from override analytics, store
   persistence, and panel-state derivation. The panel component itself is DOM +
   store wiring (not imported here); all logic under test lives in the pure service. */

import {
  REQUEST_REQUIRED_FIELDS,
  PANEL_STATE,
  ACCEPTANCE_RISK,
  evaluateReadiness,
  acceptanceRiskFromAccuracy,
  generateDispatchRecommendation,
  buildRecommendationPackage,
  buildRequestRecommendation,
  requestToEngineRequest,
  derivePanelState,
  resolveEffectiveDispatch,
  classifyApproval,
  isApprovalOverride,
  buildApprovalOverrideRecord,
} from '../js/services/request-intelligence-service.js';
import { OVERRIDE_OUTCOME } from '../js/services/override-workflow-service.js';
import {
  saveRequestRecommendation,
  getRequestRecommendation,
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
const drivers = [{ id: 'd_andi', name: 'Andi' }, { id: 'd_budi', name: 'Budi' }];
// Store-shaped vehicles ({ id }) — the service must map id → vehicleId.
const vehicles = [
  { id: 'innova_01', name: 'Toyota Innova', capacity: 7, healthScore: 100 }, // fit 90 → 97
  { id: 'luxio_01', name: 'Daihatsu Luxio', capacity: 12, healthScore: 100 }, // fit 60 → 88
];

resetDispatchIntelligence();
resetDispatchConfig();

/* ── Request readiness + missing fields ──────────────────────────────── */
console.log('\n[readiness]');
check('required fields = date/startTime/endTime/passengers',
  JSON.stringify(REQUEST_REQUIRED_FIELDS) === JSON.stringify(['date', 'startTime', 'endTime', 'passengers']));
check('complete request → ready, no missing', (() => { const r = evaluateReadiness(REQUEST); return r.ready === true && r.missingFields.length === 0; })());
check('empty request → not ready, all 4 missing', (() => {
  const r = evaluateReadiness({});
  return r.ready === false && JSON.stringify(r.missingFields) === JSON.stringify(['date', 'startTime', 'endTime', 'passengers']);
})());
check('passengers 0 → missing passengers only', (() => {
  const r = evaluateReadiness({ date: '2026-06-24', startTime: '08:00', endTime: '12:00', passengers: 0 });
  return r.ready === false && JSON.stringify(r.missingFields) === JSON.stringify(['passengers']);
})());
check('missing times → lists startTime + endTime', (() => {
  const r = evaluateReadiness({ date: '2026-06-24', passengers: 4 });
  return JSON.stringify(r.missingFields) === JSON.stringify(['startTime', 'endTime']);
})());

/* ── Acceptance risk banding ─────────────────────────────────────────── */
console.log('\n[acceptance risk]');
check('accuracy 90 → LOW', acceptanceRiskFromAccuracy(90) === ACCEPTANCE_RISK.LOW);
check('accuracy 85 → LOW (85+)', acceptanceRiskFromAccuracy(85) === ACCEPTANCE_RISK.LOW);
check('accuracy 84 → MEDIUM', acceptanceRiskFromAccuracy(84) === ACCEPTANCE_RISK.MEDIUM);
check('accuracy 70 → MEDIUM', acceptanceRiskFromAccuracy(70) === ACCEPTANCE_RISK.MEDIUM);
check('accuracy 69 → HIGH', acceptanceRiskFromAccuracy(69) === ACCEPTANCE_RISK.HIGH);
check('accuracy 0 → HIGH', acceptanceRiskFromAccuracy(0) === ACCEPTANCE_RISK.HIGH);
check('no history → UNKNOWN', acceptanceRiskFromAccuracy(50, false) === ACCEPTANCE_RISK.UNKNOWN);

/* ── Recommendation generation (reuses Dispatch Scoring Engine) ──────── */
console.log('\n[recommendation generation]');
const gen = generateDispatchRecommendation(REQUEST, drivers, vehicles, [], { now: NOW });
check('generateDispatchRecommendation maps id→vehicleId + recommends Andi+Innova 99',
  gen.recommendedDispatch && gen.recommendedDispatch.driverId === 'd_andi'
  && gen.recommendedDispatch.vehicleId === 'innova_01' && gen.recommendedDispatch.dispatchScore === 99);

const pkg = buildRecommendationPackage({ request: REQUEST, drivers, vehicles, assignments: [], overrideLogs: [] }, { now: NOW });
check('READY package: ready + state READY', pkg.ready === true && pkg.state === PANEL_STATE.READY);
check('package exposes dispatch/driver/vehicle recommendations + generatedAt',
  !!pkg.dispatchRecommendation && !!pkg.driverRecommendation && !!pkg.vehicleRecommendation && typeof pkg.generatedAt === 'string');
check('package recommendedDispatch = Andi+Innova 99',
  pkg.recommendedDispatch.driverId === 'd_andi' && pkg.recommendedDispatch.vehicleId === 'innova_01' && pkg.recommendedDispatch.dispatchScore === 99);
check('summary mentions both names + score', pkg.summary.includes('Andi') && pkg.summary.includes('Toyota Innova') && pkg.summary.includes('99'));
check('no override history → acceptance risk UNKNOWN (sampleSize 0)',
  pkg.acceptanceRisk.level === ACCEPTANCE_RISK.UNKNOWN && pkg.acceptanceRisk.sampleSize === 0);

/* ── Acceptance risk fed by override analytics ───────────────────────── */
console.log('\n[risk from override analytics]');
// Andi recommended 10×, kept 9× → accuracy 90 → LOW.
const overrideLogs = [
  ...Array.from({ length: 9 }, () => ({ recommendedDriverId: 'd_andi', selectedDriverId: 'd_andi', recommendedVehicleId: 'innova_01', selectedVehicleId: 'innova_01' })),
  { recommendedDriverId: 'd_andi', selectedDriverId: 'd_other', recommendedVehicleId: 'innova_01', selectedVehicleId: 'innova_01' },
];
const pkgRisk = buildRecommendationPackage({ request: REQUEST, drivers, vehicles, assignments: [], overrideLogs }, { now: NOW });
check('Andi accuracy 90 → acceptance risk LOW (n=10)',
  pkgRisk.acceptanceRisk.level === ACCEPTANCE_RISK.LOW && pkgRisk.acceptanceRisk.driverAccuracy === 90 && pkgRisk.acceptanceRisk.sampleSize === 10);

/* ── Not-ready package ───────────────────────────────────────────────── */
console.log('\n[not-ready package]');
const pkgNotReady = buildRecommendationPackage({ request: { date: '2026-06-24', passengers: 6 }, drivers, vehicles, assignments: [] }, { now: NOW });
check('incomplete request → state NOT_READY + missing times', pkgNotReady.state === PANEL_STATE.NOT_READY
  && JSON.stringify(pkgNotReady.missingFields) === JSON.stringify(['startTime', 'endTime']));
check('not-ready package has no recommendation', pkgNotReady.recommendedDispatch === null && pkgNotReady.dispatchRecommendation === null);

/* ── No-recommendation package ───────────────────────────────────────── */
console.log('\n[no-recommendation package]');
const tooSmall = [{ id: 'ayla_01', name: 'Daihatsu Ayla', capacity: 4 }]; // 6 > 4 → over-capacity, no valid dispatch
const pkgNoRec = buildRecommendationPackage({ request: REQUEST, drivers, vehicles: tooSmall, assignments: [] }, { now: NOW });
check('ready but no valid dispatch → state NO_RECOMMENDATION', pkgNoRec.ready === true && pkgNoRec.state === PANEL_STATE.NO_RECOMMENDATION);
check('no-recommendation still exposes dispatchRecommendation (diagnostics) but null recommendedDispatch',
  !!pkgNoRec.dispatchRecommendation && pkgNoRec.recommendedDispatch === null);

/* ── Panel-state derivation ──────────────────────────────────────────── */
console.log('\n[panel states]');
check('derivePanelState(not ready) → NOT_READY', derivePanelState(pkgNotReady) === PANEL_STATE.NOT_READY);
check('derivePanelState(ready+rec) → READY', derivePanelState(pkg) === PANEL_STATE.READY);
check('derivePanelState(ready+no rec) → NO_RECOMMENDATION', derivePanelState(pkgNoRec) === PANEL_STATE.NO_RECOMMENDATION);
check('derivePanelState(null) → NOT_READY (safe default)', derivePanelState(null) === PANEL_STATE.NOT_READY);

/* ── Persistence ─────────────────────────────────────────────────────── */
console.log('\n[persistence]');
resetDispatchIntelligence();
check('fresh store → no cached request recommendation', getRequestRecommendation() === null);
saveRequestRecommendation(pkg);
check('saveRequestRecommendation + getRequestRecommendation round-trip', getRequestRecommendation() === pkg);
saveRequestRecommendation(pkgNoRec, 'req_7');
check('keyed save/read independent', getRequestRecommendation('req_7') === pkgNoRec && getRequestRecommendation() === pkg);
check('absent key → null', getRequestRecommendation('nope') === null);
resetDispatchIntelligence();
check('reset clears request recommendations', getRequestRecommendation() === null);

/* ── Background request recommendation (beta.3 — stored with the request) ── */
console.log('\n[background request recommendation]');
// A STORED request shape (startDate / pax / purpose — no driver/vehicle chosen).
const storedRequest = { startDate: '2026-06-24', startTime: '08:00', endTime: '12:00', pax: 6, purpose: 'Jemput atlet' };
const eng = requestToEngineRequest(storedRequest);
check('requestToEngineRequest maps startDate→date, pax→passengers, purpose→destination',
  eng.date === '2026-06-24' && eng.passengers === 6 && eng.destination === 'Jemput atlet' && eng.startTime === '08:00');
check('requestToEngineRequest full-day → 00:00–23:59',
  (() => { const e = requestToEngineRequest({ startDate: '2026-06-24', fullDay: true, pax: 2 }); return e.startTime === '00:00' && e.endTime === '23:59'; })());

const bg = buildRequestRecommendation({ request: storedRequest, drivers, vehicles, assignments: [] }, { now: NOW });
check('background recommendation has a driver + vehicle + score (Andi/Innova/99)',
  bg.hasRecommendation === true && bg.recommendedDriver === 'Andi' && bg.recommendedVehicle === 'Toyota Innova' && bg.dispatchScore === 99);
check('stored fields are all defined (Firebase-safe, no null/undefined)',
  typeof bg.recommendedDriver === 'string' && typeof bg.recommendedDriverId === 'string'
  && typeof bg.recommendedVehicle === 'string' && typeof bg.dispatchScore === 'number'
  && typeof bg.reasonSummary === 'string' && typeof bg.availabilitySummary === 'string' && Array.isArray(bg.alternatives));
check('reason + availability summaries are non-empty',
  bg.reasonSummary.includes('99') && bg.availabilitySummary.includes('Andi'));

const bgNotReady = buildRequestRecommendation({ request: { startDate: '2026-06-24', pax: 6 }, drivers, vehicles, assignments: [] }, { now: NOW });
check('incomplete request → hasRecommendation false + empty names + score 0',
  bgNotReady.hasRecommendation === false && bgNotReady.recommendedDriver === '' && bgNotReady.dispatchScore === 0);
const bgNoValid = buildRequestRecommendation({ request: storedRequest, drivers, vehicles: [{ id: 'ayla_01', name: 'Ayla', capacity: 4 }], assignments: [] }, { now: NOW });
check('ready but no valid dispatch (over-capacity) → hasRecommendation false',
  bgNoValid.hasRecommendation === false && bgNoValid.dispatchScore === 0);

/* ── Approval Override UX (beta.3.1 — decision helpers) ─────────────────── */
console.log('\n[approval override UX]');
const REQ = { id: 'req_1', recommendedDriver: 'Aria', recommendedVehicle: 'Innova', dispatchScore: 90 };

check('approve recommendation (no decision) → ACCEPTED', classifyApproval(REQ, {}) === OVERRIDE_OUTCOME.ACCEPTED);
check('driver changed → DRIVER_OVERRIDE', classifyApproval(REQ, { driver: 'Budi', vehicle: 'Innova' }) === OVERRIDE_OUTCOME.DRIVER_OVERRIDE);
check('vehicle changed → VEHICLE_OVERRIDE', classifyApproval(REQ, { driver: 'Aria', vehicle: 'Luxio' }) === OVERRIDE_OUTCOME.VEHICLE_OVERRIDE);
check('both changed → FULL_OVERRIDE', classifyApproval(REQ, { driver: 'Budi', vehicle: 'Luxio' }) === OVERRIDE_OUTCOME.FULL_OVERRIDE);

check('resolveEffectiveDispatch (no decision) → selected = recommended',
  (() => { const e = resolveEffectiveDispatch(REQ, {}); return e.selectedDriver === 'Aria' && e.selectedVehicle === 'Innova' && e.recommendedDriver === 'Aria'; })());
check('resolveEffectiveDispatch (driver override) → keeps recommended vehicle',
  (() => { const e = resolveEffectiveDispatch(REQ, { driver: 'Budi' }); return e.selectedDriver === 'Budi' && e.selectedVehicle === 'Innova'; })());

check('reason required predicate: ACCEPTED → false', isApprovalOverride(REQ, { driver: 'Aria', vehicle: 'Innova' }) === false);
check('reason required predicate: override → true', isApprovalOverride(REQ, { driver: 'Budi', vehicle: 'Innova' }) === true);

const accRec = buildApprovalOverrideRecord(REQ, {}, 'Evan');
check('approve-recommendation override record → ACCEPTED, overridden false, selected=recommended',
  accRec.outcome === OVERRIDE_OUTCOME.ACCEPTED && accRec.overridden === false
  && accRec.selectedDriverId === 'Aria' && accRec.recommendedDriverId === 'Aria');
check('audit trail fields present (recommended/selected driver+vehicle, outcome, reason, approvedBy, timestamp)',
  ['recommendedDriverId', 'recommendedVehicleId', 'selectedDriverId', 'selectedVehicleId', 'outcome', 'reason', 'approvedBy', 'timestamp']
    .every((k) => k in accRec) && accRec.approvedBy === 'Evan' && !Number.isNaN(Date.parse(accRec.timestamp)));

const ovrRec = buildApprovalOverrideRecord(REQ, { driver: 'Budi', vehicle: 'Luxio', reason: 'Aria ke tugas VIP' }, 'Evan');
check('full-override record → FULL_OVERRIDE, captures selected + reason',
  ovrRec.outcome === OVERRIDE_OUTCOME.FULL_OVERRIDE && ovrRec.overridden === true
  && ovrRec.selectedDriverId === 'Budi' && ovrRec.selectedVehicleId === 'Luxio' && ovrRec.reason === 'Aria ke tugas VIP');

// Legacy request: no recommendation, but a requester-chosen driver/vehicle.
const LEGACY = { id: 'req_legacy', driver: 'OldDriver', vehicle: 'OldVehicle' };
check('legacy request approved as-is → ACCEPTED (baseline = legacy choice)',
  classifyApproval(LEGACY, {}) === OVERRIDE_OUTCOME.ACCEPTED);
check('legacy resolveEffectiveDispatch → selected = legacy driver/vehicle',
  (() => { const e = resolveEffectiveDispatch(LEGACY, {}); return e.selectedDriver === 'OldDriver' && e.selectedVehicle === 'OldVehicle'; })());
check('legacy override (driver changed) → DRIVER_OVERRIDE',
  classifyApproval(LEGACY, { driver: 'NewDriver', vehicle: 'OldVehicle' }) === OVERRIDE_OUTCOME.DRIVER_OVERRIDE);

/* ── Summary ─────────────────────────────────────────────────────────── */
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
