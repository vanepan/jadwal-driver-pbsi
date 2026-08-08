/* ============================================================
   CUSTOM-ROLES-RULES.JS — Role Management (Editable), v1.30.2

   Administration Platform, Phase 3. PURE business-rule layer for Custom
   Roles: name normalization/duplicate-checking, clone-snapshot
   construction, and permission diffing for the Save/Review workflow. No
   Firebase, no auth.js, no DOM — kept Node-loadable on purpose, mirroring
   the pure/DOM split already established by role-management-logic.js and
   Phase 1's permission-registry.js/role-permissions.js.

   These functions never touch the code-defined ROLES/ROLE_PERMISSIONS —
   System Roles are read by the caller and passed in as plain data
   (sourceLabel/sourcePermissions/systemLabels); this file has no import
   from config/role-registry.js or config/role-permissions.js at all.

   PURE: plain data transforms. No DOM, no Firebase, no `window`.
   ============================================================ */

'use strict';

/** Trim + lowercase + collapse internal whitespace, for name comparison. */
export function normalizeRoleName(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Whether `name` collides with a System Role label or another active
 * Custom Role's name (case-insensitive, trimmed). Returns the conflicting
 * label/name string, or null when there's no conflict.
 * @param {string} name
 * @param {{systemLabels?: string[], customRoles?: Array<{id:string,name:string}>, excludeId?: string}} opts
 * @returns {string|null}
 */
export function findDuplicateName(name, { systemLabels = [], customRoles = [], excludeId = null } = {}) {
  const normalized = normalizeRoleName(name);
  if (!normalized) return null;
  for (const label of systemLabels) {
    if (normalizeRoleName(label) === normalized) return label;
  }
  for (const role of customRoles) {
    if (role.id === excludeId) continue;
    if (normalizeRoleName(role.name) === normalized) return role.name;
  }
  return null;
}

/**
 * Slug-based id with a collision-suffix loop, mirroring
 * drivers-store.js's makeDriverId()/createDriver() shape.
 * @param {string} name
 * @param {Set<string>|string[]} existingIds
 * @returns {string}
 */
export function makeCustomRoleId(name, existingIds) {
  const existing = existingIds instanceof Set ? existingIds : new Set(existingIds || []);
  const baseSlug = normalizeRoleName(name).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const make = (suffix) => `role_${baseSlug || 'custom'}${suffix ? `-${suffix}` : ''}`;
  let suffix = 0;
  let id = make(suffix);
  while (existing.has(id)) {
    suffix++;
    id = make(suffix);
  }
  return id;
}

/**
 * Builds the plain-data shape for a new Custom Role cloned from an
 * existing role (System or Custom). `sourcePermissions` is copied by
 * VALUE (a fresh array) — the clone never shares a reference with its
 * source, so editing the clone can never mutate the source.
 *
 * `clonedFrom` (a display label) is kept for backward compatibility with
 * records written before v1.30.3. `clonedFromId` (Phase 4, additive) is
 * the stable lineage link role-relationships.js prefers when present —
 * unlike a label, it survives the source role later being renamed.
 * `sourceRoleId` is optional so every pre-Phase-4 call site keeps working
 * unchanged; new call sites should pass it.
 * @param {{sourceLabel: string, sourcePermissions: string[], newName: string, sourceRoleId?: string|null}} args
 * @returns {{name: string, permissions: string[], clonedFrom: string|null, clonedFromId: string|null}}
 */
export function buildClonedRole({ sourceLabel, sourcePermissions, newName, sourceRoleId = null }) {
  return {
    name: String(newName || '').trim(),
    permissions: [...(sourcePermissions || [])],
    clonedFrom: sourceLabel || null,
    clonedFromId: sourceRoleId || null,
  };
}

/**
 * Permission-id diff between two arrays, for the Review-before-Save step.
 * @param {string[]} before
 * @param {string[]} after
 * @returns {{added: string[], removed: string[]}}
 */
export function diffPermissions(before, after) {
  const beforeSet = new Set(before || []);
  const afterSet = new Set(after || []);
  return {
    added: [...afterSet].filter((id) => !beforeSet.has(id)),
    removed: [...beforeSet].filter((id) => !afterSet.has(id)),
  };
}

/** Whether a permission list is empty (drives the "no permissions at all" confirm). */
export function isEmptyPermissionSet(permissions) {
  return !permissions || permissions.length === 0;
}
