/* ============================================================
   ROLE-PERMISSION-OVERRIDES-STORE.JS — Role-Level Permission
   Assignment, Phase 4: Storage & Security Foundation (v1.30.9.9)

   Firebase-persisted read/write abstraction for
   /rolePermissionOverrides/{roleId} — a brand-new node, sibling to
   /userPermissionOverrides (Individual Permission Assignment, Phase 1)
   and structurally independent of /customRoles (see role-permission-
   overrides-rules.js's header for why Custom Roles never target this
   node — isValidRoleOverrideTarget() is enforced here, before any write
   is attempted, exactly as isValidPermissionId() already is).

   TWO DISTINCT ACCESS PATTERNS, deliberately kept in one file because
   they read/write the exact same node (mirrors user-permission-
   overrides-store.js's own shape: one file, one admin one-shot API, one
   live cache, different consumers):

   1. ONE-SHOT ADMIN API (getRolePermissionOverrides/grantRolePermission/
      revokeRolePermission) — used by Role Management (any role, one at a
      time, on selection) and by User Management's Individual Permission
      panel (the currently-selected role in the Edit User form, for the
      3-way effective-permission provenance line). Never a broad
      collection read: the RTDB rule for this node grants admin/
      adminEquivalent read/write ONLY at the $roleId level (see
      database.rules.json's own comment on this node), matching exactly
      how these one-shot calls are always scoped to a single role id.

   2. LIVE CACHE, scoped to exactly the CURRENT SESSION's own role
      (initRolePermissionOverridesLive/getCachedRolePermissionOverrides)
      — consumed exclusively through permission-management/role-
      permission-provider.js, never directly by permission-service.js.
      This is what lets can()/listPermissions() stay synchronous while
      reflecting a role's Additional grants without a page reload. The
      RTDB rule's `auth.token.role === $roleId` branch is what makes a
      non-admin session's read of ITS OWN role's node legal at all — see
      database.rules.json's comment for the full reasoning (this mirrors
      userPermissionOverrides' `auth.uid === $username` self-branch,
      translated from per-user identity to per-role identity since a role
      is shared by many users and has no uid of its own).

   Every write path validates against role-permission-overrides-rules.js
   BEFORE attempting to reach Firebase — the RTDB rule is the real
   enforcement boundary, independent of this file, per this program's
   "the UI is not a security boundary" discipline (established since
   Individual Permission Assignment, Phase 1).

   PURE at this file's own boundary is NOT claimed — this file owns
   Firebase I/O. No DOM.
   ============================================================ */

'use strict';

import { readNode, subscribeNode, storeFirebaseData, updateFirebaseData, isFirebaseConfigured } from '../firebase.js';
import { isAdmin } from '../auth.js';
import {
  isValidPermissionId,
  isValidRoleOverrideTarget,
  normalizeOverrideRecord,
  buildGrantUpdate,
  buildRevokeUpdate,
} from './role-permission-overrides-rules.js';

const OVERRIDES_PATH = 'rolePermissionOverrides';

/* ── One-shot admin API ────────────────────────────────────────────── */

/**
 * The current Role Additional grants for `roleId`, as a plain Set<string>
 * — already normalized (fail-closed: a missing or malformed record
 * resolves to an empty Set, never an error).
 * @param {string} roleId
 * @returns {Promise<Set<string>>}
 */
export async function getRolePermissionOverrides(roleId) {
  if (!roleId) return new Set();
  if (!isFirebaseConfigured()) return new Set();
  const res = await readNode(`${OVERRIDES_PATH}/${roleId}`);
  if (res.status !== 'ok') return new Set(); // denied/error → fail closed, never throw
  return normalizeOverrideRecord(res.value);
}

/**
 * Grants `permissionId` to every user holding System Role `roleId`,
 * additive (existing Role Additional grants are preserved). Never touches
 * the role's Base permissions or any user's Individual overrides.
 * @param {string} roleId
 * @param {string} permissionId
 * @returns {Promise<Set<string>>} the resulting Role Additional grant set
 */
export async function grantRolePermission(roleId, permissionId) {
  if (!isAdmin()) throw new Error('Hanya admin yang dapat memberikan Role Additional Permission.');
  if (!isValidRoleOverrideTarget(roleId)) {
    throw new Error('Role Additional Permission hanya berlaku untuk System Role.');
  }
  if (!isValidPermissionId(permissionId)) {
    throw new Error(`"${permissionId}" bukan permission yang valid untuk Role Additional Permission.`);
  }

  const current = await getRolePermissionOverrides(roleId);
  const payload = buildGrantUpdate(current, permissionId);

  if (!isFirebaseConfigured()) return new Set([...current, permissionId]);
  await storeFirebaseData(`${OVERRIDES_PATH}/${roleId}`, payload);
  return normalizeOverrideRecord(payload);
}

/**
 * Revokes `permissionId` from System Role `roleId`'s Role Additional
 * grants. Deletes the whole record when this was the last grant. Never
 * mutates any user's Individual override as a side effect — this
 * function has no knowledge /userPermissionOverrides even exists.
 * @param {string} roleId
 * @param {string} permissionId
 * @returns {Promise<Set<string>>} the resulting Role Additional grant set
 */
