/* ============================================================
   USER-PERMISSION-OVERRIDES-STORE.JS — Individual Permission
   Assignment, Phase 1: Storage & Security Foundation (v1.30.9.1)

   Firebase-persisted read/write abstraction for
   /userPermissionOverrides/{username} — a brand-new node, completely
   separate from /users (see database.rules.json's own comment on that
   node and docs/INDIVIDUAL_PERMISSION_ASSIGNMENT_ARCHITECTURE_AUDIT_
   v1.30.9.md §11 for why: /users' self-write branch was the exact
   surface a real self-privilege-escalation vulnerability was found and
   fixed on this session, v1.30.7.9 — this node is deliberately built
   with NO self-write branch at all, stricter than /users, so that class
   of defect cannot recur by construction).

   PHASE 1 SCOPE ONLY: schema normalization, permission id validation,
   read/write abstraction, safe serialization, fail-closed handling.
   This file is NOT imported by permission-service.js and does not
   participate in runtime permission resolution — that is explicitly
   Phase 2's job (see the architecture audit §12's recommended
   individual-permission-provider.js, not built here). A user's runtime
   permissions are byte-for-byte unchanged by this file's existence.

   No live subscription yet (unlike custom-roles-store.js) — Phase 1 has
   no consumer that needs one. One-shot reads are sufficient for a
   storage-and-security-only phase; Phase 2 adds the live-cache pattern
   only once something actually needs to react to a change in real time.

   Every write path validates against user-permission-overrides-rules.js
   BEFORE attempting to reach Firebase — but the RTDB rule
   (database.rules.json's userPermissionOverrides node) is the real
   enforcement boundary, independent of this file, exactly per the
   architecture audit's "the UI is not a security boundary" principle.
   This file's own validation exists to fail fast/clearly for a
   legitimate admin caller, not as the security guarantee itself.

   PHASE 2 ADDITION (v1.30.9.5): a live, per-username cache — the
   "Phase 2 adds the live-cache pattern only once something actually
   needs to react to a change in real time" this file's own header
   predicted. Consumed exclusively through
   permission-management/individual-permission-provider.js, never
   directly by permission-service.js. Deliberately scoped to ONE
   username at a time (never a global subscription like
   custom-roles-store.js's /customRoles): the RTDB rule for this node
   only permits admin/adminEquivalent or the record's own subject to
   read it, so a global subscription would be denied outright for a
   non-admin session. getCachedUserPermissionOverrides() additionally
   fails closed if asked for any username other than the one currently
   subscribed — a defense-in-depth identity guard, not just a
   convenience default, so a stale/mis-scoped cache can never answer for
   the wrong user. The existing one-shot admin-editing API below
   (getUserPermissionOverrides/grantUserPermission/revokeUserPermission)
   is untouched — it serves admin editing ANOTHER user's overrides,
   which the live cache (scoped to the CURRENT session's own identity)
   must not be conflated with.
   ============================================================ */

'use strict';

import { readNode, subscribeNode, storeFirebaseData, updateFirebaseData, isFirebaseConfigured } from '../firebase.js';
import { isAdmin } from '../auth.js';
import {
  isValidPermissionId,
  normalizeOverrideRecord,
  buildGrantUpdate,
  buildRevokeUpdate,
} from './user-permission-overrides-rules.js';

const OVERRIDES_PATH = 'userPermissionOverrides';

/** Mirror of users.js#normalizeUsername() — must stay in sync. Not
    imported directly: js/users.js is on this phase's untouched-files
    list, and the function isn't exported there either (same reasoning
    functions/src/auth/verifyPin.js already documents for its own
    mirror of the identical logic). */
function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '-');
}

/**
 * The current individual permission grants for `username`, as a plain
 * Set<string> — already normalized (fail-closed: a missing or malformed
 * record resolves to an empty Set, never an error).
 * @param {string} username
 * @returns {Promise<Set<string>>}
 */
export async function getUserPermissionOverrides(username) {
  const normalized = normalizeUsername(username);
  if (!normalized) return new Set();
  if (!isFirebaseConfigured()) return new Set();
  const res = await readNode(`${OVERRIDES_PATH}/${normalized}`);
  if (res.status !== 'ok') return new Set(); // denied/error → fail closed, never throw
  return normalizeOverrideRecord(res.value);
}

/**
 * Grants `permissionId` to `username`, additive (existing grants are
 * preserved). Client-side gate mirrors this codebase's established
 * convention (e.g. custom-roles-store.js#createCustomRoleFromClone()) of
 * checking isAdmin() before even attempting the write — the REAL
 * enforcement is the RTDB rule, this is a fast, clear failure for a
 * legitimate caller who simply isn't authorized, not the security
 * boundary itself.
 * @param {string} username
 * @param {string} permissionId
 * @returns {Promise<Set<string>>} the resulting grant set
 */
export async function grantUserPermission(username, permissionId) {
  if (!isAdmin()) throw new Error('Hanya admin yang dapat memberikan individual permission grant.');
  const normalized = normalizeUsername(username);
  if (!normalized) throw new Error('Username tidak valid.');
  if (!isValidPermissionId(permissionId)) {
    throw new Error(`"${permissionId}" bukan permission yang valid untuk individual grant.`);
  }

  const current = await getUserPermissionOverrides(normalized);
  const payload = buildGrantUpdate(current, permissionId);

  if (!isFirebaseConfigured()) return new Set([...current, permissionId]);
  await storeFirebaseData(`${OVERRIDES_PATH}/${normalized}`, payload);
  return normalizeOverrideRecord(payload);
}

