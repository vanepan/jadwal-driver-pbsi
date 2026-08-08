/* ============================================================
   ROLE-SUMMARY-MODEL.JS — Role Assignment & Dependency, v1.30.3

   Administration Platform, Phase 4. The single reusable Role Summary the
   Phase 4 brief asks for — Name/Type/Permission Count/Module Count/
   Created/Updated/Derived From/Derived Roles/Assigned Users/Status — and
   the one place summary + relationship-graph caching lives, per the
   brief's Performance section ("cached... no repeated tree generation...
   no duplicate calculations").

   Reuses, never recomputes: getPermissionTree() from role-management-
   logic.js (already module-load-memoized there), and
   buildRelationshipGraph()/buildRoleRelationships() from
   role-relationships.js. `grantedSet` is always the caller's persisted
   set (role-management-center.js's resolveGrantedSet(), never the
   in-progress edit draft) — a Role Summary represents saved truth.

   Caching is signature-keyed, not reference-keyed: role-management-
   center.js#getAllRoles() builds fresh role/record objects on every call,
   so identity-based memoization would never hit. The relationship graph
   (built once per distinct role-list shape) and each role's summary
   (built once per distinct role+grantedSet content) are cached
   independently; invalidateRoleSummaryCache() is the one hook
   role-management-center.js calls from its existing
   registerCustomRolesChangeListener().

   PURE: plain data transforms + in-memory caches. No DOM, no Firebase, no
   `window`.
   ============================================================ */

'use strict';

import { getPermissionTree } from './role-management-logic.js';
import { buildRelationshipGraph, buildRoleRelationships } from './role-relationships.js';
import { getRoleUsage } from './role-usage-provider.js';

let summaryCache = new Map(); // roleId -> { signature, summary }
let graphCache = null;        // { signature, graph } | null

/**
 * Per-module granted/total counts over the FULL permission tree (not a
 * search-filtered view — that's role-management-logic.js#buildSummary's
 * job, a different, UI-transient concept).
 * @param {Object} tree  result of getPermissionTree()
 * @param {Set<string>} grantedSet
 * @returns {Array<{module: string, granted: number, total: number}>}
 */
export function buildModuleBreakdown(tree, grantedSet) {
  const breakdown = [];
  for (const [moduleName, categories] of Object.entries(tree)) {
    let granted = 0;
    let total = 0;
    for (const permissions of Object.values(categories)) {
      total += permissions.length;
      granted += permissions.filter((p) => grantedSet.has(p.id)).length;
    }
    breakdown.push({ module: moduleName, granted, total });
  }
  return breakdown;
}

function graphSignature(allRoles) {
  return allRoles
    .map((r) => {
      const rec = r.record;
      return `${r.id}:${rec ? rec.clonedFromId || '' : ''}:${rec ? rec.clonedFrom || '' : ''}:${rec ? !!rec.archived : ''}`;
    })
    .join('|');
}

function getCachedGraph(allRoles) {
  const signature = graphSignature(allRoles);
  if (graphCache && graphCache.signature === signature) return graphCache.graph;
  const graph = buildRelationshipGraph(allRoles);
  graphCache = { signature, graph };
  return graph;
}

function summarySignature(role, grantedSet) {
  const record = role.record;
  const grantedKey = [...grantedSet].sort().join(',');
  return [
    role.id,
    role.type,
    record ? record.updatedAt || '' : '',
    record ? !!record.archived : '',
    record ? record.archivedAt || '' : '',
    grantedKey,
  ].join('|');
}

/**
 * The single Role Summary model — admin UI should never assemble these
 * fields itself, only render this.
 * @param {{id:string, label:string, type:string, record:Object|null}} role
 * @param {Array} allRoles   full role list (system + active custom), for relationship resolution
 * @param {Set<string>} grantedSet   role's PERSISTED granted-permission set
 */
export function buildRoleSummary(role, allRoles, grantedSet) {
  const signature = summarySignature(role, grantedSet);
  const cached = summaryCache.get(role.id);
  if (cached && cached.signature === signature) return cached.summary;

  const tree = getPermissionTree();
  const breakdown = buildModuleBreakdown(tree, grantedSet);
  const graph = getCachedGraph(allRoles);
  const relationships = buildRoleRelationships(role, graph);
  const usage = getRoleUsage(role.id);

  const summary = Object.freeze({
    roleId: role.id,
    name: role.label,
    type: role.type,
    permissionCount: grantedSet.size,
    moduleCount: breakdown.filter((b) => b.granted > 0).length,
    createdAt: relationships.createdAt,
    updatedAt: relationships.updatedAt,
    archivedAt: relationships.archivedAt,
    derivedFrom: relationships.derivedFrom,
    derivedFromStale: relationships.derivedFromStale,
    derivedRoles: relationships.derivedRoles,
    assignedUsers: usage.assignedUsers,
    status: relationships.status,
  });
  summaryCache.set(role.id, { signature, summary });
  return summary;
}

/** Clears both caches. Call whenever the underlying Custom Role data changes. */
export function invalidateRoleSummaryCache() {
  summaryCache = new Map();
  graphCache = null;
}
