/* auth-identity-check.mjs — RTDB Authorization Validation Suite (v1.30.7.1,
   Phase A: Emulator Harness Foundation)

   REAL Firebase Realtime Database emulator test (not structural JSON
   parsing — the existing scripts/rtdb-hardening-*-check.mjs files already
   do that). Loads the actual database.rules.json into the emulator's
   rules engine and executes it against every distinct auth-claims shape
   this platform's login flow (functions/src/auth/verifyPin.js) can
   produce, plus two claims shapes that CANNOT be produced by that flow
   today (unknown/bogus role, and a directly-presented 'developer' claim)
   to prove the rules deny-by-default correctly even for those.

   The 10 identity scenarios mirror functions/src/auth/verifyPin.js's
   VALID_ROLES (copy-pasted below — VALID_ROLES itself is an unexported
   local const, so it cannot be imported; keep this list in sync by hand)
   plus the two claims shapes resolveRoleClaims() can mint for a Custom
   Role, plus the unauthenticated and 'developer' edge cases.

   Two ops are exercised per identity — drivers .read ("auth != null") and
   settings .write ("admin || adminEquivalent") — chosen because together
   they distinguish all 10 claims shapes (see the settings.write table:
   only #2 admin and #8 adminEquivalent succeed, notably NOT #10
   developer, since that rule has no 'developer' clause, unlike
   settings.read). This is a representative slice proving the harness and
   claims model work end-to-end; the full ~25-node CRUD matrix is Phase B.

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
  projectId: 'demo-sarpras-phasea-auth',
  database: { rules: rulesSource, host: '127.0.0.1', port: DB_PORT },
});

try {
  await testEnv.clearDatabase();

  console.log('\n=== Authentication Layer — 10 Identity Scenarios (Phase A) ===');

  const identities = [
    { label: 'Unauthenticated', context: testEnv.unauthenticatedContext(), driversReadAllowed: false, settingsWriteAllowed: false },
    { label: "role: 'admin'", context: testEnv.authenticatedContext('id-admin', { role: 'admin' }), driversReadAllowed: true, settingsWriteAllowed: true },
    { label: "role: 'bidang'", context: testEnv.authenticatedContext('id-bidang', { role: 'bidang' }), driversReadAllowed: true, settingsWriteAllowed: false },
    { label: "role: 'driver'", context: testEnv.authenticatedContext('id-driver', { role: 'driver' }), driversReadAllowed: true, settingsWriteAllowed: false },
    { label: "role: 'viewer'", context: testEnv.authenticatedContext('id-viewer', { role: 'viewer' }), driversReadAllowed: true, settingsWriteAllowed: false },
    { label: "role: 'engineering_coordinator'", context: testEnv.authenticatedContext('id-eng-coord', { role: 'engineering_coordinator' }), driversReadAllowed: true, settingsWriteAllowed: false },
    { label: "role: 'engineering_member'", context: testEnv.authenticatedContext('id-eng-member', { role: 'engineering_member' }), driversReadAllowed: true, settingsWriteAllowed: false },
    { label: 'Custom Role, active, system.admin → adminEquivalent', context: testEnv.authenticatedContext('id-custom-super', { role: 'fasilitas_super', adminEquivalent: true }), driversReadAllowed: true, settingsWriteAllowed: true },
    { label: 'Custom Role, active, no system.admin (unknown role string)', context: testEnv.authenticatedContext('id-custom-basic', { role: 'fasilitas_basic' }), driversReadAllowed: true, settingsWriteAllowed: false },
    { label: "role: 'developer' claim presented directly (dynamic fact — see custom-role-archived-rule-check.mjs for the static mint-path fact)", context: testEnv.authenticatedContext('id-developer', { role: 'developer' }), driversReadAllowed: true, settingsWriteAllowed: false },
  ];

  console.log("\n--- drivers .read  (rule: \"auth != null\") — expect ALLOW for every identity except #1 Unauthenticated ---");
  for (const id of identities) {
    const op = id.context.database().ref('drivers').once('value');
    await checkAsync(`${id.label} -> drivers read ${id.driversReadAllowed ? 'ALLOWED' : 'DENIED'}`, () => (id.driversReadAllowed ? assertSucceeds(op) : assertFails(op)));
  }

  console.log("\n--- settings .write  (rule: \"admin || adminEquivalent\") — expect ALLOW ONLY for #2 admin and #8 adminEquivalent ---");
  for (const id of identities) {
    const op = id.context.database().ref('settings/testKey').set(true);
    await checkAsync(`${id.label} -> settings write ${id.settingsWriteAllowed ? 'ALLOWED' : 'DENIED'}`, () => (id.settingsWriteAllowed ? assertSucceeds(op) : assertFails(op)));
  }

  console.log('\n=== Boundary note: invalid token / expired session (NOT emulator-testable) ===');
  console.log('  Firebase Auth verifies token validity/expiry BEFORE a request ever reaches');
  console.log("  database.rules.json — authenticatedContext() can only simulate an already-");
  console.log("  valid session's CLAIMS payload; there is no emulator-observable way to");
  console.log('  exercise "invalid token" or "expired session" rejection at the rules layer,');
  console.log('  because that rejection never involves rule evaluation at all. This is a');
  console.log('  Firebase Auth responsibility, not a database.rules.json behavior — no check');
  console.log('  is fabricated for it here; flagged honestly instead.');
} finally {
  await testEnv.cleanup();
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
