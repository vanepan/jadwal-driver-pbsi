/* permission-service-check.mjs — Permission Foundation (v1.30.0; extended
   v1.30.5 for Custom Role resolution + the runtime invariant guard)
   PURE node test. Drives the REAL permission-registry.js + role-permissions.js
   directly (both pure, both Node-loadable — no Firebase mocking needed).
   permission-service.js itself imports auth.js (Firebase-touching, not
   Node-loadable, same constraint documented in vehicle-asset-check.mjs), so
   its can()/cannot()/hasAny()/hasAll()/listPermissions() are exercised here
   via a local mirror of the exact same permissionSetFor() algorithm,
   parameterized by role instead of getCurrentUser() — the same pattern
   other check scripts use to test pure logic without booting Firebase. The
   v1.30.5 Custom Role branch of that mirror is checked against synthetic
   fixtures (custom-roles-store.js itself is Firebase-coupled, not
   Node-loadable — its Puppeteer-driven counterpart is
   scripts/permission-runtime-invariant-check.mjs).
   Covers: permission lookup, unknown permission, multiple permissions, role
   mapping, caching, performance, edge cases, regression (eng./sic. parity
   with role-registry.js CAPABILITIES), registry integrity, the
   Module -> Feature -> Permission hierarchy tree, Custom Role resolution,
   and a permanent drift guard against Role Management's own Role Summary
   computation (role-management-logic.js#grantedSetForRole).
   Run: node scripts/permission-service-check.mjs (exit 0 = pass) */

import {
  PERMISSIONS,
  getPermission,
  listAllPermissions,
  permissionsByModule,
  permissionsByCategory,
  buildPermissionTree,
} from '../js/config/permission-registry.js';
import {
  ROLE_PERMISSIONS,
  permissionsForRole,
  validateRegistryIntegrity,
} from '../js/config/role-permissions.js';
import { ROLES, CAPABILITIES } from '../js/config/role-registry.js';
import { grantedSetForRole } from '../js/role-management/role-management-logic.js';

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };

/* ── Local mirror of permission-service.js's algorithm, parameterized by
   role instead of getCurrentUser() (auth.js is not Node-loadable). The
   Custom Role fallback branch (v1.30.5) is mirrored against a synthetic
   fixture array instead of the real (Firebase-coupled) custom-roles-store.js
   — same shape (`{id, permissions, archived}`) getCustomRoleById() returns. */
const _setCache = new Map();
// v1.30.9.10 — Custom Role Protected Permission Security Hardening: the
// REAL permission-service.js now strips these two ids from a Custom
// Role's own base contribution unconditionally (permissionSetFor()'s
// NEVER_EFFECTIVE_IN_CUSTOM_ROLE_BASE) — mirrored here so this file's
// local mirror doesn't silently drift from the real algorithm.
const NEVER_EFFECTIVE_IN_CUSTOM_ROLE_BASE = ['system.admin', 'system.users.manage'];
function permissionSetFor(roleId, customRoleFixtures = []) {
  if (!roleId) return new Set();
  if (roleId in ROLE_PERMISSIONS) {
    if (!_setCache.has(roleId)) _setCache.set(roleId, new Set(ROLE_PERMISSIONS[roleId] || []));
    return _setCache.get(roleId);
  }
  const customRole = customRoleFixtures.find((r) => r.id === roleId) || null;
  if (!customRole || customRole.archived === true) return new Set();
  const permissions = new Set(customRole.permissions || []);
  for (const id of NEVER_EFFECTIVE_IN_CUSTOM_ROLE_BASE) permissions.delete(id);
  return permissions;
}
const canAs = (roleId, permission, fixtures) => permissionSetFor(roleId, fixtures).has(permission);
const cannotAs = (roleId, permission, fixtures) => !canAs(roleId, permission, fixtures);
const hasAnyAs = (roleId, permissions) => permissions.some((p) => canAs(roleId, p));
const hasAllAs = (roleId, permissions) => permissions.length > 0 && permissions.every((p) => canAs(roleId, p));
const listPermissionsAs = (roleId) => permissionsForRole(roleId);

