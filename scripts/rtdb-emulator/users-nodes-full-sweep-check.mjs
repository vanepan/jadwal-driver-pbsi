/* users-nodes-full-sweep-check.mjs — RTDB Authorization Validation Suite
   (v1.30.7.5, Phase B: Full RTDB Authorization Matrix)

   REAL Firebase Realtime Database emulator test completing `users/$username`
   coverage and adding entirely new coverage for `userProfiles`. Phase A's
   role-claim-rules-check.mjs already proved: alice self-read-allow, alice
   cross-user-read-deny, admin cross-user READ-allow, alice self-write-allow,
   bob cross-user-write-deny. NOT proved: admin cross-user WRITE-allow — a
   distinct assertion from admin cross-user read-allow, since `users`' write
   rule is a textually-parallel but SEPARATE expression from its read rule.

   `userProfiles` (`.read: auth != null`, `.write: false` unconditionally)
   is untested in Phase A. The standout fact worth its own labeled check is
   that admin write is ALSO denied — the same "even admin has no bypass"
   pattern already seen on `feature_flags` (public-authenticated-nodes-check.mjs)
   and `notification_state` (user-owned-nodes-check.mjs) — cross-referenced
   here as a real recurring data-model pattern, not three unrelated
   coincidences.

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
  projectId: 'demo-sarpras-phaseb-users',
  database: { rules: rulesSource, host: '127.0.0.1', port: DB_PORT },
});

const asAdmin = () => testEnv.authenticatedContext('id-admin', { role: 'admin' }).database();
const asAnon = () => testEnv.unauthenticatedContext().database();
const asBidang = () => testEnv.authenticatedContext('id-bidang', { role: 'bidang' }).database();

try {
  await testEnv.clearDatabase();

  console.log('\n=== users/$username — completion: admin cross-user WRITE (Phase A only proved admin cross-user READ) ===');
  await checkAsync("admin -> writes bob's users/bob record ALLOWED (a separate expression from the read rule, even though textually parallel)", () => assertSucceeds(asAdmin().ref('users/bob/displayName').set('Bob Updated By Admin')));

  console.log('\n=== userProfiles  (.read: "auth != null" for anyone, .write: "false" for EVERYONE including admin) ===');
  await checkAsync('bidang (any authenticated role) -> userProfiles read ALLOWED', () => assertSucceeds(asBidang().ref('userProfiles').once('value')));
  await checkAsync('unauthenticated -> userProfiles read DENIED', () => assertFails(asAnon().ref('userProfiles').once('value')));
  await checkAsync('admin -> userProfiles write DENIED (Cloud-Function-mirror-only via onUserWrite.js — the same "even admin has no bypass" pattern as feature_flags and notification_state)', () => assertFails(asAdmin().ref('userProfiles/someuser').set({ displayName: 'Hack Attempt' })));
} finally {
  await testEnv.cleanup();
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
