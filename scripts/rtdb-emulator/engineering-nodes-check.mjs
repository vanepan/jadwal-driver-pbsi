/* engineering-nodes-check.mjs — RTDB Authorization Validation Suite
   (v1.30.7.5, Phase B: Full RTDB Authorization Matrix)

   REAL Firebase Realtime Database emulator test of the 4 `engineering/*`
   nodes. `engineering/assignments` is the most sophisticated pre-existing
   rule in the whole tree (migration plan §2 calls it "the template" Stage
   5's ownership-scoped nodes were modeled on): a 4-role read sweep (admin/
   dev/eng_coordinator/eng_member — 4 literal named clauses, all tested),
   ONE representative deny (they'd all hit the identical unnamed `else`),
   a status-gate write lock (`status !== 'verified'`), a no-creation gate
   (`data.exists()`), and its own `.validate`. `engineering/notifications`
   and `engineering/workReports` share one uniform symmetric shape.
   `engineering/settings` has a genuine read/write ASYMMETRY — coordinator/
   member can read but not write (admin/dev only) — its own labeled pair.

   Every ALLOW/success check gets a dedicated, never-reused fixture key
   (a write that succeeds mutates real emulator state); DENY checks may
   safely share a fixture since a denied write never applies.

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
  projectId: 'demo-sarpras-phaseb-engineering',
  database: { rules: rulesSource, host: '127.0.0.1', port: DB_PORT },
});

const asAdmin = () => testEnv.authenticatedContext('id-admin', { role: 'admin' }).database();
const asDeveloper = () => testEnv.authenticatedContext('id-developer', { role: 'developer' }).database();
const asEngCoord = () => testEnv.authenticatedContext('id-eng-coord', { role: 'engineering_coordinator' }).database();
const asEngMember = () => testEnv.authenticatedContext('id-eng-member', { role: 'engineering_member' }).database();
const asBidang = () => testEnv.authenticatedContext('id-bidang', { role: 'bidang' }).database();

try {
  await testEnv.clearDatabase();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.database();
    await db.ref('engineering/assignments/engAssignForCoordWrite').set({ id: 'engAssignForCoordWrite', status: 'in_progress' });
    await db.ref('engineering/assignments/engAssignForMemberWrite').set({ id: 'engAssignForMemberWrite', status: 'in_progress' });
    await db.ref('engineering/assignments/engAssignVerified').set({ id: 'engAssignVerified', status: 'verified' });
  });

  console.log('\n=== engineering/assignments .read — 4 literal named clauses, all tested ===');
  await checkAsync('admin -> engineering/assignments read ALLOWED', () => assertSucceeds(asAdmin().ref('engineering/assignments').once('value')));
  await checkAsync('developer -> engineering/assignments read ALLOWED', () => assertSucceeds(asDeveloper().ref('engineering/assignments').once('value')));
  await checkAsync('engineering_coordinator -> engineering/assignments read ALLOWED', () => assertSucceeds(asEngCoord().ref('engineering/assignments').once('value')));
  await checkAsync('engineering_member -> engineering/assignments read ALLOWED', () => assertSucceeds(asEngMember().ref('engineering/assignments').once('value')));
  await checkAsync('bidang -> engineering/assignments read DENIED (representative — not in the role list at all)', () => assertFails(asBidang().ref('engineering/assignments').once('value')));

  console.log('\n=== engineering/assignments .write — status gate, creation gate, admin/dev bypass, coordinator === member ===');
  await checkAsync('engineering_coordinator -> writes a non-verified record ALLOWED', () => assertSucceeds(asEngCoord().ref('engineering/assignments/engAssignForCoordWrite').update({ status: 'in_progress', note: 'coord touched it' })));
  await checkAsync('engineering_member -> writes a non-verified record ALLOWED (rule treats coordinator and member identically — a real, documented rule-vs-UI asymmetry: the client capability matrix distinguishes them elsewhere, this rule does not)', () => assertSucceeds(asEngMember().ref('engineering/assignments/engAssignForMemberWrite').update({ status: 'in_progress', note: 'member touched it' })));
  await checkAsync("engineering_coordinator -> writes a 'verified' record DENIED (locked, even for them)", () => assertFails(asEngCoord().ref('engineering/assignments/engAssignVerified').update({ note: 'trying anyway' })));
  await checkAsync("engineering_member -> writes a 'verified' record DENIED (same lock)", () => assertFails(asEngMember().ref('engineering/assignments/engAssignVerified').update({ note: 'trying anyway' })));
  await checkAsync("admin -> writes a 'verified' record ALLOWED (admin/dev bypass still works after the lock)", () => assertSucceeds(asAdmin().ref('engineering/assignments/engAssignVerified').update({ note: 'admin override' })));
  await checkAsync('engineering_coordinator -> attempts to CREATE a brand-new record DENIED (data.exists() gate — creation is admin/dev-only via this rule)', () => assertFails(asEngCoord().ref('engineering/assignments/engAssignBrandNew').set({ id: 'engAssignBrandNew', status: 'pending' })));
  await checkAsync("admin -> creates a brand-new record MISSING 'status' DENIED (.validate: hasChildren(['id','status']), not a role issue)", () => assertFails(asAdmin().ref('engineering/assignments/engAssignInvalid').set({ id: 'engAssignInvalid' })));

  console.log('\n=== engineering/notifications & engineering/workReports — uniform symmetric 4-role shape ===');
  for (const node of ['engineering/notifications', 'engineering/workReports']) {
    await checkAsync(`${node}: engineering_member read ALLOWED`, () => assertSucceeds(asEngMember().ref(node).once('value')));
    await checkAsync(`${node}: engineering_member write ALLOWED (symmetric — unlike engineering/settings)`, () => assertSucceeds(asEngMember().ref(`${node}/probe`).set({ v: 1 })));
    await checkAsync(`${node}: bidang read/write DENIED`, () => assertFails(asBidang().ref(`${node}/probe2`).set({ v: 2 })));
  }

  console.log('\n=== engineering/settings — the read/write ASYMMETRY: coordinator/member can read but NOT write ===');
  await checkAsync('engineering_coordinator -> engineering/settings read ALLOWED', () => assertSucceeds(asEngCoord().ref('engineering/settings').once('value')));
  await checkAsync('engineering_coordinator -> engineering/settings write DENIED (admin/dev only — distinct from the symmetric siblings above)', () => assertFails(asEngCoord().ref('engineering/settings/probe').set({ v: 1 })));
  await checkAsync('admin -> engineering/settings write ALLOWED', () => assertSucceeds(asAdmin().ref('engineering/settings/probe2').set({ v: 2 })));
} finally {
  await testEnv.cleanup();
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
