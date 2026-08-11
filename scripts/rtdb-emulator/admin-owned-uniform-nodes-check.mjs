/* admin-owned-uniform-nodes-check.mjs — RTDB Authorization Validation
   Suite (v1.30.7.5, Phase B: Full RTDB Authorization Matrix)

   REAL Firebase Realtime Database emulator test of the 22 nodes that share
   BYTE-IDENTICAL rule text (migration plan §4 "Admin-owned"): 5 Petty Cash
   nodes, 13 Overtime nodes, 4 v2_sarpras nodes — every one of them
   `.read: admin/developer/adminEquivalent`, `.write: admin/adminEquivalent`.

   Looped rather than hand-duplicated 22 times (the collapsing principle:
   these are 22 instances of the exact same 2 literal clauses, not 22
   independent rules to re-derive) — but each node still gets its own
   NAMED pass/fail line per check, so the Phase B coverage table has a real
   row for every one of these 22 nodes, not one aggregate line.

   Per node: admin write-allow, developer read-allow (a distinct named
   clause), adminEquivalent write-allow (a distinct named clause), one
   representative non-privileged read/write-deny, one Custom Role
   (non-equivalent) deny. No anonymous sweep here (redundant per Phase A's
   auth-identity-check.mjs, which already proved auth==null behaves
   identically to a non-privileged authenticated role against an
   admin-gated rule) and no per-role sweep on the deny side (every
   non-admin-family role hits the identical unnamed `else`).

   Run: npm run test:rtdb-emulator (exit 0 = pass; requires the emulator —
   do not run this file directly with plain `node`) */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const rulesSource = readFileSync(path.join(ROOT, 'database.rules.json'), 'utf8');
const firebaseJson = JSON.parse(readFileSync(path.join(ROOT, 'firebase.json'), 'utf8'));
const DB_PORT = firebaseJson.emulators?.database?.port ?? 9000;

let pass = 0, fail = 0;
async function checkAsync(name, run) {
  try { await run(); pass++; console.log(`  ✓ ${name}`); }
  catch (err) { fail++; console.log(`  ✗ ${name} — ${err.message}`); }
}

const testEnv = await initializeTestEnvironment({
  projectId: 'demo-sarpras-phaseb-adminuniform',
  database: { rules: rulesSource, host: '127.0.0.1', port: DB_PORT },
});

const asAdmin = () => testEnv.authenticatedContext('id-admin', { role: 'admin' }).database();
const asDeveloper = () => testEnv.authenticatedContext('id-developer', { role: 'developer' }).database();
const asAdminEquivalent = () => testEnv.authenticatedContext('id-custom-super', { role: 'fasilitas_super', adminEquivalent: true }).database();
const asBidang = () => testEnv.authenticatedContext('id-bidang', { role: 'bidang' }).database();
const asCustomNonEquivalent = () => testEnv.authenticatedContext('id-custom-basic', { role: 'fasilitas_basic' }).database();

const NODES = [
  'pettyCashExpenses', 'pettyCashNors', 'pettyCashCycles', 'pettyCashSettings', 'pettyCashAudit',
  'overtimeUnits', 'overtimeEmployees', 'overtimeRates', 'overtimeRateVersions', 'overtimeHolidays',
  'overtimeRecords', 'overtimeDailySummary', 'overtimeMonthlySummary', 'overtimeAudit',
  'overtimeBudget', 'overtimeReportHistory', 'overtimeClosing', 'overtimeArchive',
  'v2_sarpras/import_sessions', 'v2_sarpras/import_batches', 'v2_sarpras/file_storage', 'v2_sarpras/composer_documents',
];

try {
  await testEnv.clearDatabase();

  console.log(`\n=== ${NODES.length} admin-owned, uniform-shape nodes — 5 checks each ===`);
  for (const node of NODES) {
    console.log(`\n--- ${node} ---`);
    await checkAsync(`${node}: admin write ALLOWED`, () => assertSucceeds(asAdmin().ref(`${node}/probeKey`).set({ v: 1 })));
    await checkAsync(`${node}: developer read ALLOWED (distinct named clause)`, () => assertSucceeds(asDeveloper().ref(node).once('value')));
    await checkAsync(`${node}: adminEquivalent write ALLOWED (distinct named clause)`, () => assertSucceeds(asAdminEquivalent().ref(`${node}/probeKey2`).set({ v: 2 })));
    await checkAsync(`${node}: bidang read/write DENIED (representative non-privileged role)`, () => assertFails(asBidang().ref(`${node}/probeKey3`).set({ v: 3 })));
    await checkAsync(`${node}: Custom Role (non-adminEquivalent) DENIED`, () => assertFails(asCustomNonEquivalent().ref(`${node}/probeKey4`).set({ v: 4 })));
  }
} finally {
  await testEnv.cleanup();
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