console.log('\n1. Permission lookup — matches real auth.js/role-registry.js behavior');
check('admin can driver.schedule.create', canAs('admin', 'driver.schedule.create'));
check('admin can warehouse.item.delete', canAs('admin', 'warehouse.item.delete'));
check('admin can system.admin', canAs('admin', 'system.admin'));
check('bidang cannot driver.schedule.create (admin-only)', cannotAs('bidang', 'driver.schedule.create'));
check('bidang can driver.request.create', canAs('bidang', 'driver.request.create'));
check('driver cannot driver.request.create (bidang-only)', cannotAs('driver', 'driver.request.create'));
check('driver can driver.schedule.view.own', canAs('driver', 'driver.schedule.view.own'));
check('viewer can driver.schedule.view', canAs('viewer', 'driver.schedule.view'));
check('viewer cannot driver.schedule.start', cannotAs('viewer', 'driver.schedule.start'));
check('viewer cannot warehouse.view (admin-only)', cannotAs('viewer', 'warehouse.view'));
check('engineering_coordinator can eng.verify', canAs('engineering_coordinator', 'eng.verify'));
check('engineering_coordinator cannot eng.create (admin-only)', cannotAs('engineering_coordinator', 'eng.create'));
check('engineering_member can eng.continueTomorrow.ownOnly', canAs('engineering_member', 'eng.continueTomorrow.ownOnly'));
check('engineering_member cannot eng.verify (coordinator-only)', cannotAs('engineering_member', 'eng.verify'));
check('bidang can sic.review.act', canAs('bidang', 'sic.review.act'));
check('bidang cannot sic.approve.act (admin-only)', cannotAs('bidang', 'sic.approve.act'));

console.log('\n2. Unknown permission — deny by default, every role');
for (const role of ['admin', 'bidang', 'driver', 'viewer', 'engineering_coordinator', 'engineering_member']) {
  check(`${role} cannot 'nonexistent.permission'`, cannotAs(role, 'nonexistent.permission'));
}
check('getPermission() returns null for unknown id', getPermission('nonexistent.permission') === null);

console.log('\n3. Multiple permissions — hasAny/hasAll composition');
check('admin hasAll([system.admin, warehouse.view])', hasAllAs('admin', ['system.admin', 'warehouse.view']));
check('driver hasAny([driver.schedule.view.own, system.admin])', hasAnyAs('driver', ['driver.schedule.view.own', 'system.admin']));
check('driver !hasAll([driver.schedule.view.own, system.admin])', !hasAllAs('driver', ['driver.schedule.view.own', 'system.admin']));
check('viewer !hasAny([system.admin, warehouse.view])', !hasAnyAs('viewer', ['system.admin', 'warehouse.view']));
check('hasAny([]) is false (no permission satisfies an empty ask)', !hasAnyAs('admin', []));
check('hasAll([]) is false (vacuous grant explicitly denied, not truthy)', !hasAllAs('admin', []));

console.log('\n4. Role mapping — ROLE_PERMISSIONS matches hand-computed expected sets');
const expectDriver = new Set(['driver.schedule.view', 'driver.schedule.view.own', 'driver.schedule.start', 'driver.schedule.complete', 'driver.reimbursement.print']);
check('driver grant set matches exactly', setsEqual(new Set(ROLE_PERMISSIONS.driver), expectDriver));
const expectViewer = new Set(['driver.schedule.view']);
check('viewer grant set matches exactly', setsEqual(new Set(ROLE_PERMISSIONS.viewer), expectViewer));
const expectBidang = new Set(['driver.schedule.view', 'driver.request.create', 'driver.schedule.start', 'driver.schedule.complete', 'driver.schedule.cancel', 'sic.review.act']);
check('bidang grant set matches exactly', setsEqual(new Set(ROLE_PERMISSIONS.bidang), expectBidang));
check('engineering_coordinator has 12 eng.* grants (no create/edit/delete/analytics/settings/ownOnly)', ROLE_PERMISSIONS.engineering_coordinator.length === 12);
check('engineering_member has 9 eng.* grants', ROLE_PERMISSIONS.engineering_member.length === 9);
check('reserved executive roles (ketua_umum) hold zero permissions today', ROLE_PERMISSIONS.ketua_umum.length === 0);
check('every role in role-registry.js ROLES has a ROLE_PERMISSIONS entry', ROLES.every((r) => Array.isArray(ROLE_PERMISSIONS[r.id])));
check('listPermissions()-equivalent agrees with ROLE_PERMISSIONS for admin', setsEqual(new Set(listPermissionsAs('admin')), new Set(ROLE_PERMISSIONS.admin)));

