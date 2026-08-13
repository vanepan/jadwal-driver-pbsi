/* role-permission-overrides-check.mjs — Role-Level Permission Assignment,
   Phase 4: Storage & Security Foundation (v1.30.9.9)

   REAL Firebase Realtime Database emulator test for the new
   rolePermissionOverrides/$roleId node. Mirrors user-permission-
   overrides-check.mjs's own shape (same discipline: proves the RTDB rule
   itself against the real rules engine, not just the pure application-
   layer logic already proven by role-permission-overrides-rules-check.mjs).

   THE ONE DELIBERATE STRUCTURAL DIFFERENCE FROM userPermissionOverrides,
   and the reason this file exists rather than just parameterizing the
   existing one: READ has a SELF-ROLE branch (`auth.token.role ===
   $roleId`), not a self-UID branch. A role has no uid of its own — it is
   shared by every user holding it — so "self" here means "a session
   whose own role claim matches this node's role id," which the mandatory
   negative tests below prove does NOT also grant that session WRITE
   access (mirrors the exact discipline of userPermissionOverrides'
   self-write negative tests, translated from per-user to per-role
   identity — see database.rules.json's own comment on this node for the
   full reasoning).

   TWO forbidden permission ids are validated here (system.admin AND
   system.users.manage), not one — Phase 4's own, wider boundary (see
   role-permission-overrides-rules.js's header for why this is
   deliberately stricter than userPermissionOverrides' single-id rule).

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
  projectId: 'demo-sarpras-rolepermoverrides',
  database: { rules: rulesSource, host: '127.0.0.1', port: DB_PORT },
});

const asAdmin = () => testEnv.authenticatedContext('id-admin', { role: 'admin' }).database();
const asAdminEquivalent = () => testEnv.authenticatedContext('id-custom-super', { role: 'fasilitas_super', adminEquivalent: true }).database();
const asAnon = () => testEnv.unauthenticatedContext().database();
// A session whose OWN role claim matches the node under test — the
// self-role branch, not a self-uid branch (a role has no uid).
const asBidangSession = () => testEnv.authenticatedContext('carol', { role: 'bidang' }).database();
const asDriverSession = () => testEnv.authenticatedContext('bob', { role: 'driver' }).database();

try {
  await testEnv.clearDatabase();

  console.log('\n=== READ ===');
  await asAdmin().ref('rolePermissionOverrides/bidang').set({ permissions: ['warehouse.view'], updatedAt: '2026-08-13T00:00:00.000Z' });
  await checkAsync('admin -> reads any role\'s override record ALLOWED', () => assertSucceeds(asAdmin().ref('rolePermissionOverrides/bidang').once('value')));
  await checkAsync('adminEquivalent -> reads any role\'s override record ALLOWED', () => assertSucceeds(asAdminEquivalent().ref('rolePermissionOverrides/bidang').once('value')));
  await checkAsync('a session with role=bidang -> reads bidang\'s OWN override record ALLOWED (self-role branch — required for that session\'s own can()/listPermissions() resolution)', () => assertSucceeds(asBidangSession().ref('rolePermissionOverrides/bidang').once('value')));
  await checkAsync("a session with role=driver -> reads bidang's override record DENIED (cross-role read)", () => assertFails(asDriverSession().ref('rolePermissionOverrides/bidang').once('value')));
  await checkAsync('unauthenticated -> read DENIED', () => assertFails(asAnon().ref('rolePermissionOverrides/bidang').once('value')));

  console.log('\n=== WRITE — who ===');
  await checkAsync('admin -> writes a valid grant to any role ALLOWED', () => assertSucceeds(asAdmin().ref('rolePermissionOverrides/driver').set({ permissions: ['overtime.view'], updatedAt: '2026-08-13T00:00:00.000Z' })));
  await checkAsync('adminEquivalent -> writes a valid grant to any role ALLOWED', () => assertSucceeds(asAdminEquivalent().ref('rolePermissionOverrides/viewer').set({ permissions: ['analytics.view'], updatedAt: '2026-08-13T00:00:00.000Z' })));
  await checkAsync('a plain (non-admin) session -> write DENIED', () => assertFails(asDriverSession().ref('rolePermissionOverrides/admin').set({ permissions: ['pettycash.view'] })));

  console.log('\n=== WRITE — the mandatory self-role-write negative tests (mirrors the userPermissionOverrides self-write discipline exactly, translated to role identity) ===');
  await checkAsync('a session with role=bidang (which CAN read bidang\'s own node) -> attempts to write to bidang\'s OWN node with a HARMLESS permission DENIED (read access at $roleId must never imply write access — WHO is writing is what matters)', () => assertFails(asBidangSession().ref('rolePermissionOverrides/bidang').set({ permissions: ['warehouse.view'], updatedAt: '2026-08-13T00:00:00.000Z' })));
  await checkAsync('a session with role=bidang -> attempts to grant itself system.admin via its own node DENIED (doubly: self-role-write AND the dangerous-id rule both independently deny this)', () => assertFails(asBidangSession().ref('rolePermissionOverrides/bidang').set({ permissions: ['system.admin'] })));
  await checkAsync("a session with role=driver -> attempts to write to bidang's node DENIED (cross-role write, not just self)", () => assertFails(asDriverSession().ref('rolePermissionOverrides/bidang').set({ permissions: ['warehouse.view'] })));

  console.log('\n=== VALIDATE — content shape, even for an admin writer ===');
  await checkAsync('admin -> writes system.admin as a grant DENIED (hard boundary — no writer is trusted with this, not even admin)', () => assertFails(asAdmin().ref('rolePermissionOverrides/viewer').set({ permissions: ['system.admin'], updatedAt: '2026-08-13T00:00:00.000Z' })));
  await checkAsync('admin -> writes system.users.manage as a grant DENIED (Phase 4\'s own WIDER boundary vs. userPermissionOverrides\' single-id rule)', () => assertFails(asAdmin().ref('rolePermissionOverrides/viewer').set({ permissions: ['system.users.manage'], updatedAt: '2026-08-13T00:00:00.000Z' })));
  await checkAsync('admin -> writes system.admin ALONGSIDE a harmless permission in the same array DENIED (every element is checked, not just the first)', () => assertFails(asAdmin().ref('rolePermissionOverrides/viewer').set({ permissions: ['pettycash.view', 'system.admin'], updatedAt: '2026-08-13T00:00:00.000Z' })));
  await checkAsync('admin -> writes system.users.manage ALONGSIDE a harmless permission in the same array DENIED', () => assertFails(asAdmin().ref('rolePermissionOverrides/viewer').set({ permissions: ['pettycash.view', 'system.users.manage'] })));
  await checkAsync('adminEquivalent -> writes system.admin as a grant DENIED (same boundary, different admin-tier writer)', () => assertFails(asAdminEquivalent().ref('rolePermissionOverrides/viewer').set({ permissions: ['system.admin'] })));
  await checkAsync('admin -> writes a record carrying a top-level "role" field DENIED (this node is bulk permission grants only, never identity/authorization claims)', () => assertFails(asAdmin().ref('rolePermissionOverrides/viewer').set({ permissions: ['pettycash.view'], role: 'admin' })));
  await checkAsync('admin -> writes a record carrying a top-level "adminEquivalent" field DENIED', () => assertFails(asAdmin().ref('rolePermissionOverrides/viewer').set({ permissions: ['pettycash.view'], adminEquivalent: true })));
  await checkAsync('admin -> writes a record carrying a "pin" field DENIED (never credential material)', () => assertFails(asAdmin().ref('rolePermissionOverrides/viewer').set({ permissions: ['pettycash.view'], pin: '1234' })));
  await checkAsync('admin -> writes a record carrying a "pinHash" field DENIED', () => assertFails(asAdmin().ref('rolePermissionOverrides/viewer').set({ permissions: ['pettycash.view'], pinHash: 'x' })));
  await checkAsync('admin -> writes a record carrying an "active" field DENIED', () => assertFails(asAdmin().ref('rolePermissionOverrides/viewer').set({ permissions: ['pettycash.view'], active: true })));
  await checkAsync('admin -> writes a record carrying an "archived" field DENIED', () => assertFails(asAdmin().ref('rolePermissionOverrides/viewer').set({ permissions: ['pettycash.view'], archived: false })));
  await checkAsync('admin -> writes a non-string array element (a number) DENIED (type matters)', () => assertFails(asAdmin().ref('rolePermissionOverrides/viewer').set({ permissions: [42] })));
  await checkAsync('admin -> writes a non-string array element (boolean true) DENIED', () => assertFails(asAdmin().ref('rolePermissionOverrides/viewer').set({ permissions: [true] })));
  await checkAsync('admin -> writes a record with NO permissions field at all DENIED', () => assertFails(asAdmin().ref('rolePermissionOverrides/viewer').set({ updatedAt: '2026-08-13T00:00:00.000Z' })));
  await checkAsync('admin -> writes a genuinely well-formed grant ALLOWED (control case — the rule isn\'t just denying everything)', () => assertSucceeds(asAdmin().ref('rolePermissionOverrides/viewer').set({ permissions: ['pettycash.view', 'analytics.view'], updatedAt: '2026-08-13T00:00:00.000Z' })));
  await checkAsync('admin -> deletes an existing override record ALLOWED (a null write is exempt from .validate by RTDB\'s own semantics)', () => assertSucceeds(asAdmin().ref('rolePermissionOverrides/viewer').set(null)));

  console.log('\n=== A note on unregistered-but-not-dangerous permission ids (same deliberate, documented scope boundary as userPermissionOverrides) ===');
  await checkAsync('admin -> writing an UNREGISTERED (but not dangerous) permission id is ALLOWED AT THE RULES LAYER — full Permission Registry membership is enforced at the application layer (role-permission-overrides-rules.js#isValidPermissionId, already proven in the pure-logic suite), not duplicated into database.rules.json. Harmless downstream: no consumer will ever recognize an unregistered id as a valid grant.', () => assertSucceeds(asAdmin().ref('rolePermissionOverrides/eve').set({ permissions: ['totally.made.up.permission'] })));

  console.log('\n=== A note on the role id itself: the rule cannot distinguish a System Role from a Custom Role id (that boundary is application-layer only) ===');
  await checkAsync('admin -> writing a well-formed record under a Custom-Role-SHAPED id is still ALLOWED AT THE RULES LAYER — role-permission-overrides-rules.js#isValidRoleOverrideTarget() is the actual enforcement point (already proven in the pure-logic suite); the rule has no way to know $roleId is a Custom Role by shape alone, and is not expected to', () => assertSucceeds(asAdmin().ref('rolePermissionOverrides/role_bidang-copy').set({ permissions: ['pettycash.view'] })));
} finally {
  await testEnv.cleanup();
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
