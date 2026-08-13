/* ============================================================
   ROLE-PERMISSION-PROVIDER.JS — Role-Level Permission Assignment,
   Phase 4: Runtime Resolution (v1.30.9.9)

   The ONLY thing js/permission-service.js is allowed to know about how a
   role's Role Additional Permissions are stored/resolved — structurally
   identical to permission-management/individual-permission-provider.js's
   boundary (which does the same job for Individual Permissions) and to
   role-management/runtime-role-provider.js's boundary (Custom Roles).
   permission-service.js must never import role-permission-overrides-
   store.js (or Firebase) directly, so the storage/caching mechanism
   behind "this role's Additional grants" can change later without
   touching the authorization engine at all.

   Scoped to exactly the CURRENT SESSION's own role — never a global
   subscription — mirroring individual-permission-provider.js's identical
   reasoning: the RTDB rule for /rolePermissionOverrides/{roleId} only
   permits admin/adminEquivalent or a session whose own auth.token.role
   claim equals $roleId to read that specific role's node (see
   database.rules.json's own comment on this node).

   PURE at this file's own boundary: no permission logic lives here, only
   indirection. No DOM, no Firebase writes.
   ============================================================ */

'use strict';

import { getCurrentUser } from '../auth.js';
import {
  initRolePermissionOverridesLive,
  getCachedRolePermissionOverrides,
} from './role-permission-overrides-store.js';

/**
 * Start the live subscription for the CURRENT session's own role's Role
 * Additional Permissions. Idempotent — safe to call on every session boot
 * alongside initIndividualPermissionProvider(). No-op when signed out or
 * the session has no role (nothing to scope the subscription to).
 * @returns {void}
 */
export function initRolePermissionProvider() {
  const user = getCurrentUser();
  if (!user || !user.role) return;
  initRolePermissionOverridesLive(user.role);
}

/**
 * The Role Additional Permission grants for `roleId`, as a Set<string> —
 * the only shape permission-service.js is allowed to depend on. A
 * synchronous read of the already-live local cache (no Firebase call on
 * the read path itself). Fail-closed: returns an empty Set when there is
 * no live cache for exactly this roleId (not yet loaded, denied,
 * unavailable, or scoped to a different session's role).
 * @param {string} roleId
 * @returns {Set<string>}
 */
export function getRoleAdditionalPermissions(roleId) {
  if (!roleId) return new Set();
  return getCachedRolePermissionOverrides(roleId);
}