/**
 * Revokes `permissionId` from `username`. Deletes the whole record when
 * this was the last grant (buildRevokeUpdate() returns null in that
 * case) — an override record with zero grants is not a meaningful
 * persisted state (architecture audit §9's test matrix: "no override
 * record" and "an empty one" must be indistinguishable in effect).
 * @param {string} username
 * @param {string} permissionId
 * @returns {Promise<Set<string>>} the resulting grant set
 */
export async function revokeUserPermission(username, permissionId) {
  if (!isAdmin()) throw new Error('Hanya admin yang dapat mencabut individual permission grant.');
  const normalized = normalizeUsername(username);
  if (!normalized) throw new Error('Username tidak valid.');

  const current = await getUserPermissionOverrides(normalized);
  const payload = buildRevokeUpdate(current, permissionId);

  if (!isFirebaseConfigured()) {
    const next = new Set(current);
    next.delete(permissionId);
    return next;
  }
  if (payload === null) {
    await storeFirebaseData(`${OVERRIDES_PATH}/${normalized}`, null);
    return new Set();
  }
  await updateFirebaseData(`${OVERRIDES_PATH}/${normalized}`, payload);
  return normalizeOverrideRecord(payload);
}

/* ── Live cache — Phase 2 (v1.30.9.5) ──────────────────────────────────
   Scoped to exactly ONE username at a time (see file header). Consumed
   only through individual-permission-provider.js. */

const LOAD = { UNLOADED: 'UNLOADED', LOADING: 'LOADING', LOADED: 'LOADED' };
const SUB = { IDLE: 'IDLE', SUBSCRIBING: 'SUBSCRIBING', SUBSCRIBED: 'SUBSCRIBED' };

let liveUsername = null;
let liveGrants = new Set();
let liveLoadState = LOAD.UNLOADED;
let liveSubState = SUB.IDLE;
let liveUnsubscribe = null;

function resetLiveOverrideCache() {
  if (liveUnsubscribe) { try { liveUnsubscribe(); } catch (_) {} liveUnsubscribe = null; }
  liveUsername = null;
  liveGrants = new Set();
  liveLoadState = LOAD.UNLOADED;
  liveSubState = SUB.IDLE;
}

/**
 * Start (or re-scope) the live subscription for `username`'s own
 * override record. Idempotent for the SAME username — safe to call on
 * every session boot. Re-scoping to a DIFFERENT username tears down the
 * previous subscription first, so the cache can never simultaneously
 * answer for two identities (defense-in-depth; the real invariant this
 * app relies on is that a user switch always passes through a full page
 * reload — see js/auth.js#logout() — which already destroys this
 * module's state on its own).
 * @param {string} username
 * @returns {void}
 */
export function initUserPermissionOverridesLive(username) {
  const normalized = normalizeUsername(username);
  if (!normalized) { resetLiveOverrideCache(); return; }
  if (liveUsername === normalized && liveSubState !== SUB.IDLE) return;
  resetLiveOverrideCache();
  liveUsername = normalized;
  if (!isFirebaseConfigured()) { liveLoadState = LOAD.LOADED; return; }
  liveLoadState = LOAD.LOADING;
  liveSubState = SUB.SUBSCRIBING;
  liveUnsubscribe = subscribeNode(
    `${OVERRIDES_PATH}/${normalized}`,
    (snapshot) => {
      liveGrants = normalizeOverrideRecord(snapshot.val());
      liveLoadState = LOAD.LOADED;
      liveSubState = SUB.SUBSCRIBED;
    },
    {
      // Fail-closed (§8 of the Phase 2 investigation): a denied/errored
      // read never falls back to "allow" — it resolves to an empty grant
      // set, identical in effect to "no override record exists".
      onDenied: () => { liveGrants = new Set(); liveLoadState = LOAD.LOADED; liveSubState = SUB.IDLE; },
      onError: () => { liveGrants = new Set(); liveLoadState = LOAD.LOADED; liveSubState = SUB.IDLE; },
    }
  );
}

/**
 * Synchronous read of the live cache for `username` — the only function
 * individual-permission-provider.js calls on the can()/listPermissions()
 * read path. Fail-closed identity guard: returns an empty Set for any
 * username other than the one currently subscribed (not yet loaded, no
 * live cache at all, or — defensively — a mismatched identity), never a
 * stale grant belonging to a different session.
 * @param {string} username
 * @returns {Set<string>}
 */
export function getCachedUserPermissionOverrides(username) {
  const normalized = normalizeUsername(username);
  if (!normalized || normalized !== liveUsername) return new Set();
  return new Set(liveGrants);
}

/**
 * TEST-ONLY. Directly seeds the live cache for `username`, bypassing
 * Firebase entirely — mirrors custom-roles-store.js's
 * __seedCustomRolesForTest() convention. Real application code MUST
 * NEVER import this.
 * @param {string} username
 * @param {string[]} permissions
 */
export function __seedUserPermissionOverridesForTest(username, permissions) {
  const normalized = normalizeUsername(username);
  liveUsername = normalized;
  liveGrants = normalizeOverrideRecord({ permissions: permissions || [] });
  liveLoadState = LOAD.LOADED;
  liveSubState = SUB.SUBSCRIBED;
}

/**
 * TEST-ONLY. Resets the live cache to its unloaded/unsubscribed state —
 * lets a test simulate the logout/reload boundary without a real page
 * reload.
 */
export function __resetUserPermissionOverridesLiveForTest() {
  resetLiveOverrideCache();
}
