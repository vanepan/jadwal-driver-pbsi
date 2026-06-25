/* dispatch-persistence-check.mjs — validates the Dispatch Intelligence
   Persistence Layer (v1.16.4.11-rc.1).
   Run: node scripts/dispatch-persistence-check.mjs   (exit 0 = all pass)

   Uses an in-memory FAKE Firebase adapter (the persistence service takes the
   adapter by injection — it imports no firebase.js, so it is fully node-testable).
   Covers the 12 areas: save/load of each node, store hydration, missing node,
   corrupt data, Firebase-unavailable fallback, and analytics consistency. */

import {
  DI_PATHS,
  DISPATCH_INTELLIGENCE_ROOT,
  hydrateDispatchIntelligence,
  initDispatchIntelligencePersistence,
  _resetDispatchIntelligencePersistence,
} from '../js/services/dispatch-intelligence-persistence.js';
import {
  saveOverrideLog,
  getOverrideLogs,
  getOverrideStats,
  getDriverAccuracy,
  getVehicleAccuracy,
  saveRequestRecommendation,
  getRequestRecommendation,
  saveSnapshot,
  getSnapshotHistory,
  resetDispatchIntelligence,
} from '../js/stores/dispatch-intelligence-store.js';
import { createOverrideRecord } from '../js/services/override-workflow-service.js';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

/* ── In-memory fake RTDB adapter ─────────────────────────────────────── */
function makeFakeDb(initial = {}) {
  const db = JSON.parse(JSON.stringify(initial));
  const get = (path) => path.split('/').reduce((o, k) => (o == null ? undefined : o[k]), db);
  const setp = (path, value) => {
    const keys = path.split('/');
    let o = db;
    for (let i = 0; i < keys.length - 1; i++) { o[keys[i] ??= {}]; o = o[keys[i]] ||= {}; }
    o[keys[keys.length - 1]] = JSON.parse(JSON.stringify(value)); // simulate serialization
  };
  return {
    db,
    adapter: {
      isConfigured: () => true,
      fetchData: async (path) => { const v = get(path); return v === undefined ? null : JSON.parse(JSON.stringify(v)); },
      storeData: async (path, value) => { setp(path, value); },
    },
  };
}

function freshOverrideRecord(rd, rv, sd, sv, reason = '') {
  return createOverrideRecord({ recommendationId: 'req_x', recommendedDriverId: rd, recommendedVehicleId: rv, selectedDriverId: sd, selectedVehicleId: sv, reason, approvedBy: 'Evan' });
}

/* ── 1–2: save + load override log ───────────────────────────────────── */
console.log('\n[override log persistence]');
resetDispatchIntelligence(); _resetDispatchIntelligencePersistence();
let { db, adapter } = makeFakeDb();
initDispatchIntelligencePersistence(adapter);
const rec1 = freshOverrideRecord('Andi', 'Innova', 'Andi', 'Innova');           // ACCEPTED
const rec2 = freshOverrideRecord('Andi', 'Innova', 'Budi', 'Innova', 'VIP');     // DRIVER_OVERRIDE
saveOverrideLog(rec1);
saveOverrideLog(rec2);
check('save: override logs written to RTDB node', Array.isArray(db.dispatchIntelligence.overrideLogs) && db.dispatchIntelligence.overrideLogs.length === 2);
check('save: persisted record keeps audit fields',
  db.dispatchIntelligence.overrideLogs[1].outcome === 'DRIVER_OVERRIDE'
  && db.dispatchIntelligence.overrideLogs[1].selectedDriverId === 'Budi'
  && db.dispatchIntelligence.overrideLogs[1].reason === 'VIP'
  && db.dispatchIntelligence.overrideLogs[1].approvedBy === 'Evan'
  && !!db.dispatchIntelligence.overrideLogs[1].timestamp);

_resetDispatchIntelligencePersistence();
resetDispatchIntelligence();
check('reset clears the in-memory store', getOverrideLogs().length === 0);
await hydrateDispatchIntelligence(adapter);
check('load: override logs hydrated from RTDB (2)', getOverrideLogs().length === 2);
check('load: outcomes round-trip', getOverrideLogs()[0].outcome === 'ACCEPTED' && getOverrideLogs()[1].outcome === 'DRIVER_OVERRIDE');

