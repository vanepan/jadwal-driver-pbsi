/* system-internal-and-append-only-check.mjs — RTDB Authorization
   Validation Suite (v1.30.7.5, Phase B: Full RTDB Authorization Matrix)

   REAL Firebase Realtime Database emulator test of two related-but-distinct
   node shapes (kept in one file, two clearly separated sections, matching
   Phase A's role-claim-rules-check.mjs precedent of one file covering
   multiple node shapes under separate headers):

   SECTION 1 — "System-owned / Internal, fully closed to clients"
   (migration plan §4): `events`/`telegram_deliveries`/
   `notification_deliveries`/`reminders` (admin-family read, write
   unconditionally false — Cloud Function Admin SDK is the only writer,
   which bypasses rules entirely and needs no test here), PLUS
   `backups`/`reimbursement_counters`, which have NO rule block at all —
   under the Phase 7 deny-by-default root, this means read AND write are
   denied to EVERY role including admin (there is no "admin bypass"
   possible for a node with no rule at all under a `false` root — a
   meaningfully STRICTER guarantee than the admin-family nodes one section
   up, where `developer` specifically IS allowed; worth its own contrast).

   SECTION 2 — "Append-only": `logs`/`analytics_exports` — a fresh key
   accepts a first write from ANY authenticated role; the same existing
   key rejects a second write from EVERYONE, including admin (the rule has
   no role branching in its write clause at all: `auth != null &&
   !data.exists()`).

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
  projectId: 'demo-sarpras-phaseb-systeminternal',
  database: { rules: rulesSource, host: '127.0.0.1', port: DB_PORT },
});

const asAdmin = () => testEnv.authenticatedContext('id-admin', { role: 'admin' }).database();
const asDeveloper = () => testEnv.authenticatedContext('id-developer', { role: 'developer' }).database();
const asAdminEquivalent = () => testEnv.authenticatedContext('id-custom-super', { role: 'fasilitas_super', adminEquivalent: true }).database();
const asViewer = () => testEnv.authenticatedContext('id-viewer', { role: 'viewer' }).database();

try {
  await testEnv.clearDatabase();

  console.log('\n=== SECTION 1 — closed-to-clients internal nodes (admin-family read, write false) ===');
  for (const node of ['events', 'telegram_deliveries', 'notification_deliveries', 'reminders']) {
    await checkAsync(`admin -> ${node} read ALLOWED`, () => assertSucceeds(asAdmin().ref(node).once('value')));
    await checkAsync(`developer -> ${node} read ALLOWED (distinct named clause)`, () => assertSucceeds(asDeveloper().ref(node).once('value')));
    await checkAsync(`adminEquivalent -> ${node} read ALLOWED (distinct named clause)`, () => assertSucceeds(asAdminEquivalent().ref(node).once('value')));
    await checkAsync(`viewer -> ${node} read DENIED`, () => assertFails(asViewer().ref(node).once('value')));
    await checkAsync(`admin -> ${node} write DENIED (Cloud Functions/Admin SDK only, no client role has a write bypass)`, () => assertFails(asAdmin().ref(`${node}/someKey`).set(true)));
  }

  console.log("\n=== SECTION 1b — backups/reimbursement_counters (NO rule at all — STRICTER than the admin-family shape above, since 'developer' IS allowed on every node in Section 1 but NOT here) ===");
  for (const node of ['backups', 'reimbursement_counters']) {
    await checkAsync(`admin -> ${node} read DENIED (no rule exists; even admin has no bypass under deny-by-default root)`, () => assertFails(asAdmin().ref(node).once('value')));
    await checkAsync(`developer -> ${node} read DENIED (contrast: developer IS allowed on events/telegram_deliveries/notification_deliveries/reminders, but NOT here — no rule is stricter than an admin-family rule)`, () => assertFails(asDeveloper().ref(node).once('value')));
    await checkAsync(`adminEquivalent -> ${node} write DENIED (no rule at all; only Cloud Functions' Admin SDK, which bypasses rules entirely, can ever touch this node)`, () => assertFails(asAdminEquivalent().ref(`${node}/someKey`).set(true)));
  }

  console.log('\n=== SECTION 2 — append-only nodes (logs/analytics_exports): first write to a fresh key succeeds for any authenticated role; second write to the SAME key fails for everyone including admin ===');
  for (const node of ['logs', 'analytics_exports']) {
    await checkAsync(`admin -> ${node} read ALLOWED`, () => assertSucceeds(asAdmin().ref(node).once('value')));
    await checkAsync(`viewer (any authenticated role) -> first write to a fresh ${node} key ALLOWED`, () => assertSucceeds(asViewer().ref(`${node}/freshKey`).set({ action: 'first write' })));
    await checkAsync(`admin -> second write to the SAME existing ${node} key DENIED (append-only has no admin override either)`, () => assertFails(asAdmin().ref(`${node}/freshKey`).set({ action: 'overwrite attempt' })));
  }
} finally {
  await testEnv.cleanup();
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
