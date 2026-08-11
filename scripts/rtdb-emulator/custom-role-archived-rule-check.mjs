/* custom-role-archived-rule-check.mjs — RTDB Authorization Validation
   Suite (v1.30.7.1, Phase A: Emulator Harness Foundation)

   REAL Firebase Realtime Database emulator test of customRoles/$roleId's
   archived-conditional read rule and its admin-only (NOT adminEquivalent)
   write rule — plus the 'developer' role's two DISTINCT facts, kept as
   two separately-labeled checks so they are never conflated:

     STATIC  — a grep-style re-check that verifyPin.js's VALID_ROLES fast
               path (the direct, common mint path for every real login)
               does not include 'developer'. This mirrors the existing
               documented finding in
               docs/PERMISSION_RUNTIME_MIGRATION_REPORT_v1.30.6.md — this
               check does NOT prove 'developer' is unreachable by every
               conceivable path (see caveat below), only that the fast
               path excludes it.
     DYNAMIC — what the real rules engine does if a 'developer' claim were
               presented anyway, regardless of how it got there.

   Caveat surfaced by this investigation (worth carrying forward, not
   previously written down in this exact form): verifyPin.js's Custom Role
   FALLBACK path (resolveRoleClaims) looks up /customRoles/{storedRole}
   for any role value outside VALID_ROLES. If an admin ever created a
   Custom Role whose id is literally "developer" AND set some user's
   stored /users/{u}.role to the literal string "developer", the fallback
   path would mint role:'developer' verbatim (plus adminEquivalent if that
   Custom Role's permissions include 'system.admin'). This is a narrow,
   audited, operationally-unlikely path (Custom Role ids come from the
   role-management UI, not free-typed by end users) — not a code change
   this phase makes (Role Registry / Credential Service are out of scope)
   — but "no code path can ever mint it" should be read as "the fast path
   cannot" rather than an absolute impossibility. Flagged here, not fixed.

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
const check = (name, cond) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };
async function checkAsync(name, run) {
  try { await run(); pass++; console.log(`  ✓ ${name}`); }
  catch (err) { fail++; console.log(`  ✗ ${name} — ${err.message}`); }
}

console.log('\n=== STATIC — verifyPin.js VALID_ROLES fast path excludes \'developer\' ===');
const verifyPinSource = readFileSync(path.join(ROOT, 'functions', 'src', 'auth', 'verifyPin.js'), 'utf8');
check(
  "verifyPin.js source contains no literal 'developer' string (fast-path VALID_ROLES cannot mint it; see file header for the Custom Role fallback caveat)",
  !verifyPinSource.includes("'developer'")
);

const testEnv = await initializeTestEnvironment({
  projectId: 'demo-sarpras-phasea-customroles',
  database: { rules: rulesSource, host: '127.0.0.1', port: DB_PORT },
});

const asAdmin = () => testEnv.authenticatedContext('id-admin', { role: 'admin' }).database();
const asAdminEquivalent = () => testEnv.authenticatedContext('id-custom-super', { role: 'fasilitas_super', adminEquivalent: true }).database();
const asViewer = () => testEnv.authenticatedContext('id-viewer', { role: 'viewer' }).database();
const asDeveloper = () => testEnv.authenticatedContext('id-developer', { role: 'developer' }).database();

try {
  await testEnv.clearDatabase();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.database();
    await db.ref('customRoles/roleActive').set({ archived: false, permissions: ['some.permission'] });
    await db.ref('customRoles/roleArchived').set({ archived: true, permissions: ['some.permission'] });
  });

  console.log("\n=== customRoles/$roleId .read  (rule: admin || developer || (auth != null && !archived)) ===");
  await checkAsync('viewer -> reads active (non-archived) custom role ALLOWED', () => assertSucceeds(asViewer().ref('customRoles/roleActive').once('value')));
  await checkAsync('viewer -> reads archived custom role DENIED', () => assertFails(asViewer().ref('customRoles/roleArchived').once('value')));
  await checkAsync('admin -> reads archived custom role ALLOWED (admin bypasses the archived check)', () => assertSucceeds(asAdmin().ref('customRoles/roleArchived').once('value')));
  await checkAsync("'developer' claim -> reads archived custom role ALLOWED (explicit clause in the rule)", () => assertSucceeds(asDeveloper().ref('customRoles/roleArchived').once('value')));
  await checkAsync('adminEquivalent custom role -> reads archived custom role DENIED (adminEquivalent is NOT in this rule at all — a real, non-obvious asymmetry only the live engine surfaces)', () => assertFails(asAdminEquivalent().ref('customRoles/roleArchived').once('value')));

  console.log('\n=== customRoles .write  (rule: admin ONLY — no adminEquivalent clause) ===');
  await checkAsync('admin -> writes a custom role record ALLOWED', () => assertSucceeds(asAdmin().ref('customRoles/roleActive/permissions').set(['other.permission'])));
  await checkAsync('adminEquivalent custom role -> writes a custom role record DENIED (cannot edit the registry that grants such roles)', () => assertFails(asAdminEquivalent().ref('customRoles/roleActive/permissions').set(['other.permission'])));
} finally {
  await testEnv.cleanup();
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
