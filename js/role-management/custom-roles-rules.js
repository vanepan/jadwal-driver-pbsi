/* ============================================================
   CUSTOM-ROLES-RULES.JS — Role Management (Editable), v1.30.2
   Protected-permission hardening added v1.30.9.10.

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

   PROTECTED-PERMISSION HARDENING (v1.30.9.10) — CUSTOM ROLE PROTECTED
   PERMISSION SECURITY HARDENING TASK. Pre-existing gap found during the
   Role-Level Permission Assignment (v1.30.9.9) Phase 4 Final Review: this
   file had ZERO concept of a forbidden permission id, unlike its two
   younger siblings (user-permission-overrides-rules.js,
   role-permission-overrides-rules.js), which both already exclude
   'system.admin' (and, for the newer one, 'system.users.manage' too) at
   this exact layer. A Custom Role's permission list feeds directly into
   permission-service.js#permissionSetFor()'s BASE grant for every user
   holding that role — nothing about it is an "override," so it was never
   in scope for either of those two files' own protections.

   FORBIDDEN_PERMISSION_IDS here mirrors role-permission-overrides-
   rules.js's (the WIDER, two-id) list — deliberately re-declared locally
   rather than imported, matching this codebase's established "small
   two-item list, one per mechanism, not a shared cross-cutting module"
   convention (see permission-service.js#NEVER_EFFECTIVE_VIA_OVERRIDE's
   own header comment for the fullest statement of this reasoning).

   sanitizePermissionList() is the SILENT self-healing tool: used at
   clone-snapshot time (buildClonedRole(), below) and at Custom Role
   draft-creation time (role-management-center.js#ensureDraft()) so a
   legacy-invalid persisted record (or a clone sourced from the built-in
   Admin System Role, which legitimately holds both ids in ITS OWN base
   grant) never propagates them into a NEW or freshly-edited Custom Role
   — silently, because by the time either call site runs, the two ids
   were never a permission the ADMIN OR THE ADMIN'S CLICK actually chose.
   isValidCustomRolePermissionSet() is the LOUD gate: custom-roles-
   store.js's create/update calls throw when it returns false — reached
   only if some OTHER, non-UI caller ever passes a raw permission list
   straight through without going via the sanitizing paths above.

   PURE: plain data transforms. No DOM, no Firebase, no `window`.
   ============================================================ */

'use strict';

/**
 * Permission ids that must never be present in a PERSISTED Custom Role's
 * own permission list, under any circumstances — these feed directly
 * into permission-service.js's BASE grant for every user holding that
 * role, so nothing downstream (Role Additional's / Individual's own
 * override-only filters) ever re-checks them for this specific path.
 * Mirrors role-permission-overrides-rules.js's FORBIDDEN_PERMISSION_IDS
 * (the wider, two-id list) — see file header for why this is a fresh,
 * independent declaration rather than a shared import.
 */
export const FORBIDDEN_PERMISSION_IDS = Object.freeze(['system.admin', 'system.users.manage']);

/**
 * Whether `permissionId` is one a Custom Role's own permission list is
 * structurally forbidden from ever containing.
 * @param {string} permissionId
 * @returns {boolean}
 */
export function isDangerousPermissionId(permissionId) {
  return FORBIDDEN_PERMISSION_IDS.includes(permissionId);
}

/**
 * Whether `permissions` is a legal Custom Role permission list — an
 * array containing NEITHER forbidden id. Does not check individual ids
 * against the permission registry (custom-roles-rules.js has never done
 * full registry validation — that discipline is out of scope for this
 * hardening task, which protects specifically these two reserved ids,
 * per its own explicit instruction not to duplicate the 50-permission
 * registry here).
 * @param {string[]} permissions
 * @returns {boolean}
 */
export function isValidCustomRolePermissionSet(permissions) {
  return Array.isArray(permissions) && permissions.every((id) => !isDangerousPermissionId(id));
}

/**
 * Strips both forbidden ids from `permissions`, silently — the "self-
 * healing" half of this hardening (see file header). Always returns a
 * NEW array (never the same reference as the input), preserving the
 * pre-existing "value copy, not a live reference" guarantee this file's
 * callers already depend on (see buildClonedRole()'s own doc comment).
 * @param {string[]|null|undefined} permissions
 * @returns {string[]}
 */
export function sanitizePermissionList(permissions) {
  return (permissions || []).filter((id) => !isDangerousPermissionId(id));
}

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
 * v1.30.9.10 — SECURITY: `sourcePermissions` is sanitized (see
 * sanitizePermissionList(), above) before copying. This is the most
 * direct, real path to the vulnerability this hardening closes: cloning
 * the built-in "Admin" SYSTEM Role — an ordinary, already-supported
 * operation (Role Management's own "Clone" button works on any role,
 * System or Custom, with no restriction) — passes admin's own Base grant
 * (which legitimately includes both protected ids) as `sourcePermissions`
 * verbatim. Without this filter, the resulting Custom Role would start
 * life already holding real, effective god-mode access for every user it
 * is later assigned to.
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
    permissions: sanitizePermissionList(sourcePermissions),
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
