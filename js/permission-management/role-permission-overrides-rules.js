/* ============================================================
   ROLE-PERMISSION-OVERRIDES-RULES.JS — Role-Level Permission
   Assignment, Phase 4: Storage & Security Foundation (v1.30.9.9)

   PURE business-rule layer for ROLE-LEVEL (bulk, "Role Additional")
   permission grants — the middle layer of:
     effectivePermissions(user) = permissionSetFor(user.role)
       ∪ roleAdditionalGrantsFor(user.role)
       ∪ individualGrantsFor(user.username)
   Sibling of user-permission-overrides-rules.js (Individual Permission
   Assignment, Phase 1), same shape, same discipline: this file owns only
   "what is a legal role-level grant." Zero knowledge of runtime
   resolution (role-permission-provider.js's job) and zero knowledge of
   Firebase — kept Node-loadable on purpose.

   STORAGE SHAPE — `permissions: string[]`, identical reasoning to
   user-permission-overrides-rules.js: permission ids are dot-notation
   and RTDB keys cannot contain '.'. Same proven convention as
   /customRoles/{id}.permissions and /userPermissionOverrides/{username}.

   WHY THIS FILE EXISTS SEPARATELY FROM user-permission-overrides-
   rules.js (not a shared/generalized module): the two mechanisms answer
   different questions with different protected-permission scope (see
   below) and different identity validation (a role id, not a username).
   Keeping them as separate, parallel, single-purpose files — rather than
   one "overrides-rules.js" parameterized by kind — matches this
   codebase's established convention of one pure-rule file per storage
   node (custom-roles-rules.js / user-permission-overrides-rules.js),
   and avoids a shared abstraction two callers don't actually need.

   PROTECTED PERMISSIONS — WIDER than Individual Permission Assignment's
   FORBIDDEN_PERMISSION_IDS (which only hard-blocks 'system.admin' at
   this layer; 'system.users.manage' is Individual's UI-only exclusion,
   per docs/INDIVIDUAL_PERMISSION_ASSIGNMENT_PHASE_3_FINAL_REPORT_
   v1.30.9.7.md §4). Phase 4's own brief is explicit that BOTH ids must
   never become effective through Role Additional Permissions, enforced
   at every layer (UI/store/runtime/rules/tests) — so this file's
   FORBIDDEN_PERMISSION_IDS includes both from the start, a deliberate,
   documented tightening relative to the Individual Permission precedent,
   not an inconsistency with it.

   SYSTEM-ROLE-ONLY — the Phase 4 architectural decision (see the
   Architecture Audit): Custom Roles already provide "a mutable
   permission set applying to every user assigned that role" through
   their own, pre-existing, untouched mechanism
   (role-management/custom-roles-store.js#updateCustomRole). Introducing
   a SECOND role-level override mechanism for the same Custom Role id
   would make two independently-writable layers both claim to define
   "this role's bulk permissions" — semantically duplicative. So Role
   Additional Permissions are only ever legal for a SYSTEM Role id (one
   present in config/role-registry.js#ROLES). isValidRoleOverrideTarget()
   is the one function every write path (client-side pre-check AND, by
   the same non-negotiable discipline as user-permission-overrides-
   rules.js's isDangerousPermissionId(), never trusted alone) must agree
   a role id passes before a grant/revoke is attempted.

   PURE: plain data transforms. No DOM, no Firebase, no `window`.
   ============================================================ */

'use strict';

import { getPermission } from '../config/permission-registry.js';
import { ROLES } from '../config/role-registry.js';

/**
 * Permission ids that must never become effective through Role Additional
 * Permissions, under any circumstances — wider than Individual Permission
 * Assignment's equivalent list (see file header). Must remain exclusively
 * role/Custom-Role-derived ('system.admin') or reserved for a future,
 * explicit enforcement decision ('system.users.manage').
 */
export const FORBIDDEN_PERMISSION_IDS = Object.freeze(['system.admin', 'system.users.manage']);

/** Top-level fields that must never appear on a role override record —
    this node represents bulk permission grants ONLY, never identity/
    authorization claims or credential material (mirrors
    user-permission-overrides-rules.js's FORBIDDEN_RECORD_FIELDS; a role
    override record has no "self" concept but the same defense-in-depth
    applies). */
export const FORBIDDEN_RECORD_FIELDS = Object.freeze([
  'role', 'adminEquivalent', 'pin', 'pinHash', 'active', 'archived',
]);

/** The System Role ids Role Additional Permissions may legally target —
    every id in config/role-registry.js#ROLES, computed once. Custom Role
    ids (role_*) are deliberately never members of this set. */
const SYSTEM_ROLE_IDS = new Set(ROLES.map((r) => r.id));

/**
 * Whether `permissionId` is one Role Additional Permissions are
 * structurally forbidden from ever granting.
 * @param {string} permissionId
 * @returns {boolean}
 */
