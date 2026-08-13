/* custom-roles-check.mjs — Role Management, Editable (v1.30.2)
   PURE node test. Drives the REAL custom-roles-rules.js directly (no
   Firebase, no auth.js — Node-loadable by design, same split as Phase 1/2's
   pure logic files). Covers: name normalization, duplicate detection
   against both System Role labels and Custom Role names (case-insensitive),
   id generation + collision suffixing, clone-snapshot construction (proves
   a value copy, not a live reference), permission diffing, and empty-
   permission-set detection.
   Run: node scripts/custom-roles-check.mjs (exit 0 = pass) */

import {
  normalizeRoleName,
  findDuplicateName,
  makeCustomRoleId,
  buildClonedRole,
  diffPermissions,
  isEmptyPermissionSet,
  FORBIDDEN_PERMISSION_IDS,
  isDangerousPermissionId,
  isValidCustomRolePermissionSet,
  sanitizePermissionList,
} from '../js/role-management/custom-roles-rules.js';

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };

console.log('\n1. Name normalization');
check("trims + lowercases", normalizeRoleName('  Administrator PBSI  ') === 'administrator pbsi');
check('collapses internal whitespace', normalizeRoleName('Admin   PBSI') === 'admin pbsi');
check('handles null/undefined safely', normalizeRoleName(null) === '' && normalizeRoleName(undefined) === '');

console.log('\n2. Duplicate name detection');
const systemLabels = ['Admin', 'Bidang', 'Driver', 'Viewer', 'Koordinator Engineering'];
const customRoles = [{ id: 'role_a', name: 'Administrator PBSI' }, { id: 'role_b', name: 'Gudang Only' }];
check('detects exact-case collision against a System Role label', findDuplicateName('Admin', { systemLabels, customRoles }) === 'Admin');
check('detects case-insensitive collision against a System Role label', findDuplicateName('  admin  ', { systemLabels, customRoles }) === 'Admin');
check('detects collision against another Custom Role name', findDuplicateName('gudang only', { systemLabels, customRoles }) === 'Gudang Only');
check('excludeId lets a role keep its own name during an update', findDuplicateName('Administrator PBSI', { systemLabels, customRoles, excludeId: 'role_a' }) === null);
check('a genuinely new name has no conflict', findDuplicateName('Warehouse Supervisor', { systemLabels, customRoles }) === null);
check('empty name has no conflict (empty-name is a separate validation)', findDuplicateName('', { systemLabels, customRoles }) === null);

console.log('\n3. Custom Role id generation');
check('slugifies the name', makeCustomRoleId('Administrator PBSI', []) === 'role_administrator-pbsi');
check('strips non-alphanumerics', makeCustomRoleId('Gudang & Aset!!', []) === 'role_gudang-aset');
check('collision suffix increments until unique', makeCustomRoleId('Admin', ['role_admin', 'role_admin-1']) === 'role_admin-2');
check('empty/symbol-only name falls back to a safe slug', makeCustomRoleId('!!!', []) === 'role_custom');

console.log('\n4. Clone-snapshot construction — value copy, not a live reference');
// v1.30.9.10: this fixture used to be ['system.admin', 'warehouse.view'] —
// harmless before the Custom Role Protected Permission Security Hardening
// task, but buildClonedRole() now sanitizes its input (see §4c below for
// the dedicated proof of THAT behavior), so this section's own fixture was
// switched to two ordinary, non-protected ids — it is testing value-copy
// semantics, not protection, and should not conflate the two.
const sourcePermissions = ['vehicle.maintenance', 'warehouse.view'];
const clone = buildClonedRole({ sourceLabel: 'Admin', sourcePermissions, newName: '  Admin (Copy)  ' });
check('trims the new name', clone.name === 'Admin (Copy)');
check('copies every source permission', clone.permissions.length === 2 && clone.permissions.includes('vehicle.maintenance') && clone.permissions.includes('warehouse.view'));
check('records clonedFrom', clone.clonedFrom === 'Admin');
check('the clone\'s permissions array is a DIFFERENT array instance than the source', clone.permissions !== sourcePermissions);
sourcePermissions.push('vehicle.view');
check('mutating the source array afterward does not affect the clone (proves value-copy semantics)', clone.permissions.length === 2);

console.log('\n4b. clonedFromId — v1.30.3 additive lineage link (Role Assignment & Dependency)');
check('omitting sourceRoleId (every pre-v1.30.3 call site) leaves clonedFromId null', clone.clonedFromId === null);
const idClone = buildClonedRole({ sourceLabel: 'Admin', sourcePermissions: ['warehouse.view'], newName: 'Admin (Copy 2)', sourceRoleId: 'admin' });
check('a passed sourceRoleId is recorded as clonedFromId', idClone.clonedFromId === 'admin');
check('clonedFrom (the label) is still recorded alongside clonedFromId', idClone.clonedFrom === 'Admin');

