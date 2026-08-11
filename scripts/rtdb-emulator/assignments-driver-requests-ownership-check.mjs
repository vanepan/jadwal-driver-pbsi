/* assignments-driver-requests-ownership-check.mjs — RTDB Authorization
   Validation Suite (v1.30.7.3, Phase B: Full RTDB Authorization Matrix)

   REAL Firebase Realtime Database emulator test of the two hardest,
   highest-risk rules in the whole tree: assignments/$assignmentId.write
   and driver_requests/$requestId.write — the per-record ownership rules
   from Program Phases 5A/5B (v1.30.6.8/v1.30.6.9), deliberately excluded
   from Phase A's representative slice. Built and run FIRST, in isolation,
   before any other Phase B file, because planning-time static analysis
   surfaced a plausible real rules defect that must be confirmed or ruled
   out against the actual engine before any further Phase B work proceeds
   (see the HYPOTHESIS section below and this repo's plan file).

   Kept as ONE file with two sections (not split in two) because the
   assignments bidang-self-drive branch cross-references driver_requests
   via root.child(...) — splitting would duplicate the shared fixtures for
   no isolation benefit (each file already gets its own process/testEnv
   regardless of file count).

   Fixtures are seeded once via testEnv.withSecurityRulesDisabled() and
   NEVER mutated by a check — every scenario gets its own unique key, so
   checks stay independent of run order.

   Run standalone during development (this file's gate must resolve before
   any other Phase B file is written):
     firebase emulators:exec --only database "node scripts/rtdb-emulator/assignments-driver-requests-ownership-check.mjs"
   Normally run via: npm run test:rtdb-emulator (exit 0 = pass) */

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
  projectId: 'demo-sarpras-phaseb-ownership',
  database: { rules: rulesSource, host: '127.0.0.1', port: DB_PORT },
});

const dbAs = (uid, claims) => testEnv.authenticatedContext(uid, claims).database();
const asBidang1 = () => dbAs('bidang1', { role: 'bidang' });
const asBidang2 = () => dbAs('bidang2', { role: 'bidang' });
const asDriverA = () => dbAs('driverA', { role: 'driver' });
const asDriverB = () => dbAs('driverB', { role: 'driver' });
const asAdmin = () => dbAs('id-admin', { role: 'admin' });
const asAdminEquivalent = () => dbAs('id-custom-super', { role: 'fasilitas_super', adminEquivalent: true });
const asViewer = () => dbAs('id-viewer', { role: 'viewer' });
const asAnon = () => testEnv.unauthenticatedContext().database();

