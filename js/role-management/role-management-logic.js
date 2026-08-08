/* ============================================================
   ROLE-MANAGEMENT-LOGIC.JS — Role Management (Read-Only), v1.30.1

   Administration Platform, Phase 2. PURE presentation-logic layer: search
   matching, module filtering, and summary-counting over the Permission
   Foundation's own registry (js/config/permission-registry.js,
   js/config/role-permissions.js). No DOM, no auth.js, no Firebase — kept
   Node-loadable on purpose, mirroring the engine/presentation split already
   established by Phase 1 (permission-registry.js/role-permissions.js are
   pure; permission-service.js is the session-dependent layer on top).

   The permission tree is built ONCE at module load (buildPermissionTree()
   is a pure function — nothing here re-derives it) and every filter/search
   operation derives a smaller view over that same cached tree. This is what
   satisfies the brief's Performance requirement: "Permission Tree should be
   generated once. Reuse cached structures. No repeated tree generation."

   PURE: plain data transforms. No DOM, no Firebase, no `window`.
   ============================================================ */

'use strict';

import { buildPermissionTree, listAllPermissions } from '../config/permission-registry.js';
import { permissionsForRole } from '../config/role-permissions.js';

/** Built once at module load — every consumer shares this same object. */
const PERMISSION_TREE = buildPermissionTree();

/** The cached Module -> Feature -> Permission[] tree. Never regenerated. */
export function getPermissionTree() {
  return PERMISSION_TREE;
}

/** Every permission id `roleId` holds, as a Set (convenient for `.has()` checks). */
export function grantedSetForRole(roleId) {
  return new Set(permissionsForRole(roleId));
}

/**
 * Whether `permission` matches a free-text `query` across id/title/
 * description/module/category. Empty/whitespace query matches everything.
 */
export function matchesSearch(permission, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;
  return (
    permission.id.toLowerCase().includes(q) ||
    permission.title.toLowerCase().includes(q) ||
    permission.description.toLowerCase().includes(q) ||
    permission.module.toLowerCase().includes(q) ||
    permission.category.toLowerCase().includes(q)
  );
}

/**
 * Derives a filtered view of `tree` — never mutates or rebuilds it. Drops
 * empty categories and empty modules so the rendered tree never shows a
 * hollow group.
 * @param {Object} tree     result of getPermissionTree()
 * @param {{search?: string, module?: string}} opts  module: 'all' or a real module name
 * @returns {Object} same Module -> Feature -> Permission[] shape, filtered
 */
export function filterTree(tree, { search = '', module = 'all' } = {}) {
  const filtered = {};
  for (const [moduleName, categories] of Object.entries(tree)) {
    if (module && module !== 'all' && module !== moduleName) continue;
    const filteredCategories = {};
    for (const [categoryName, permissions] of Object.entries(categories)) {
      const kept = permissions.filter((p) => matchesSearch(p, search));
      if (kept.length > 0) filteredCategories[categoryName] = kept;
    }
    if (Object.keys(filteredCategories).length > 0) filtered[moduleName] = filteredCategories;
  }
  return filtered;
}

/** Every permission record present anywhere in a (possibly filtered) tree. */
export function flattenTree(tree) {
  const result = [];
  for (const categories of Object.values(tree)) {
    for (const permissions of Object.values(categories)) {
      result.push(...permissions);
    }
  }
  return result;
}

/**
 * Summary stats for the currently-visible (filtered/searched) permission
 * set, relative to a role's granted-permission Set.
 * @param {Object} filteredTree  result of filterTree()
 * @param {Set<string>} grantedSet  result of grantedSetForRole()
 */
export function buildSummary(filteredTree, grantedSet) {
  const visible = flattenTree(filteredTree);
  const granted = visible.filter((p) => grantedSet.has(p.id)).length;
  return {
    totalPermissions: visible.length,
    granted,
    denied: visible.length - granted,
    modulesRepresented: Object.keys(filteredTree).length,
  };
}

/** Every module name in registry order (first-seen order in the flat list). */
export function listModules() {
  const seen = new Set();
  const modules = [];
  for (const p of listAllPermissions()) {
    if (!seen.has(p.module)) { seen.add(p.module); modules.push(p.module); }
  }
  return modules;
}
