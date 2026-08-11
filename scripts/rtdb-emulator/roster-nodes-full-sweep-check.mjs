/* roster-nodes-full-sweep-check.mjs — RTDB Authorization Validation Suite
   (v1.30.7.5, Phase B: Full RTDB Authorization Matrix)

   REAL Firebase Realtime Database emulator test completing coverage on
   `drivers`/`vehicles` (migration plan §4 "Role-owned, broad-read").
   Phase A's role-claim-rules-check.mjs already proved: drivers
   unauthenticated-read-deny, drivers driver-role-read-allow, drivers
   bidang-write-deny, drivers admin-write-allow, drivers
   adminEquivalent-write-allow, vehicles viewer-read-allow, vehicles
   driver-write-deny, vehicles admin-write-allow. NONE of those are
   repeated here. This file fills exactly the remaining gaps: vehicles'
   anonymous-read-deny and adminEquivalent-write-allow (parity with
   drivers' existing coverage), a Custom Role (non-adminEquivalent)
   write-deny on both nodes (a genuinely new claims shape), and explicit
   anonymous write-deny on both nodes (only read was ever proven
   unauthenticated so far, never write). No field-modification variant —
   this rule ignores payload content entirely, so a one-field write and a
   whole-node write hit the identical boolean.

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
  projectId: 'demo-sarpras-phaseb-roster',
  database: { rules: rulesSource, host: '127.0.0.1', port: DB_PORT },
});

const asAdminEquivalent = () => testEnv.authenticatedContext('id-custom-super', { role: 'fasilitas_super', adminEquivalent: true }).database();
const asCustomNonEquivalent = () => testEnv.authenticatedContext('id-custom-basic', { role: 'fasilitas_basic' }).database();
const asAnon = () => testEnv.unauthenticatedContext().database();

try {
  await testEnv.clearDatabase();

  for (const node of ['drivers', 'vehicles']) {
    console.log(`\n=== ${node} — gap-filling completion ===`);
    await checkAsync(`${node}: unauthenticated write DENIED (write-side anonymous, only read-side was proven before)`, () => assertFails(asAnon().ref(`${node}/probe`).set({ name: 'x' })));
    await checkAsync(`${node}: Custom Role (non-adminEquivalent) write DENIED`, () => assertFails(asCustomNonEquivalent().ref(`${node}/probe2`).set({ name: 'y' })));
  }

  console.log('\n=== vehicles — parity completion with drivers\' existing Phase A coverage ===');
  await checkAsync('vehicles: unauthenticated read DENIED (drivers already proved this; vehicles never was)', () => assertFails(asAnon().ref('vehicles').once('value')));
  await checkAsync('vehicles: adminEquivalent write ALLOWED (drivers already proved this; vehicles never was)', () => assertSucceeds(asAdminEquivalent().ref('vehicles/probe3').set({ plate: 'Z' })));
} finally {
  await testEnv.cleanup();
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
