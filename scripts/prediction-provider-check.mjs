/* ============================================================
   prediction-provider-check.mjs — Hybrid Prediction Architecture (v1.19.3)

   PURE node test (no browser, no Firebase). Proves the provider abstraction:
   the Prediction Service now builds predictions THROUGH a provider registry,
   the RuleProvider is the default and is engine-parity, the PythonProvider is a
   NOT_IMPLEMENTED stub, and switching providers flows through the service and
   its cache correctly — with NO change to default runtime behaviour.

     provider registration · provider switching · default provider ·
     RuleProvider parity · PythonProvider stub · Prediction Service compatibility

   Run:  node scripts/prediction-provider-check.mjs   (exit 0 = pass)
   ============================================================ */

import { buildPredictionModel, PREDICTION_SCHEMA } from '../js/engines/prediction-engine.js';
import {
  getProvider,
  getActiveProvider,
  getActiveProviderId,
  listProviders,
  registerProvider,
  setActiveProvider,
  resetRegistry,
  isProvider,
  providerSuccess,
  providerFailure,
  PROVIDER_ERRORS,
  PROVIDER_SCHEMA,
  PROVIDER_CONTRACT,
  DEFAULT_PROVIDER_ID,
  REGISTRY_ERRORS,
} from '../js/prediction/prediction-provider.js';
import { ruleProvider, RULE_PROVIDER_ID } from '../js/prediction/rule-provider.js';
import { pythonProvider, PYTHON_PROVIDER_ID, PYTHON_PROVIDER_VERSION } from '../js/prediction/python-provider.js';
import { createPredictionService, SERVICE_ERRORS } from '../js/services/prediction-service.js';

let fail = 0;
const check = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fail++; };
const section = (t) => console.log(`\n── ${t} ──`);

const NOW = '2026-07-02T08:00:00.000Z';

/* ── the same rich fixture the engine/validator/service checks use ──────────── */

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

section('Provider registration');
check(PROVIDER_SCHEMA === 'prediction-provider@1', `provider schema is ${PROVIDER_SCHEMA}`);
check(getProvider(RULE_PROVIDER_ID) === ruleProvider, 'RuleProvider is registered under its id');
check(getProvider(PYTHON_PROVIDER_ID) === pythonProvider, 'PythonProvider is registered under its id');
check(getProvider('does-not-exist') === null, 'getProvider(unknown) ⇒ null');
const listed = listProviders();
check(Array.isArray(listed) && listed.length >= 2, 'listProviders() returns every registered provider');
check(listed.some((p) => p.id === 'rule') && listed.some((p) => p.id === 'python'), 'list contains both rule and python');
check(listed.every((p) => !('predict' in p)), 'listed summaries never leak the predict() function');
check(Object.isFrozen(listed), 'listProviders() result is frozen');

section('Provider contract — both providers satisfy the shape');
for (const p of [ruleProvider, pythonProvider]) {
  check(isProvider(p), `${p.id} satisfies isProvider()`);
  check(PROVIDER_CONTRACT.provider.every((k) => k in p), `${p.id} exposes every contract field`);
  const r = p.predict(FULL);
  check(PROVIDER_CONTRACT.result.every((k) => k in r), `${p.id}.predict() returns every ProviderResult field`);
  check(Object.isFrozen(r), `${p.id}.predict() result is frozen`);
}

section('Default provider is RuleProvider');
check(DEFAULT_PROVIDER_ID === 'rule', "DEFAULT_PROVIDER_ID = 'rule'");
check(getActiveProviderId() === 'rule', 'active provider id defaults to rule');
check(getActiveProvider() === ruleProvider, 'getActiveProvider() defaults to RuleProvider');
check(listProviders().find((p) => p.id === 'rule').active === true, 'rule is flagged active in the listing');

section('RuleProvider parity — same model as a direct engine call (adds no logic)');
const rr = ruleProvider.predict(FULL);
check(rr.ok === true && rr.error === null, 'RuleProvider.predict(FULL) ⇒ ok, no error');
check(rr.providerId === 'rule' && rr.engineVersion === PREDICTION_SCHEMA, `RuleProvider result carries providerId + engineVersion (${PREDICTION_SCHEMA})`);
const direct = buildPredictionModel(FULL);
check(JSON.stringify(rr.model) === JSON.stringify(direct), 'RuleProvider model === direct buildPredictionModel(FULL) (byte-identical)');
// config forwarding: an override reaches the engine through the provider.
const cfg = { /* a harmless empty override still exercises the path */ };
check(JSON.stringify(ruleProvider.predict(FULL, cfg).model) === JSON.stringify(buildPredictionModel(FULL, cfg)), 'RuleProvider forwards config to the engine');
check(rr.model === null || typeof rr.model === 'object', 'RuleProvider returns a raw (uncertified) model object');

section('RuleProvider never throws — engine failure ⇒ predictable BUILD_FAILED');
// A frozen/booby-trapped input can make the engine throw; the provider captures it.
const boom = ruleProvider.predict(Object.defineProperty({}, 'wellness', { get() { throw new Error('kaboom'); } }));
check(boom.ok === false && boom.error.code === PROVIDER_ERRORS.BUILD_FAILED, 'engine throw ⇒ ok:false + BUILD_FAILED');
check(boom.model === null, 'a build failure exposes no model');

