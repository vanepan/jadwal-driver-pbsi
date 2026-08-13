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

   v1.30.9.9 — Role-Level Permission Assignment, Phase 4 (Runtime
   Resolution): effective permissions = base role/Custom Role grant UNION
   this session's role's Role Additional grants UNION this session's
   individual overrides, resolved through permission-management/role-
   permission-provider.js — the same dependency-inversion boundary as the
   other two providers above, applied uniformly to every roleId (System or
   Custom): Role Additional Permissions are only ever WRITTEN for a System
   Role (enforced by role-permission-overrides-rules.js#
   isValidRoleOverrideTarget() at the store layer), so a Custom Role's
   effective union simply adds an always-empty set in practice — this
   function does not need to know the distinction, keeping it as agnostic
   about role TYPE as permissionSetFor() already is.

   PURE: plain lookups over getCurrentUser() (+ the runtime role, role
   permission, and individual permission providers' already-cached reads).
   No DOM, no Firebase writes.
   ============================================================ */

'use strict';

import { getCurrentUser } from './auth.js';
import { ROLE_PERMISSIONS } from './config/role-permissions.js';
import { getRuntimeRole } from './role-management/runtime-role-provider.js';
import { getIndividualPermissionOverrides } from './permission-management/individual-permission-provider.js';
import { getRoleAdditionalPermissions } from './permission-management/role-permission-provider.js';

const EMPTY_SET = Object.freeze(new Set());

/** roleId -> Set<permissionId>, built once per SYSTEM role and reused after that. */
const _permissionSetCache = new Map();

/**
 * Permission ids that must never be effective as part of a Custom Role's
 * OWN base grant — v1.30.9.10, Custom Role Protected Permission Security
 * Hardening. Deliberately re-declared here rather than imported (same
 * "small two-item list, one per mechanism" reasoning as
 * NEVER_EFFECTIVE_VIA_OVERRIDE below — see that constant's own comment).
 *
 * WHY THIS EXISTS: custom-roles-rules.js/custom-roles-store.js/
 * database.rules.json now all reject a NEW write that would introduce
 * either id into a Custom Role's permission list (see those files' own
 * v1.30.9.10 comments) — but this function's job is READ-time safety,
 * independent of write-time prevention. A record that predates this
 * hardening, or one written by a direct admin-console bypass of every
 * other layer, must still never become an effective grant for any real
 * user. This is the last line of defense, applied unconditionally to
 * EVERY non-System-Role read — never to the `roleId in ROLE_PERMISSIONS`
 * branch above, which is code-defined and fully trusted (this is what
 * keeps the built-in Admin System Role's own legitimate system.admin/
 * system.users.manage grant completely untouched).
 */
const NEVER_EFFECTIVE_IN_CUSTOM_ROLE_BASE = Object.freeze(['system.admin', 'system.users.manage']);

/**
 * Permission Set for `roleId`. System Roles resolve from the static,
 * cached registry, fully trusted, never filtered. Anything else (a
 * Custom Role) is resolved through the runtime role provider — an
 * unresolvable or archived role fails closed (EMPTY_SET), same as an
 * unknown role id always has — and additionally has
 * NEVER_EFFECTIVE_IN_CUSTOM_ROLE_BASE's two ids stripped unconditionally,
 * since a Custom Role's permissions are Firebase-sourced data, not
 * code-trusted like the branch above.
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
  const permissions = new Set(runtimeRole.permissions || []);
  for (const id of NEVER_EFFECTIVE_IN_CUSTOM_ROLE_BASE) permissions.delete(id);
  return permissions;
}

/**
 * Permission ids that must never become effective THROUGH AN OVERRIDE
 * LAYER (Role Additional or Individual), regardless of source — the
 * final, defense-in-depth floor this resolution engine itself enforces,
 * in ADDITION to (never instead of) each override layer's own
 * validation. Deliberately re-declared here rather than imported from
 * role-permission-overrides-rules.js or user-permission-overrides-
 * rules.js: this file's own architecture never imports a concrete
 * override/rules module (see file header — only the two PROVIDER
 * indirections), and importing a rules file here would be a step
 * backward from that boundary for a two-item constant.
 *
 * WHY THIS EXISTS (found during Phase 4's own test-writing, v1.30.9.9):
 * role-permission-overrides-rules.js hard-blocks BOTH 'system.admin' AND
 * 'system.users.manage' at its own normalizeOverrideRecord() (Phase 4's
 * own, wider boundary — see that file's header). But user-permission-
 * overrides-rules.js (Individual Permission Assignment, Phase 1) only
 * hard-blocks 'system.admin' at that same layer — 'system.users.manage'
 * was, by that phase's own explicit and DOCUMENTED decision (docs/
 * INDIVIDUAL_PERMISSION_ASSIGNMENT_PHASE_3_FINAL_REPORT_v1.30.9.7.md §4),
 * excluded only at the UI layer (js/admin.js's IPM_FORBIDDEN_PERMISSION_
 * IDS), never at storage/rules. That file is on this phase's explicit
 * do-not-modify list, so this function adds the missing floor HERE
 * instead — a strictly additive safety net, never a behavior removal,
 * that also closes this latent gap for Individual overrides as a
 * side effect, without touching a single byte of the Phase 1-3 program.
 * Never applied to `base` — an ADMIN role's own legitimate 'system.admin'
 * base grant is untouched; only override CONTRIBUTIONS are filtered.
 */
const NEVER_EFFECTIVE_VIA_OVERRIDE = new Set(['system.admin', 'system.users.manage']);

/**
 * Effective permission Set for `user`: base role/Custom Role grant UNION
 * this session's role's Role Additional grants UNION this session's
 * individual overrides (additive only — there is no DENY concept). An
 * archived/unresolvable base role resolves to EMPTY_SET as always, but
 * Role Additional grants and individual overrides are NOT collapsed along
 * with it — by explicit product decision (established for individual
 * overrides in Phase 2, extended identically to Role Additional grants in
 * Phase 4) both remain independently effective on top of an empty base
 * (EMPTY_SET ∪ roleAdditional ∪ individual = roleAdditional ∪ individual).
 * Both override sources are already fail-closed and normalize their own
 * raw data (role-permission-overrides-rules.js / user-permission-
 * overrides-rules.js's normalizeOverrideRecord(), which the live caches
 * behind getRoleAdditionalPermissions()/getIndividualPermissionOverrides()
 * apply on every read) — but this function does NOT blindly trust either
 * layer to be the last word on NEVER_EFFECTIVE_VIA_OVERRIDE's two ids (see
 * that constant's own comment for why); it re-filters both override
 * contributions itself as the final boundary.
 * @param {Object|null} user  a getCurrentUser() shape ({role, username})
 * @returns {Set<string>}
 */
function effectivePermissionSetFor(user) {
  if (!user) return EMPTY_SET;
  const base = permissionSetFor(user.role);
  const roleAdditional = getRoleAdditionalPermissions(user.role);
  const individual = getIndividualPermissionOverrides(user.username);
  if ((!roleAdditional || roleAdditional.size === 0) && (!individual || individual.size === 0)) return base;
  const merged = new Set(base);
  for (const permissionId of roleAdditional) { if (!NEVER_EFFECTIVE_VIA_OVERRIDE.has(permissionId)) merged.add(permissionId); }
  for (const permissionId of individual) { if (!NEVER_EFFECTIVE_VIA_OVERRIDE.has(permissionId)) merged.add(permissionId); }
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
    Role grant plus Role Additional and individual overrides (empty array if
    signed out). */
export function listPermissions() {
  const user = getCurrentUser();
  return user ? [...effectivePermissionSetFor(user)] : [];
}
