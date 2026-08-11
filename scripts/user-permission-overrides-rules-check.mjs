/* user-permission-overrides-rules-check.mjs — Individual Permission
   Assignment, Phase 1: Storage & Security Foundation (v1.30.9.1)
   PURE node test. Drives the REAL user-permission-overrides-rules.js
   directly (no Firebase, no auth.js — Node-loadable by design, same
   split as custom-roles-rules.js). Covers: permission id validation
   against the real permission-registry.js catalog, the system.admin
   hard boundary, record well-formedness (array-of-strings shape — see
   this file's own header for why an object-of-booleans shape was tried
   first and reverted: RTDB keys can't contain "." and permission ids
   are dot-notation), fail-closed normalization of malformed/malicious
   payloads, and the grant/revoke update builders.
   Run: node scripts/user-permission-overrides-rules-check.mjs (exit 0 = pass) */

import {
  FORBIDDEN_PERMISSION_IDS,
  FORBIDDEN_RECORD_FIELDS,
  isDangerousPermissionId,
  isValidPermissionId,
  isWellFormedOverrideRecord,
  normalizeOverrideRecord,
  buildGrantUpdate,
  buildRevokeUpdate,
} from '../js/permission-management/user-permission-overrides-rules.js';
import { listAllPermissions } from '../js/config/permission-registry.js';

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };

console.log('\n1. isDangerousPermissionId() — the hard system.admin boundary');
check('system.admin is dangerous', isDangerousPermissionId('system.admin') === true);
check('an ordinary permission is not dangerous', isDangerousPermissionId('pettycash.view') === false);
check('FORBIDDEN_PERMISSION_IDS contains exactly system.admin', FORBIDDEN_PERMISSION_IDS.length === 1 && FORBIDDEN_PERMISSION_IDS[0] === 'system.admin');

console.log('\n2. isValidPermissionId() — real registry membership + danger check');
check('a real, ordinary permission id is valid', isValidPermissionId('pettycash.view') === true);
check('every single registered permission is valid EXCEPT system.admin', listAllPermissions().every((p) => p.id === 'system.admin' ? isValidPermissionId(p.id) === false : isValidPermissionId(p.id) === true));
check('system.admin itself is INVALID despite being a real registry entry', isValidPermissionId('system.admin') === false);
check('an unknown/fake permission id is invalid', isValidPermissionId('fake.permission') === false);
check('empty string is invalid', isValidPermissionId('') === false);
check('null is invalid', isValidPermissionId(null) === false);
check('undefined is invalid', isValidPermissionId(undefined) === false);
check('a non-string is invalid', isValidPermissionId(42) === false);

console.log('\n3. isWellFormedOverrideRecord() — full record shape validation (array-of-strings)');
check('a clean, single-grant record is well-formed', isWellFormedOverrideRecord({ permissions: ['pettycash.view'] }) === true);
check('a clean, multi-grant record is well-formed', isWellFormedOverrideRecord({ permissions: ['pettycash.view', 'analytics.view'] }) === true);
check('a record with updatedAt metadata alongside permissions is well-formed', isWellFormedOverrideRecord({ permissions: ['pettycash.view'], updatedAt: '2026-08-11T00:00:00.000Z' }) === true);
check("RTDB's own list-like object form (as it actually comes back from a real read) is well-formed too", isWellFormedOverrideRecord({ permissions: { 0: 'pettycash.view', 1: 'analytics.view' } }) === true);
check('null is not well-formed', isWellFormedOverrideRecord(null) === false);
check('an array (the record itself, not just permissions) is not well-formed', isWellFormedOverrideRecord(['pettycash.view']) === false);
check('a record with no permissions key is not well-formed', isWellFormedOverrideRecord({ updatedAt: 'x' }) === false);
check('a record with an EMPTY permissions array is not well-formed', isWellFormedOverrideRecord({ permissions: [] }) === false);
check('a record containing system.admin is NOT well-formed', isWellFormedOverrideRecord({ permissions: ['pettycash.view', 'system.admin'] }) === false);
check('a record with an unknown permission id is NOT well-formed', isWellFormedOverrideRecord({ permissions: ['fake.permission'] }) === false);
check('a record with a duplicate permission id is NOT well-formed', isWellFormedOverrideRecord({ permissions: ['pettycash.view', 'pettycash.view'] }) === false);
for (const field of FORBIDDEN_RECORD_FIELDS) {
  check(`a record carrying a top-level "${field}" field is NOT well-formed`, isWellFormedOverrideRecord({ permissions: ['pettycash.view'], [field]: field === 'active' || field === 'archived' || field === 'adminEquivalent' ? true : 'x' }) === false);
}

