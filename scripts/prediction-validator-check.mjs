/* ============================================================
   prediction-validator-check.mjs — Prediction Validation & Explainability (v1.19.1)

   PURE node test (no browser, no Firebase). Proves js/engines/prediction-validator.js
   certifies the engine's output and REJECTS anything that breaks the
   explainability contract. Covers every case the sprint requires:

     empty model · partial model · complete model · invalid model ·
     missing reasons · missing signals · invalid confidence · invalid score ·
     invalid level · immutability · determinism

   Run:  node scripts/prediction-validator-check.mjs   (exit 0 = pass)
   ============================================================ */

import { buildPredictionModel } from '../js/engines/prediction-engine.js';
import {
  validatePredictionModel,
  validatePrediction,
  collectPredictions,
  isPredictionNode,
  PREDICTION_CONTRACT,
  VALIDATION_SCHEMA,
} from '../js/engines/prediction-validator.js';

let fail = 0;
const check = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fail++; };
const section = (t) => console.log(`\n── ${t} ──`);

const NOW = '2026-07-02T08:00:00.000Z';

/* ── a rich, stressed fixture (same shapes the platform emits) ─────────────── */

const wellness = {
  schema: 'driver-wellness@1',
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
  { id: 'v1', name: 'Innova', status: 'active', type: 'mobil', registration: { year: 2011 },
    health: { operational: 35, legal: 40, documents: 55, overall: 43 },
    taxStatus: 'overdue', stnkStatus: 'expired', insuranceStatus: 'valid', utilization: 92 },
  { id: 'v2', name: 'Fortuner', status: 'active', type: 'mobil', registration: { year: 2023 },
    health: { operational: 95, legal: 98, documents: 100, overall: 96 },
    taxStatus: 'paid', stnkStatus: 'valid', insuranceStatus: 'valid', utilization: 40 },
];
const dispatch = { summary: { utilization: 90, pending: 4 } };
const recommendation = { summary: { acceptanceRate: 72, accuracy: 80, avgConfidence: 68 } };
const finance = { summary: { balance: 400000, initial: 5000000, spent: 4600000 }, spendSeries: [900000, 1100000, 1300000, 1300000] };

const FULL = { now: NOW, wellness, vehicles, dispatch, recommendation, finance };

/* ── a valid stand-alone prediction to mutate into invalid variants ─────────── */

function validPrediction(overrides = {}) {
  return {
    kind: 'risk', score: 82, level: 'HIGH', levelLabel: 'High', tone: 'danger',
    confidence: 80, confidenceLevel: 'HIGH',
    reasons: ['Utilisasi di atas ambang', 'Perawatan terlambat'],
    signals: [{ id: 'utilization', value: 92, weight: 40 }, { id: 'maintenanceAge', value: 88, weight: 60 }],
    summary: 'Risiko perawatan tinggi — jadwalkan dalam 7 hari.',
    ...overrides,
  };
}

/* ════════════════════════════════════════════════════════════════════════════ */

section('Complete model — certified ready for UI');
const model = buildPredictionModel(FULL);
const report = validatePredictionModel(model);
check(report.schema === VALIDATION_SCHEMA, `report schema is ${VALIDATION_SCHEMA}`);
check(report.certified === true, `complete model CERTIFIED (errors: ${report.counts.errors})`);
check(report.valid === true && report.counts.errors === 0, 'zero errors on the real engine output');
check(report.counts.predictions >= 12, `validated ${report.counts.predictions} predictions`);
check(report.counts.certifiedPredictions === report.counts.predictions, 'every prediction individually valid');
check(report.target === 'prediction@1', 'report records the target schema');
check(report.generatedAt === new Date(NOW).toISOString(), 'report echoes generatedAt');
if (report.counts.errors) console.log('   unexpected errors:', JSON.stringify(report.errors, null, 2));

section('Explainability contract — every prediction is fully explained');
const preds = collectPredictions(model);
const contractOk = preds.every(({ node }) =>
  PREDICTION_CONTRACT.requiredFields.every((f) => f in node));
check(contractOk, 'every prediction carries score/level/confidence/confidenceLevel/reasons/signals/summary');
check(preds.every(({ node }) => node.reasons.length >= 1), 'every prediction has ≥1 reason');
check(preds.every(({ node }) => typeof node.summary === 'string' && node.summary.length > 0), 'every prediction has a summary sentence');
check(preds.every(({ node }) => ['LOW', 'MEDIUM', 'HIGH'].includes(node.confidenceLevel)), 'every confidenceLevel is LOW/MEDIUM/HIGH');
// signals carry the { id, value, weight } evidence shape
const allSignals = preds.flatMap(({ node }) => node.signals);
check(allSignals.length > 0, `evidence present (${allSignals.length} signals total)`);
check(allSignals.every((s) => typeof s.id === 'string' && Number.isFinite(s.value) && Number.isFinite(s.weight)), 'every signal is { id, value, weight }');