/* ── 3–4: save + load request recommendation ─────────────────────────── */
console.log('\n[request recommendation persistence]');
resetDispatchIntelligence(); _resetDispatchIntelligencePersistence();
({ db, adapter } = makeFakeDb());
initDispatchIntelligencePersistence(adapter);
const recoData = { requestId: 'req_1', recommendedDriverId: 'd_andi', recommendedVehicleId: 'innova_01', dispatchScore: 95, reasonSummary: 'skor 95', availabilitySummary: 'tersedia', generatedAt: '2026-06-24T12:00:00.000Z' };
saveRequestRecommendation(recoData, 'req_1');
check('save: recommendation written under its requestId key', !!db.dispatchIntelligence.requestRecommendations.req_1 && db.dispatchIntelligence.requestRecommendations.req_1.dispatchScore === 95);
_resetDispatchIntelligencePersistence(); resetDispatchIntelligence();
await hydrateDispatchIntelligence(adapter);
check('load: recommendation hydrated (req_1 score 95)', getRequestRecommendation('req_1')?.dispatchScore === 95 && getRequestRecommendation('req_1')?.recommendedDriverId === 'd_andi');

/* ── 5–6: save + load capacity snapshot ──────────────────────────────── */
console.log('\n[capacity history persistence]');
resetDispatchIntelligence(); _resetDispatchIntelligencePersistence();
({ db, adapter } = makeFakeDb());
initDispatchIntelligencePersistence(adapter);
const snap1 = { generatedAt: '2026-06-20T00:00:00.000Z', drivers: [{ driverId: 'd1', utilizationPercent: 40 }] };
const snap2 = { generatedAt: '2026-06-21T00:00:00.000Z', drivers: [{ driverId: 'd1', utilizationPercent: 60 }] };
saveSnapshot(snap1); saveSnapshot(snap2);
check('save: capacity snapshots written (schema unchanged)',
  Array.isArray(db.dispatchIntelligence.capacityHistory) && db.dispatchIntelligence.capacityHistory.length === 2
  && db.dispatchIntelligence.capacityHistory[1].drivers[0].utilizationPercent === 60);
_resetDispatchIntelligencePersistence(); resetDispatchIntelligence();
await hydrateDispatchIntelligence(adapter);
check('load: capacity history hydrated (2, chronological)',
  getSnapshotHistory().length === 2 && getSnapshotHistory()[0].generatedAt < getSnapshotHistory()[1].generatedAt);

/* ── 7: full store hydration round-trip ──────────────────────────────── */
console.log('\n[store hydration]');
resetDispatchIntelligence(); _resetDispatchIntelligencePersistence();
({ db, adapter } = makeFakeDb());
initDispatchIntelligencePersistence(adapter);
saveOverrideLog(freshOverrideRecord('Andi', 'Innova', 'Andi', 'Innova'));
saveRequestRecommendation({ requestId: 'r1', dispatchScore: 88 }, 'r1');
saveSnapshot({ generatedAt: '2026-06-22T00:00:00.000Z', drivers: [] });
_resetDispatchIntelligencePersistence(); resetDispatchIntelligence();
const res = await hydrateDispatchIntelligence(adapter);
check('hydration reports success', res.hydrated === true);
check('all three nodes hydrated together',
  getOverrideLogs().length === 1 && getRequestRecommendation('r1')?.dispatchScore === 88 && getSnapshotHistory().length === 1);

/* ── 8: missing nodes ────────────────────────────────────────────────── */
console.log('\n[missing nodes]');
resetDispatchIntelligence(); _resetDispatchIntelligencePersistence();
const emptyAdapter = makeFakeDb({}).adapter; // no dispatchIntelligence node at all
const r8 = await hydrateDispatchIntelligence(emptyAdapter);
check('missing root node → hydrates to empty, no throw',
  r8.hydrated === true && getOverrideLogs().length === 0 && getSnapshotHistory().length === 0 && getRequestRecommendation('x') === null);
const partialAdapter = makeFakeDb({ dispatchIntelligence: { overrideLogs: [freshOverrideRecord('A', 'B', 'A', 'B')] } }).adapter; // only one node
const r8b = await hydrateDispatchIntelligence(partialAdapter);
check('partial node (only overrideLogs) loads safely', r8b.hydrated === true && getOverrideLogs().length === 1 && getSnapshotHistory().length === 0);

/* ── 9: corrupt data ─────────────────────────────────────────────────── */
console.log('\n[corrupt data]');
resetDispatchIntelligence();
const corruptAdapter = makeFakeDb({
  dispatchIntelligence: {
    overrideLogs: { '000': freshOverrideRecord('A', 'B', 'A', 'B'), '001': null, '002': 'not-an-object', '003': 42 },
    capacityHistory: [null, { generatedAt: '2026-06-23T00:00:00.000Z', drivers: [] }, 'garbage'],
    requestRecommendations: [{ requestId: 'rr1', dispatchScore: 70 }],
  },
}).adapter;
const r9 = await hydrateDispatchIntelligence(corruptAdapter);
check('corrupt override node → keeps only valid objects (1)', r9.hydrated === true && getOverrideLogs().length === 1);
check('corrupt capacity node → keeps only valid snapshots (1)', getSnapshotHistory().length === 1);
check('array-form recommendations re-keyed by requestId', getRequestRecommendation('rr1')?.dispatchScore === 70);

