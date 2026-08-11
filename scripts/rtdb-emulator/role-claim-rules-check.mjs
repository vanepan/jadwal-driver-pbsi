/* role-claim-rules-check.mjs — RTDB Authorization Validation Suite
   (v1.30.7.1, Phase A: Emulator Harness Foundation)

   REAL Firebase Realtime Database emulator test. Where
   auth-identity-check.mjs proves the harness differentiates every claims
   shape at all, this file proves role/adminEquivalent rule behavior on a
   representative cross-section of the SIMPLE role-gated nodes: drivers,
   settings, vehicles (all three share the same "auth != null read /
   admin-or-adminEquivalent write" or close variant shape), plus
   users/$username — the one node in this slice that uses the
   auth.uid-based self-access branch, load-bearing for Phase C's future
   ownership rules on assignments/driver_requests (validated once here, on
   the simplest node that exercises it). The full ~25-node matrix,
   including the ownership-rule nodes themselves, is Phase B/C's job.

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
  projectId: 'demo-sarpras-phasea-roles',
  database: { rules: rulesSource, host: '127.0.0.1', port: DB_PORT },
});

const asAdmin = () => testEnv.authenticatedContext('id-admin', { role: 'admin' }).database();
const asAdminEquivalent = () => testEnv.authenticatedContext('id-custom-super', { role: 'fasilitas_super', adminEquivalent: true }).database();
const asBidang = () => testEnv.authenticatedContext('id-bidang', { role: 'bidang' }).database();
const asDriver = () => testEnv.authenticatedContext('id-driver', { role: 'driver' }).database();
const asViewer = () => testEnv.authenticatedContext('id-viewer', { role: 'viewer' }).database();
const asDeveloper = () => testEnv.authenticatedContext('id-developer', { role: 'developer' }).database();
const asAnon = () => testEnv.unauthenticatedContext().database();

try {
  await testEnv.clearDatabase();

  console.log("\n=== drivers  (.read: \"auth != null\", .write: admin || adminEquivalent) ===");
  await checkAsync('unauthenticated -> drivers read DENIED', () => assertFails(asAnon().ref('drivers').once('value')));
  await checkAsync('driver role -> drivers read ALLOWED', () => assertSucceeds(asDriver().ref('drivers').once('value')));
  await checkAsync('bidang role -> drivers write DENIED', () => assertFails(asBidang().ref('drivers/x').set({ name: 'x' })));
  await checkAsync('admin -> drivers write ALLOWED', () => assertSucceeds(asAdmin().ref('drivers/x').set({ name: 'x' })));
  await checkAsync('adminEquivalent custom role -> drivers write ALLOWED', () => assertSucceeds(asAdminEquivalent().ref('drivers/y').set({ name: 'y' })));

  console.log("\n=== vehicles  (same shape as drivers — confirms the pattern generalizes, not a one-node fluke) ===");
  await checkAsync('viewer role -> vehicles read ALLOWED', () => assertSucceeds(asViewer().ref('vehicles').once('value')));
  await checkAsync('driver role -> vehicles write DENIED', () => assertFails(asDriver().ref('vehicles/z').set({ plate: 'Z' })));
  await checkAsync('admin -> vehicles write ALLOWED', () => assertSucceeds(asAdmin().ref('vehicles/z').set({ plate: 'Z' })));

  console.log("\n=== settings  (.read: admin || developer || adminEquivalent, .write: admin || adminEquivalent — read/write are NOT symmetric) ===");
  await checkAsync('viewer role -> settings read DENIED', () => assertFails(asViewer().ref('settings').once('value')));
  await checkAsync("'developer' claim -> settings read ALLOWED (developer is in the read clause)", () => assertSucceeds(asDeveloper().ref('settings').once('value')));
  await checkAsync("'developer' claim -> settings write DENIED (developer is NOT in the write clause — read/write asymmetry is real, not a copy-paste)", () => assertFails(asDeveloper().ref('settings/testKey').set(1)));
  await checkAsync('adminEquivalent custom role -> settings write ALLOWED', () => assertSucceeds(asAdminEquivalent().ref('settings/testKey').set(1)));

  console.log("\n=== users/$username  (auth.uid === $username, OR admin/adminEquivalent — the ownership branch this slice exists to validate) ===");
  const aliceDb = testEnv.authenticatedContext('alice', { role: 'driver' }).database();
  const bobDb = testEnv.authenticatedContext('bob', { role: 'driver' }).database();
  await checkAsync('alice -> reads her own users/alice record ALLOWED (auth.uid === $username)', () => assertSucceeds(aliceDb.ref('users/alice').once('value')));
  await checkAsync("alice -> reads bob's users/bob record DENIED (uid mismatch, no admin/adminEquivalent)", () => assertFails(aliceDb.ref('users/bob').once('value')));
  await checkAsync('admin -> reads any users/$username record ALLOWED regardless of uid', () => assertSucceeds(asAdmin().ref('users/bob').once('value')));
  await checkAsync('alice -> writes her own users/alice record ALLOWED', () => assertSucceeds(aliceDb.ref('users/alice/displayName').set('Alice')));
  await checkAsync("bob -> writes alice's users/alice record DENIED", () => assertFails(bobDb.ref('users/alice/displayName').set('Not Alice')));
} finally {
  await testEnv.cleanup();
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
