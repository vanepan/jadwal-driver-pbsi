/* ============================================================
   PERMISSION-SERVICE.JS — Permission Foundation (v1.30.0, Custom-Role-aware
   since v1.30.5, storage-decoupled since v1.30.6)

   The single source of truth for "can the CURRENT session do X". Backed by
   config/role-permissions.js (System Role → permission grants) and,
   transitively, config/permission-registry.js (permission definitions +
   metadata), plus role-management/runtime-role-provider.js for roles that
   aren't in that static registry (Custom Roles).

   v1.30.5 is this file's first real consumer: js/app.js#canAccessModule()
   and its dependent navigation cluster. Other existing role checks
   (auth.js's PERMISSIONS/hasPermission, canEng, isAdmin, etc.) are still
   untouched — future phases migrate remaining call sites module by module.

   v1.30.6: this file deliberately does NOT import role-management/
   custom-roles-store.js (or any concrete storage) directly — only
   runtime-role-provider.js's getRuntimeRole(roleId). That indirection is
   the whole point: which Firebase node/mechanism backs a Custom Role's
   runtime resolution is an implementation detail the provider owns: it can
   change (e.g. to a mirrored roleRuntime node) without this file, the
   authorization engine, ever being touched. See runtime-role-provider.js's
   own header for the "Future Runtime Architecture" this enables.

   Deliberately narrow: this file only answers session-scoped authorization
   questions. It does not expose the metadata catalog or the tree — a future
   Role Management UI reads config/permission-registry.js (catalog) and
   config/role-permissions.js (grants) directly for that, keeping this
   service's one job (and "no UI inside the service") honest.

   System Role permission Sets are built once and cached — repeated lookups
   are O(1) Set membership checks, not re-parsed data. Custom Role Sets are
   NOT cached the same way: the runtime role provider's backing store
   already holds a live, reactively-updated local cache, so re-reading it
   per call is itself O(1) and always reflects the latest edit — caching it
   a second time here would risk serving a stale grant after an admin edits
   a Custom Role's permissions.

   PURE: plain lookups over getCurrentUser() (+ the runtime role provider's
   already-cached read). No DOM, no Firebase writes.
   ============================================================ */

'use strict';

import { getCurrentUser } from './auth.js';
import { ROLE_PERMISSIONS } from './config/role-permissions.js';
import { getRuntimeRole } from './role-management/runtime-role-provider.js';

const EMPTY_SET = Object.freeze(new Set());

/** roleId -> Set<permissionId>, built once per SYSTEM role and reused after that. */
const _permissionSetCache = new Map();

/**
 * Permission Set for `roleId`. System Roles resolve from the static,
 * cached registry. Anything else is resolved through the runtime role
 * provider — an unresolvable or archived role fails closed (EMPTY_SET),
 * same as an unknown role id always has.
 */
function permissionSetFor(roleId) {
  if (!roleId) return EMPTY_SET;
  if (roleId in ROLE_PERMISSIONS) {
    if (!_permissionSetCache.has(roleId)) {
      _permissionSetCache.set(roleId, new Set(ROLE_PERMISSIONS[roleId] || []));
    }
    return _permissionSetCache.get(roleId);
  }
  const runtimeRole = getRuntimeRole(roleId);
  if (!runtimeRole || runtimeRole.archived === true) return EMPTY_SET;
  return new Set(runtimeRole.permissions || []);
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
  return user ? [...permissionSetFor(user.role)] : [];
}