try {
  await testEnv.clearDatabase();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.database();
    await db.ref('driver_requests/reqBidang1').set({ requesterId: 'bidang1', status: 'pending' });
    await db.ref('driver_requests/reqBidang2').set({ requesterId: 'bidang2', status: 'pending' });
    await db.ref('assignments/assignDriverAOwn').set({ driverUsername: 'driverA', status: 'assigned' });
    await db.ref('assignments/assignDriverACompleted').set({ driverUsername: 'driverA', status: 'completed' });
    await db.ref('assignments/assignDriverB').set({ driverUsername: 'driverB', status: 'assigned' });
    await db.ref('assignments/assignSelfDriveOpen').set({ driverUsername: '', driver: '', status: 'pending', requestId: 'reqBidang1' });
    await db.ref('assignments/assignSelfDriveTaken').set({ driverUsername: '', driver: 'someone', status: 'pending', requestId: 'reqBidang1' });
    await db.ref('assignments/assignSelfDriveForeign').set({ driverUsername: '', driver: '', status: 'pending', requestId: 'reqBidang2' });
    await db.ref('assignments/assignSelfDriveForHypothesis').set({ driverUsername: '', driver: '', status: 'pending', requestId: 'reqBidang1' });
  });

  console.log('\n=== driver_requests .read + assignments .read  (both top-level rules: "auth != null" — never directly exercised before this, despite being the two highest-stakes nodes in the tree) ===');
  await checkAsync(
    'viewer (any authenticated role) -> driver_requests read ALLOWED',
    () => assertSucceeds(asViewer().ref('driver_requests').once('value'))
  );
  await checkAsync(
    'unauthenticated -> driver_requests read DENIED',
    () => assertFails(asAnon().ref('driver_requests').once('value'))
  );
  await checkAsync(
    'viewer (any authenticated role) -> assignments read ALLOWED',
    () => assertSucceeds(asViewer().ref('assignments').once('value'))
  );
  await checkAsync(
    'unauthenticated -> assignments read DENIED',
    () => assertFails(asAnon().ref('assignments').once('value'))
  );

  console.log('\n=== driver_requests/$requestId .write ===');
  await checkAsync(
    'bidang creates a brand-new request as themselves ALLOWED',
    () => assertSucceeds(asBidang1().ref('driver_requests/reqNewByBidang1').set({ requesterId: 'bidang1', status: 'pending' }))
  );
  await checkAsync(
    "bidang creates a brand-new request impersonating another bidang's requesterId DENIED",
    () => assertFails(asBidang1().ref('driver_requests/reqImpersonate').set({ requesterId: 'bidang2', status: 'pending' }))
  );
  await checkAsync(
    'bidang updates their OWN existing request without reassigning requesterId ALLOWED',
    () => assertSucceeds(asBidang1().ref('driver_requests/reqBidang1/status').set('approved'))
  );
  await checkAsync(
    "bidang updates their own request while reassigning requesterId to someone else DENIED (no ownership transfer through an update)",
    () => assertFails(asBidang1().ref('driver_requests/reqBidang1').update({ requesterId: 'bidang2' }))
  );
  await checkAsync(
    "bidang updates ANOTHER bidang's existing request DENIED (cross-user)",
    () => assertFails(asBidang2().ref('driver_requests/reqBidang1/status').set('rejected'))
  );
  await checkAsync(
    'driver role attempts any driver_requests write DENIED (not in the rule\'s role list at all)',
    () => assertFails(asDriverA().ref('driver_requests/reqBidang1/status').set('rejected'))
  );
  await checkAsync(
    'admin writes ANY driver_requests record regardless of ownership ALLOWED (control case — the admin bypass clause was never directly exercised before this)',
    () => assertSucceeds(asAdmin().ref('driver_requests/reqBidang2/status').set('approved'))
  );
  await checkAsync(
    'adminEquivalent custom role writes ANY driver_requests record ALLOWED (a distinct literal clause from plain admin, never exercised on this rule before)',
    () => assertSucceeds(asAdminEquivalent().ref('driver_requests/reqBidang2/status').set('rejected'))
  );

  console.log('\n=== assignments/$assignmentId .write ===');
  await checkAsync(
    'driver writes their OWN assignment record ALLOWED',
    () => assertSucceeds(asDriverA().ref('assignments/assignDriverAOwn/status').set('started'))
  );
  await checkAsync(
    "driver writes another driver's assignment record DENIED (cross-user)",
    () => assertFails(asDriverA().ref('assignments/assignDriverB/status').set('started'))
  );
  await checkAsync(
    'driver writes their own record while also changing driverUsername DENIED (immutability)',
    () => assertFails(asDriverA().ref('assignments/assignDriverAOwn').update({ driverUsername: 'driverB', status: 'started' }))
  );
  await checkAsync(
    "driver writes their own record once status is 'completed' DENIED (terminal lockout)",
    () => assertFails(asDriverA().ref('assignments/assignDriverACompleted/status').set('started'))
  );
  await checkAsync(
    'bidang claims their own open self-drive assignment via a valid request cross-reference ALLOWED (also a regression check on v1.30.7.2\'s empty-string fix)',
    () => assertSucceeds(asBidang1().ref('assignments/assignSelfDriveOpen').update({ driver: 'Bidang One (Self-Drive)' }))
  );
  await checkAsync(
    'bidang attempts self-drive on an assignment that already has a driver DENIED (same fix, other branch)',
    () => assertFails(asBidang1().ref('assignments/assignSelfDriveTaken').update({ driver: 'Someone Else' }))
  );
  await checkAsync(
    "bidang attempts self-drive whose requestId references a FOREIGN bidang's request DENIED",
    () => assertFails(asBidang1().ref('assignments/assignSelfDriveForeign').update({ driver: 'Bidang One (Self-Drive)' }))
  );
  await checkAsync(
    'non-admin attempts to CREATE a brand-new assignment record DENIED (creation is admin-only via this rule)',
    () => assertFails(asDriverA().ref('assignments/assignBrandNew').set({ driverUsername: 'driverA', status: 'assigned' }))
  );
  await checkAsync(
    "viewer role attempts any assignment write DENIED (not in the rule's role list at all)",
    () => assertFails(asViewer().ref('assignments/assignDriverAOwn/status').set('started'))
  );
  await checkAsync(
    'admin write on any assignment record ALLOWED regardless of ownership (control case)',
    () => assertSucceeds(asAdmin().ref('assignments/assignDriverB/status').set('completed'))
  );
  await checkAsync(
    'adminEquivalent custom role write on assignments ALLOWED (a distinct literal clause from plain admin, never exercised on this rule before — also proves adminEquivalent bypasses the creation gate, same as admin)',
    () => assertSucceeds(asAdminEquivalent().ref('assignments/assignForAdminEquivProbe').set({ driverUsername: 'someone', status: 'assigned' }))
  );

  console.log('\n=== PERMANENT REGRESSION GUARD — requestId re-targeting exploit (v1.30.7.4) ===');
  console.log('  CONFIRMED, FIXED IN v1.30.7.4: before this fix, the rule pinned');
  console.log('  newData.driverUsername === data.driverUsername (immutable) but had no');
  console.log("  equivalent pin on requestId. The ownership check reads data.child('requestId')");
  console.log('  (the OLD value) to verify the cross-referenced driver_requests record');
  console.log("  belongs to the caller, but never re-checked newData.child('requestId') — so a");
  console.log('  bidang user legitimately claiming their own open self-drive assignment could');
  console.log('  ALSO retarget requestId to a request owned by a different bidang in the same');
  console.log('  write, and the old-value-based ownership check never noticed. Verified against');
  console.log('  the real emulator: ALLOWED before the fix, DENIED after. This section must');
  console.log('  never go green on the exploit case without the paired legitimate case also');
  console.log('  passing — if it does, the fix was reverted or weakened.');
  await checkAsync(
    'REGRESSION: bidang1 claims assignSelfDriveForHypothesis (legitimate, dedicated never-mutated fixture) while retargeting requestId to reqBidang2 (foreign) in the SAME write — DENIED (the fixed exploit)',
    () => assertFails(asBidang1().ref('assignments/assignSelfDriveForHypothesis').update({ driver: 'Bidang One (Self-Drive)', requestId: 'reqBidang2' }))
  );
  await checkAsync(
    'REGRESSION: bidang1 claims assignSelfDriveForHypothesis WITHOUT changing requestId — still ALLOWED (the fix does not break the legitimate self-drive claim)',
    () => assertSucceeds(asBidang1().ref('assignments/assignSelfDriveForHypothesis').update({ driver: 'Bidang One (Self-Drive)' }))
  );
} finally {
  await testEnv.cleanup();
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
