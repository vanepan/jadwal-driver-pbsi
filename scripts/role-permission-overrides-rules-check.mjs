/* role-permission-overrides-rules-check.mjs — Role-Level Permission
   Assignment, Phase 4: Storage & Security Foundation (v1.30.9.9)
   PURE node test. Drives the REAL role-permission-overrides-rules.js
   directly (no Firebase, no auth.js — Node-loadable by design, mirrors
   user-permission-overrides-rules-check.mjs's own shape). Covers:
   permission id validation against the real permission-registry.js
   catalog, the system.admin + system.users.manage hard boundary (WIDER
   than Individual Permission Assignment's — see the rules file's own
   header for why), the isValidRoleOverrideTarget() System-Role-only
   boundary (the Phase 4 Custom Role architectural decision, enforced in
   code), record well-formedness, fail-closed normalization, and the
   grant/revoke update builders.
   Run: node scripts/role-permission-overrides-rules-check.mjs (exit 0 = pass) */

import {
  FORBIDDEN_PERMISSION_IDS,
  FORBIDDEN_RECORD_FIELDS,
  isDangerousPermissionId,
  isValidPermissionId,
  isValidRoleOverrideTarget,
  isWellFormedOverrideRecord,
  normalizeOverrideRecord,
  buildGrantUpdate,
  buildRevokeUpdate,
} from '../js/permission-management/role-permission-overrides-rules.js';
import { listAllPermissions } from '../js/config/permission-registry.js';
import { ROLES } from '../js/config/role-registry.js';

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };

console.log('\n1. isDangerousPermissionId() — the hard boundary, WIDER than Individual Permission Assignment');
check('system.admin is dangerous', isDangerousPermissionId('system.admin') === true);
check('system.users.manage is dangerous (Phase 4 tightens this beyond Individual Permission Assignment\'s UI-only exclusion)', isDangerousPermissionId('system.users.manage') === true);
check('an ordinary permission is not dangerous', isDangerousPermissionId('pettycash.view') === false);
check('FORBIDDEN_PERMISSION_IDS contains exactly both protected ids', FORBIDDEN_PERMISSION_IDS.length === 2 && FORBIDDEN_PERMISSION_IDS.includes('system.admin') && FORBIDDEN_PERMISSION_IDS.includes('system.users.manage'));

console.log('\n2. isValidPermissionId() — real registry membership + danger check');
check('a real, ordinary permission id is valid', isValidPermissionId('pettycash.view') === true);
check('every single registered permission is valid EXCEPT the two protected ids', listAllPermissions().every((p) => FORBIDDEN_PERMISSION_IDS.includes(p.id) ? isValidPermissionId(p.id) === false : isValidPermissionId(p.id) === true));
check('system.admin itself is INVALID despite being a real registry entry', isValidPermissionId('system.admin') === false);
check('system.users.manage itself is INVALID despite being a real registry entry', isValidPermissionId('system.users.manage') === false);
check('an unknown/fake permission id is invalid', isValidPermissionId('fake.permission') === false);
check('empty string is invalid', isValidPermissionId('') === false);
check('null is invalid', isValidPermissionId(null) === false);
check('undefined is invalid', isValidPermissionId(undefined) === false);
check('a non-string is invalid', isValidPermissionId(42) === false);

console.log('\n3. isValidRoleOverrideTarget() — the Custom Role architectural boundary (Phase 4\'s own resolution of the CRITICAL CUSTOM ROLE DECISION)');
check('every real System Role id is a valid target', ROLES.every((r) => isValidRoleOverrideTarget(r.id) === true));
check('a Custom Role-shaped id is NOT a valid target', isValidRoleOverrideTarget('role_bidang-copy') === false);
check('an unknown role id is NOT a valid target', isValidRoleOverrideTarget('totally-made-up-role') === false);
check('empty string is not a valid target', isValidRoleOverrideTarget('') === false);
check('null is not a valid target', isValidRoleOverrideTarget(null) === false);
check('a non-string is not a valid target', isValidRoleOverrideTarget(42) === false);

console.log('\n4. isWellFormedOverrideRecord() — full record shape validation (array-of-strings, mirrors userPermissionOverrides\' shape)');
check('a clean, single-grant record is well-formed', isWellFormedOverrideRecord({ permissions: ['pettycash.view'] }) === true);
check('a clean, multi-grant record is well-formed', isWellFormedOverrideRecord({ permissions: ['pettycash.view', 'analytics.view'] }) === true);
check('a record with updatedAt metadata alongside permissions is well-formed', isWellFormedOverrideRecord({ permissions: ['pettycash.view'], updatedAt: '2026-08-13T00:00:00.000Z' }) === true);
check("RTDB's own list-like object form is well-formed too", isWellFormedOverrideRecord({ permissions: { 0: 'pettycash.view', 1: 'analytics.view' } }) === true);
check('null is not well-formed', isWellFormedOverrideRecord(null) === false);
check('an array (the record itself, not just permissions) is not well-formed', isWellFormedOverrideRecord(['pettycash.view']) === false);
check('a record with no permissions key is not well-formed', isWellFormedOverrideRecord({ updatedAt: 'x' }) === false);
check('a record with an EMPTY permissions array is not well-formed', isWellFormedOverrideRecord({ permissions: [] }) === false);
check('a record containing system.admin is NOT well-formed', isWellFormedOverrideRecord({ permissions: ['pettycash.view', 'system.admin'] }) === false);
check('a record containing system.users.manage is NOT well-formed', isWellFormedOverrideRecord({ permissions: ['pettycash.view', 'system.users.manage'] }) === false);
check('a record with an unknown permission id is NOT well-formed', isWellFormedOverrideRecord({ permissions: ['fake.permission'] }) === false);
check('a record with a duplicate permission id is NOT well-formed', isWellFormedOverrideRecord({ permissions: ['pettycash.view', 'pettycash.view'] }) === false);
for (const field of FORBIDDEN_RECORD_FIELDS) {
  check(`a record carrying a top-level "${field}" field is NOT well-formed`, isWellFormedOverrideRecord({ permissions: ['pettycash.view'], [field]: field === 'active' || field === 'archived' || field === 'adminEquivalent' ? true : 'x' }) === false);
}

