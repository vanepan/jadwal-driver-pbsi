/* custom-role-protected-permission-check.mjs — Custom Role Protected
   Permission Security Hardening (v1.30.9.10)

   REAL Firebase Realtime Database emulator test for the NEW
   customRoles/$roleId/permissions/$index .validate clause. Proves the
   security boundary holds against the real rules engine, independent of
   the application-layer validation already proven pure-logic-only in
   custom-roles-check.mjs §4c/4d (isValidCustomRolePermissionSet/
   sanitizePermissionList/buildClonedRole) — same "the UI/store is not
   the final security boundary" discipline this whole program has used
   since Individual Permission Assignment, Phase 1.

   Pre-existing authorization semantics (.read's archived-conditional
   rule, .write's admin-only-no-adminEquivalent rule) are DELIBERATELY
   NOT re-proven exhaustively here — custom-role-archived-rule-check.mjs
   already owns that coverage and is re-run unchanged as part of this
   task's regression (see the Final Report). This file adds ONLY what's
   new: the .validate clause, and confirms it doesn't disturb the write
   authorization boundary it sits alongside.

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
  projectId: 'demo-sarpras-customroleprotected',
  database: { rules: rulesSource, host: '127.0.0.1', port: DB_PORT },
});

const asAdmin = () => testEnv.authenticatedContext('id-admin', { role: 'admin' }).database();
const asAdminEquivalent = () => testEnv.authenticatedContext('id-custom-super', { role: 'fasilitas_super', adminEquivalent: true }).database();
const asViewer = () => testEnv.authenticatedContext('id-viewer', { role: 'viewer' }).database();
const asDriver = () => testEnv.authenticatedContext('id-driver', { role: 'driver' }).database();
const asBidang = () => testEnv.authenticatedContext('id-bidang', { role: 'bidang' }).database();
const asAnon = () => testEnv.unauthenticatedContext().database();

try {
  await testEnv.clearDatabase();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.database();
    await db.ref('customRoles/roleValid').set({
      name: 'Valid Role', archived: false,
      permissions: ['warehouse.view', 'vehicle.view'],
      createdAt: '2026-08-13T00:00:00.000Z', updatedAt: '2026-08-13T00:00:00.000Z',
    });
  });

  console.log('\n=== 1. Admin can write valid Custom Role permissions (control case) ===');
  await checkAsync('admin -> replaces the whole permissions array with a valid one ALLOWED', () => assertSucceeds(asAdmin().ref('customRoles/roleValid/permissions').set(['warehouse.view', 'overtime.view'])));
  await checkAsync('admin -> creates a brand-new Custom Role with valid permissions ALLOWED', () => assertSucceeds(asAdmin().ref('customRoles/roleFresh').set({ name: 'Fresh Role', archived: false, permissions: ['pettycash.view'] })));

  console.log('\n=== 2-4. Admin cannot write either protected id (the core boundary) ===');
  await checkAsync('admin -> writes system.admin alone DENIED', () => assertFails(asAdmin().ref('customRoles/roleValid/permissions').set(['system.admin'])));
  await checkAsync('admin -> writes system.users.manage alone DENIED', () => assertFails(asAdmin().ref('customRoles/roleValid/permissions').set(['system.users.manage'])));
  await checkAsync('admin -> writes BOTH protected ids together DENIED', () => assertFails(asAdmin().ref('customRoles/roleValid/permissions').set(['system.admin', 'system.users.manage'])));
  await checkAsync('admin -> writes system.admin ALONGSIDE valid permissions DENIED (every element is checked, not just the first)', () => assertFails(asAdmin().ref('customRoles/roleValid/permissions').set(['warehouse.view', 'system.admin', 'vehicle.view'])));
  await checkAsync('admin -> writes a full Custom Role RECORD (not just the permissions sub-path) containing system.admin DENIED', () => assertFails(asAdmin().ref('customRoles/roleBlocked').set({ name: 'Blocked Role', archived: false, permissions: ['warehouse.view', 'system.admin'] })));
  await checkAsync('admin -> writes a full Custom Role RECORD containing system.users.manage DENIED', () => assertFails(asAdmin().ref('customRoles/roleBlocked').set({ name: 'Blocked Role', archived: false, permissions: ['system.users.manage'] })));

  console.log('\n=== 5. adminEquivalent cannot bypass validation ===');
  // customRoles' .write is admin-role-ONLY (no adminEquivalent clause at
  // all — a PRE-EXISTING, unrelated asymmetry this task does not touch,
  // already proven by custom-role-archived-rule-check.mjs). adminEquivalent
  // is therefore already denied for ANY write to this node, valid or not —
  // proven here for completeness of THIS file's own narrative, not because
  // the new .validate clause is what's stopping it.
  await checkAsync('adminEquivalent -> even a VALID permissions write is DENIED (pre-existing .write boundary, unrelated to this task)', () => assertFails(asAdminEquivalent().ref('customRoles/roleValid/permissions').set(['warehouse.view'])));
  await checkAsync('adminEquivalent -> attempting to write system.admin is ALSO denied (redundantly, by both boundaries)', () => assertFails(asAdminEquivalent().ref('customRoles/roleValid/permissions').set(['system.admin'])));

  console.log('\n=== 6-7. Non-admin / cross-user cannot write, valid or not ===');
  await checkAsync('viewer -> writing valid permissions DENIED', () => assertFails(asViewer().ref('customRoles/roleValid/permissions').set(['warehouse.view'])));
  await checkAsync('viewer -> writing system.admin DENIED', () => assertFails(asViewer().ref('customRoles/roleValid/permissions').set(['system.admin'])));
  await checkAsync('driver -> writing valid permissions DENIED', () => assertFails(asDriver().ref('customRoles/roleValid/permissions').set(['warehouse.view'])));
  await checkAsync('bidang -> writing system.users.manage DENIED', () => assertFails(asBidang().ref('customRoles/roleValid/permissions').set(['system.users.manage'])));
  await checkAsync('unauthenticated -> any write DENIED', () => assertFails(asAnon().ref('customRoles/roleValid/permissions').set(['warehouse.view'])));

  console.log('\n=== 8-9. Deep array-index injection denied (the exact bypass class this rule must close) ===');
  await checkAsync('admin -> deep-writes system.admin directly to permissions/0 DENIED', () => assertFails(asAdmin().ref('customRoles/roleValid/permissions/0').set('system.admin')));
  await checkAsync('admin -> deep-writes system.users.manage directly to a NEW index (permissions/5) DENIED', () => assertFails(asAdmin().ref('customRoles/roleValid/permissions/5').set('system.users.manage')));
  await checkAsync('admin -> deep-writes a non-string value to a permissions index DENIED (type matters)', () => assertFails(asAdmin().ref('customRoles/roleValid/permissions/0').set(42)));

  console.log('\n=== 10. Multi-location update() injection denied ===');
  await checkAsync('admin -> multi-path update() injecting system.admin at one path alongside an unrelated valid change elsewhere DENIED (whole update is atomic — nothing partially lands)', () => assertFails(asAdmin().ref().update({
    'customRoles/roleValid/permissions/0': 'system.admin',
    'customRoles/roleFresh/name': 'Fresh Role Renamed',
  })));
  await checkAsync('admin -> update() replacing the whole permissions array (as an update, not a set) with a valid one ALLOWED', () => assertSucceeds(asAdmin().ref().update({
    'customRoles/roleValid/permissions': ['overtime.view', 'pettycash.view'],
  })));
  await checkAsync('admin -> update() replacing the whole permissions array with one containing system.users.manage DENIED', () => assertFails(asAdmin().ref().update({
    'customRoles/roleValid/permissions': ['overtime.view', 'system.users.manage'],
  })));

  console.log('\n=== 11-12. Valid permission removal and replacement still work (the fix is narrow, not a blanket lockdown) ===');
  await checkAsync('admin -> removes one valid permission, keeping another ALLOWED', () => assertSucceeds(asAdmin().ref('customRoles/roleValid/permissions').set(['overtime.view'])));
  await checkAsync('admin -> replaces the entire valid permissions array with a different valid one ALLOWED', () => assertSucceeds(asAdmin().ref('customRoles/roleValid/permissions').set(['warehouse.view', 'vehicle.maintenance', 'analytics.view'])));
  await checkAsync('admin -> deletes the whole Custom Role record ALLOWED (unaffected by the new validate clause)', () => assertSucceeds(asAdmin().ref('customRoles/roleFresh').set(null)));

  console.log('\n=== 13. Existing authorization semantics remain intact (spot-check; full coverage stays in custom-role-archived-rule-check.mjs) ===');
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await context.database().ref('customRoles/roleArchivedSpotCheck').set({ name: 'Archived', archived: true, permissions: ['warehouse.view'] });
  });
  await checkAsync('viewer -> still reads a NON-archived role (read boundary untouched)', () => assertSucceeds(asViewer().ref('customRoles/roleValid').once('value')));
  await checkAsync('viewer -> still denied reading an ARCHIVED role (read boundary untouched)', () => assertFails(asViewer().ref('customRoles/roleArchivedSpotCheck').once('value')));
  await checkAsync('admin -> still reads an archived role (admin bypass untouched)', () => assertSucceeds(asAdmin().ref('customRoles/roleArchivedSpotCheck').once('value')));

  console.log('\n=== A note on unregistered-but-not-dangerous permission ids (same deliberate, documented scope boundary as the sibling override nodes) ===');
  await checkAsync('admin -> writing an UNREGISTERED (but not dangerous) permission id is ALLOWED AT THE RULES LAYER — full Permission Registry membership is not duplicated into database.rules.json for Custom Roles either, matching the sibling nodes\' own documented tradeoff', () => assertSucceeds(asAdmin().ref('customRoles/roleValid/permissions').set(['totally.made.up.permission'])));
} finally {
  await testEnv.cleanup();
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