/* ── 10: Firebase unavailable ────────────────────────────────────────── */
console.log('\n[firebase unavailable]');
resetDispatchIntelligence(); _resetDispatchIntelligencePersistence();
const downAdapter = { isConfigured: () => false, fetchData: async () => { throw new Error('down'); }, storeData: async () => { throw new Error('down'); } };
const r10 = await hydrateDispatchIntelligence(downAdapter);
check('unconfigured → hydrate returns not-configured, store untouched', r10.hydrated === false && r10.reason === 'not-configured');
check('unconfigured → write-through disabled (returns false)', initDispatchIntelligencePersistence(downAdapter) === false);
// store still fully operational on memory
saveOverrideLog(freshOverrideRecord('Andi', 'Innova', 'Andi', 'Innova'));
check('store keeps working in memory when Firebase is down', getOverrideLogs().length === 1);
// a throwing storeData must not bubble out of write-through
resetDispatchIntelligence(); _resetDispatchIntelligencePersistence();
const throwAdapter = { isConfigured: () => true, fetchData: async () => ({}), storeData: () => { throw new Error('write boom'); } };
initDispatchIntelligencePersistence(throwAdapter);
let threw = false;
try { saveOverrideLog(freshOverrideRecord('Andi', 'Innova', 'Andi', 'Innova')); } catch { threw = true; }
check('throwing storeData is swallowed (never blocks the store write)', threw === false && getOverrideLogs().length === 1);
// a rejecting (async) storeData is also swallowed
resetDispatchIntelligence(); _resetDispatchIntelligencePersistence();
const rejectAdapter = { isConfigured: () => true, fetchData: async () => ({}), storeData: async () => { throw new Error('reject boom'); } };
initDispatchIntelligencePersistence(rejectAdapter);
saveOverrideLog(freshOverrideRecord('Andi', 'Innova', 'Andi', 'Innova'));
check('rejecting storeData does not throw synchronously', getOverrideLogs().length === 1);

/* ── 11: analytics consistency across a reload ───────────────────────── */
console.log('\n[analytics consistency]');
resetDispatchIntelligence(); _resetDispatchIntelligencePersistence();
({ db, adapter } = makeFakeDb());
initDispatchIntelligencePersistence(adapter);
// Andi recommended 3×, kept 2× → 67%. Innova recommended 3×, kept 3× → 100%.
saveOverrideLog(freshOverrideRecord('Andi', 'Innova', 'Andi', 'Innova'));
saveOverrideLog(freshOverrideRecord('Andi', 'Innova', 'Andi', 'Innova'));
saveOverrideLog(freshOverrideRecord('Andi', 'Innova', 'Budi', 'Innova', 'swap'));
const before = { stats: getOverrideStats(), andi: getDriverAccuracy('Andi'), innova: getVehicleAccuracy('Innova') };
_resetDispatchIntelligencePersistence(); resetDispatchIntelligence();
await hydrateDispatchIntelligence(adapter);
const after = { stats: getOverrideStats(), andi: getDriverAccuracy('Andi'), innova: getVehicleAccuracy('Innova') };
check('getOverrideStats identical after reload', JSON.stringify(before.stats) === JSON.stringify(after.stats) && after.stats.total === 3 && after.stats.accepted === 2);
check('getDriverAccuracy(Andi) identical after reload (67%)', JSON.stringify(before.andi) === JSON.stringify(after.andi) && after.andi.accuracy === 67);
check('getVehicleAccuracy(Innova) identical after reload (100%)', JSON.stringify(before.innova) === JSON.stringify(after.innova) && after.innova.accuracy === 100);

/* ── Paths sanity ────────────────────────────────────────────────────── */
console.log('\n[rtdb layout]');
check('paths under dispatchIntelligence/ root',
  DI_PATHS.overrideLogs === `${DISPATCH_INTELLIGENCE_ROOT}/overrideLogs`
  && DI_PATHS.requestRecommendations === `${DISPATCH_INTELLIGENCE_ROOT}/requestRecommendations`
  && DI_PATHS.capacityHistory === `${DISPATCH_INTELLIGENCE_ROOT}/capacityHistory`);

_resetDispatchIntelligencePersistence();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