console.log('\n4. normalizeOverrideRecord() — fail-closed, per-entry, never throws');
check('null record normalizes to an empty Set', normalizeOverrideRecord(null).size === 0);
check('a non-object record normalizes to an empty Set', normalizeOverrideRecord('garbage').size === 0);
check('a well-formed record normalizes to exactly its grants', [...normalizeOverrideRecord({ permissions: ['pettycash.view', 'analytics.view'] })].sort().join(',') === 'analytics.view,pettycash.view');
check("RTDB's own list-like object form normalizes identically to a real array", [...normalizeOverrideRecord({ permissions: { 0: 'pettycash.view', 1: 'analytics.view' } })].sort().join(',') === 'analytics.view,pettycash.view');
check('system.admin is silently EXCLUDED even if somehow present in the raw record (defense in depth)', !normalizeOverrideRecord({ permissions: ['pettycash.view', 'system.admin'] }).has('system.admin'));
check('a valid grant survives even when system.admin was also present alongside it', normalizeOverrideRecord({ permissions: ['pettycash.view', 'system.admin'] }).has('pettycash.view'));
check('an unknown permission id is silently excluded, real ones survive', [...normalizeOverrideRecord({ permissions: ['pettycash.view', 'fake.permission'] })].join(',') === 'pettycash.view');
check('a record with no permissions field normalizes to empty', normalizeOverrideRecord({ updatedAt: 'x' }).size === 0);
check('duplicates collapse naturally (Set semantics)', normalizeOverrideRecord({ permissions: ['pettycash.view', 'pettycash.view'] }).size === 1);
check('a record whose permissions field is a plain string (wrong type) normalizes to empty', normalizeOverrideRecord({ permissions: 'pettycash.view' }).size === 0);

console.log('\n5. buildGrantUpdate() — additive, throws on an invalid id (never silently no-ops)');
const g1 = buildGrantUpdate(new Set(), 'pettycash.view');
check('granting from empty produces exactly one permission', Array.isArray(g1.permissions) && g1.permissions.length === 1 && g1.permissions[0] === 'pettycash.view');
check('the update carries an updatedAt timestamp', typeof g1.updatedAt === 'string' && g1.updatedAt.length > 0);
const g2 = buildGrantUpdate(new Set(['analytics.view']), 'pettycash.view');
check('granting is additive — existing grants are preserved', [...g2.permissions].sort().join(',') === 'analytics.view,pettycash.view');
check('granting the same permission twice is idempotent (still exactly one entry)', buildGrantUpdate(new Set(['pettycash.view']), 'pettycash.view').permissions.length === 1);
check('attempting to grant system.admin THROWS rather than silently succeeding', (() => { try { buildGrantUpdate(new Set(), 'system.admin'); return false; } catch (_) { return true; } })());
check('attempting to grant an unknown permission id THROWS', (() => { try { buildGrantUpdate(new Set(), 'fake.permission'); return false; } catch (_) { return true; } })());

console.log('\n6. buildRevokeUpdate() — deletes the whole record when it was the last grant');
const r1 = buildRevokeUpdate(new Set(['pettycash.view']), 'pettycash.view');
check('revoking the only grant returns null (meaning: delete the record)', r1 === null);
const r2 = buildRevokeUpdate(new Set(['pettycash.view', 'analytics.view']), 'pettycash.view');
check('revoking one of several grants leaves the others intact', r2 !== null && r2.permissions.join(',') === 'analytics.view');
check('revoking a permission the user never had is a harmless no-op shape (not an error)', buildRevokeUpdate(new Set(['analytics.view']), 'pettycash.view').permissions.includes('analytics.view'));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
