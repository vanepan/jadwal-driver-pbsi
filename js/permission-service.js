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

   v1.30.9.5 — Individual Permission Assignment, Phase 2 (Runtime
   Resolution): effective permissions = base role/Custom Role grant UNION
   this session's individual overrides, resolved through
   permission-management/individual-permission-provider.js — the exact
   same dependency-inversion boundary runtime-role-provider.js already
   established for Custom Roles. permissionSetFor() itself (the BASE grant
   only) is deliberately UNCHANGED — role-catalog.js#resolveGrantedSet()
   and Role Management's Role Summary still describe a ROLE's own
   definition, not any one user's effective permissions, and must keep
   doing so. ARCHIVED CUSTOM ROLE + individual override: by explicit
   product decision, the base collapses to EMPTY_SET as it always has, but
   the individual override survives independently on top of it (does NOT
   also collapse) — see docs/INDIVIDUAL_PERMISSION_ASSIGNMENT_PHASE_2_
   REPORT_v1.30.9.5.md.

   PURE: plain lookups over getCurrentUser() (+ the runtime role provider's
   and individual permission provider's already-cached reads). No DOM, no
   Firebase writes.
   ============================================================ */

'use strict';

import { getCurrentUser } from './auth.js';
import { ROLE_PERMISSIONS } from './config/role-permissions.js';
import { getRuntimeRole } from './role-management/runtime-role-provider.js';
import { getIndividualPermissionOverrides } from './permission-management/individual-permission-provider.js';

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
 * Effective permission Set for `user`: base role/Custom Role grant UNION
 * this session's individual overrides (additive only — there is no DENY
 * concept). An archived/unresolvable base role resolves to EMPTY_SET as
 * always, but individual overrides are NOT collapsed along with it — by
 * explicit product decision they remain independently effective on top
 * of an empty base (EMPTY_SET ∪ overrides = overrides). Overrides are
 * themselves already fail-closed and system.admin-proof at the source
 * (user-permission-overrides-rules.js's normalizeOverrideRecord(), which
 * the live cache behind getIndividualPermissionOverrides() applies on
 * every read) — this function trusts that guarantee rather than
 * re-validating it.
 * @param {Object|null} user  a getCurrentUser() shape ({role, username})
 * @returns {Set<string>}
 */
function effectivePermissionSetFor(user) {
  if (!user) return EMPTY_SET;
  const base = permissionSetFor(user.role);
  const overrides = getIndividualPermissionOverrides(user.username);
  if (!overrides || overrides.size === 0) return base;
  const merged = new Set(base);
  for (const permissionId of overrides) merged.add(permissionId);
  return merged;
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
  return effectivePermissionSetFor(user).has(permission);
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

/** Every effective permission id the current session holds — base role/Custom
    Role grant plus individual overrides (empty array if signed out). */
export function listPermissions() {
  const user = getCurrentUser();
  return user ? [...effectivePermissionSetFor(user)] : [];
}
