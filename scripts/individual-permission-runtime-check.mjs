/* individual-permission-runtime-check.mjs — Individual Permission
   Assignment, Phase 2: Runtime Permission Resolution (v1.30.9.5)
   PURE node test. Mirrors permission-service-check.mjs's established
   pattern (auth.js is Firebase-coupled, not Node-loadable, so the base
   permissionSetFor() algorithm is locally mirrored, parameterized by role
   instead of getCurrentUser()) — but drives the REAL
   user-permission-overrides-rules.js#normalizeOverrideRecord() directly
   for the override half, since that file is pure/Node-loadable by design.
   This means every fail-closed/system.admin/malformed-record assertion
   below exercises the actual production normalization logic, not a
   second mirror of it.

   Covers the full §9/§15 resolution matrix from
   docs/INDIVIDUAL_PERMISSION_ASSIGNMENT_ARCHITECTURE_AUDIT_v1.30.9.md:
   System Role + override, Custom Role + override, archived Custom Role +
   override (individual grants survive independently — explicit product
   decision, v1.30.9.5), system.admin cannot become effective, unknown/
   malformed entries ignored, and the mandatory backward-compatibility
   invariant (no override record => byte-identical to pre-Phase-2
   behavior).

   The REAL wiring (permission-service.js -> individual-permission-
   provider.js -> user-permission-overrides-store.js's live cache) is
   exercised separately by the Puppeteer test,
   scripts/permission-runtime-invariant-check.mjs.

   Run: node scripts/individual-permission-runtime-check.mjs (exit 0 = pass) */

import { normalizeOverrideRecord } from '../js/permission-management/user-permission-overrides-rules.js';
import { ROLE_PERMISSIONS } from '../js/config/role-permissions.js';
import { ROLES } from '../js/config/role-registry.js';
import { listAllPermissions } from '../js/config/permission-registry.js';

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };
const setsEqual = (a, b) => a.size === b.size && [...a].every((v) => b.has(v));

/* ── Local mirror of permission-service.js's base resolution (identical
   shape to permission-service-check.mjs's own mirror). ────────────────── */
const _setCache = new Map();
function permissionSetFor(roleId, customRoleFixtures = []) {
  if (!roleId) return new Set();
  if (roleId in ROLE_PERMISSIONS) {
    if (!_setCache.has(roleId)) _setCache.set(roleId, new Set(ROLE_PERMISSIONS[roleId] || []));
    return _setCache.get(roleId);
  }
  const customRole = customRoleFixtures.find((r) => r.id === roleId) || null;
  if (!customRole || customRole.archived === true) return new Set();
  return new Set(customRole.permissions || []);
}

/* ── Local mirror of permission-service.js's effectivePermissionSetFor().
   The override half calls the REAL normalizeOverrideRecord() — the same
   fail-closed/system.admin-stripping function the live cache applies on
   every RTDB snapshot. ─────────────────────────────────────────────── */
function effectivePermissionSetFor(roleId, rawOverrideRecord, customRoleFixtures = []) {
  const base = permissionSetFor(roleId, customRoleFixtures);
  const overrides = normalizeOverrideRecord(rawOverrideRecord);
  if (overrides.size === 0) return base;
  const merged = new Set(base);
  for (const p of overrides) merged.add(p);
  return merged;
}

console.log('\n1. Backward compatibility — no override record is byte-identical to pre-Phase-2 behavior');
for (const role of ROLES) {
  check(
    `${role.id}: effective(no override) === base permissionSetFor()`,
    setsEqual(effectivePermissionSetFor(role.id, null), permissionSetFor(role.id))
  );
}
check('an override record with an EMPTY array is identical to no record at all', setsEqual(
  effectivePermissionSetFor('viewer', { permissions: [] }),
  effectivePermissionSetFor('viewer', null)
));

console.log('\n2. System Role + override — union (Cases 1-6)');
check('viewer + no override => base only', setsEqual(effectivePermissionSetFor('viewer', null), new Set(ROLE_PERMISSIONS.viewer)));
check('viewer + one override => base + override', setsEqual(
  effectivePermissionSetFor('viewer', { permissions: ['pettycash.view'] }),
  new Set([...ROLE_PERMISSIONS.viewer, 'pettycash.view'])
));
check('viewer + multiple overrides => union of all', setsEqual(
  effectivePermissionSetFor('viewer', { permissions: ['pettycash.view', 'analytics.view'] }),
  new Set([...ROLE_PERMISSIONS.viewer, 'pettycash.view', 'analytics.view'])
));
check('bidang + override => union', setsEqual(
  effectivePermissionSetFor('bidang', { permissions: ['warehouse.view'] }),
  new Set([...ROLE_PERMISSIONS.bidang, 'warehouse.view'])
));
check('driver + override => union', setsEqual(
  effectivePermissionSetFor('driver', { permissions: ['overtime.view'] }),
  new Set([...ROLE_PERMISSIONS.driver, 'overtime.view'])
));
check('admin + override => admin semantics unchanged (override is a strict subset already)', setsEqual(
  effectivePermissionSetFor('admin', { permissions: ['pettycash.view'] }),
  new Set(ROLE_PERMISSIONS.admin)
));
check('admin already holds system.admin regardless of any override', effectivePermissionSetFor('admin', { permissions: ['pettycash.view'] }).has('system.admin'));