console.log('\n5. Caching — repeated lookups reuse the same Set instance');
const setA = permissionSetFor('admin');
const setB = permissionSetFor('admin');
check('permissionSetFor(admin) returns the identical Set reference on repeat calls', setA === setB);
const cacheSizeBefore = _setCache.size;
permissionSetFor('admin'); permissionSetFor('admin'); permissionSetFor('admin');
check('cache does not grow on repeated lookups of the same role', _setCache.size === cacheSizeBefore);

console.log('\n6. Performance — bulk lookups stay fast (sanity bound, not a benchmark)');
const perfStart = Date.now();
for (let i = 0; i < 50000; i++) canAs('admin', 'warehouse.item.edit');
const perfMs = Date.now() - perfStart;
check(`50,000 can() lookups complete in <500ms (took ${perfMs}ms)`, perfMs < 500);

console.log('\n7. Edge cases');
check('canAs(null, ...) is false (signed-out session)', !canAs(null, 'system.admin'));
check('canAs(undefined, ...) is false', !canAs(undefined, 'system.admin'));
check("canAs('ghost-role', ...) is false (unknown role id)", !canAs('ghost-role', 'system.admin'));
check('listPermissionsAs(unknown role) returns empty array', listPermissionsAs('ghost-role').length === 0);
check('permissionsForRole(null) returns empty array, not a throw', permissionsForRole(null).length === 0);

console.log('\n8. Regression — eng.*/sic.* grants match role-registry.js CAPABILITIES exactly (reused, not diverged)');
let capabilityParityOk = true;
for (const [cap, allowedRoles] of Object.entries(CAPABILITIES)) {
  for (const role of ROLES.map((r) => r.id)) {
    const expected = allowedRoles.includes(role);
    const actual = canAs(role, cap);
    if (expected !== actual) { capabilityParityOk = false; console.log(`    mismatch: ${cap} / ${role} expected ${expected}, got ${actual}`); }
  }
}
check('every CAPABILITIES entry agrees with ROLE_PERMISSIONS for every role', capabilityParityOk);

console.log('\n9. Registry integrity — role-permissions.js and permission-registry.js stay in sync');
const integrityProblems = validateRegistryIntegrity();
check('no role is granted a permission id missing from the catalog', integrityProblems.length === 0);
check('every catalog entry has non-empty title/description/module/category', listAllPermissions().every((p) => p.title && p.description && p.module && p.category));
check('every catalog entry id matches its own key', Object.entries(PERMISSIONS).every(([k, v]) => k === v.id));

console.log('\n10. Hierarchy — Module -> Feature -> Permission tree derives automatically');
const tree = buildPermissionTree();
const totalInTree = Object.values(tree).reduce((sum, cats) => sum + Object.values(cats).reduce((s2, list) => s2 + list.length, 0), 0);
check('every permission appears exactly once in the tree', totalInTree === listAllPermissions().length);
check("tree has a 'Warehouse' module", Object.prototype.hasOwnProperty.call(tree, 'Warehouse'));
check("Warehouse -> 'Items' feature has 3 permissions (view/create excluded, edit/create/delete included)", tree.Warehouse.Items.length === 3);
check("Warehouse -> 'Goods In' feature has exactly 1 permission", tree.Warehouse['Goods In'].length === 1);
check('permissionsByModule(Warehouse) matches the tree module total', permissionsByModule('Warehouse').length === Object.values(tree.Warehouse).reduce((s, l) => s + l.length, 0));
check('permissionsByCategory(Warehouse, Items) matches tree leaf', permissionsByCategory('Warehouse', 'Items').length === tree.Warehouse.Items.length);
check('every module/category referenced in PERMISSIONS appears as a tree node', listAllPermissions().every((p) => tree[p.module] && tree[p.module][p.category] && tree[p.module][p.category].some((x) => x.id === p.id)));

