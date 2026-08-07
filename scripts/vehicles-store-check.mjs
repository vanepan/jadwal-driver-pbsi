/* vehicles-store-check.mjs — validates js/vehicles-store.js (v1.29.13 Refresh
   Consistency). Run: node scripts/vehicles-store-check.mjs   (exit 0 = all pass)

   FIRST direct test coverage for this file. js/vehicles-store.js imports
   js/firebase.js, which imports the real Firebase SDK from
   https://www.gstatic.com/... at module scope — unresolvable by Node's
   default ESM loader, and even if it resolved, isFirebaseConfigured() is
   hardcoded true in this app, so every write would hit the REAL PRODUCTION
   database. This script registers a Node module-customization-hook loader
   (scripts/lib/firebase-stubs/loader.mjs) BEFORE importing the store, which
   redirects just the 5 gstatic.com SDK specifiers to local in-memory stubs
   (scripts/lib/firebase-stubs/) — js/firebase.js and js/vehicles-store.js
   load completely unmodified; only the external SDK boundary is faked.
   See scripts/lib/firebase-stubs/README.md for the full rationale.

   Covers: every mutating export (create/update/deactivate/reactivate/
   archive/restore/delete vehicle, odometer, add/update/delete maintenance,
   add compliance) with TIMING assertions proving the write's own promise and
   its registerVehiclesChangeListener notification are now consistently
   resolved together (the v1.29.13 fix) — not "cache updated but listener
   waits for the echo" (pre-fix ledger-writer bug) and not "nothing updates
   until the echo, ever" (pre-fix identity-writer bug). The fake SDK
   deliberately delays its realtime "echo" to a macrotask (see
   firebase-database.js) specifically so a writer that forgot to refresh
   locally would FAIL these assertions instead of accidentally passing. */

import { register } from 'node:module';
register('./lib/firebase-stubs/loader.mjs', import.meta.url);

const store = await import('../js/vehicles-store.js');
const { __resetFakeDatabase, __inspectFakeDatabaseRoot } =
  await import('./lib/firebase-stubs/firebase-database.js');

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}
function tick(ms = 10) { return new Promise((r) => setTimeout(r, ms)); }

__resetFakeDatabase();

const listenerCalls = [];
store.registerVehiclesChangeListener((vs) => listenerCalls.push(vs));

/* ── Boot ──────────────────────────────────────────────────────────────── */
console.log('\n[boot]');
await store.initVehiclesStore();
await tick(20); // let the initial subscribe-fire settle before measuring writer deltas
const bootCount = listenerCalls.length;
check('seeds 4 default vehicles', store.getVehicles().length === 4);
check('listener fired at least once during boot', bootCount >= 1);

/* ── createVehicle (identity writer) ─────────────────────────────────────
   Pre-fix: this branch never called refreshVehiclesCache at all when
   Firebase was configured — both getVehicles() AND the listener were stale
   until the echo landed. */
console.log('\n[createVehicle]');
{
  const before = listenerCalls.length;
  const created = await store.createVehicle({ name: 'Test Car', capacity: 4, type: 'mobil' });
  check('resolves with the created vehicle', created && created.name === 'Test Car' && !!created.id);
  check('getVehicles() reflects it IMMEDIATELY after resolving (no extra tick)',
    store.getVehicles().some((v) => v.id === created.id));
  check('listener fired by the time the write resolved (no extra tick)',
    listenerCalls.length > before);
  check('the listener’s payload already includes the new vehicle',
    listenerCalls[listenerCalls.length - 1].some((v) => v.id === created.id));
  globalThis.__testCarId = created.id;
}

/* ── updateVehicle (identity writer) ─────────────────────────────────── */
console.log('\n[updateVehicle]');
{
  const id = globalThis.__testCarId;
  const before = listenerCalls.length;
  const updated = await store.updateVehicle(id, { name: 'Test Car Updated', capacity: 6 });
  check('resolves with the updated fields', updated.name === 'Test Car Updated' && updated.capacity === 6);
  check('getVehicles() reflects it immediately',
    store.getVehicleById(id).name === 'Test Car Updated' && store.getVehicleById(id).capacity === 6);
  check('listener fired by the time the write resolved', listenerCalls.length > before);
}