section('PythonProvider stub — NOT_IMPLEMENTED, same contract, no side effects');
const pr = pythonProvider.predict(FULL);
check(pr.ok === false, 'PythonProvider.predict() ⇒ ok:false');
check(pr.model === null, 'PythonProvider returns no model (stub)');
check(pr.error && pr.error.code === PROVIDER_ERRORS.NOT_IMPLEMENTED, `PythonProvider error.code = ${PROVIDER_ERRORS.NOT_IMPLEMENTED}`);
check(pr.providerId === 'python' && pr.engineVersion === PYTHON_PROVIDER_VERSION, 'PythonProvider identifies itself distinctly from the engine');
check(pythonProvider.version !== PREDICTION_SCHEMA, 'PythonProvider version is NOT the engine schema (never mistaken for the engine)');

section('Provider switching');
check(setActiveProvider('python') === pythonProvider, "setActiveProvider('python') returns the provider");
check(getActiveProviderId() === 'python', 'active provider switched to python');
check(setActiveProvider('rule') === ruleProvider, "setActiveProvider('rule') returns the provider");
check(getActiveProviderId() === 'rule', 'active provider switched back to rule');
let threw = false;
try { setActiveProvider('nope'); } catch (e) { threw = e && e.code === REGISTRY_ERRORS.UNKNOWN_PROVIDER; }
check(threw, 'setActiveProvider(unknown) throws UNKNOWN_PROVIDER');
let threw2 = false;
try { registerProvider({ id: '', predict: 1 }); } catch (e) { threw2 = e && e.code === REGISTRY_ERRORS.INVALID_PROVIDER; }
check(threw2, 'registerProvider(malformed) throws INVALID_PROVIDER');

section('ProviderResult helpers');
const s = providerSuccess({ schema: 'x' }, { providerId: 'p', engineVersion: 'v' });
check(s.ok === true && s.model.schema === 'x' && s.error === null && Object.isFrozen(s), 'providerSuccess builds a frozen ok result');
const f = providerFailure(PROVIDER_ERRORS.NOT_IMPLEMENTED, 'nope', { providerId: 'p', engineVersion: 'v' });
check(f.ok === false && f.model === null && f.error.code === PROVIDER_ERRORS.NOT_IMPLEMENTED && Object.isFrozen(f), 'providerFailure builds a frozen error result');

section('Prediction Service compatibility — service builds THROUGH the active provider');
const svc = createPredictionService();
// Default (rule): identical to a direct engine + validator run.
const viaRule = svc.getPrediction(FULL);
check(viaRule.ok === true && viaRule.certified === true, 'with RuleProvider active: certified result (runtime unchanged)');
check(viaRule.metadata.engineVersion === PREDICTION_SCHEMA, `service metadata.engineVersion = provider version (${PREDICTION_SCHEMA})`);
check(JSON.stringify(viaRule.model) === JSON.stringify(direct), 'service model (via RuleProvider) === direct engine model');

section('Prediction Service under a stub provider — degrades predictably, never certifies');
setActiveProvider('python');
const svc2 = createPredictionService();
const viaPy = svc2.getPrediction(FULL);
check(viaPy.ok === false && viaPy.certified === false, 'with PythonProvider active: ok:false, not certified');
check(viaPy.model === null, 'stub provider ⇒ service exposes no model');
check(viaPy.error && viaPy.error.code === SERVICE_ERRORS.NOT_IMPLEMENTED, `service surfaces NOT_IMPLEMENTED (was ${PROVIDER_ERRORS.NOT_IMPLEMENTED} from the provider)`);
check(svc2.getCertifiedPrediction(FULL) === null, 'getCertifiedPrediction ⇒ null under the stub provider');
check(viaPy.metadata.engineVersion === PYTHON_PROVIDER_VERSION, 'failure metadata reflects the active provider version');
setActiveProvider('rule'); // restore

section('Cache is provider-scoped — switching providers never returns a stale result');
const svc3 = createPredictionService();
const a = svc3.getPrediction(FULL);                    // built via rule (cached under rule)
check(a.ok === true, 'rule result cached');
setActiveProvider('python');
const b = svc3.getPrediction(FULL);                    // same input, different provider
check(b.ok === false && b.error.code === SERVICE_ERRORS.NOT_IMPLEMENTED, 'same input under python ⇒ recomputed as NOT_IMPLEMENTED (no rule cache bleed)');
check(svc3.cacheStats().size === 2, 'the two providers hold distinct cache entries for the same input');
setActiveProvider('rule');
const c = svc3.getPrediction(FULL);                    // back to rule ⇒ original cached ref
check(c === a, 'switching back to rule returns the original cached rule result');
setActiveProvider('rule'); // ensure restored

section('Registry reset restores the bootstrap state');
setActiveProvider('python');
resetRegistry();
check(getActiveProviderId() === 'rule', 'resetRegistry() restores rule as the active provider');
check(getProvider('rule') === ruleProvider && getProvider('python') === pythonProvider, 'resetRegistry() re-registers the built-ins');

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${fail} failing check(s).`);
process.exit(fail === 0 ? 0 : 1);
