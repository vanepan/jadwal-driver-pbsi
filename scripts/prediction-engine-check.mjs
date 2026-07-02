/* ============================================================
   prediction-engine-check.mjs — Prediction Foundation validation (v1.19.0)

   PURE node test (no browser, no Firebase). Verifies the foundation contract of
   js/engines/prediction-engine.js:

     • immutability      — the whole model is deep-frozen (mutations throw/no-op)
     • deterministic     — same input ⇒ byte-identical output (JSON equal)
     • purity            — no window/document/Firebase touched (module imports clean)
     • empty input       — {} yields a valid, reasoned model (no throw)
     • partial input     — a single module present still produces a full model
     • missing modules    — absent domains degrade to "insufficient data", not crash
     • explainability    — EVERY prediction has { score, level, reasons[≥1] }
     • risk levels       — banding + the schema example (score 82 ⇒ HIGH)

   Run:  node scripts/prediction-engine-check.mjs   (exit 0 = pass)
   ============================================================ */

import {
  buildPredictionModel,
  riskLevel,
  qualityLevel,
  RISK_LEVELS,
  PREDICTION_SCHEMA,
} from '../js/engines/prediction-engine.js';

let fail = 0;
const check = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fail++; };
const section = (t) => console.log(`\n── ${t} ──`);

const NOW = '2026-07-02T08:00:00.000Z';

/* ── seed models in the REAL shapes the platform emits ─────────────────────── */

const wellness = {
  schema: 'driver-wellness@1',
  summary: { avgHealth: 62 },
  drivers: [
    { driverId: 'd1', driverName: 'Igo',
      health: { score: 42 }, fatigue: { index: 78 }, burnout: { index: 66 },
      capacityHealth: { score: 20, utilization: 88 }, recovery: { avgRestDays: 0.5, maxStreak: 9 } },
    { driverId: 'd2', driverName: 'Bayu',
      health: { score: 91 }, fatigue: { index: 12 }, burnout: { index: 8 },
      capacityHealth: { score: 90, utilization: 22 }, recovery: { avgRestDays: 3, maxStreak: 2 } },
  ],
};

const vehicles = [
  { id: 'v1', name: 'Innova', status: 'active', type: 'mobil',
    registration: { year: 2011, odometer: 240000 },
    health: { operational: 35, legal: 40, documents: 55, overall: 43 },
    taxStatus: 'overdue', stnkStatus: 'expired', insuranceStatus: 'valid', utilization: 92 },
  { id: 'v2', name: 'Fortuner', status: 'active', type: 'mobil',
    registration: { year: 2023, odometer: 15000 },
    health: { operational: 95, legal: 98, documents: 100, overall: 96 },
    taxStatus: 'paid', stnkStatus: 'valid', insuranceStatus: 'valid', utilization: 40 },
];

const dispatch = { summary: { utilization: 90, pending: 4 } };
const recommendation = { summary: { acceptanceRate: 72, accuracy: 80, avgConfidence: 68 } };
const finance = {
  summary: { balance: 400000, initial: 5000000, spent: 4600000 },
  spendSeries: [900000, 1100000, 1300000, 1300000],
};

const FULL = { now: NOW, wellness, vehicles, dispatch, recommendation, finance };

/* ── helper: walk every Prediction object in the model ─────────────────────── */

function isPrediction(o) {
  return o && typeof o === 'object' && typeof o.score === 'number' &&
    typeof o.level === 'string' && Array.isArray(o.reasons);
}
function collectPredictions(node, acc = []) {
  if (!node || typeof node !== 'object') return acc;
  if (isPrediction(node)) acc.push(node);
  for (const k of Object.keys(node)) {
    const v = node[k];
    if (v && typeof v === 'object') collectPredictions(v, acc);
  }
  return acc;
}

/* ════════════════════════════════════════════════════════════════════════════ */

section('Schema + basic shape');
const model = buildPredictionModel(FULL);
check(model.schema === PREDICTION_SCHEMA, `schema is ${PREDICTION_SCHEMA}`);
check(model.generatedAt === new Date(NOW).toISOString(), 'generatedAt reflects the passed `now`');
check(model.deterministic === true, 'deterministic flag true when `now` supplied');
for (const key of ['executive', 'drivers', 'vehicles', 'dispatch', 'finance', 'recommendations']) {
  check(key in model, `model.${key} present`);
}