/* ── deactivateVehicle / reactivateVehicle (status writers) ────────────── */
console.log('\n[deactivateVehicle / reactivateVehicle]');
{
  const id = globalThis.__testCarId;
  let before = listenerCalls.length;
  await store.deactivateVehicle(id);
  check('deactivate: getVehicleById reflects inactive immediately',
    store.getVehicleById(id).active === false && store.getVehicleById(id).status === 'inactive');
  check('deactivate: listener fired by the time the write resolved', listenerCalls.length > before);

  before = listenerCalls.length;
  await store.reactivateVehicle(id);
  check('reactivate: getVehicleById reflects active immediately',
    store.getVehicleById(id).active === true && store.getVehicleById(id).status === 'active');
  check('reactivate: listener fired by the time the write resolved', listenerCalls.length > before);
}

/* ── archiveVehicle / restoreVehicle (lifecycle writers) ────────────────── */
console.log('\n[archiveVehicle / restoreVehicle]');
{
  const id = globalThis.__testCarId;
  let before = listenerCalls.length;
  await store.archiveVehicle(id);
  check('archive: getVehicleById reflects archived immediately', store.getVehicleById(id).archived === true);
  check('archive: listener fired by the time the write resolved', listenerCalls.length > before);

  before = listenerCalls.length;
  await store.restoreVehicle(id);
  check('restore: getVehicleById reflects un-archived immediately', store.getVehicleById(id).archived === false);
  check('restore: listener fired by the time the write resolved', listenerCalls.length > before);
}

/* ── updateVehicleOdometer (single-field writer) ─────────────────────── */
console.log('\n[updateVehicleOdometer]');
{
  const id = globalThis.__testCarId;
  const before = listenerCalls.length;
  await store.updateVehicleOdometer(id, 12345);
  check('getVehicleById reflects the new odometer immediately', store.getVehicleById(id).odometer === '12345');
  check('listener fired by the time the write resolved', listenerCalls.length > before);
}

/* ── Maintenance ledger writers ───────────────────────────────────────────
   Pre-fix: these mutated the cached object in place BEFORE the Firebase
   await (so getVehicles() looked fine already) but never fired listeners in
   the online branch — the exact opposite half of the same inconsistency. */
console.log('\n[addMaintenanceRecord / updateMaintenanceRecord / deleteMaintenanceRecord]');
{
  const id = globalThis.__testCarId;
  let before = listenerCalls.length;
  const rec = await store.addMaintenanceRecord(id, { type: 'preventive', status: 'completed', date: '2026-06-01', category: 'servis_rutin' });
  check('addMaintenanceRecord resolves with an id', !!rec.id);
  check('getMaintenanceRecords reflects it immediately', store.getMaintenanceRecords(id).some((r) => r.id === rec.id));
  check('listener fired by the time the write resolved (was MISSING pre-fix)', listenerCalls.length > before);
  check('listener payload already carries the new maintenance record',
    listenerCalls[listenerCalls.length - 1].find((v) => v.id === id).maintenanceRecords.some((r) => r.id === rec.id));

  before = listenerCalls.length;
  const upd = await store.updateMaintenanceRecord(id, rec.id, { status: 'completed', notes: 'checked' });
  check('updateMaintenanceRecord resolves with the merged record', upd.notes === 'checked' && upd.id === rec.id);
  check('getMaintenanceRecords reflects the update immediately',
    store.getMaintenanceRecords(id).find((r) => r.id === rec.id).notes === 'checked');
  check('listener fired by the time the write resolved (was MISSING pre-fix)', listenerCalls.length > before);

  before = listenerCalls.length;
  await store.deleteMaintenanceRecord(id, rec.id);
  check('getMaintenanceRecords no longer includes the deleted record, immediately',
    !store.getMaintenanceRecords(id).some((r) => r.id === rec.id));
  check('listener fired by the time the write resolved (was MISSING pre-fix)', listenerCalls.length > before);
}