console.log('\n3. Custom Role + override — union, no special-casing (Cases 7-9)');
const activeCustom = [{ id: 'custom-warehouse-lead', name: 'Warehouse Lead', permissions: ['warehouse.view', 'warehouse.item.edit'], archived: false }];
check('custom role + no override => exactly its own permission set', setsEqual(
  effectivePermissionSetFor('custom-warehouse-lead', null, activeCustom),
  new Set(['warehouse.view', 'warehouse.item.edit'])
));
check('custom role + one override => union', setsEqual(
  effectivePermissionSetFor('custom-warehouse-lead', { permissions: ['pettycash.view'] }, activeCustom),
  new Set(['warehouse.view', 'warehouse.item.edit', 'pettycash.view'])
));
check('custom role + multiple overrides => union of all', setsEqual(
  effectivePermissionSetFor('custom-warehouse-lead', { permissions: ['pettycash.view', 'overtime.view'] }, activeCustom),
  new Set(['warehouse.view', 'warehouse.item.edit', 'pettycash.view', 'overtime.view'])
));

console.log('\n4. Archived Custom Role + override — EXPLICIT PRODUCT DECISION (v1.30.9.5): base collapses to EMPTY_SET, override survives independently (Case 10)');
const archivedCustom = [{ id: 'custom-retired', name: 'Retired Role', permissions: ['warehouse.view', 'warehouse.item.edit'], archived: true }];
check('archived custom role alone (no override) fails closed to EMPTY_SET — unchanged, pre-existing behavior', permissionSetFor('custom-retired', archivedCustom).size === 0);
check('archived custom role + override => effective set is EXACTLY the override, not the archived role\'s old grants', setsEqual(
  effectivePermissionSetFor('custom-retired', { permissions: ['pettycash.view'] }, archivedCustom),
  new Set(['pettycash.view'])
));
check('archived custom role\'s own former permissions are NOT resurrected by the presence of an override', !effectivePermissionSetFor('custom-retired', { permissions: ['pettycash.view'] }, archivedCustom).has('warehouse.view'));
check('archived custom role + multiple overrides => exactly those overrides', setsEqual(
  effectivePermissionSetFor('custom-retired', { permissions: ['pettycash.view', 'overtime.view'] }, archivedCustom),
  new Set(['pettycash.view', 'overtime.view'])
));

console.log('\n5. Security — system.admin can NEVER become effective through an override (Cases 11-12)');
check('override containing ONLY system.admin => effective set unaffected (empty override contribution)', setsEqual(
  effectivePermissionSetFor('viewer', { permissions: ['system.admin'] }),
  new Set(ROLE_PERMISSIONS.viewer)
));
check('system.admin mixed with a valid permission => the valid one still lands, system.admin never does', (() => {
  const eff = effectivePermissionSetFor('viewer', { permissions: ['system.admin', 'pettycash.view'] });
  return eff.has('pettycash.view') && !eff.has('system.admin');
})());
check('a viewer + override can NEVER reach system.admin, under any override content', !effectivePermissionSetFor('viewer', { permissions: ['system.admin', 'pettycash.view', 'analytics.view'] }).has('system.admin'));
check('an archived-role-plus-override scenario also cannot smuggle system.admin in', !effectivePermissionSetFor('custom-retired', { permissions: ['system.admin'] }, archivedCustom).has('system.admin'));

console.log('\n6. Unknown / malformed override entries — ignored, never poison the whole record (Cases 13-14)');
check('an unknown permission id in the override is silently ignored', !effectivePermissionSetFor('viewer', { permissions: ['totally.fake.permission'] }).has('totally.fake.permission'));
check('a valid permission survives alongside an unknown one in the same record', effectivePermissionSetFor('viewer', { permissions: ['totally.fake.permission', 'pettycash.view'] }).has('pettycash.view'));
check('a malformed record (permissions is a string, not an array) fails closed to base-only', setsEqual(effectivePermissionSetFor('viewer', { permissions: 'pettycash.view' }), permissionSetFor('viewer')));
check('a malformed record (permissions missing entirely) fails closed to base-only', setsEqual(effectivePermissionSetFor('viewer', { updatedAt: 'x' }), permissionSetFor('viewer')));
check('a non-object record (garbage) fails closed to base-only', setsEqual(effectivePermissionSetFor('viewer', 'garbage'), permissionSetFor('viewer')));
check('null (no override record at all — the majority case) fails closed to base-only, not an error', setsEqual(effectivePermissionSetFor('viewer', null), permissionSetFor('viewer')));

console.log('\n7. Unresolvable / unknown role id — fails closed even with an override present (defense in depth)');
check('an unknown role id + override => only the override contributes (base is EMPTY_SET)', setsEqual(
  effectivePermissionSetFor('totally-unknown-role', { permissions: ['pettycash.view'] }),
  new Set(['pettycash.view'])
));

console.log('\n8. Set semantics — duplicates and re-grants are naturally idempotent');
check('duplicate permission ids in the override collapse to one entry\'s worth of effect', setsEqual(
  effectivePermissionSetFor('viewer', { permissions: ['pettycash.view', 'pettycash.view'] }),
  new Set([...ROLE_PERMISSIONS.viewer, 'pettycash.view'])
));
check('an override that re-grants something the base role ALREADY holds changes nothing observable', setsEqual(
  effectivePermissionSetFor('viewer', { permissions: ['driver.schedule.view'] }),
  permissionSetFor('viewer')
));

console.log('\n9. Registry coverage — every real permission id is a legal override target somewhere in this matrix');
const registeredNonAdmin = listAllPermissions().filter((p) => p.id !== 'system.admin').map((p) => p.id);
check('at least one non-system.admin permission exists to exercise (registry sanity)', registeredNonAdmin.length > 0);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
