/* role-management-check.mjs — Role Management, Read-Only (v1.30.1)
   PURE node test. Drives the REAL role-management-logic.js directly (no
   auth.js/DOM import — Node-loadable by design, same split as Phase 1's
   permission-registry.js/role-permissions.js). Covers: search matching,
   module filter, summary counts, tree generated exactly once (reference
   equality), every real role produces a valid non-throwing summary,
   bulk-operation performance, and a registry-count regression check against
   Phase 1's known values (50 permissions, 11 modules).
   Run: node scripts/role-management-check.mjs (exit 0 = pass) */

import {
  getPermissionTree,
  grantedSetForRole,
  matchesSearch,
  filterTree,
  flattenTree,
  buildSummary,
  listModules,
} from '../js/role-management/role-management-logic.js';
import { listAllPermissions } from '../js/config/permission-registry.js';
import { ROLES } from '../js/config/role-registry.js';

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };

console.log('\n1. Permission tree generation — built once, cached, reused');
const treeA = getPermissionTree();
const treeB = getPermissionTree();
check('getPermissionTree() returns the identical object reference on repeat calls', treeA === treeB);
check('tree has a Warehouse module with an Items feature', Array.isArray(treeA.Warehouse?.Items));
check('every permission in the registry appears exactly once in the unfiltered tree', flattenTree(treeA).length === listAllPermissions().length);

console.log('\n2. Search matching — id/title/description/module/category, case-insensitive');
const editItem = listAllPermissions().find((p) => p.id === 'warehouse.item.edit');
check('matches by id substring', matchesSearch(editItem, 'item.edit'));
check('matches by title, case-insensitive', matchesSearch(editItem, 'EDIT item'));
check('matches by description substring', matchesSearch(editItem, 'inventory items'));
check('matches by module name', matchesSearch(editItem, 'warehouse'));
check('matches by category name', matchesSearch(editItem, 'items'));
check('does not match unrelated text', !matchesSearch(editItem, 'overtime'));
check('empty query matches everything', matchesSearch(editItem, ''));
check('whitespace-only query matches everything', matchesSearch(editItem, '   '));

console.log('\n3. Module filter — filterTree() narrows without mutating the cached tree');
const warehouseOnly = filterTree(getPermissionTree(), { module: 'Warehouse' });
check('module filter keeps only Warehouse', Object.keys(warehouseOnly).length === 1 && !!warehouseOnly.Warehouse);
check('original cached tree is untouched by filtering', Object.keys(getPermissionTree()).length > 1);
const allModules = filterTree(getPermissionTree(), { module: 'all' });
check("module: 'all' returns every module", Object.keys(allModules).length === listModules().length);
const searchAndFilter = filterTree(getPermissionTree(), { search: 'goods', module: 'Warehouse' });
check('search + module filter compose correctly (Warehouse "goods" -> Goods In + Goods Out)', flattenTree(searchAndFilter).length === 2);
const emptyResult = filterTree(getPermissionTree(), { search: 'nonexistent-permission-xyz' });
check('a query matching nothing produces an empty tree (no hollow groups)', Object.keys(emptyResult).length === 0);

console.log('\n4. Summary counts');
const adminGranted = grantedSetForRole('admin');
const adminSummary = buildSummary(getPermissionTree(), adminGranted);
check('admin summary: totalPermissions matches full registry size', adminSummary.totalPermissions === listAllPermissions().length);
check('admin summary: granted matches admin\'s real grant count', adminSummary.granted === adminGranted.size);
check('admin summary: granted + denied === total', adminSummary.granted + adminSummary.denied === adminSummary.totalPermissions);
check('admin summary: modulesRepresented matches listModules() length', adminSummary.modulesRepresented === listModules().length);

const viewerGranted = grantedSetForRole('viewer');
const viewerSummary = buildSummary(getPermissionTree(), viewerGranted);
check('viewer summary: exactly 1 permission granted', viewerSummary.granted === 1);
check('viewer summary: denied is total - 1', viewerSummary.denied === viewerSummary.totalPermissions - 1);

const filteredSummary = buildSummary(warehouseOnly, adminGranted);
check('summary respects the filtered view, not the full registry (Warehouse-only total = 6)', filteredSummary.totalPermissions === 6);
check('summary on filtered view: modulesRepresented === 1', filteredSummary.modulesRepresented === 1);

console.log('\n5. Role switching — every real role produces a valid, non-throwing summary');
for (const role of ROLES) {
  const granted = grantedSetForRole(role.id);
  const summary = buildSummary(getPermissionTree(), granted);
  check(`${role.id}: summary is internally consistent`, summary.granted + summary.denied === summary.totalPermissions && summary.granted === granted.size);
}
check('unknown role id yields an empty granted set, not a throw', grantedSetForRole('ghost-role').size === 0);

console.log('\n6. Performance — bulk filter/search stays fast (sanity bound, not a benchmark)');
const perfStart = Date.now();
for (let i = 0; i < 5000; i++) {
  filterTree(getPermissionTree(), { search: 'edit', module: 'all' });
}
const perfMs = Date.now() - perfStart;
check(`5,000 filterTree() calls complete in <1000ms (took ${perfMs}ms)`, perfMs < 1000);

console.log('\n7. Regression — registry counts match Phase 1\'s known values');
check('registry has 50 permissions', listAllPermissions().length === 50);
check('registry spans 11 modules', listModules().length === 11);
check('ROLES has 9 entries', ROLES.length === 9);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