/* ── addComplianceRecord (ledger writer, same class as maintenance) ─────── */
console.log('\n[addComplianceRecord]');
{
  const id = globalThis.__testCarId;
  const before = listenerCalls.length;
  const rec = await store.addComplianceRecord(id, {
    type: 'annual_tax', renewalDate: '2026-06-01', expiryDate: '2027-06-01', amount: 500000,
  });
  check('addComplianceRecord resolves with an id', !!rec.id);
  check('getComplianceHistory reflects it immediately', store.getComplianceHistory(id).some((r) => r.id === rec.id));
  check('stnkExpiry mirror recomputed immediately', store.getVehicleById(id).stnkExpiry === '2027-06-01');
  check('listener fired by the time the write resolved (was MISSING pre-fix)', listenerCalls.length > before);
  check('listener payload already carries the recomputed mirror field',
    listenerCalls[listenerCalls.length - 1].find((v) => v.id === id).stnkExpiry === '2027-06-01');
}

/* ── addComplianceRecord — Insurance Ledger (Phase 5, v1.29.16) ───────────
   Insurance reuses the SAME complianceHistory ledger/writer as Tax (no new
   store function, no new Firebase path) — only asserting the new type is
   accepted and mirrors into its OWN field (insuranceExpiry), independently
   of stnkExpiry/annualTaxDue/fiveYearTaxDue. */
console.log('\n[addComplianceRecord — insurance]');
{
  const id = globalThis.__testCarId;
  const stnkExpiryBefore = store.getVehicleById(id).stnkExpiry;
  const before = listenerCalls.length;
  const rec = await store.addComplianceRecord(id, {
    type: 'insurance', renewalDate: '2026-06-10', expiryDate: '2027-06-10', amount: 1200000,
  });
  check('addComplianceRecord accepts type:"insurance" and resolves with an id', !!rec.id);
  check('getComplianceHistory reflects it immediately', store.getComplianceHistory(id).some((r) => r.id === rec.id && r.type === 'insurance'));
  check('insuranceExpiry mirror recomputed immediately', store.getVehicleById(id).insuranceExpiry === '2027-06-10');
  check('stnkExpiry mirror is untouched by an insurance renewal (independent fields)',
    store.getVehicleById(id).stnkExpiry === stnkExpiryBefore);
  check('listener fired by the time the write resolved', listenerCalls.length > before);
  check('listener payload already carries the recomputed insurance mirror field',
    listenerCalls[listenerCalls.length - 1].find((v) => v.id === id).insuranceExpiry === '2027-06-10');

  // A later, earlier-dated STNK renewal must not disturb the already-recomputed
  // insuranceExpiry mirror (per-type latest-by-expiryDate, not last-write-wins).
  await store.addComplianceRecord(id, { type: 'annual_tax', renewalDate: '2026-07-01', expiryDate: '2027-07-01', amount: 600000 });
  check('a subsequent Tax renewal does not disturb the insurance mirror (regression)',
    store.getVehicleById(id).insuranceExpiry === '2027-06-10');
}

/* ── addComplianceRecord — five_year_tax + cross-type STNK precedence ────
   recomputeComplianceMirror() (js/vehicles-store.js) derives stnkExpiry/
   annualTaxDue from whichever of annual_tax/five_year_tax has the LATER
   expiryDate — not "annual_tax always wins" and not "last write wins". This
   branch had zero coverage: every prior test in this file only ever wrote
   ONE of the two tax types, so the cross-type max-by-expiry comparison
   (js/vehicles-store.js recomputeComplianceMirror, the `stnkCandidates`
   reduce) never actually ran with both types present. */