section('Immutability (deep freeze)');
check(Object.isFrozen(model), 'root frozen');
check(Object.isFrozen(model.drivers) && Object.isFrozen(model.drivers[0]), 'drivers array + rows frozen');
check(Object.isFrozen(model.executive.warnings), 'executive.warnings frozen');
check(Object.isFrozen(model.drivers[0].fatigueRisk.reasons), 'nested reasons array frozen');
let mutationBlocked = true;
try {
  model.drivers[0].fatigueRisk.score = -999;
  if (model.drivers[0].fatigueRisk.score === -999) mutationBlocked = false;
} catch { /* strict-mode throw is also acceptable */ }
check(mutationBlocked, 'mutating a frozen prediction has no effect');

section('Determinism');
const a = JSON.stringify(buildPredictionModel(FULL));
const b = JSON.stringify(buildPredictionModel(FULL));
check(a === b, 'same input ⇒ byte-identical JSON');
const c = JSON.stringify(buildPredictionModel({ ...FULL }));
check(a === c, 'shallow-cloned input ⇒ identical output (no hidden state)');

section('Explainability — every prediction has score/level/reasons');
const preds = collectPredictions(model);
check(preds.length >= 12, `found ${preds.length} prediction objects (expected many)`);
const allReasoned = preds.every((p) => Array.isArray(p.reasons) && p.reasons.length >= 1);
check(allReasoned, 'EVERY prediction carries ≥1 reason');
const allScored = preds.every((p) => Number.isFinite(p.score) && p.score >= 0 && p.score <= 100);
check(allScored, 'every prediction score is a finite 0–100');
const validLevels = new Set([...RISK_LEVELS.map((l) => l.key), 'EXCELLENT', 'GOOD', 'FAIR', 'ATTENTION', 'CRITICAL']);
check(preds.every((p) => validLevels.has(p.level)), 'every prediction level is a known band');

section('Risk banding (incl. the schema example: 82 ⇒ HIGH)');
check(riskLevel(82).key === 'HIGH', 'riskLevel(82) === HIGH (matches sprint example)');
check(riskLevel(0).key === 'LOW', 'riskLevel(0) === LOW');
check(riskLevel(100).key === 'CRITICAL', 'riskLevel(100) === CRITICAL');
check(riskLevel(44).key === 'MODERATE' && riskLevel(45).key === 'ELEVATED', 'ELEVATED boundary at 45');
check(qualityLevel(90).key === 'EXCELLENT' && qualityLevel(0).key === 'CRITICAL', 'quality banding higher=better');

section('Signal correctness — the tired driver reads riskier than the fresh one');
const igo = model.drivers.find((d) => d.name === 'Igo');
const bayu = model.drivers.find((d) => d.name === 'Bayu');
check(igo.fatigueRisk.score > bayu.fatigueRisk.score, 'Igo fatigueRisk > Bayu');
check(['HIGH', 'CRITICAL'].includes(igo.fatigueRisk.level), `Igo fatigue is HIGH/CRITICAL (got ${igo.fatigueRisk.level})`);
check(igo.recoveryRecommended === true, 'Igo flagged recoveryRecommended');
check(bayu.recoveryRecommended === false, 'Bayu NOT flagged for recovery');
check(igo.fatigueRisk.reasons.length >= 1 && igo.fatigueRisk.reasons.some((r) => /kelelahan/i.test(r)), 'Igo fatigue reason mentions the fatigue index');

section('Vehicle prediction — the old, overdue vehicle reads riskier');
const innova = model.vehicles.find((v) => v.name === 'Innova');
const fortuner = model.vehicles.find((v) => v.name === 'Fortuner');
check(innova.maintenanceRisk.score > fortuner.maintenanceRisk.score, 'Innova maintenanceRisk > Fortuner');
check(innova.administrativeRisk.score > fortuner.administrativeRisk.score, 'Innova administrativeRisk > Fortuner');
check(['HIGH', 'CRITICAL'].includes(innova.administrativeRisk.level), 'Innova admin risk HIGH/CRITICAL (STNK expired + tax overdue)');
check(innova.administrativeRisk.reasons.some((r) => /STNK/i.test(r)), 'admin reasons cite STNK');

