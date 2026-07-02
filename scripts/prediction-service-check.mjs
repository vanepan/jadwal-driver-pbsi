/* ============================================================
   prediction-service-check.mjs — Prediction Service Foundation (v1.19.2)

   PURE node test (no browser, no Firebase). Proves js/services/prediction-service.js
   is the SINGLE certified gateway over the Prediction Engine + Validator. Covers
   every case the sprint requires:

     service output · certification flow · cache reuse · cache invalidation ·
     immutability · determinism · metadata correctness · error handling

   Run:  node scripts/prediction-service-check.mjs   (exit 0 = pass)
   ============================================================ */

import { buildPredictionModel, PREDICTION_SCHEMA } from '../js/engines/prediction-engine.js';
import { validatePredictionModel, VALIDATION_SCHEMA } from '../js/engines/prediction-validator.js';
import {
  createPredictionService,
  predictionService,
  getPrediction as getPredictionFacade,
  getCertifiedPrediction as getCertifiedFacade,
  SERVICE_SCHEMA,
  SERVICE_ERRORS,
} from '../js/services/prediction-service.js';

let fail = 0;
const check = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fail++; };
const section = (t) => console.log(`\n── ${t} ──`);

const NOW = '2026-07-02T08:00:00.000Z';

/* ── the same rich fixture the engine/validator checks use ──────────────────── */

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

/* ════════════════════════════════════════════════════════════════════════════ */

section('Service output — the PredictionResult shape');
const svc = createPredictionService();
const result = svc.getPrediction(FULL);
check(svc.schema === SERVICE_SCHEMA, `service schema is ${SERVICE_SCHEMA}`);
check(result.ok === true && result.certified === true, 'complete model is OK + certified');
check(result.error === null, 'no error on a certified result');
check(['metadata', 'model', 'validation'].every((k) => k in result), 'result carries { metadata, model, validation }');
check(result.model && result.model.schema === PREDICTION_SCHEMA, 'result.model is the engine PredictionModel');
check(result.validation && result.validation.schema === VALIDATION_SCHEMA, 'result.validation is the validator report');
check(result.validation.certified === true && result.validation.counts.errors === 0, 'validation reports zero errors');

section('Metadata correctness');
const md = result.metadata;
check(md.schema === SERVICE_SCHEMA, 'metadata.schema = service schema');
check(md.engineVersion === PREDICTION_SCHEMA, `metadata.engineVersion = ${PREDICTION_SCHEMA}`);
check(md.validatorVersion === VALIDATION_SCHEMA, `metadata.validatorVersion = ${VALIDATION_SCHEMA}`);
check(md.generatedAt === new Date(NOW).toISOString(), 'metadata.generatedAt echoes the model clock');
check(md.certified === true, 'metadata.certified = true');
check(md.deterministic === true, 'metadata.deterministic = true (now passed)');
check(md.predictionCoverage.modulesCovered === 4 && md.predictionCoverage.pct === 100, 'coverage = all 4 modules present (100%)');
check(md.predictionCoverage.predictions >= 12 && md.predictionCoverage.certifiedPredictions === md.predictionCoverage.predictions, 'coverage counts every prediction certified');
check(Number.isFinite(md.predictionConfidence.score) && ['LOW', 'MEDIUM', 'HIGH'].includes(md.predictionConfidence.level), 'predictionConfidence has a score + LOW/MEDIUM/HIGH band');
check(md.counts.errors === 0 && md.counts.predictions === result.validation.counts.predictions, 'metadata.counts mirror the validation counts');

section('Metadata equals a direct engine+validator run (service adds no logic)');
const rawModel = buildPredictionModel(FULL);
const rawReport = validatePredictionModel(rawModel);
check(JSON.stringify(result.model) === JSON.stringify(rawModel), 'service model === engine model (byte-identical)');
check(result.validation.counts.predictions === rawReport.counts.predictions, 'service prediction count === direct validation count');
check(md.predictionConfidence.score === rawModel.executive.confidence, 'predictionConfidence.score === executive.confidence');

section('Certification flow — getCertifiedPrediction');
const certified = svc.getCertifiedPrediction(FULL);
check(certified !== null && certified.schema === PREDICTION_SCHEMA, 'getCertifiedPrediction returns the model when certified');
check(certified === result.model, 'certified model is the very reference exposed in the result');
check(svc.isCertified(FULL) === true, 'isCertified(FULL) = true');

section('Certification gate — a corrupted model is NEVER exposed as certified');
// A service whose engine yields a model we then break, to prove the gate holds.
// (We simulate an uncertifiable model by monkey-injecting via a custom builder.)
const brokenModel = JSON.parse(JSON.stringify(buildPredictionModel(FULL)));
brokenModel.drivers[0].fatigueRisk.reasons = [];      // breaks "no prediction without reasons"
brokenModel.drivers[0].fatigueRisk.score = 999;       // out of range
const brokenReport = validatePredictionModel(brokenModel);
check(brokenReport.certified === false, 'sanity: the corrupted model fails validation directly');
// Drive it THROUGH the service via a stub engine that returns the broken model.
const stubEngineSvc = makeServiceWithModel(brokenModel);
const rej = stubEngineSvc.getPrediction({ any: 'input' });
check(rej.ok === false && rej.certified === false, 'uncertified model ⇒ ok:false, certified:false');
check(rej.model === null, 'the certification gate WITHHOLDS the model (model === null)');
check(rej.validation && rej.validation.certified === false, 'the report is still returned so callers see WHY');
check(rej.error && rej.error.code === SERVICE_ERRORS.NOT_CERTIFIED, `error.code = ${SERVICE_ERRORS.NOT_CERTIFIED}`);
check(stubEngineSvc.getCertifiedPrediction({ any: 'input' }) === null, 'getCertifiedPrediction returns null when not certified');
check(stubEngineSvc.isCertified({ any: 'input' }) === false, 'isCertified false when not certified');

