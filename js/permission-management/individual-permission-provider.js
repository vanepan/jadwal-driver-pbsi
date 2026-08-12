/* ============================================================
   INDIVIDUAL-PERMISSION-PROVIDER.JS — Individual Permission
   Assignment, Phase 2: Runtime Permission Resolution (v1.30.9.5)

   The ONLY thing js/permission-service.js is allowed to know about how
   a user's individual permission overrides are stored/resolved —
   structurally identical to role-management/runtime-role-provider.js's
   boundary for Custom Roles. permission-service.js must never import
   user-permission-overrides-store.js (or Firebase) directly, so the
   storage/caching mechanism behind "this user's individual grants" can
   change later without touching the authorization engine at all.

   Unlike runtime-role-provider.js (customRoles is broadly readable —
   one global subscription serves every session), the RTDB rule for
   /userPermissionOverrides/{username} only permits admin/adminEquivalent
   or the record's own subject to read it (database.rules.json). So this
   provider's live cache is scoped to exactly ONE username — the current
   session's own — never a global subscription. See
   user-permission-overrides-store.js#initUserPermissionOverridesLive()
   for the per-user scoping + fail-closed identity guard.

   PURE at this file's own boundary: no permission logic lives here, only
   indirection. No DOM, no Firebase writes.
   ============================================================ */

'use strict';

import { getCurrentUser } from '../auth.js';
import {
  initUserPermissionOverridesLive,
  getCachedUserPermissionOverrides,
} from './user-permission-overrides-store.js';

/**
 * Start the live subscription for the CURRENT session's own override
 * record. Idempotent — safe to call on every session boot alongside
 * initRuntimeRoleProvider(). No-op when signed out (nothing to scope
 * the subscription to).
 * @returns {void}
 */
export function initIndividualPermissionProvider() {
  const user = getCurrentUser();
  if (!user || !user.username) return;
  initUserPermissionOverridesLive(user.username);
}

/**
 * The individual permission grants for `username`, as a Set<string> —
 * the only shape permission-service.js is allowed to depend on. A
 * synchronous read of the already-live local cache (no Firebase call on
 * the read path itself). Fail-closed: returns an empty Set when there is
 * no live cache for exactly this username (not yet loaded, denied,
 * unavailable, or scoped to a different session's identity).
 * @param {string} username
 * @returns {Set<string>}
 */
export function getIndividualPermissionOverrides(username) {
  if (!username) return new Set();
  return getCachedUserPermissionOverrides(username);
}