section('Operational summary quality (spot check)');
const igo = model.drivers.find((d) => d.name === 'Igo');
check(/Igo/.test(igo.fatigueRisk.summary), 'driver summary names the driver');
check(igo.fatigueRisk.confidenceLevel === 'HIGH', `full evidence ⇒ HIGH confidence (got ${igo.fatigueRisk.confidenceLevel})`);
const innova = model.vehicles.find((v) => v.name === 'Innova');
check(/perawatan|jadwal/i.test(innova.maintenanceRisk.summary), 'HIGH maintenance summary includes an action');

section('Single-prediction validation — the golden case');
const good = validatePrediction(validPrediction(), 'sample');
check(good.valid === true && good.errors.length === 0, 'a well-formed prediction validates');
check(isPredictionNode(validPrediction()), 'isPredictionNode recognises a prediction');

section('Invalid score / level / confidence rejected');
check(validatePrediction(validPrediction({ score: 150 }), 's').errors.some((e) => e.code === 'SCORE_RANGE'), 'score 150 ⇒ SCORE_RANGE error');
check(validatePrediction(validPrediction({ score: 'high' }), 's').errors.some((e) => e.code === 'SCORE_RANGE'), 'non-numeric score ⇒ error');
check(validatePrediction(validPrediction({ level: 'SUPER' }), 's').errors.some((e) => e.code === 'LEVEL_UNKNOWN'), 'unknown level ⇒ LEVEL_UNKNOWN');
check(validatePrediction(validPrediction({ kind: 'quality', level: 'HIGH' }), 's').errors.some((e) => e.code === 'LEVEL_KIND'), 'quality prediction with a risk level ⇒ LEVEL_KIND');
check(validatePrediction(validPrediction({ confidence: 200 }), 's').errors.some((e) => e.code === 'CONFIDENCE_RANGE'), 'confidence 200 ⇒ CONFIDENCE_RANGE');
check(validatePrediction(validPrediction({ confidenceLevel: 'MAYBE' }), 's').errors.some((e) => e.code === 'CONFIDENCE_LEVEL_UNKNOWN'), 'bad confidenceLevel ⇒ error');

section('Missing reasons / signals rejected');
check(validatePrediction(validPrediction({ reasons: [] }), 's').errors.some((e) => e.code === 'REASONS_EMPTY'), 'empty reasons ⇒ REASONS_EMPTY');
check(validatePrediction(validPrediction({ reasons: [''] }), 's').errors.some((e) => e.code === 'REASONS_INVALID'), 'blank reason ⇒ REASONS_INVALID');
check(validatePrediction(validPrediction({ signals: [] }), 's').errors.some((e) => e.code === 'SIGNALS_EMPTY_CONFIDENT'), 'no signals on a HIGH-confidence prediction ⇒ error');
check(validatePrediction(validPrediction({ signals: 'nope' }), 's').errors.some((e) => e.code === 'SIGNALS_NOT_ARRAY'), 'non-array signals ⇒ error');
check(validatePrediction(validPrediction({ signals: [{ id: 'x' }] }), 's').errors.some((e) => e.code === 'SIGNAL_VALUE'), 'malformed signal (no value) ⇒ SIGNAL_VALUE');
check(validatePrediction(validPrediction({ summary: '' }), 's').errors.some((e) => e.code === 'SUMMARY_EMPTY'), 'empty summary ⇒ SUMMARY_EMPTY');
const noSummary = validPrediction(); delete noSummary.summary;
check(validatePrediction(noSummary, 's').errors.some((e) => e.code === 'MISSING_FIELD'), 'a removed required field ⇒ MISSING_FIELD');