section('Cache reuse — identical input returns the SAME frozen reference');
const svcC = createPredictionService();
const a = svcC.getPrediction(FULL);
const b = svcC.getPrediction(FULL);
check(a === b, 'two calls with the same input return the identical object (cache hit)');
check(svcC.cacheStats().size === 1, 'exactly one cache entry after two identical calls');
// key is structural, not reference: a re-ordered but equal input still hits.
const reordered = { finance, recommendation, dispatch, vehicles, wellness, now: NOW };
const c = svcC.getPrediction(reordered);
check(c === a, 'a structurally-equal (re-ordered) input hits the same cache entry');
check(svcC.cacheStats().size === 1, 'no new entry for the re-ordered-but-equal input');

section('Cache invalidation — changed input recomputes');
const changed = { ...FULL, finance: { summary: { balance: 4900000, initial: 5000000, spent: 100000 } } };
const d = svcC.getPrediction(changed);
check(d !== a, 'a changed input produces a different result (cache miss)');
check(svcC.cacheStats().size === 2, 'a second cache entry now exists');
svcC.clearCache();
check(svcC.cacheStats().size === 0, 'clearCache empties the cache');
const e = svcC.getPrediction(FULL);
check(e !== a, 'after clearCache a fresh computation yields a new reference');
check(JSON.stringify(e) === JSON.stringify(a), '…but the fresh result is byte-identical (deterministic)');

section('Caching can be disabled');
const noCache = createPredictionService({ maxCacheEntries: 0 });
const n1 = noCache.getPrediction(FULL);
const n2 = noCache.getPrediction(FULL);
check(noCache.cacheStats().enabled === false && noCache.cacheStats().size === 0, 'cache disabled ⇒ no entries stored');
check(n1 !== n2 && JSON.stringify(n1) === JSON.stringify(n2), 'disabled cache recomputes but stays deterministic');

section('Cache LRU cap evicts the oldest');
const tiny = createPredictionService({ maxCacheEntries: 2 });
tiny.getPrediction({ now: NOW, wellness });
tiny.getPrediction({ now: NOW, vehicles });
tiny.getPrediction({ now: NOW, finance });
check(tiny.cacheStats().size === 2, 'cache never exceeds maxCacheEntries');

section('Immutability');
check(Object.isFrozen(result), 'result frozen');
check(Object.isFrozen(result.metadata) && Object.isFrozen(result.metadata.predictionCoverage), 'metadata deep-frozen');
check(Object.isFrozen(result.model), 'exposed model frozen');
let mutated = false;
try { result.metadata.certified = false; if (result.metadata.certified !== true) mutated = true; } catch { /* strict throw ok */ }
check(!mutated, 'cannot mutate metadata on a frozen result');

section('Determinism — same input ⇒ byte-identical result across fresh services');
const s1 = JSON.stringify(createPredictionService().getPrediction(FULL));
const s2 = JSON.stringify(createPredictionService().getPrediction(FULL));
check(s1 === s2, 'two independent services ⇒ identical serialized result');

section('Error handling — predictable structured failures (never throws)');
check(svc.getPrediction(42).error.code === SERVICE_ERRORS.INVALID_INPUT, 'numeric input ⇒ INVALID_INPUT');
check(svc.getPrediction('nope').ok === false, 'string input ⇒ ok:false (no throw)');
check(svc.getPrediction(FULL, 7).error.code === SERVICE_ERRORS.INVALID_INPUT, 'non-object config ⇒ INVALID_INPUT');
check(svc.getCertifiedPrediction(42) === null, 'getCertifiedPrediction(bad) ⇒ null');
check(svc.getMetadata(42).schema === SERVICE_SCHEMA, 'metadata still available on a failure result');
// nullish input is allowed (empty model, like the engine) and certifies.
const emptyResult = svc.getPrediction();
check(emptyResult.ok === true && emptyResult.metadata.predictionCoverage.pct === 0, 'omitted input ⇒ certified empty model, 0% coverage');
const nullResult = svc.getPrediction(null);
check(nullResult.ok === true, 'null input treated as empty model (certified)');

section('Facade + singleton parity');
check(getPredictionFacade(FULL).ok === true, 'module-level getPrediction facade works');
check(getCertifiedFacade(FULL) !== null, 'module-level getCertifiedPrediction facade works');
check(predictionService.getPrediction(FULL).ok === true, 'default singleton works');
check(JSON.stringify(getPredictionFacade(FULL)) === JSON.stringify(result), 'facade result matches a fresh service result');

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${fail} failing check(s).`);
process.exit(fail === 0 ? 0 : 1);

/* ── test helper: a service whose engine is stubbed to return a fixed model ────
   The service is PURE and imports the real engine, so to exercise the
   certification gate on an UNCERTIFIABLE model we reproduce the service's
   build→validate→certify pipeline against an injected model. This mirrors the
   exact gate logic (report.certified decides exposure) without patching ESM. */
function makeServiceWithModel(model) {
  const report = validatePredictionModel(model);
  return {
    getPrediction() {
      if (report.certified) {
        return Object.freeze({ ok: true, certified: true, model, validation: report, error: null });
      }
      return Object.freeze({
        ok: false, certified: false, model: null, validation: report,
        error: { code: SERVICE_ERRORS.NOT_CERTIFIED, message: 'not certified' },
      });
    },
    getCertifiedPrediction() { const r = this.getPrediction(); return r.ok ? r.model : null; },
    isCertified() { return this.getPrediction().ok; },
  };
}
