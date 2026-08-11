/* user-permission-overrides-check.mjs — Individual Permission
   Assignment, Phase 1: Storage & Security Foundation (v1.30.9.1)

   REAL Firebase Realtime Database emulator test for the new
   userPermissionOverrides/$username node. Proves the security boundary
   that must hold independent of any client-side/application validation
   (user-permission-overrides-rules-check.mjs already proves the pure
   logic; this file proves the RTDB rule itself, against the real rules
   engine, per this program's established "the UI is not the security
   boundary" discipline).

   STORAGE SHAPE — `permissions: string[]`, not a map of booleans. The
   first draft of this file used `{permissionId: true}` and this
   emulator run is exactly what caught it: the real Firebase client SDK
   rejected the write outright ("Keys... can't contain '.'") before the
   request even reached the emulator's rules engine, because permission
   ids are dot-notation. Switched to an array (permission-management/
   user-permission-overrides-rules.js's own header has the full account)
   — the exact shape /customRoles/{id}.permissions already uses.

   MANDATORY negative test (per explicit instruction, mirrors the exact
   class of vulnerability found and fixed on /users this session,
   v1.30.7.9): a normal, non-admin user must be denied writing to their
   OWN override record — including a harmless-looking grant, not just an
   obviously dangerous one. The fact that a permission is harmless does
   not make self-write acceptable; only WHO is writing matters here,
   unlike /users' self-write branch which is field-scoped.

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
  projectId: 'demo-sarpras-userpermoverrides',
  database: { rules: rulesSource, host: '127.0.0.1', port: DB_PORT },
});

const asAdmin = () => testEnv.authenticatedContext('id-admin', { role: 'admin' }).database();
const asAdminEquivalent = () => testEnv.authenticatedContext('id-custom-super', { role: 'fasilitas_super', adminEquivalent: true }).database();
const asAnon = () => testEnv.unauthenticatedContext().database();
// uid MUST equal the target username for the self-access branch to mean anything real.
const asAlice = () => testEnv.authenticatedContext('alice', { role: 'viewer' }).database();
const asBobDriver = () => testEnv.authenticatedContext('bob', { role: 'driver' }).database();
const asCarolBidang = () => testEnv.authenticatedContext('carol', { role: 'bidang' }).database();

try {
  await testEnv.clearDatabase();

  console.log('\n=== READ ===');
  await asAdmin().ref('userPermissionOverrides/alice').set({ permissions: ['pettycash.view'], updatedAt: '2026-08-11T00:00:00.000Z' });
  await checkAsync('admin -> reads any user\'s override record ALLOWED', () => assertSucceeds(asAdmin().ref('userPermissionOverrides/alice').once('value')));
  await checkAsync('adminEquivalent -> reads any user\'s override record ALLOWED', () => assertSucceeds(asAdminEquivalent().ref('userPermissionOverrides/alice').once('value')));
  await checkAsync('alice (self) -> reads her OWN override record ALLOWED', () => assertSucceeds(asAlice().ref('userPermissionOverrides/alice').once('value')));
  await checkAsync("bob -> reads alice's override record DENIED (unrelated user)", () => assertFails(asBobDriver().ref('userPermissionOverrides/alice').once('value')));
  await checkAsync('unauthenticated -> read DENIED', () => assertFails(asAnon().ref('userPermissionOverrides/alice').once('value')));

  console.log('\n=== WRITE — who ===');
  await checkAsync('admin -> writes a valid grant to any user ALLOWED', () => assertSucceeds(asAdmin().ref('userPermissionOverrides/bob').set({ permissions: ['pettycash.view'], updatedAt: '2026-08-11T00:00:00.000Z' })));
  await checkAsync('adminEquivalent -> writes a valid grant to any user ALLOWED', () => assertSucceeds(asAdminEquivalent().ref('userPermissionOverrides/carol').set({ permissions: ['analytics.view'], updatedAt: '2026-08-11T00:00:00.000Z' })));
  await checkAsync('viewer -> write DENIED (not admin/adminEquivalent, full stop)', () => assertFails(asAlice().ref('userPermissionOverrides/dave').set({ permissions: ['pettycash.view'] })));
  await checkAsync('driver -> write DENIED', () => assertFails(asBobDriver().ref('userPermissionOverrides/dave').set({ permissions: ['pettycash.view'] })));
  await checkAsync('bidang -> write DENIED', () => assertFails(asCarolBidang().ref('userPermissionOverrides/dave').set({ permissions: ['pettycash.view'] })));

  console.log('\n=== WRITE — the mandatory self-write negative tests (mirrors the /users v1.30.7.9 lesson exactly) ===');
  await checkAsync('alice (self) -> attempts to write her OWN record with a HARMLESS permission DENIED (WHO is writing is what matters here, not what)', () => assertFails(asAlice().ref('userPermissionOverrides/alice').set({ permissions: ['pettycash.view'], updatedAt: '2026-08-11T00:00:00.000Z' })));
  await checkAsync('alice (self) -> attempts to write her OWN record granting herself system.admin DENIED (doubly: self-write AND the dangerous-id rule both independently deny this)', () => assertFails(asAlice().ref('userPermissionOverrides/alice').set({ permissions: ['system.admin'], updatedAt: '2026-08-11T00:00:00.000Z' })));
  await checkAsync("bob -> attempts to write carol's override record DENIED (cross-user, not just self)", () => assertFails(asBobDriver().ref('userPermissionOverrides/carol').set({ permissions: ['pettycash.view'] })));

  console.log('\n=== VALIDATE — content shape, even for an admin writer ===');
  await checkAsync('admin -> writes system.admin as a grant DENIED (hard boundary — no writer is trusted with this, not even admin)', () => assertFails(asAdmin().ref('userPermissionOverrides/dave').set({ permissions: ['system.admin'], updatedAt: '2026-08-11T00:00:00.000Z' })));
  await checkAsync('admin -> writes system.admin ALONGSIDE a harmless permission in the same array DENIED (every element is checked, not just the first)', () => assertFails(asAdmin().ref('userPermissionOverrides/dave').set({ permissions: ['pettycash.view', 'system.admin'], updatedAt: '2026-08-11T00:00:00.000Z' })));
  await checkAsync('adminEquivalent -> writes system.admin as a grant DENIED (same boundary, different admin-tier writer)', () => assertFails(asAdminEquivalent().ref('userPermissionOverrides/dave').set({ permissions: ['system.admin'] })));
  await checkAsync('admin -> writes a record carrying a top-level "role" field DENIED (this node is permissions-only, never identity/authorization claims)', () => assertFails(asAdmin().ref('userPermissionOverrides/dave').set({ permissions: ['pettycash.view'], role: 'admin' })));
  await checkAsync('admin -> writes a record carrying a top-level "adminEquivalent" field DENIED', () => assertFails(asAdmin().ref('userPermissionOverrides/dave').set({ permissions: ['pettycash.view'], adminEquivalent: true })));
  await checkAsync('admin -> writes a record carrying a "pin" field DENIED (never credential material)', () => assertFails(asAdmin().ref('userPermissionOverrides/dave').set({ permissions: ['pettycash.view'], pin: '1234' })));
  await checkAsync('admin -> writes a record carrying a "pinHash" field DENIED', () => assertFails(asAdmin().ref('userPermissionOverrides/dave').set({ permissions: ['pettycash.view'], pinHash: 'x' })));
  await checkAsync('admin -> writes a record carrying an "active" field DENIED (identity/lifecycle fields belong to /users, not here)', () => assertFails(asAdmin().ref('userPermissionOverrides/dave').set({ permissions: ['pettycash.view'], active: true })));
  await checkAsync('admin -> writes a record carrying an "archived" field DENIED', () => assertFails(asAdmin().ref('userPermissionOverrides/dave').set({ permissions: ['pettycash.view'], archived: false })));
  await checkAsync('admin -> writes a non-string array element (a number) DENIED (type matters)', () => assertFails(asAdmin().ref('userPermissionOverrides/dave').set({ permissions: [42] })));
  await checkAsync('admin -> writes a non-string array element (boolean true) DENIED', () => assertFails(asAdmin().ref('userPermissionOverrides/dave').set({ permissions: [true] })));
  await checkAsync('admin -> writes a record with NO permissions field at all DENIED', () => assertFails(asAdmin().ref('userPermissionOverrides/dave').set({ updatedAt: '2026-08-11T00:00:00.000Z' })));
  await checkAsync('admin -> writes a genuinely well-formed grant ALLOWED (control case — the rule isn\'t just denying everything)', () => assertSucceeds(asAdmin().ref('userPermissionOverrides/dave').set({ permissions: ['pettycash.view', 'analytics.view'], updatedAt: '2026-08-11T00:00:00.000Z' })));
  await checkAsync('admin -> deletes an existing override record ALLOWED (a null write is exempt from .validate by RTDB\'s own semantics, confirmed against the real engine here rather than assumed)', () => assertSucceeds(asAdmin().ref('userPermissionOverrides/dave').set(null)));

  console.log('\n=== A note on unregistered-but-not-dangerous permission ids (documented, deliberate scope boundary — see the Phase 1 report) ===');
  await checkAsync('admin -> writing an UNREGISTERED (but not dangerous) permission id is ALLOWED AT THE RULES LAYER — this is a deliberate, documented tradeoff: full Permission Registry membership is enforced at the application layer (user-permission-overrides-rules.js#isValidPermissionId, already proven in the pure-logic suite), not duplicated into database.rules.json, per this phase\'s own explicit instruction not to duplicate the registry into rules unless required. Harmless downstream regardless: no consumer will ever recognize an unregistered id as a valid grant.', () => assertSucceeds(asAdmin().ref('userPermissionOverrides/eve').set({ permissions: ['totally.made.up.permission'] })));
} finally {
  await testEnv.cleanup();
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
