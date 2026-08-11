/* public-authenticated-nodes-check.mjs — RTDB Authorization Validation
   Suite (v1.30.7.5, Phase B: Full RTDB Authorization Matrix)

   REAL Firebase Realtime Database emulator test of the "Public
   authenticated" node class (migration plan §4): any signed-in user gets
   read access by design, not by accident. `feature_flags` is entirely new
   coverage; `customRoles` extends Phase A's `custom-role-archived-rule-check.mjs`
   (which already proved the archived/write-asymmetry cases — not repeated
   here) with the one gap it left: confirming the non-archived read branch
   is genuinely role-blind for a role other than `viewer`.

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
  projectId: 'demo-sarpras-phaseb-public',
  database: { rules: rulesSource, host: '127.0.0.1', port: DB_PORT },
});

const asAdmin = () => testEnv.authenticatedContext('id-admin', { role: 'admin' }).database();
const asAdminEquivalent = () => testEnv.authenticatedContext('id-custom-super', { role: 'fasilitas_super', adminEquivalent: true }).database();
const asBidang = () => testEnv.authenticatedContext('id-bidang', { role: 'bidang' }).database();
const asAnon = () => testEnv.unauthenticatedContext().database();

try {
  await testEnv.clearDatabase();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await context.database().ref('customRoles/roleForPublicSweep').set({ archived: false, permissions: ['some.permission'] });
  });

  console.log('\n=== feature_flags  (.read: "auth != null", .write: "false" — nobody has a write bypass, not even admin) ===');
  await checkAsync('bidang (any authenticated role) -> feature_flags read ALLOWED', () => assertSucceeds(asBidang().ref('feature_flags').once('value')));
  await checkAsync('unauthenticated -> feature_flags read DENIED', () => assertFails(asAnon().ref('feature_flags').once('value')));
  await checkAsync('admin -> feature_flags write DENIED (flags are ops-managed, not client-writable by ANY role)', () => assertFails(asAdmin().ref('feature_flags/someFlag').set(true)));
  await checkAsync('adminEquivalent custom role -> feature_flags write DENIED (same universal closure)', () => assertFails(asAdminEquivalent().ref('feature_flags/someFlag').set(true)));

  console.log("\n=== customRoles/$roleId .read — sweep completion (Phase A already proved 'viewer'; confirming 'bidang' hits the identical role-blind branch) ===");
  await checkAsync('bidang -> reads a non-archived custom role ALLOWED (the (auth != null && !archived) branch is genuinely role-blind, not viewer-specific)', () => assertSucceeds(asBidang().ref('customRoles/roleForPublicSweep').once('value')));
} finally {
  await testEnv.cleanup();
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