export function isDangerousPermissionId(permissionId) {
  return FORBIDDEN_PERMISSION_IDS.includes(permissionId);
}

/**
 * Whether `permissionId` is a real, registered, grantable permission — and
 * not one of the ids Role Additional Permissions may never grant.
 * @param {string} permissionId
 * @returns {boolean}
 */
export function isValidPermissionId(permissionId) {
  if (!permissionId || typeof permissionId !== 'string') return false;
  if (isDangerousPermissionId(permissionId)) return false;
  return !!getPermission(permissionId);
}

/**
 * Whether `roleId` is a legal Role Additional Permissions target — a real
 * System Role id, never a Custom Role id (see file header's "SYSTEM-ROLE-
 * ONLY" section — Custom Roles already own their own bulk-permission
 * mechanism, and must never gain a second, competing one).
 * @param {string} roleId
 * @returns {boolean}
 */
export function isValidRoleOverrideTarget(roleId) {
  return typeof roleId === 'string' && SYSTEM_ROLE_IDS.has(roleId);
}

/**
 * Whether `record.permissions` is a completely well-formed role override
 * record: every element a valid, non-dangerous, non-duplicate permission
 * id, and no forbidden top-level fields present.
 * @param {Object|null} record  raw value as read from
 *   /rolePermissionOverrides/{roleId}, or null if absent
 * @returns {boolean}
 */
export function isWellFormedOverrideRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return false;
  for (const field of FORBIDDEN_RECORD_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(record, field)) return false;
  }
  const permissions = toPermissionArray(record.permissions);
  if (permissions === null || permissions.length === 0) return false;
  const seen = new Set();
  for (const permissionId of permissions) {
    if (!isValidPermissionId(permissionId)) return false;
    if (seen.has(permissionId)) return false;
    seen.add(permissionId);
  }
  return true;
}

/** Normalizes whatever shape `permissions` actually is (real array, RTDB
    list-like object, or malformed) into a plain array, or null if unusable. */
function toPermissionArray(permissions) {
  if (Array.isArray(permissions)) return permissions;
  if (permissions && typeof permissions === 'object') return Object.values(permissions);
  return null;
}

/**
 * Fail-closed normalization: a raw RTDB value becomes a clean Set<string>
 * of granted permission ids. A malformed RECORD never fails "safe"
 * (empty), only individual malformed ENTRIES are excluded — identical
 * discipline to user-permission-overrides-rules.js#normalizeOverrideRecord
 * and permission-service.js's "an unresolvable role fails to EMPTY_SET,
 * never throws" convention.
 * @param {Object|null} record
 * @returns {Set<string>}
 */
export function normalizeOverrideRecord(record) {
  const result = new Set();
  if (!record || typeof record !== 'object' || Array.isArray(record)) return result;
  const permissions = toPermissionArray(record.permissions);
  if (permissions === null) return result;
  for (const permissionId of permissions) {
    if (isValidPermissionId(permissionId)) result.add(permissionId);
  }
  return result;
}

/**
 * Builds the exact RTDB write payload for granting `permissionId` to a
 * role, given its CURRENT Role Additional grant set (additive — never
 * clobbers other existing grants, and never touches the role's Base or
 * any user's Individual grants). Throws if `permissionId` is not a legal
 * grant — the RTDB rule is the last line of defense, not the first.
 * @param {Set<string>} currentGrants
 * @param {string} permissionId
 * @returns {{permissions: string[], updatedAt: string}}
 */
export function buildGrantUpdate(currentGrants, permissionId) {
  if (!isValidPermissionId(permissionId)) {
    throw new Error(`"${permissionId}" bukan permission yang valid untuk Role Additional Permission.`);
  }
  const next = new Set(currentGrants || []);
  next.add(permissionId);
  return {
    permissions: [...next],
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Builds the exact RTDB write payload for revoking `permissionId` from a
 * role's Role Additional grant set. Returns `null` (delete the whole
 * record) when the resulting set would be empty — mirrors user-
 * permission-overrides-rules.js#buildRevokeUpdate exactly. Revoking a
 * Role Additional grant NEVER touches any user's Individual override —
 * that independence is enforced by construction: this function only ever
 * builds a payload for /rolePermissionOverrides/{roleId}, and has no
 * knowledge /userPermissionOverrides even exists.
 * @param {Set<string>} currentGrants
 * @param {string} permissionId
 * @returns {{permissions: string[], updatedAt: string}|null}
 */
export function buildRevokeUpdate(currentGrants, permissionId) {
  const next = new Set(currentGrants || []);
  next.delete(permissionId);
  if (next.size === 0) return null;
  return {
    permissions: [...next],
    updatedAt: new Date().toISOString(),
  };
}
