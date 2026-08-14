/* custom-roles-collection-read-check.mjs — v1.30.9.12
   customRoles Collection-Read Fix (gap reserved since v1.30.9.2, carried
   forward untouched through v1.30.9.4/.8/.11)

   REAL Firebase Realtime Database emulator test proving the actual
   defect and its fix, mirroring users-collection-read-check.mjs's
   (v1.30.9.2) exact discipline for the same class of bug.
   js/role-management/custom-roles-store.js#initCustomRolesStore() calls
   subscribeNode('customRoles', ...) — a subscription at the /customRoles
   COLLECTION path itself, never at individual /customRoles/$roleId
   children. Every prior suite (role-claim-rules-check.mjs,
   custom-role-archived-rule-check.mjs) only ever exercised
   ref('customRoles/$roleId') — a child-level read, which the $roleId
   .read rule genuinely allows. But Firebase RTDB evaluates a read
   request against the .read rule at the EXACT requested path and its
   ancestors ONLY; a .read rule that exists solely on a child ($roleId)
   never satisfies a read issued at the parent (customRoles) path,
   regardless of role. With root .read: false and (before this fix) no
   .read on `customRoles` itself, EVERY role's collection subscription —
   including admin's own — was silently denied. This is the real,
   reproducible root cause behind role-management-center.js and User
   Management's Manajemen User screen being unable to list Custom Roles
   at all, independent of any application-level bug.

   Fix: added a `.read` rule directly on `customRoles` (a SIBLING of the
   pre-existing `$roleId` child block, which is untouched) — admin/
   developer ONLY, deliberately narrower than this file's usual admin/
   developer/adminEquivalent-read convention used by its 22 sibling
   admin-owned nodes. Discovered empirically while writing THIS suite
   (the first draft included adminEquivalent and this file's own
   collection-level archived-visibility assertion caught the regression
   before it shipped): RTDB rules CASCADE DOWNWARD — a .read rule that
   evaluates true at a PARENT is granted immediately and short-circuits
   before any narrower CHILD rule is ever consulted, for BOTH a
   collection-level read AND, via the exact same cascade, any subsequent
   child-level read once a session holds a broader ancestor grant. The
   $roleId child rule deliberately excludes adminEquivalent from reading
   ARCHIVED records (only admin/developer bypass that check there); had
   this fix included adminEquivalent at the collection level, it would
   have silently widened that pre-existing, intentional boundary
   (custom-role-archived-rule-check.mjs already documents and tests it)
   rather than merely fixing the broken bulk read. admin/developer both
   ALREADY have unconditional (including-archived) child-level access, so
   granting them the same at the collection level adds no new privilege.

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
  projectId: 'demo-sarpras-customroles-collection-read',
  database: { rules: rulesSource, host: '127.0.0.1', port: DB_PORT },
});

const asAdmin = () => testEnv.authenticatedContext('id-admin', { role: 'admin' }).database();
const asDeveloper = () => testEnv.authenticatedContext('id-developer', { role: 'developer' }).database();
const asAdminEquivalent = () => testEnv.authenticatedContext('id-custom-super', { role: 'some_custom_role', adminEquivalent: true }).database();
const asViewer = () => testEnv.authenticatedContext('id-viewer', { role: 'viewer' }).database();
const asBidang = () => testEnv.authenticatedContext('id-bidang', { role: 'bidang' }).database();
const asDriver = () => testEnv.authenticatedContext('id-driver', { role: 'driver' }).database();

try {
  await testEnv.clearDatabase();

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.database();
    await db.ref('customRoles/roleActive').set({ name: 'Active Role', archived: false, permissions: ['some.permission'] });
    await db.ref('customRoles/roleArchived').set({ name: 'Archived Role', archived: true, permissions: ['other.permission'] });
  });

  console.log("\n=== customRoles (COLLECTION-level read) — the exact path custom-roles-store.js#initCustomRolesStore() subscribes to; reproduces the real defect directly ===");
  await checkAsync('admin -> reads the /customRoles COLLECTION ALLOWED (this is the fix)', () => assertSucceeds(asAdmin().ref('customRoles').once('value')));
  await checkAsync('developer -> reads the /customRoles COLLECTION ALLOWED', () => assertSucceeds(asDeveloper().ref('customRoles').once('value')));
  await checkAsync('admin -> collection read actually returns BOTH records, including the archived one (not just a permitted-but-empty/filtered read)', async () => {
    const snap = await asAdmin().ref('customRoles').once('value');
    const val = snap.val();
    if (!val || !val.roleActive || !val.roleArchived) throw new Error(`expected roleActive+roleArchived in snapshot, got: ${JSON.stringify(val)}`);
  });
  await checkAsync('adminEquivalent -> reads the /customRoles COLLECTION DENIED — the important negative case: this fix is deliberately admin/developer ONLY, since RTDB\'s downward rule cascade means a broader collection grant would otherwise silently expose archived Custom Role records to adminEquivalent, which the pre-existing $roleId child rule intentionally denies', () => assertFails(asAdminEquivalent().ref('customRoles').once('value')));
  await checkAsync('viewer -> reads the /customRoles COLLECTION DENIED (no broadening — stays admin/developer only)', () => assertFails(asViewer().ref('customRoles').once('value')));
  await checkAsync('bidang -> reads the /customRoles COLLECTION DENIED', () => assertFails(asBidang().ref('customRoles').once('value')));
  await checkAsync('driver -> reads the /customRoles COLLECTION DENIED', () => assertFails(asDriver().ref('customRoles').once('value')));
  await checkAsync('unauthenticated -> reads the /customRoles COLLECTION DENIED', () => assertFails(testEnv.unauthenticatedContext().database().ref('customRoles').once('value')));

  console.log("\n=== customRoles/$roleId (CHILD-level read) — unchanged pre-existing behavior, re-asserted here so this fix is proven NOT to have touched it ===");
  await checkAsync('viewer -> reads active (non-archived) custom role CHILD ALLOWED (unchanged)', () => assertSucceeds(asViewer().ref('customRoles/roleActive').once('value')));
  await checkAsync('viewer -> reads archived custom role CHILD DENIED (unchanged)', () => assertFails(asViewer().ref('customRoles/roleArchived').once('value')));
  await checkAsync('admin -> reads archived custom role CHILD ALLOWED (unchanged, admin bypasses the archived check)', () => assertSucceeds(asAdmin().ref('customRoles/roleArchived').once('value')));
  await checkAsync('developer -> reads archived custom role CHILD ALLOWED (unchanged)', () => assertSucceeds(asDeveloper().ref('customRoles/roleArchived').once('value')));
  await checkAsync('adminEquivalent -> reads archived custom role CHILD still DENIED — proves this fix did NOT widen the pre-existing archived-record boundary via cascade (adminEquivalent holds no collection-level grant, so the child rule alone still governs, exactly as before this fix)', () => assertFails(asAdminEquivalent().ref('customRoles/roleArchived').once('value')));

  console.log('\n=== customRoles .write — unchanged pre-existing behavior (admin ONLY — no adminEquivalent, no collection-level write added) ===');
  await checkAsync('admin -> writes a custom role record ALLOWED (unchanged)', () => assertSucceeds(asAdmin().ref('customRoles/roleActive/permissions').set(['other.permission'])));
  await checkAsync('developer -> writes a custom role record DENIED (unchanged, write was never granted to developer)', () => assertFails(asDeveloper().ref('customRoles/roleActive/permissions').set(['other.permission'])));
  await checkAsync('adminEquivalent -> writes a custom role record DENIED (unchanged, cannot edit the registry that grants such roles)', () => assertFails(asAdminEquivalent().ref('customRoles/roleActive/permissions').set(['other.permission'])));
  await checkAsync('admin -> a bulk multi-location update() cannot smuggle a collection-level write bypass (still governed by the unchanged per-record write rule)', () => assertSucceeds(asAdmin().ref().update({ 'customRoles/roleActive/name': 'Renamed Active Role' })));
  await checkAsync('viewer -> a bulk multi-location update() touching customRoles is DENIED (no new collection-level write path introduced by this fix)', () => assertFails(asViewer().ref().update({ 'customRoles/roleActive/name': 'Hijacked' })));
} finally {
  await testEnv.cleanup();
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
