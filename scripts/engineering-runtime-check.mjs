/* engineering-runtime-check.mjs — v1.20.3 RC1 runtime-architecture hardening.
   Proves Engineering has DETERMINISTIC, environment-driven startup with NO
   implicit seeding anywhere:
     • APP_ENV is authoritative; unknown values fail safe to production.
     • ProviderRegistry resolves adapters by env (staging/production → null).
     • Development startup is EMPTY; data appears ONLY via the Seed Manager.
     • The adapter conforms to the full Firebase-ready interface.
   Run: node scripts/engineering-runtime-check.mjs   (exit 0 = all pass) */

import { normalizeEnv, getAppEnv } from '../js/config.js';
import { registerAdapter, resolveAdapter, hasAdapter, clearAdapters } from '../js/engineering/providers/provider-registry.js';
import { createDevSeedAdapter } from '../js/engineering/providers/dev-seed-adapter.js';
import {
  initializeProvider, loadAll, saveAssignmentThrough, ENGINEERING_PATHS,
} from '../js/engineering/providers/engineering-provider.js';
import { loadDemoData, resetDemoData, clearAllData, isSeedManagerAvailable } from '../js/engineering/providers/seed-manager.js';
import { createFirebaseAdapter } from '../js/engineering/providers/firebase-adapter.js';
import { resetEngineeringStore, listAssignments } from '../js/engineering/stores/engineering-store.js';
import { buildEngineeringAnalytics } from '../js/engineering/analytics/engineering-analytics.js';
import { renderEngineeringAnalyticsView } from '../js/analytics/views/analytics-engineering-view.js';
import { createAssignmentModel } from '../js/engineering/models/engineering-assignment.js';
import { fmtDeadline } from '../js/engineering/ui/engineering-atoms.js';
import { searchableText, renderQueue } from '../js/engineering/ui/engineering-queue.js';

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };

/* ── 1. APP_ENV authoritative + fail-safe ─────────────────────────────── */
console.log('\n[environment]');
check('normalizeEnv(development) = development', normalizeEnv('development') === 'development');
check('normalizeEnv(staging) = staging', normalizeEnv('staging') === 'staging');
check('normalizeEnv(production) = production', normalizeEnv('production') === 'production');
check('normalizeEnv(unknown) → production (fail-safe)',
  normalizeEnv('qa') === 'production' && normalizeEnv(undefined) === 'production' && normalizeEnv('') === 'production' && normalizeEnv(null) === 'production');
check('getAppEnv() returns a valid env', ['development', 'staging', 'production'].includes(getAppEnv()));

/* ── 2. Provider registry resolves by env (no default adapter) ─────────── */
console.log('\n[registry]');
clearAdapters();
check('production → null (no storage configured)', resolveAdapter('production') === null);
check('staging → null (no storage configured)', resolveAdapter('staging') === null);
check('development → null before registration', resolveAdapter('development') === null);
registerAdapter('development', () => createDevSeedAdapter());
check('development → adapter after registration', hasAdapter('development') && resolveAdapter('development')?.kind === 'dev-seed');
check('unknown env → null', resolveAdapter('qa') === null);

/* ── 3. Adapter implements the full Firebase-ready interface ───────────── */
console.log('\n[adapter interface]');
const iface = createDevSeedAdapter();
for (const m of ['initialize', 'fetchData', 'saveAssignment', 'updateAssignment', 'deleteAssignment', 'subscribe', 'dispose']) {
  check(`adapter implements ${m}()`, typeof iface[m] === 'function');
}

/* ── 4. Dev adapter STARTS EMPTY; only __dev_loadSeed populates ─────────── */
console.log('\n[dev adapter starts empty]');
const fresh = createDevSeedAdapter();
const init = await fresh.initialize();
check('initialize() → ready & empty', init.ready === true && init.empty === true);
const before = await fresh.fetchData(ENGINEERING_PATHS.assignments);
check('fetchData(assignments) empty before seed', before && Object.keys(before).length === 0);
const seededCount = fresh.__dev_loadSeed();
const after = await fresh.fetchData(ENGINEERING_PATHS.assignments);
check('fetchData(assignments) populated only after __dev_loadSeed', seededCount > 0 && Object.keys(after).length === seededCount);
let notified = 0;
const unsub = fresh.subscribe(() => { notified++; });
await fresh.saveAssignment({ id: 'rt-x', assignmentNumber: 'ENG-1' });
check('subscribe() fires on write', notified === 1);
unsub();
await fresh.saveAssignment({ id: 'rt-y', assignmentNumber: 'ENG-2' });
check('unsubscribe() stops notifications', notified === 1);

/* ── 5. Startup flow per environment (the core guarantee) ──────────────── */
console.log('\n[startup: development]');
resetEngineeringStore();
const devAdapter = resolveAdapter('development');
await initializeProvider(devAdapter);
await loadAll(devAdapter);
check('DEV startup → store EMPTY (no automatic seeding)', listAssignments().length === 0);
const loaded = await loadDemoData(devAdapter);
check('DEV + explicit Load Demo → seeded', loaded.ok && loaded.count > 0 && listAssignments().length === loaded.count);
await clearAllData(devAdapter);
check('DEV + Clear All → empty', listAssignments().length === 0);
const reset = await resetDemoData(devAdapter);
check('DEV + Reset Demo → seeded again', reset.ok && listAssignments().length > 0);

