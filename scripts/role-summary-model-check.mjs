/* role-summary-model-check.mjs — Role Assignment & Dependency (v1.30.3)
   PURE node test. Drives the REAL role-summary-model.js directly against
   the REAL permission registry (role-management-logic.js's already-
   memoized getPermissionTree()/grantedSetForRole(), not a fixture) — no
   Firebase, no auth.js, no DOM. Covers: module-breakdown aggregation, the
   full Role Summary field shape for both a System Role and a fixture
   Custom Role, the signature-keyed cache (same reference on unchanged
   input, a fresh reference on real change or explicit invalidation), and
   a regression check against Phase 1's live role-permissions.js source of
   truth (not a hardcoded magic number, so it can't rot silently).
   Run: node scripts/role-summary-model-check.mjs (exit 0 = pass) */

import { buildRoleSummary, buildModuleBreakdown, invalidateRoleSummaryCache } from '../js/role-management/role-summary-model.js';
import { getPermissionTree, grantedSetForRole } from '../js/role-management/role-management-logic.js';
import { permissionsForRole } from '../js/config/role-permissions.js';
import { ROLE_STATUS } from '../js/role-management/role-status.js';
import { resetRoleUsageProvider } from '../js/role-management/role-usage-provider.js';

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };

resetRoleUsageProvider(); // this script runs standalone, but be explicit about the baseline it assumes

console.log('\n1. buildModuleBreakdown — full (unfiltered) permission tree');
const tree = getPermissionTree();
const adminGranted = grantedSetForRole('admin');
const breakdown = buildModuleBreakdown(tree, adminGranted);
const treeModuleCount = Object.keys(tree).length;
const treeTotalPermissions = Object.values(tree).reduce((sum, cats) => sum + Object.values(cats).reduce((s, list) => s + list.length, 0), 0);
check('one breakdown entry per module in the tree', breakdown.length === treeModuleCount);
check('per-module totals sum to the registry-wide total', breakdown.reduce((sum, b) => sum + b.total, 0) === treeTotalPermissions);
check('granted never exceeds total for any module', breakdown.every((b) => b.granted <= b.total));

console.log('\n2. buildRoleSummary — full field shape, System Role');
const adminRole = { id: 'admin', label: 'Admin', type: 'system', record: null };
invalidateRoleSummaryCache();
const adminSummary = buildRoleSummary(adminRole, [adminRole], adminGranted);
check('roleId/name/type', adminSummary.roleId === 'admin' && adminSummary.name === 'Admin' && adminSummary.type === 'system');
check('permissionCount matches the granted set size', adminSummary.permissionCount === adminGranted.size);
check('moduleCount matches modules with >=1 granted permission', adminSummary.moduleCount === breakdown.filter((b) => b.granted > 0).length);
check('System Role has null lifecycle timestamps', adminSummary.createdAt === null && adminSummary.updatedAt === null && adminSummary.archivedAt === null);
check('System Role has no Derived From', adminSummary.derivedFrom === null);
check('assignedUsers is 0 under the default zero provider', adminSummary.assignedUsers === 0);
check('status is ACTIVE', adminSummary.status === ROLE_STATUS.ACTIVE);

console.log('\n3. buildRoleSummary — fixture Custom Role, resolves lineage against allRoles');
const customRecord = { clonedFromId: 'admin', clonedFrom: 'Admin', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z', archived: false, archivedAt: null };
const customRole = { id: 'role_custom', label: 'Custom Sample', type: 'custom', record: customRecord };
const customAllRoles = [adminRole, customRole];
const customGranted = new Set(['system.admin']);
invalidateRoleSummaryCache();
const customSummary = buildRoleSummary(customRole, customAllRoles, customGranted);
check('a fresh Custom Role id starts with role_', customSummary.roleId.startsWith('role_'));
check('derivedFrom resolves to admin via clonedFromId', customSummary.derivedFrom?.id === 'admin');
check('a fresh non-archived Custom Role status is ACTIVE', customSummary.status === ROLE_STATUS.ACTIVE);
check('permissionCount reflects the granted set actually passed in', customSummary.permissionCount === 1);

console.log('\n4. Caching — unchanged input reuses the reference; real change busts it');
invalidateRoleSummaryCache();
const first = buildRoleSummary(customRole, customAllRoles, customGranted);
const second = buildRoleSummary(customRole, customAllRoles, customGranted);
check('two calls with unchanged input return the SAME object reference', first === second);

const changedRole = { ...customRole, record: { ...customRecord, updatedAt: '2026-01-03T00:00:00.000Z' } };
const third = buildRoleSummary(changedRole, customAllRoles, customGranted);
check('a changed updatedAt produces a DIFFERENT reference', third !== second);

const widerGranted = new Set(['system.admin', 'driver.schedule.view']);
const fourth = buildRoleSummary(changedRole, customAllRoles, widerGranted);
check('a changed granted-permission set produces a DIFFERENT reference', fourth !== third);

invalidateRoleSummaryCache();
const fifth = buildRoleSummary(changedRole, customAllRoles, widerGranted);
check('invalidateRoleSummaryCache() forces a fresh reference even with unchanged input', fifth !== fourth);

console.log('\n5. Regression — anchored to Phase 1\'s live registry, not a magic number');
invalidateRoleSummaryCache();
const regressionSummary = buildRoleSummary(adminRole, [adminRole], grantedSetForRole('admin'));
check('admin permissionCount matches the live permissionsForRole(\'admin\').length', regressionSummary.permissionCount === permissionsForRole('admin').length);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
