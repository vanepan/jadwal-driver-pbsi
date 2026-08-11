/* settings-sensitivity-check.mjs — RTDB Authorization Validation Suite
   (v1.30.7.5, Phase B: Full RTDB Authorization Matrix)

   REAL Firebase Realtime Database emulator test of `settings`'s carve-out
   shape (migration plan §4 "Admin-owned, mixed sensitivity" — its own
   classification, distinct from both "Public authenticated"
   (feature_flags/customRoles) and "Role-owned broad-read" (drivers/
   vehicles), so kept in its own file rather than folded into either).
   Phase A's role-claim-rules-check.mjs already proved: viewer
   general-settings-read-deny, developer general-settings-read-allow,
   developer general-settings-write-deny, adminEquivalent
   general-settings-write-allow. NONE of those are repeated here. This
   file's whole point is the carve-out itself: does settings/operations'
   broadened `auth != null` read genuinely widen ONLY that one sub-path,
   or does it leak upward into the parent `settings` node? Tested with a
   role Phase A never used against settings (`engineering_coordinator`)
   plus one Custom Role check on both paths.

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
  projectId: 'demo-sarpras-phaseb-settings',
  database: { rules: rulesSource, host: '127.0.0.1', port: DB_PORT },
});

const asEngCoord = () => testEnv.authenticatedContext('id-eng-coord', { role: 'engineering_coordinator' }).database();
const asCustomNonEquivalent = () => testEnv.authenticatedContext('id-custom-basic', { role: 'fasilitas_basic' }).database();

try {
  await testEnv.clearDatabase();

  console.log('\n=== settings — the carve-out boundary: does settings/operations\' broadened read leak upward into the parent? ===');
  await checkAsync('engineering_coordinator -> general settings (e.g. settings/telegram) read DENIED (not admin/dev/adminEquivalent)', () => assertFails(asEngCoord().ref('settings/telegram').once('value')));
  await checkAsync("engineering_coordinator -> settings/operations read ALLOWED (the carve-out genuinely widens THIS sub-path, proving it's not a parent-wide loosening)", () => assertSucceeds(asEngCoord().ref('settings/operations').once('value')));
  await checkAsync('Custom Role (non-adminEquivalent) -> general settings read DENIED', () => assertFails(asCustomNonEquivalent().ref('settings/telegram').once('value')));
  await checkAsync('Custom Role (non-adminEquivalent) -> settings/operations read ALLOWED (same carve-out, same role-blindness as the public-authenticated class)', () => assertSucceeds(asCustomNonEquivalent().ref('settings/operations').once('value')));
} finally {
  await testEnv.cleanup();
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