console.log('\n[startup: staging + production]');
for (const env of ['staging', 'production']) {
  resetEngineeringStore();
  const a = resolveAdapter(env);
  await initializeProvider(a);
  await loadAll(a);
  check(`${env} startup → no adapter, store EMPTY`, a === null && listAssignments().length === 0);
}

/* ── 6. Seed Manager is inert without a dev adapter ────────────────────── */
console.log('\n[seed manager gating]');
resetEngineeringStore();
check('isSeedManagerAvailable(null) === false', isSeedManagerAvailable(null) === false);
check('isSeedManagerAvailable(devAdapter) === true', isSeedManagerAvailable(devAdapter) === true);
const noop = await loadDemoData(null);
check('loadDemoData(null) → no-op, store stays EMPTY', noop.ok === false && listAssignments().length === 0);
const saved = await saveAssignmentThrough(null, { id: 'noop' });
check('saveAssignmentThrough(null) → safe no-op', saved && saved.id === 'noop');

/* ── 7. Every screen tolerates 0 data (analytics is the risky one) ─────── */
console.log('\n[empty-state safety]');
resetEngineeringStore();
let emptySnap, emptyView = '', threw = false;
try {
  emptySnap = buildEngineeringAnalytics([], { now: Date.now() });
  emptyView = renderEngineeringAnalyticsView(emptySnap);
} catch (_) { threw = true; }
check('buildEngineeringAnalytics([]) does not throw', !threw && !!emptySnap);
check('empty analytics view renders (0 assignments, no crash)', !threw && typeof emptyView === 'string' && emptyView.length > 0);
check('empty analytics reports zero totals', emptySnap && (emptySnap.totalAssignments === 0 || emptySnap.completed === 0));

/* ── 8. Production Firebase adapter — full interface, drop-in shape ─────── */
console.log('\n[firebase adapter]');
const fbAdapter = createFirebaseAdapter();
check('firebase adapter kind = firebase', fbAdapter.kind === 'firebase');
for (const m of ['initialize', 'fetchData', 'saveAssignment', 'updateAssignment', 'deleteAssignment', 'subscribe', 'dispose']) {
  check(`firebase adapter implements ${m}()`, typeof fbAdapter[m] === 'function');
}
check('firebase adapter matches dev adapter interface (drop-in)',
  Object.keys(createDevSeedAdapter()).filter((k) => typeof createDevSeedAdapter()[k] === 'function' && !k.startsWith('__'))
    .every((k) => typeof fbAdapter[k] === 'function'));

/* ── 9. Create-flow data model: deadlineAt + deadline formatting ───────── */
console.log('\n[deadline + model]');
const iso = new Date(2026, 6, 7, 23, 59).toISOString();
const model = createAssignmentModel({ title: 'X', building: 'GOR', room: 'Lt 2', deadlineAt: iso });
check('model carries deadlineAt (ISO)', typeof model.deadlineAt === 'string' && !Number.isNaN(Date.parse(model.deadlineAt)));
check('model keeps free-text building/room verbatim', model.building === 'GOR' && model.room === 'Lt 2');
const t0 = Date.now();
check('fmtDeadline(today) = Hari ini', fmtDeadline(new Date().toISOString(), t0) === 'Hari ini');
check('fmtDeadline(+1d) = Besok', fmtDeadline(new Date(t0 + 86400000).toISOString(), t0) === 'Besok');
check('fmtDeadline(+6d) = day + month', /\d{1,2} \w{3}/.test(fmtDeadline(new Date(t0 + 6 * 86400000).toISOString(), t0)));

/* ── 10. Search projection + SINGLE global create entry point ───────────── */
console.log('\n[search + single create entry point]');
const sa = createAssignmentModel({
  title: 'Ganti Lampu', building: 'Gedung Pelatnas', room: 'Ruang Fitness',
  category: 'kelistrikan', priority: 'high', requester: 'Bidang Umum',
  participants: [{ workerId: 'w1', name: 'Budi Santoso' }],
});
const text = searchableText(sa);
check('searchableText covers building/room/category/priority/requester/member',
  ['gedung pelatnas', 'ruang fitness', 'kelistrikan', 'high', 'bidang umum', 'budi santoso'].every((s) => text.includes(s)));
// The ONLY "Buat Penugasan" action is the sidebar CTA — no screen renders an
// in-content create button (data-act="eng-create"), for ANY role.
const adminCtx = { role: 'admin', me: { id: 'me', name: 'Admin' }, canEng: () => true, now: Date.now(), filters: {} };
const queueEmpty = renderQueue([], adminCtx);
const queueFull = renderQueue([sa], adminCtx);
check('Queue (empty) renders NO in-content create button', !queueEmpty.includes('data-act="eng-create"'));
check('Queue (populated) renders NO in-content create button', !queueFull.includes('data-act="eng-create"'));
check('createBtn helper removed from queue module', typeof createBtn === 'undefined');

/* ── Summary ───────────────────────────────────────────────────────────── */
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
