/* ============================================================
   USER-PERMISSION-OVERRIDES-RULES.JS — Individual Permission
   Assignment, Phase 1: Storage & Security Foundation (v1.30.9.1)

   PURE business-rule layer for individual (per-user) permission grants
   — the ADDITIVE layer described in
   docs/INDIVIDUAL_PERMISSION_ASSIGNMENT_ARCHITECTURE_AUDIT_v1.30.9.md:
   effectivePermissions(user) = permissionSetFor(user.role) ∪
   individualGrantsFor(user.username). This file owns only the "what is
   a legal individual grant" question. It has ZERO knowledge of runtime
   permission RESOLUTION (that is explicitly Phase 2's job, not built
   here) and ZERO knowledge of Firebase (kept Node-loadable on purpose,
   mirroring the pure/store split already established by
   custom-roles-rules.js / custom-roles-store.js).

   STORAGE SHAPE — `permissions: string[]`, NOT a map of
   `{permissionId: true}`. This was the first design tried and reverted:
   permission ids are dot-notation (e.g. `warehouse.item.edit`), and
   Firebase Realtime Database keys cannot contain `.` at all — confirmed
   by the real client SDK itself rejecting the write outright ("Keys...
   can't contain '.', '#', '$', '/', '[', or ']'") the moment the
   emulator suite actually tried it, not caught by reading the rule text.
   An array of strings sidesteps this entirely (the ids become VALUES,
   never keys) and — not incidentally — is the exact shape
   `/customRoles/{id}.permissions` already uses successfully in
   production; this module now follows that same, already-proven
   convention rather than inventing a second one.

   GRANT-ONLY MODEL (v1.30.9.1 scope, per the architecture audit §10):
   there is no denial concept here, and the array shape makes this true
   almost for free — a permission id is either present in the array
   (granted) or absent (not granted); there is no key/value pair to hold
   a `false`, so there is nothing to reject the way the old map shape
   needed isValidGrantValue() for.

   HARD SECURITY BOUNDARY (audit §13, non-negotiable): 'system.admin' can
   never be a legal individual grant, full stop, regardless of who is
   attempting to write it. isDangerousPermissionId() is the one function
   every write path (client-side pre-check AND the RTDB .validate rule,
   independently) must agree on — this file's copy is the client-side
   half of that agreement; database.rules.json's own literal
   `newData.val() !== 'system.admin'` clause (checked per array element,
   via the `$index` wildcard) is the server-side half. Neither trusts the
   other to be sufficient alone.

   PURE: plain data transforms. No DOM, no Firebase, no `window`.
   ============================================================ */

'use strict';

import { getPermission } from '../config/permission-registry.js';

/**
 * The one permission id that must never be grantable through this
 * mechanism, under any circumstances — it must remain exclusively
 * role/Custom-Role-derived (see verifyPin.js#resolveRoleClaims(), the
 * only place `adminEquivalent` is ever minted, and which this module's
 * storage layer is never consulted by, by design).
 */
export const FORBIDDEN_PERMISSION_IDS = Object.freeze(['system.admin']);

/** Top-level fields that must never appear on an override record — this
    node represents permission grants ONLY, never identity/authorization
    claims or credential material (architecture audit §2/§11). */
export const FORBIDDEN_RECORD_FIELDS = Object.freeze([
  'role', 'adminEquivalent', 'pin', 'pinHash', 'active', 'archived',
]);

/**
 * Whether `permissionId` is one this mechanism is structurally
 * forbidden from ever granting.
 * @param {string} permissionId
 * @returns {boolean}
 */
export function isDangerousPermissionId(permissionId) {
  return FORBIDDEN_PERMISSION_IDS.includes(permissionId);
}

/**
 * Whether `permissionId` is a real, registered, grantable permission —
 * checked against permission-registry.js (the single source of truth
 * for what permissions exist at all), and not one of the structurally
 * forbidden ids above.
 * @param {string} permissionId
 * @returns {boolean}
 */
export function isValidPermissionId(permissionId) {
  if (!permissionId || typeof permissionId !== 'string') return false;
  if (isDangerousPermissionId(permissionId)) return false;
  return !!getPermission(permissionId);
}

/**
 * Whether `record.permissions` (as read from RTDB — a "list-like" object
 * with numeric-string keys, or a genuine JS array once read back through
 * the SDK) is a completely well-formed override record: every element a
 * valid, non-dangerous, non-duplicate permission id, and no forbidden
 * top-level fields present on the record itself.
 * @param {Object|null} record  raw value as read from
 *   /userPermissionOverrides/{username}, or null if absent
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
    if (seen.has(permissionId)) return false; // duplicates indicate a malformed/tampered write
    seen.add(permissionId);
  }
  return true;
}

/**
 * Normalizes whatever shape `permissions` actually is (a real JS array,
 * or RTDB's list-like `{"0":"a","1":"b"}` object form, or something
 * malformed) into a plain array of values, or `null` if the shape itself
 * is unusable (not an array and not a plain object).
 * @param {*} permissions
 * @returns {Array|null}
 */
function toPermissionArray(permissions) {
  if (Array.isArray(permissions)) return permissions;
  if (permissions && typeof permissions === 'object') return Object.values(permissions);
  return null;
}

/**
 * Fail-closed normalization: a raw RTDB value (whatever it actually is —
 * null, malformed, partially valid, or fully valid) becomes a clean
 * Set<string> of granted permission ids. Any individual entry that fails
 * isValidPermissionId() is silently dropped rather than poisoning the
 * whole result — a malformed RECORD never fails "safe" (empty), only
 * individual malformed ENTRIES within an otherwise legible record are
 * excluded. This mirrors permission-service.js's own "an unresolvable
 * role fails to EMPTY_SET, never throws" convention.
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
 * user, given their CURRENT grant set (so a grant is additive — it never
 * clobbers other existing grants). Throws (does not silently no-op) if
 * `permissionId` is not a legal grant — callers must not attempt to
 * persist an invalid id; the RTDB rule is the last line of defense, not
 * the first (architecture audit §4: "the UI is not a security boundary"
 * cuts both ways — invalid input must not even reach the write attempt).
 * @param {Set<string>} currentGrants
 * @param {string} permissionId
 * @returns {{permissions: string[], updatedAt: string}}
 */
export function buildGrantUpdate(currentGrants, permissionId) {
  if (!isValidPermissionId(permissionId)) {
    throw new Error(`"${permissionId}" bukan permission yang valid untuk individual grant.`);
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
 * user's current grant set. Returns `null` (meaning: delete the whole
 * record) when the resulting set would be empty — an override record
 * with zero grants is not a meaningful state to persist (RTDB itself
 * would prune an empty array/object on write regardless; this makes that
 * behavior explicit rather than incidental).
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
