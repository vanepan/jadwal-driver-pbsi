/* gudang-nodes-check.mjs — RTDB Authorization Validation Suite (v1.30.7.5,
   Phase B: Full RTDB Authorization Matrix)

   REAL Firebase Realtime Database emulator test of the 7 `gudang/*` nodes
   — the only "Admin-owned" nodes with `.validate` shape constraints, a
   genuinely different failure axis from the role gate (migration plan §1
   explicitly distinguishes ".validate constrains data SHAPE, not WHO" from
   the `.read`/`.write` access-control layer this whole suite otherwise
   tests). Two concerns are kept visually separate per node: the role gate
   (admin-family allow, one representative deny — same shape as
   admin-owned-uniform-nodes-check.mjs, no role sweep needed) and the
   `.validate` boundary (tested against an otherwise fully role-authorized
   admin write, so a denial can only be attributed to shape, not access).

   Fixture data is valid-by-construction for every node (satisfies that
   node's own `hasChildren`/type/own-id-match requirement) so role-gate
   checks aren't accidentally confounded by an unrelated validate failure.

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
  projectId: 'demo-sarpras-phaseb-gudang',
  database: { rules: rulesSource, host: '127.0.0.1', port: DB_PORT },
});

const asAdmin = () => testEnv.authenticatedContext('id-admin', { role: 'admin' }).database();
const asDeveloper = () => testEnv.authenticatedContext('id-developer', { role: 'developer' }).database();
const asAdminEquivalent = () => testEnv.authenticatedContext('id-custom-super', { role: 'fasilitas_super', adminEquivalent: true }).database();
const asBidang = () => testEnv.authenticatedContext('id-bidang', { role: 'bidang' }).database();

const now = Date.now();
const validItem = { itemId: 'itemProbe', name: 'Test Item', itemType: 'consumable', active: true, normalizedName: 'test item', searchTokens: ['test', 'item'], createdAt: now };
const validMovement = { movementId: 'movProbe', itemId: 'itemProbe', type: 'in', quantityDelta: 5, reason: 'test', actorId: 'id-admin', createdAt: now };
const validAsset = { assetId: 'assetProbe', itemId: 'itemProbe', identity: 'SN123', status: 'active', createdAt: now };
const validHistory = { historyId: 'histProbe', assetId: 'assetProbe', eventType: 'created', actorId: 'id-admin', reason: 'test', occurredAt: now };
const validLocation = { locationId: 'locProbe', name: 'Test Location', createdAt: now };
const validDepartment = { departmentId: 'deptProbe', name: 'Test Dept', createdAt: now };
const validStockProjection = { itemId: 'itemProbe2', quantity: 10, rebuiltAt: now, consistent: true };

const ROLE_GATE_NODES = [
  { node: 'gudang/items/roleGateProbe', idField: 'itemId', data: { ...validItem, itemId: 'roleGateProbe' } },
  { node: 'gudang/movements/roleGateProbe', idField: 'movementId', data: { ...validMovement, movementId: 'roleGateProbe' } },
  { node: 'gudang/assets/roleGateProbe', idField: 'assetId', data: { ...validAsset, assetId: 'roleGateProbe' } },
  { node: 'gudang/assetHistory/roleGateProbe', idField: 'historyId', data: { ...validHistory, historyId: 'roleGateProbe' } },
  { node: 'gudang/locations/roleGateProbe', idField: 'locationId', data: { ...validLocation, locationId: 'roleGateProbe' } },
  { node: 'gudang/departments/roleGateProbe', idField: 'departmentId', data: { ...validDepartment, departmentId: 'roleGateProbe' } },
  { node: 'gudang/stockProjection/roleGateProbe', idField: 'itemId', data: { ...validStockProjection, itemId: 'roleGateProbe' } },
];

try {
  await testEnv.clearDatabase();

  console.log('\n=== Role gate — admin-family write allow, representative non-privileged deny (all 7 gudang nodes) ===');
  for (const { node, idField, data } of ROLE_GATE_NODES) {
    await checkAsync(`${node}: admin write (valid shape) ALLOWED`, () => assertSucceeds(asAdmin().ref(node).set(data)));
    await checkAsync(`${node}: developer read ALLOWED (distinct named clause, not just admin)`, () => assertSucceeds(asDeveloper().ref(node).once('value')));
    const equivKey = node.replace('roleGateProbe', 'roleGateProbeEquiv');
    await checkAsync(`${node}: adminEquivalent write ALLOWED (distinct named clause, proven THROUGH the .validate layer too, not just the role check in isolation)`, () => assertSucceeds(asAdminEquivalent().ref(equivKey).set({ ...data, [idField]: equivKey.split('/').pop() })));
    await checkAsync(`${node}: bidang write DENIED`, () => assertFails(asBidang().ref(node.replace('roleGateProbe', 'roleGateProbe2')).set({ ...data })));
  }

  console.log("\n=== .validate boundary — items: itemType immutability ===");
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await context.database().ref('gudang/items/itemProbe').set(validItem);
  });
  await checkAsync('items: admin write to an EXISTING record with itemType UNCHANGED ALLOWED (genuinely exercises the data.exists() && itemType-match branch, not just the !data.exists()-so-anything-goes branch)', () => assertSucceeds(asAdmin().ref('gudang/items/itemProbe').set(validItem)));
  await checkAsync('items: admin write to that SAME existing record CHANGING itemType DENIED (immutability, not a role issue)', () => assertFails(asAdmin().ref('gudang/items/itemProbe').set({ ...validItem, itemType: 'asset' })));
  await checkAsync('items: admin write MISSING a required hasChildren field DENIED (.validate, not a role issue)', () => assertFails(asAdmin().ref('gudang/items/itemIncomplete').set({ itemId: 'itemIncomplete', name: 'Incomplete' })));

  console.log('\n=== .validate boundary — movements/assetHistory: append-only, even for admin ===');
  await checkAsync('movements: admin FIRST write to a fresh key ALLOWED', () => assertSucceeds(asAdmin().ref('gudang/movements/movFirst').set({ ...validMovement, movementId: 'movFirst' })));
  await checkAsync('movements: admin SECOND write to the SAME existing key DENIED (append-only — stricter than the role gate, same contrast as system-internal-and-append-only-check.mjs)', () => assertFails(asAdmin().ref('gudang/movements/movFirst').set({ ...validMovement, movementId: 'movFirst', quantityDelta: 99 })));
  await checkAsync('assetHistory: admin FIRST write to a fresh key ALLOWED', () => assertSucceeds(asAdmin().ref('gudang/assetHistory/histFirst').set({ ...validHistory, historyId: 'histFirst' })));
  await checkAsync('assetHistory: admin SECOND write to the SAME existing key DENIED (append-only, even for admin)', () => assertFails(asAdmin().ref('gudang/assetHistory/histFirst').set({ ...validHistory, historyId: 'histFirst', reason: 'overwrite attempt' })));

  console.log('\n=== .validate boundary — movements/stockProjection: numeric type checks ===');
  await checkAsync('movements: admin write with quantityDelta as a STRING DENIED (isNumber() type validate)', () => assertFails(asAdmin().ref('gudang/movements/movBadType').set({ ...validMovement, movementId: 'movBadType', quantityDelta: 'five' })));
  await checkAsync('stockProjection: admin write with quantity as a STRING DENIED (isNumber() type validate)', () => assertFails(asAdmin().ref('gudang/stockProjection/itemProbe2').set({ ...validStockProjection, quantity: 'ten' })));
  await checkAsync('stockProjection: admin write with quantity as a NUMBER ALLOWED (control case)', () => assertSucceeds(asAdmin().ref('gudang/stockProjection/itemProbe2').set(validStockProjection)));
} finally {
  await testEnv.cleanup();
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