section('Consistency rules (warnings, not errors)');
const lowEvidHigh = validatePrediction(validPrediction({ confidence: 20, confidenceLevel: 'LOW' }), 's');
check(lowEvidHigh.valid === true, 'HIGH risk + LOW confidence is still VALID (reasons explain it)');
check(lowEvidHigh.warnings.some((w) => w.code === 'HIGH_RISK_LOW_CONFIDENCE'), '…but raises HIGH_RISK_LOW_CONFIDENCE warning');
const bandMismatch = validatePrediction(validPrediction({ confidence: 10, confidenceLevel: 'HIGH' }), 's');
check(bandMismatch.warnings.some((w) => w.code === 'CONFIDENCE_BAND_MISMATCH'), 'confidence 10 tagged HIGH ⇒ band-mismatch warning');
// a genuine no-data prediction: empty signals but LOW confidence is allowed
const noData = validatePrediction({ kind: 'risk', score: 0, level: 'LOW', confidence: 0, confidenceLevel: 'LOW',
  reasons: ['Data tidak cukup'], signals: [], summary: 'Risiko: data belum cukup.' }, 's');
check(noData.valid === true, 'no-data prediction (empty signals @ LOW confidence) is VALID');
check(noData.warnings.some((w) => w.code === 'SIGNALS_EMPTY_LOWDATA'), '…and warns SIGNALS_EMPTY_LOWDATA');

section('Empty model — valid, low confidence, no throw');
const empty = validatePredictionModel(buildPredictionModel({}));
check(empty.certified === true, 'empty model is certified (structurally valid, no errors)');
check(empty.counts.predictions >= 5, `empty model still has ${empty.counts.predictions} aggregate predictions`);
check(empty.warnings.some((w) => w.code === 'SIGNALS_EMPTY_LOWDATA'), 'empty model surfaces insufficient-data warnings');

section('Partial model — only one module present');
const partial = validatePredictionModel(buildPredictionModel({ now: NOW, wellness }));
check(partial.certified === true, 'drivers-only model certified');
check(partial.counts.certifiedPredictions === partial.counts.predictions, 'all predictions valid on partial input');

section('Invalid model — the validator catches injected corruption');
const broken = JSON.parse(JSON.stringify(buildPredictionModel(FULL)));
broken.drivers[0].fatigueRisk.reasons = [];              // missing reasons
broken.drivers[0].fatigueRisk.score = 999;               // out of range
broken.vehicles[0].maintenanceRisk.confidenceLevel = 'X'; // bad confidence band
broken.finance.pettyCashRisk.signals = 'oops';            // non-array signals
const brokenReport = validatePredictionModel(broken);
check(brokenReport.certified === false, 'corrupted model is NOT certified');
check(brokenReport.counts.errors >= 4, `at least 4 errors detected (got ${brokenReport.counts.errors})`);
check(brokenReport.errors.some((e) => e.code === 'REASONS_EMPTY'), 'catches the emptied reasons');
check(brokenReport.errors.some((e) => e.code === 'SCORE_RANGE'), 'catches the out-of-range score');
check(brokenReport.errors.some((e) => e.path.includes('fatigueRisk')), 'error paths point at the offending prediction');
// findings are path-sorted (deterministic)
const paths = brokenReport.errors.map((e) => e.path);
check(paths.every((p, i) => i === 0 || paths[i - 1] <= p), 'errors sorted by path (deterministic)');

section('Not-an-object / non-model inputs');
check(validatePredictionModel(null).certified === false, 'null ⇒ not certified');
check(validatePredictionModel(42).errors.some((e) => e.code === 'MODEL_NOT_OBJECT'), 'number ⇒ MODEL_NOT_OBJECT');

section('Immutability of the report');
check(Object.isFrozen(report), 'report frozen');
check(Object.isFrozen(report.errors) && Object.isFrozen(report.predictions), 'nested arrays frozen');
let mutated = false;
try { report.predictions.push({}); if (report.predictions.length !== preds.length) mutated = true; } catch { /* throw ok */ }
check(!mutated, 'cannot push into a frozen findings array');
// validator must not mutate the model it inspects
const before = JSON.stringify(model);
validatePredictionModel(model);
check(JSON.stringify(model) === before, 'validation does not mutate the input model');

section('Determinism');
const r1 = JSON.stringify(validatePredictionModel(buildPredictionModel(FULL)));
const r2 = JSON.stringify(validatePredictionModel(buildPredictionModel(FULL)));
check(r1 === r2, 'same model ⇒ byte-identical report');
const r3 = JSON.stringify(validatePrediction(validPrediction({ confidence: 20, confidenceLevel: 'LOW' }), 's'));
const r4 = JSON.stringify(validatePrediction(validPrediction({ confidence: 20, confidenceLevel: 'LOW' }), 's'));
check(r3 === r4, 'single-prediction validation is deterministic');

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${fail} failing check(s).`);
process.exit(fail === 0 ? 0 : 1);
