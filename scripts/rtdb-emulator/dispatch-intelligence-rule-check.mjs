/* dispatch-intelligence-rule-check.mjs — Phase 5, Dispatch Intelligence
   Authorization Hardening (v1.30.9.11)

   REAL Firebase Realtime Database emulator test for the NEW
   `dispatchIntelligence` node rule. Phase 5A's own investigation found
   this node had NO rule at all since the persistence layer was
   introduced (v1.16.4.11-rc.1) — confirmed via `git log
   -S"dispatchIntelligence" -- database.rules.json` (zero hits) and a
   direct fetch of the LIVE deployed rules (byte-identical to the
   pre-Phase-5 local file). Root is deny-by-default, so the node has been
   silently unreadable/unwritable for everyone, including admin, despite
   real historical data (dated up to 2026-08-11) proving it worked before
   whichever prior deploy hardened the root.

   Deliberately admin/adminEquivalent ONLY (no 'developer' branch),
   narrower than the "admin/developer/adminEquivalent read" convention
   the 22 admin-owned-uniform-nodes share — this task's own explicit
   decision tree specified admin/adminEquivalent for both read AND write,
   and nothing in the application needs a developer session to read
   dispatch override/recommendation/capacity history.

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
  projectId: 'demo-sarpras-dispatch-intel-rule',
  database: { rules: rulesSource, host: '127.0.0.1', port: DB_PORT },
});

const asAdmin = () => testEnv.authenticatedContext('id-admin', { role: 'admin' }).database();
const asAdminEquivalent = () => testEnv.authenticatedContext('id-super', { role: 'fasilitas_super', adminEquivalent: true }).database();
const asDeveloper = () => testEnv.authenticatedContext('id-dev', { role: 'developer' }).database();
const asViewer = () => testEnv.authenticatedContext('id-viewer', { role: 'viewer' }).database();
const asDriver = () => testEnv.authenticatedContext('id-driver', { role: 'driver' }).database();
const asBidang = () => testEnv.authenticatedContext('id-bidang', { role: 'bidang' }).database();
const asAnon = () => testEnv.unauthenticatedContext().database();

const SAMPLE = {
  overrideLogs: [{ approvedBy: 'Test', dispatchScore: 90, outcome: 'ACCEPTED', overridden: false, timestamp: '2026-08-13T00:00:00.000Z' }],
  requestRecommendations: { req1: { requestId: 'req1', recommendedDriverId: 'drv_x', dispatchScore: 88 } },
  capacityHistory: [{ timestamp: '2026-08-13T00:00:00.000Z', capacity: 5 }],
};

try {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await context.database().ref('dispatchIntelligence').set(SAMPLE);
  });

  console.log('\n=== READ matrix ===');
  await checkAsync('admin -> READ /dispatchIntelligence ALLOWED', () => assertSucceeds(asAdmin().ref('dispatchIntelligence').once('value')));
  await checkAsync('adminEquivalent -> READ /dispatchIntelligence ALLOWED', () => assertSucceeds(asAdminEquivalent().ref('dispatchIntelligence').once('value')));
  await checkAsync('developer -> READ /dispatchIntelligence DENIED (deliberately narrower than sibling nodes)', () => assertFails(asDeveloper().ref('dispatchIntelligence').once('value')));
  await checkAsync('viewer -> READ /dispatchIntelligence DENIED', () => assertFails(asViewer().ref('dispatchIntelligence').once('value')));
  await checkAsync('driver -> READ /dispatchIntelligence DENIED', () => assertFails(asDriver().ref('dispatchIntelligence').once('value')));
  await checkAsync('bidang -> READ /dispatchIntelligence DENIED', () => assertFails(asBidang().ref('dispatchIntelligence').once('value')));
  await checkAsync('unauthenticated -> READ /dispatchIntelligence DENIED', () => assertFails(asAnon().ref('dispatchIntelligence').once('value')));

  console.log('\n=== WRITE matrix (whole-node set, matching writeNode()\'s actual write shape) ===');
  await checkAsync('admin -> WRITE /dispatchIntelligence/overrideLogs ALLOWED', () => assertSucceeds(asAdmin().ref('dispatchIntelligence/overrideLogs').set(SAMPLE.overrideLogs)));
  await checkAsync('adminEquivalent -> WRITE /dispatchIntelligence/requestRecommendations ALLOWED', () => assertSucceeds(asAdminEquivalent().ref('dispatchIntelligence/requestRecommendations').set(SAMPLE.requestRecommendations)));
  await checkAsync('developer -> WRITE /dispatchIntelligence/capacityHistory DENIED', () => assertFails(asDeveloper().ref('dispatchIntelligence/capacityHistory').set(SAMPLE.capacityHistory)));
  await checkAsync('viewer -> WRITE /dispatchIntelligence/overrideLogs DENIED', () => assertFails(asViewer().ref('dispatchIntelligence/overrideLogs').set(SAMPLE.overrideLogs)));
  await checkAsync('driver -> WRITE /dispatchIntelligence/overrideLogs DENIED', () => assertFails(asDriver().ref('dispatchIntelligence/overrideLogs').set(SAMPLE.overrideLogs)));
  await checkAsync('bidang -> WRITE /dispatchIntelligence/overrideLogs DENIED', () => assertFails(asBidang().ref('dispatchIntelligence/overrideLogs').set(SAMPLE.overrideLogs)));
  await checkAsync('unauthenticated -> WRITE /dispatchIntelligence/overrideLogs DENIED', () => assertFails(asAnon().ref('dispatchIntelligence/overrideLogs').set(SAMPLE.overrideLogs)));

  console.log('\n=== Full-record write (what a fresh hydrate-then-write-through cycle actually does) ===');
  await checkAsync('admin -> WRITE the whole /dispatchIntelligence record ALLOWED', () => assertSucceeds(asAdmin().ref('dispatchIntelligence').set(SAMPLE)));
  await checkAsync('viewer -> WRITE the whole /dispatchIntelligence record DENIED', () => assertFails(asViewer().ref('dispatchIntelligence').set(SAMPLE)));

  console.log('\n=== No accidental broad grant: confirm the rule is NOT auth != null ===');
  await checkAsync('a non-admin, non-adminEquivalent authenticated session (bidang) is denied even though auth != null is true for it', () => assertFails(asBidang().ref('dispatchIntelligence').once('value')));

  console.log('\n=== Unrelated nodes unchanged (spot check — full coverage stays in their own suites) ===');
  await checkAsync('feature_flags: unauthenticated still denied (unrelated node, unaffected)', () => assertFails(asAnon().ref('feature_flags').once('value')));
  await checkAsync('feature_flags: admin still allowed (unrelated node, unaffected)', () => assertSucceeds(asAdmin().ref('feature_flags').once('value')));
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await context.database().ref('customRoles/roleSpot').set({ name: 'Spot', archived: false, permissions: ['warehouse.view'] });
  });
  await checkAsync('customRoles: viewer can still read a non-archived record (unrelated node, unaffected)', () => assertSucceeds(asViewer().ref('customRoles/roleSpot').once('value')));
  await checkAsync('customRoles: admin still cannot write system.admin (unrelated node, unaffected)', () => assertFails(asAdmin().ref('customRoles/roleSpot/permissions').set(['system.admin'])));
} finally {
  await testEnv.cleanup();
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