section('Dispatch + finance forecasts');
check(isPrediction(model.dispatch.capacityRisk), 'dispatch.capacityRisk is a prediction');
check(model.dispatch.recommendationConfidence.score > 0, 'recommendationConfidence derived from accuracy model');
check(model.finance.forecastBalance !== null && model.finance.forecastBalance < 400000, 'forecastBalance projects below current balance (spend rising)');
check(model.finance.upcomingExpenses && model.finance.upcomingExpenses.periods === 4, 'upcomingExpenses used the 4-period spend series');
check(['HIGH', 'CRITICAL'].includes(model.finance.pettyCashRisk.level), 'low balance ⇒ HIGH/CRITICAL pettyCashRisk');

section('Executive roll-up');
check(isPrediction(model.executive.overallRisk), 'overallRisk is a prediction');
check(model.executive.overallHealth.score === 100 - model.executive.overallRisk.score, 'overallHealth is the quality inverse of overallRisk');
check(model.executive.confidence > 0 && model.executive.confidence <= 100, 'confidence in (0,100]');
check(Array.isArray(model.executive.warnings) && model.executive.warnings.length >= 1, 'warnings raised for the stressed fixture');
check(typeof model.executive.summary === 'string' && model.executive.summary.length > 0, 'executive.summary is a non-empty narrative');
// warnings sorted most-severe first
const ws = model.executive.warnings.map((w) => w.score);
check(ws.every((s, i) => i === 0 || ws[i - 1] >= s), 'warnings sorted most-severe first');

section('Recommendations (forward-looking, deterministic order)');
check(Array.isArray(model.recommendations) && model.recommendations.length >= 1, 'recommendations produced');
const pr = model.recommendations.map((r) => r.priority);
check(pr.every((p, i) => i === 0 || pr[i - 1] >= p), 'recommendations sorted by priority desc');
check(model.recommendations.every((r) => Array.isArray(r.reasons) && r.reasons.length >= 1), 'every recommendation carries reasons');
check(model.recommendations.some((r) => r.domain === 'driver' && /Igo/.test(r.target)), 'a driver recovery recommendation for Igo exists');

section('Empty input — valid, reasoned, no throw');
let emptyModel;
let emptyThrew = false;
try { emptyModel = buildPredictionModel({}); } catch (e) { emptyThrew = true; console.log('   threw:', e.message); }
check(!emptyThrew, 'buildPredictionModel({}) does not throw');
check(emptyModel && emptyModel.schema === PREDICTION_SCHEMA, 'empty model still well-formed');
check(emptyModel.drivers.length === 0 && emptyModel.vehicles.length === 0, 'no entities from empty input');
const emptyPreds = collectPredictions(emptyModel);
check(emptyPreds.every((p) => p.reasons.length >= 1), 'even with no data, every prediction has a reason');
check(emptyModel.finance.pettyCashRisk.reasons.some((r) => /tidak tersedia|Insufficient/i.test(r)), 'finance reports the module as unavailable');
check(emptyModel.executive.confidence === 0, 'empty input ⇒ confidence 0');
check(emptyModel.deterministic === false, 'omitting `now` marks deterministic:false');

section('Partial / missing modules');
const onlyDrivers = buildPredictionModel({ now: NOW, wellness });
check(onlyDrivers.drivers.length === 2 && onlyDrivers.vehicles.length === 0, 'drivers-only input handled');
check(collectPredictions(onlyDrivers).every((p) => p.reasons.length >= 1), 'drivers-only: all reasoned');
const onlyFinance = buildPredictionModel({ now: NOW, finance });
check(onlyFinance.finance.forecastBalance !== null, 'finance-only still forecasts a balance');
check(onlyFinance.coverage.finance === true && onlyFinance.coverage.drivers === false, 'coverage flags reflect present modules');
const rawFallback = buildPredictionModel({ now: NOW, drivers: [{ id: 'd9', name: 'Raw', active: true }] });
check(rawFallback.drivers.length === 1, 'raw driver roster fallback (no wellness) still yields a driver prediction');
check(rawFallback.drivers[0].fatigueRisk.reasons.length >= 1, 'raw-fallback driver still explainable');

section('Determinism across independent module presence');
const d1 = JSON.stringify(buildPredictionModel({ now: NOW, wellness }));
const d2 = JSON.stringify(buildPredictionModel({ now: NOW, wellness }));
check(d1 === d2, 'partial input is deterministic too');

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${fail} failing check(s).`);
process.exit(fail === 0 ? 0 : 1);
