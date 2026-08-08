/* ============================================================
   ROLE-RELATIONSHIPS.JS — Role Assignment & Dependency, v1.30.3

   Administration Platform, Phase 4. PURE relationship-resolution layer:
   "Derived From" / "Derived Roles" lineage, plus the lifecycle timestamps
   and normalized status that make up a role's Relationship Info. Never
   inferred in the UI — role-management-center.js only renders what this
   file (and role-status.js) computes.

   Expects roles in the shape role-management-center.js#getAllRoles()
   produces: { id, label, type: 'system'|'custom', record }, where `record`
   is the raw customRoles/{id} node for a custom role (carrying
   clonedFromId/clonedFrom/createdAt/updatedAt/archived/archivedAt) or null
   for a System Role (code-defined, no lineage, no lifecycle timestamps).

   Lineage resolution prefers the new `clonedFromId` (a stable id, added
   this phase — see custom-roles-rules.js#buildClonedRole) and falls back
   to case-insensitive label matching against the older `clonedFrom`
   string for records created before this phase. A claimed-but-unresolved
   lineage (source renamed/archived) is surfaced as `derivedFromStale`,
   never silently dropped.

   `buildRelationshipGraph()` resolves an entire role list in one O(n)
   pass (one forward-lookup per role, then one pass to invert it into a
   reverse index) — this IS the "relationship graph, cached" the Phase 4
   brief's Performance section asks for; role-summary-model.js caches the
   graph itself so repeat calls this session don't re-run even that pass.

   PURE: plain data transforms. No DOM, no Firebase, no `window`.
   ============================================================ */

'use strict';

import { normalizeRoleName } from './custom-roles-rules.js';
import { deriveRoleStatus } from './role-status.js';

function isLineageClaimed(role) {
  const record = role && role.record;
  return !!(record && (record.clonedFromId || record.clonedFrom));
}

/**
 * The role a custom role was cloned from, resolved against `allRoles`.
 * System Roles and unlinked Custom Roles (created without cloning) return
 * null. A claimed lineage that cannot be resolved (renamed/archived
 * source) also returns null — check `derivedFromStale` on
 * buildRoleRelationships()'s output to tell the two apart.
 * @param {{id:string, label:string, type:string, record:Object|null}} role
 * @param {Array} allRoles
 * @returns {{id:string, label:string}|null}
 */
export function resolveDerivedFrom(role, allRoles) {
  if (!role || role.type !== 'custom' || !role.record) return null;
  const list = allRoles || [];
  const { clonedFromId, clonedFrom } = role.record;
  if (clonedFromId) {
    const byId = list.find((r) => r.id === clonedFromId);
    if (byId) return { id: byId.id, label: byId.label };
  }
  if (clonedFrom) {
    const normalized = normalizeRoleName(clonedFrom);
    const byLabel = list.find((r) => r.id !== role.id && normalizeRoleName(r.label) === normalized);
    if (byLabel) return { id: byLabel.id, label: byLabel.label };
  }
  return null;
}

/**
 * Every role in `allRoles` whose resolved Derived-From is `role` — DIRECT
 * children only (a grandchild clone-of-a-clone is that child's own
 * Derived Roles entry, not this role's).
 * @returns {Array<{id:string, label:string}>}
 */
export function findDerivedRoles(role, allRoles) {
  if (!role) return [];
  const list = allRoles || [];
  return list
    .filter((candidate) => candidate.type === 'custom')
    .filter((candidate) => {
      const parent = resolveDerivedFrom(candidate, list);
      return !!parent && parent.id === role.id;
    })
    .map((candidate) => ({ id: candidate.id, label: candidate.label }));
}

/**
 * Resolves an entire role list's lineage in one O(n) forward pass plus
 * one O(n) pass to invert it — the batch equivalent of calling
 * resolveDerivedFrom/findDerivedRoles per-role (which is O(n) each, so
 * O(n^2) overall for a whole list).
 * @param {Array} allRoles
 * @returns {{forward: Map<string, {id,label}|null>, reverse: Map<string, Array<{id,label}>>, stale: Set<string>}}
 */
export function buildRelationshipGraph(allRoles) {
  const list = allRoles || [];
  const forward = new Map();
  const reverse = new Map();
  const stale = new Set();

  for (const role of list) {
    reverse.set(role.id, []);
    const resolved = resolveDerivedFrom(role, list);
    forward.set(role.id, resolved);
    if (isLineageClaimed(role) && !resolved) stale.add(role.id);
  }
  for (const role of list) {
    const parent = forward.get(role.id);
    if (parent && reverse.has(parent.id)) {
      reverse.get(parent.id).push({ id: role.id, label: role.label });
    }
  }
  return { forward, reverse, stale };
}

/**
 * The full Relationship Info for one role, reading only from a
 * precomputed graph (never re-resolves lineage itself) plus the role's
 * own record for lifecycle timestamps and status (delegates to
 * role-status.js#deriveRoleStatus — not reimplemented here).
 * @param {{id:string, label:string, type:string, record:Object|null}} role
 * @param {{forward:Map, reverse:Map, stale:Set}} graph  result of buildRelationshipGraph()
 */
export function buildRoleRelationships(role, graph) {
  const record = role && role.record;
  const derivedFrom = graph.forward.get(role.id) || null;
  const derivedRoles = graph.reverse.get(role.id) || [];
  return {
    roleId: role.id,
    roleType: role.type,
    derivedFrom,
    derivedFromStale: graph.stale.has(role.id),
    derivedRoles,
    createdAt: record ? record.createdAt || null : null,
    updatedAt: record ? record.updatedAt || null : null,
    archivedAt: record ? record.archivedAt || null : null,
    status: deriveRoleStatus({ type: role.type, archived: record ? record.archived : false, status: record ? record.status : undefined }),
  };
}