console.log('\n11. Custom Role resolution (v1.30.5) — fallback path, fail-closed rules');
const customFixtures = [
  { id: 'warehouse-lead-a1b2', name: 'Warehouse Lead', permissions: ['warehouse.view', 'warehouse.item.edit'], archived: false },
  { id: 'retired-role-9z', name: 'Retired Role', permissions: ['system.admin'], archived: true },
];
check('a non-archived Custom Role sees its own granted permission', canAs('warehouse-lead-a1b2', 'warehouse.item.edit', customFixtures));
check('a non-archived Custom Role does not see an ungranted permission', cannotAs('warehouse-lead-a1b2', 'system.admin', customFixtures));
check('an archived Custom Role fails closed even for a permission it was granted before archiving', cannotAs('retired-role-9z', 'system.admin', customFixtures));
check("an unresolvable role id (no System Role, no fixture match) fails closed", cannotAs('no-such-role', 'driver.schedule.view', customFixtures));
check('a System Role id is never shadowed by a same-named Custom Role fixture (registry checked first)', canAs('admin', 'driver.schedule.create', [{ id: 'admin', permissions: [], archived: false }]));

console.log('\n11b. Custom Role Protected Permission Security Hardening (v1.30.9.10) — a NON-archived Custom Role can NEVER hold system.admin/system.users.manage as effective, regardless of what its persisted record contains (legacy data, a rules bypass, or otherwise)');
const legacyInvalidFixtures = [
  // Simulates a pre-hardening (or admin-console-bypassed) persisted record —
  // the exact real-world shape this task's own "LEGACY INVALID DATA"
  // section asks to be verified fail-safe.
  { id: 'legacy-god-mode', name: 'Legacy God Mode', permissions: ['warehouse.view', 'system.admin', 'system.users.manage'], archived: false },
];
check('SECURITY: a non-archived Custom Role holding system.admin in its persisted record NEVER has it effective', cannotAs('legacy-god-mode', 'system.admin', legacyInvalidFixtures));
check('SECURITY: the same record\'s system.users.manage is also never effective', cannotAs('legacy-god-mode', 'system.users.manage', legacyInvalidFixtures));
check('the SAME record\'s legitimate, non-protected permission still lands (this is filtering, not a blanket deny)', canAs('legacy-god-mode', 'warehouse.view', legacyInvalidFixtures));
check('listPermissionsAs-equivalent: system.admin never appears in the resolved Set for this role', !permissionSetFor('legacy-god-mode', legacyInvalidFixtures).has('system.admin'));
check('SECURITY: the built-in Admin SYSTEM Role is completely unaffected by this same filter — system.admin remains effective', canAs('admin', 'system.admin'));
check('SECURITY: the built-in Admin SYSTEM Role also still has system.users.manage', canAs('admin', 'system.users.manage'));

console.log('\n12. Runtime invariant guard — permission-service.js resolution must exactly match Role Management\'s own Role Summary computation (role-management-logic.js#grantedSetForRole), for every System Role. Catches the two ever silently forking.');
let invariantOk = true;
for (const role of ROLES) {
  const runtimeSet = permissionSetFor(role.id);
  const summarySet = grantedSetForRole(role.id);
  if (!setsEqual(runtimeSet, summarySet)) {
    invariantOk = false;
    console.log(`    drift: ${role.id} — runtime has ${runtimeSet.size}, Role Summary has ${summarySet.size}`);
  }
}
check('permission-service.js and Role Management Role Summary agree for every System Role', invariantOk);

function setsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