export async function revokeRolePermission(roleId, permissionId) {
  if (!isAdmin()) throw new Error('Hanya admin yang dapat mencabut Role Additional Permission.');
  if (!isValidRoleOverrideTarget(roleId)) {
    throw new Error('Role Additional Permission hanya berlaku untuk System Role.');
  }

  const current = await getRolePermissionOverrides(roleId);
  const payload = buildRevokeUpdate(current, permissionId);

  if (!isFirebaseConfigured()) {
    const next = new Set(current);
    next.delete(permissionId);
    return next;
  }
  if (payload === null) {
    await storeFirebaseData(`${OVERRIDES_PATH}/${roleId}`, null);
    return new Set();
  }
  await updateFirebaseData(`${OVERRIDES_PATH}/${roleId}`, payload);
  return normalizeOverrideRecord(payload);
}

/* ── Live cache — scoped to exactly ONE role at a time ───────────────
   Consumed only through role-permission-provider.js. Mirrors user-
   permission-overrides-store.js's identical-shaped live cache. */

const LOAD = { UNLOADED: 'UNLOADED', LOADING: 'LOADING', LOADED: 'LOADED' };
const SUB = { IDLE: 'IDLE', SUBSCRIBING: 'SUBSCRIBING', SUBSCRIBED: 'SUBSCRIBED' };

let liveRoleId = null;
let liveGrants = new Set();
let liveLoadState = LOAD.UNLOADED;
let liveSubState = SUB.IDLE;
let liveUnsubscribe = null;

function resetLiveOverrideCache() {
  if (liveUnsubscribe) { try { liveUnsubscribe(); } catch (_) {} liveUnsubscribe = null; }
  liveRoleId = null;
  liveGrants = new Set();
  liveLoadState = LOAD.UNLOADED;
  liveSubState = SUB.IDLE;
}

/**
 * Start (or re-scope) the live subscription for `roleId`'s own Role
 * Additional record. Idempotent for the SAME roleId — safe to call on
 * every session boot. Re-scoping to a DIFFERENT roleId tears down the
 * previous subscription first, so the cache can never simultaneously
 * answer for two roles (defense-in-depth; the real invariant this app
 * relies on — same as user-permission-overrides-store.js's identical
 * comment — is that a role change takes effect on next login, since
 * auth.token.role is a custom claim baked into the session's token, not
 * hot-reloaded mid-session).
 * @param {string} roleId
 * @returns {void}
 */
export function initRolePermissionOverridesLive(roleId) {
  if (!roleId) { resetLiveOverrideCache(); return; }
  if (liveRoleId === roleId && liveSubState !== SUB.IDLE) return;
  resetLiveOverrideCache();
  liveRoleId = roleId;
  if (!isFirebaseConfigured()) { liveLoadState = LOAD.LOADED; return; }
  liveLoadState = LOAD.LOADING;
  liveSubState = SUB.SUBSCRIBING;
  liveUnsubscribe = subscribeNode(
    `${OVERRIDES_PATH}/${roleId}`,
    (snapshot) => {
      liveGrants = normalizeOverrideRecord(snapshot.val());
      liveLoadState = LOAD.LOADED;
      liveSubState = SUB.SUBSCRIBED;
    },
    {
      // Fail-closed: a denied/errored read never falls back to "allow" —
      // it resolves to an empty grant set, identical in effect to "no
      // Role Additional Permission has been granted to this role".
      onDenied: () => { liveGrants = new Set(); liveLoadState = LOAD.LOADED; liveSubState = SUB.IDLE; },
      onError: () => { liveGrants = new Set(); liveLoadState = LOAD.LOADED; liveSubState = SUB.IDLE; },
    }
  );
}

/**
 * Synchronous read of the live cache for `roleId` — the only function
 * role-permission-provider.js calls on the can()/listPermissions() read
 * path. Fail-closed identity guard: returns an empty Set for any roleId
 * other than the one currently subscribed, never a stale/cross-role
 * grant (see CACHE / IDENTITY SAFETY in the Phase 4 brief).
 * @param {string} roleId
 * @returns {Set<string>}
 */
export function getCachedRolePermissionOverrides(roleId) {
  if (!roleId || roleId !== liveRoleId) return new Set();
  return new Set(liveGrants);
}

/**
 * TEST-ONLY. Directly seeds the live cache for `roleId`, bypassing
 * Firebase entirely — mirrors user-permission-overrides-store.js's
 * __seedUserPermissionOverridesForTest() convention.
 * @param {string} roleId
 * @param {string[]} permissions
 */
export function __seedRolePermissionOverridesForTest(roleId, permissions) {
  liveRoleId = roleId;
  liveGrants = normalizeOverrideRecord({ permissions: permissions || [] });
  liveLoadState = LOAD.LOADED;
  liveSubState = SUB.SUBSCRIBED;
}

/**
 * TEST-ONLY. Resets the live cache to its unloaded/unsubscribed state.
 */
export function __resetRolePermissionOverridesLiveForTest() {
  resetLiveOverrideCache();
}