console.log('\n5. normalizeOverrideRecord() — fail-closed, per-entry, never throws');
check('null record normalizes to an empty Set', normalizeOverrideRecord(null).size === 0);
check('a non-object record normalizes to an empty Set', normalizeOverrideRecord('garbage').size === 0);
check('a well-formed record normalizes to exactly its grants', [...normalizeOverrideRecord({ permissions: ['pettycash.view', 'analytics.view'] })].sort().join(',') === 'analytics.view,pettycash.view');
check("RTDB's own list-like object form normalizes identically to a real array", [...normalizeOverrideRecord({ permissions: { 0: 'pettycash.view', 1: 'analytics.view' } })].sort().join(',') === 'analytics.view,pettycash.view');
check('system.admin is silently EXCLUDED even if somehow present in the raw record (defense in depth)', !normalizeOverrideRecord({ permissions: ['pettycash.view', 'system.admin'] }).has('system.admin'));
check('system.users.manage is silently EXCLUDED even if somehow present in the raw record', !normalizeOverrideRecord({ permissions: ['pettycash.view', 'system.users.manage'] }).has('system.users.manage'));
check('a valid grant survives even when a protected id was also present alongside it', normalizeOverrideRecord({ permissions: ['pettycash.view', 'system.admin', 'system.users.manage'] }).has('pettycash.view'));
check('an unknown permission id is silently excluded, real ones survive', [...normalizeOverrideRecord({ permissions: ['pettycash.view', 'fake.permission'] })].join(',') === 'pettycash.view');
check('a record with no permissions field normalizes to empty', normalizeOverrideRecord({ updatedAt: 'x' }).size === 0);
check('duplicates collapse naturally (Set semantics)', normalizeOverrideRecord({ permissions: ['pettycash.view', 'pettycash.view'] }).size === 1);
check('a record whose permissions field is a plain string (wrong type) normalizes to empty', normalizeOverrideRecord({ permissions: 'pettycash.view' }).size === 0);

console.log('\n6. buildGrantUpdate() — additive, throws on an illegal grant, never silently no-ops');
check('grants a new permission onto an empty current set', [...buildGrantUpdate(new Set(), 'pettycash.view').permissions].join(',') === 'pettycash.view');
check('grant is additive — existing grants are preserved', buildGrantUpdate(new Set(['analytics.view']), 'pettycash.view').permissions.sort().join(',') === 'analytics.view,pettycash.view');
check('granting an already-granted permission is idempotent (no duplicate)', buildGrantUpdate(new Set(['pettycash.view']), 'pettycash.view').permissions.length === 1);
check('grant payload carries an ISO updatedAt string', typeof buildGrantUpdate(new Set(), 'pettycash.view').updatedAt === 'string' && !Number.isNaN(Date.parse(buildGrantUpdate(new Set(), 'pettycash.view').updatedAt)));
{
  let threw = false;
  try { buildGrantUpdate(new Set(), 'system.admin'); } catch (_) { threw = true; }
  check('attempting to grant system.admin THROWS (hard boundary, not a silent no-op)', threw === true);
}
{
  let threw = false;
  try { buildGrantUpdate(new Set(), 'system.users.manage'); } catch (_) { threw = true; }
  check('attempting to grant system.users.manage THROWS', threw === true);
}
{
  let threw = false;
  try { buildGrantUpdate(new Set(), 'fake.permission'); } catch (_) { threw = true; }
  check('attempting to grant an unregistered permission id THROWS', threw === true);
}

console.log('\n7. buildRevokeUpdate() — returns null (delete record) when the last grant is revoked');
check('revoking one of two grants leaves the other', buildRevokeUpdate(new Set(['pettycash.view', 'analytics.view']), 'pettycash.view').permissions.join(',') === 'analytics.view');
check('revoking the LAST grant returns null (delete the whole record)', buildRevokeUpdate(new Set(['pettycash.view']), 'pettycash.view') === null);
check('revoking a permission that was never granted is a safe no-op (still returns the unchanged current set)', buildRevokeUpdate(new Set(['pettycash.view']), 'analytics.view').permissions.join(',') === 'pettycash.view');
check('revoking from an already-empty set returns null', buildRevokeUpdate(new Set(), 'pettycash.view') === null);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