console.log('\n4c. Protected-permission hardening (v1.30.9.10) — Custom Role Protected Permission Security Hardening');
check('FORBIDDEN_PERMISSION_IDS contains exactly both protected ids', FORBIDDEN_PERMISSION_IDS.length === 2 && FORBIDDEN_PERMISSION_IDS.includes('system.admin') && FORBIDDEN_PERMISSION_IDS.includes('system.users.manage'));
check('isDangerousPermissionId(system.admin) is true', isDangerousPermissionId('system.admin') === true);
check('isDangerousPermissionId(system.users.manage) is true', isDangerousPermissionId('system.users.manage') === true);
check('isDangerousPermissionId(an ordinary permission) is false', isDangerousPermissionId('warehouse.view') === false);
check('sanitizePermissionList strips system.admin, keeps the rest', (() => {
  const r = sanitizePermissionList(['warehouse.view', 'system.admin', 'vehicle.view']);
  return r.length === 2 && r.includes('warehouse.view') && r.includes('vehicle.view') && !r.includes('system.admin');
})());
check('sanitizePermissionList strips system.users.manage, keeps the rest', (() => {
  const r = sanitizePermissionList(['warehouse.view', 'system.users.manage']);
  return r.length === 1 && r.includes('warehouse.view');
})());
check('sanitizePermissionList strips BOTH when present together', (() => {
  const r = sanitizePermissionList(['system.admin', 'warehouse.view', 'system.users.manage']);
  return r.length === 1 && r[0] === 'warehouse.view';
})());
check('sanitizePermissionList(null) is an empty array, not a throw', sanitizePermissionList(null).length === 0);
check('sanitizePermissionList always returns a NEW array (value copy)', (() => {
  const src = ['warehouse.view'];
  return sanitizePermissionList(src) !== src;
})());
check('isValidCustomRolePermissionSet: a clean list is valid', isValidCustomRolePermissionSet(['warehouse.view', 'vehicle.view']) === true);
check('isValidCustomRolePermissionSet: system.admin makes it invalid', isValidCustomRolePermissionSet(['warehouse.view', 'system.admin']) === false);
check('isValidCustomRolePermissionSet: system.users.manage makes it invalid', isValidCustomRolePermissionSet(['system.users.manage']) === false);
check('isValidCustomRolePermissionSet: both together, still invalid', isValidCustomRolePermissionSet(['system.admin', 'system.users.manage']) === false);
check('isValidCustomRolePermissionSet: an empty list is valid', isValidCustomRolePermissionSet([]) === true);
check('isValidCustomRolePermissionSet: a non-array is invalid', isValidCustomRolePermissionSet(null) === false && isValidCustomRolePermissionSet(undefined) === false);

console.log('\n4d. buildClonedRole() sanitizes at clone-snapshot time — the real vulnerability this task closes (cloning the built-in Admin System Role)');
const adminLikePermissions = ['driver.schedule.view', 'warehouse.view', 'system.admin', 'system.users.manage'];
const adminClone = buildClonedRole({ sourceLabel: 'Admin', sourcePermissions: adminLikePermissions, newName: 'Admin (Copy)', sourceRoleId: 'admin' });
check('cloning a role whose source permissions include BOTH protected ids never carries them into the clone', !adminClone.permissions.includes('system.admin') && !adminClone.permissions.includes('system.users.manage'));
check('every OTHER, legitimate source permission still copies over normally', adminClone.permissions.includes('driver.schedule.view') && adminClone.permissions.includes('warehouse.view'));
check('the sanitized clone is still a valid Custom Role permission set', isValidCustomRolePermissionSet(adminClone.permissions) === true);

console.log('\n5. Permission diffing');
const before = ['a', 'b', 'c'];
const after = ['b', 'c', 'd'];
const diff = diffPermissions(before, after);
check('added contains only the new id', diff.added.length === 1 && diff.added[0] === 'd');
check('removed contains only the dropped id', diff.removed.length === 1 && diff.removed[0] === 'a');
const noopDiff = diffPermissions(['x', 'y'], ['y', 'x']);
check('identical sets (different order) diff to no-op', noopDiff.added.length === 0 && noopDiff.removed.length === 0);
const fromEmpty = diffPermissions([], ['a', 'b']);
check('diffing from empty reports every permission as added', fromEmpty.added.length === 2 && fromEmpty.removed.length === 0);
const toEmpty = diffPermissions(['a', 'b'], []);
check('diffing to empty reports every permission as removed', toEmpty.removed.length === 2 && toEmpty.added.length === 0);

console.log('\n6. Empty permission set detection');
check('empty array is detected', isEmptyPermissionSet([]) === true);
check('non-empty array is not flagged', isEmptyPermissionSet(['a']) === false);
check('null/undefined is treated as empty, not a throw', isEmptyPermissionSet(null) === true && isEmptyPermissionSet(undefined) === true);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
