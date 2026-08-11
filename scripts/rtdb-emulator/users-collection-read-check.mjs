/* users-collection-read-check.mjs — v1.30.9.2 Production Incident Fix
   (RTDB Collection-Read Defect: "Manajemen User empty")

   REAL Firebase Realtime Database emulator test proving the actual
   production incident and its fix. js/users.js#ensureUsersLoadedAndSubscribed()
   calls subscribeNode('users', ...) — a subscription at the /users
   COLLECTION path itself, not at individual /users/$username children.
   Every prior suite (role-claim-rules-check.mjs, users-nodes-full-sweep-
   check.mjs) only ever exercised ref('users/$username') — a child-level
   read, which the /users/$username .read rule genuinely allows for
   admin/adminEquivalent/self. But Firebase RTDB evaluates a read request
   against the .read rule at the EXACT requested path and its ancestors
   ONLY; a .read rule that exists solely on a child ($username) never
   satisfies a read issued at the parent (users) path, regardless of role.
   With root .read: false and no .read on `users` itself, admin's own
   collection subscription was silently denied — reproduced directly below
   — which is the real root cause of the "Manajemen User empty" incident
   (see docs/RTDB_COLLECTION_READ_FIX_REPORT_v1.30.9.2.md).

   Fix: added a `.read` rule directly on `users` (a SIBLING of the
   pre-existing `$username` child block, which is untouched) restricted to
   admin/adminEquivalent ONLY — deliberately no self-branch at the
   collection level. Self access stays child-scoped to a user's own
   record; the collection lists every account and must not become
   broadly/self readable, which would let any authenticated user enumerate
   every other user's record — a real broadening this phase must not
   introduce.

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
  projectId: 'demo-sarpras-users-collection-read',
  database: { rules: rulesSource, host: '127.0.0.1', port: DB_PORT },
});

const asAdmin = () => testEnv.authenticatedContext('id-admin', { role: 'admin' }).database();
const asAdminEquivalent = () => testEnv.authenticatedContext('id-custom-super', { role: 'fasilitas_super', adminEquivalent: true }).database();
const asViewer = () => testEnv.authenticatedContext('id-viewer', { role: 'viewer' }).database();
const asBidang = () => testEnv.authenticatedContext('id-bidang', { role: 'bidang' }).database();
const asDriver = () => testEnv.authenticatedContext('id-driver', { role: 'driver' }).database();
const aliceDb = () => testEnv.authenticatedContext('alice', { role: 'driver' }).database();

try {
  await testEnv.clearDatabase();

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.database();
    await db.ref('users/alice').set({ username: 'alice', role: 'driver', active: true });
    await db.ref('users/bob').set({ username: 'bob', role: 'viewer', active: true });
  });

  console.log("\n=== users (COLLECTION-level read) — the exact path js/users.js#ensureUsersLoadedAndSubscribed() subscribes to; reproduces the production incident directly ===");
  await checkAsync('admin -> reads the /users COLLECTION ALLOWED (this is the incident + fix)', () => assertSucceeds(asAdmin().ref('users').once('value')));
  await checkAsync('adminEquivalent -> reads the /users COLLECTION ALLOWED', () => assertSucceeds(asAdminEquivalent().ref('users').once('value')));
  await checkAsync('admin -> collection read actually returns the seeded records (not just a permitted-but-empty read)', async () => {
    const snap = await asAdmin().ref('users').once('value');
    const val = snap.val();
    if (!val || !val.alice || !val.bob) throw new Error(`expected alice+bob in snapshot, got: ${JSON.stringify(val)}`);
  });
  await checkAsync('viewer -> reads the /users COLLECTION DENIED (no broadening — stays admin/adminEquivalent only)', () => assertFails(asViewer().ref('users').once('value')));
  await checkAsync('bidang -> reads the /users COLLECTION DENIED', () => assertFails(asBidang().ref('users').once('value')));
  await checkAsync('driver -> reads the /users COLLECTION DENIED', () => assertFails(asDriver().ref('users').once('value')));
  await checkAsync("alice (self) -> reads the /users COLLECTION DENIED (deliberate: self-access stays scoped to her OWN child record only, never the whole roster)", () => assertFails(aliceDb().ref('users').once('value')));
  await checkAsync('unauthenticated -> reads the /users COLLECTION DENIED', () => assertFails(testEnv.unauthenticatedContext().database().ref('users').once('value')));

  console.log("\n=== users/$username (CHILD-level read) — unchanged pre-existing behavior, re-asserted here so this file alone proves the fix did not touch it ===");
  await checkAsync('alice (self) -> reads her OWN users/alice CHILD record ALLOWED (unchanged)', () => assertSucceeds(aliceDb().ref('users/alice').once('value')));
  await checkAsync("alice -> reads bob's users/bob CHILD record DENIED (unchanged, cross-user)", () => assertFails(aliceDb().ref('users/bob').once('value')));
  await checkAsync('admin -> reads any users/$username CHILD record ALLOWED (unchanged)', () => assertSucceeds(asAdmin().ref('users/bob').once('value')));

  console.log("\n=== users/$username self-write escalation guard (v1.30.7.9) — unchanged, re-asserted here so this incident fix is proven NOT to have touched it ===");
  await checkAsync('alice (self) -> writing her own role to "admin" remains DENIED', () => assertFails(aliceDb().ref('users/alice/role').set('admin')));
  await checkAsync('alice (self) -> writing her own active flag remains DENIED', () => assertFails(aliceDb().ref('users/alice/active').set(false)));
  await checkAsync('alice (self) -> writing her own archived flag remains DENIED', () => assertFails(aliceDb().ref('users/alice/archived').set(true)));
  await checkAsync('alice (self) -> writing her own displayName (a permitted self field) remains ALLOWED', () => assertSucceeds(aliceDb().ref('users/alice/displayName').set('Alice Updated')));
} finally {
  await testEnv.cleanup();
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
