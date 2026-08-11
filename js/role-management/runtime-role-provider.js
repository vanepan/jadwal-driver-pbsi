/* ============================================================
   RUNTIME-ROLE-PROVIDER.JS — Permission Runtime Migration, Sub-phase B
   (v1.30.6)

   The ONLY thing js/permission-service.js is allowed to know about how a
   non-System-Role id resolves to a permission set. Everything downstream of
   this file is an implementation detail of "where runtime role data lives
   today" — permission-service.js (the authorization engine) must never
   import a concrete store directly, so that store can change later without
   touching the engine at all.

   TODAY: backed by role-management/custom-roles-store.js — the client reads
   /customRoles/{id} directly (RTDB `.read` scoped to non-archived records
   for any authenticated user; see database.rules.json). This is Sub-phase
   B's chosen strategy (see the plan's re-evaluation of the four candidate
   Custom Role resolution strategies): it reuses the already-shipped,
   already-tested store with zero new Cloud Function surface.

   FUTURE: if `customRoles` records ever need tighter exposure than "any
   authenticated user can read a non-archived record" (Sub-phase B's
   rejected Strategy 4), only THIS file changes: swap the two functions
   below to read a new, minimal, broadly-readable mirror node instead (e.g.
   `roleRuntime/{id}: { permissions: [...] }`, kept in sync by a Cloud
   Function trigger on `customRoles` writes — the same "trigger mirrors a
   rich admin node into a skinny public one" pattern already used elsewhere
   in this app for onAssignmentWrite/onRequestWrite-style derived data).
   Neither permission-service.js nor js/app.js's boot sequence would need
   to change — they only ever call initRuntimeRoleProvider()/getRuntimeRole()
   from THIS file, never the concrete store.

   PURE at this file's own boundary: no permission logic lives here, only
   indirection. No DOM, no Firebase writes.
   ============================================================ */

'use strict';

import { initCustomRolesStore, getCustomRoleById } from './custom-roles-store.js';

/**
 * Start whatever live sync the current backend needs (today: subscribes to
 * /customRoles). Idempotent — safe to call on every session boot. Callers
 * (js/app.js's session bootstrap) should call this once, unconditionally,
 * so a Custom-Role-holding user's grants are resolvable immediately.
 * @returns {Promise<void>}
 */
export async function initRuntimeRoleProvider() {
  await initCustomRolesStore();
}

/**
 * The runtime role record for `roleId`, or null if unresolvable — the only
 * shape permission-service.js is allowed to depend on: `{ id, permissions,
 * archived }`. Today this is a synchronous read of custom-roles-store.js's
 * already-live local cache (no Firebase call on the read path itself).
 * @param {string} roleId
 * @returns {{id: string, permissions: string[], archived: boolean}|null}
 */
export function getRuntimeRole(roleId) {
  return getCustomRoleById(roleId);
}