console.log('\n[addComplianceRecord — five_year_tax + cross-type STNK precedence]');
{
  const id = globalThis.__testCarId;
  // Current state entering this block: annual_tax expiry = 2027-07-01 (from
  // the insurance block above), no five_year_tax record yet.
  const rec = await store.addComplianceRecord(id, {
    type: 'five_year_tax', renewalDate: '2026-08-01', expiryDate: '2029-01-01', amount: 900000,
  });
  check('addComplianceRecord accepts type:"five_year_tax" and resolves with an id', !!rec.id);
  check('fiveYearTaxDue mirror recomputed immediately', store.getVehicleById(id).fiveYearTaxDue === '2029-01-01');
  check('a later-expiring five_year_tax record wins the STNK mirror over the earlier annual_tax one',
    store.getVehicleById(id).stnkExpiry === '2029-01-01' && store.getVehicleById(id).annualTaxDue === '2029-01-01');

  // A NEW annual_tax renewal that expires BEFORE the five_year_tax record
  // must not steal the STNK mirror back — proves max-by-expiry, not
  // last-write-wins, exactly the assumption a naive refactor could break.
  await store.addComplianceRecord(id, { type: 'annual_tax', renewalDate: '2026-08-15', expiryDate: '2027-12-01', amount: 650000 });
  check('an earlier-expiring annual_tax renewal does NOT steal the STNK mirror back (max-by-expiry, not last-write-wins)',
    store.getVehicleById(id).stnkExpiry === '2029-01-01');
  check('fiveYearTaxDue is untouched by the new annual_tax renewal (per-type independence)',
    store.getVehicleById(id).fiveYearTaxDue === '2029-01-01');
}

/* ── deleteVehicle (identity writer, requires archived first) ───────────── */
console.log('\n[deleteVehicle]');
{
  const id = globalThis.__testCarId;
  await store.archiveVehicle(id);
  const before = listenerCalls.length;
  await store.deleteVehicle(id);
  check('getVehicleById returns null immediately', store.getVehicleById(id) === null);
  check('listener fired by the time the write resolved', listenerCalls.length > before);
  check('listener payload no longer includes the deleted vehicle',
    !listenerCalls[listenerCalls.length - 1].some((v) => v.id === id));
}

/* ── Unified path sanity: the later echo is idempotent, not corrupting ─── */
console.log('\n[echo idempotency]');
{
  const before = listenerCalls.length;
  const created = await store.createVehicle({ name: 'Echo Check', capacity: 4 });
  const countRightAfterAwait = listenerCalls.length;
  await tick(30); // let the fake SDK's delayed echo (setTimeout) land
  check('a later echo does not remove or duplicate the vehicle',
    store.getVehicles().filter((v) => v.id === created.id).length === 1);
  check('a later echo still leaves exactly one instance in the last listener payload',
    listenerCalls[listenerCalls.length - 1].filter((v) => v.id === created.id).length === 1);
  check('the echo fires an additional (harmless) notification after the immediate one',
    listenerCalls.length > countRightAfterAwait && countRightAfterAwait > before);
}

/* ── Business rules unchanged (spot check — not a refresh concern) ──────── */
console.log('\n[business rules unchanged]');
{
  let threw = false;
  try { await store.createVehicle({ name: '', capacity: 4 }); } catch { threw = true; }
  check('empty name still rejected', threw);

  threw = false;
  try { await store.createVehicle({ name: 'X', capacity: 0 }); } catch { threw = true; }
  check('non-positive capacity still rejected', threw);

  const dup = await store.createVehicle({ name: 'Dup1', plateNumber: 'B 1234 XY', capacity: 4 });
  threw = false;
  try { await store.createVehicle({ name: 'Dup2', plateNumber: 'b1234xy', capacity: 4 }); } catch { threw = true; }
  check('duplicate plate (normalized) still rejected', threw);
  await store.archiveVehicle(dup.id);
  await store.deleteVehicle(dup.id);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
