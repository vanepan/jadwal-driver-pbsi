/* ============================================================
   PERMISSION-SERVICE.JS — Permission Foundation (v1.30.0)

   The single source of truth for "can the CURRENT session do X". Backed by
   config/role-permissions.js (role → permission grants) and, transitively,
   config/permission-registry.js (permission definitions + metadata).

   This is a FOUNDATION-ONLY layer: nothing in the app calls it yet, and no
   existing role check (auth.js's PERMISSIONS/hasPermission, canAccessModule,
   canEng, isAdmin, etc.) is touched or migrated. Old checks keep working
   exactly as before. New code going forward should ask can(permission)
   instead of adding another role === '...' branch. Future phases migrate
   existing call sites module by module.

   Deliberately narrow: this file only answers session-scoped authorization
   questions. It does not expose the metadata catalog or the tree — a future
   Role Management UI reads config/permission-registry.js (catalog) and
   config/role-permissions.js (grants) directly for that, keeping this
   service's one job (and "no UI inside the service") honest.

   Permissions are loaded once (the registries are frozen at import time)
   and the per-role permission Set is built once and cached — repeated
   lookups are O(1) Set membership checks, not re-parsed data.

   PURE: plain lookups over getCurrentUser(). No DOM, no Firebase writes.
   ============================================================ */

'use strict';

import { getCurrentUser } from './auth.js';
import { ROLE_PERMISSIONS, permissionsForRole } from './config/role-permissions.js';

const EMPTY_SET = Object.freeze(new Set());

/** roleId -> Set<permissionId>, built once per role and reused after that. */
const _permissionSetCache = new Map();

function permissionSetFor(roleId) {
  if (!roleId) return EMPTY_SET;
  if (!_permissionSetCache.has(roleId)) {
    _permissionSetCache.set(roleId, new Set(ROLE_PERMISSIONS[roleId] || []));
  }
  return _permissionSetCache.get(roleId);
}

/**
 * Whether the current session holds `permission`. Unknown permission ids
 * and signed-out sessions both deny (fail closed).
 * @param {string} permission
 * @returns {boolean}
 */
export function can(permission) {
  const user = getCurrentUser();
  if (!user) return false;
  return permissionSetFor(user.role).has(permission);
}

/** The inverse of can(permission). */
export function cannot(permission) {
  return !can(permission);
}

/** Whether the current session holds at least one of `permissions`. */
export function hasAny(permissions) {
  return Array.isArray(permissions) && permissions.some((p) => can(p));
}

/** Whether the current session holds every one of `permissions`. */
export function hasAll(permissions) {
  return Array.isArray(permissions) && permissions.length > 0 && permissions.every((p) => can(p));
}

/** Every permission id the current session's role holds (empty array if signed out). */
export function listPermissions() {
  const user = getCurrentUser();
  return user ? permissionsForRole(user.role) : [];
}
