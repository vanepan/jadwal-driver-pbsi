/* role-permission-runtime-check.mjs — Role-Level Permission Assignment,
   Phase 4: Runtime Resolution (v1.30.9.9)
   PURE node test. Mirrors individual-permission-runtime-check.mjs's
   established pattern exactly, extended to THREE layers: base role/
   Custom Role grant, Role Additional grants, and Individual overrides.
   Drives the REAL role-permission-overrides-rules.js#normalizeOverrideRecord()
   AND user-permission-overrides-rules.js#normalizeOverrideRecord() directly
   for the two override halves — both are pure/Node-loadable by design —
   so every fail-closed/protected-permission/malformed-record assertion
   below exercises the actual production normalization logic, not a
   second mirror of it. Only permission-service.js's own union algorithm
   is locally mirrored (auth.js/the live caches are Firebase-coupled, not
   Node-loadable).

   Covers the full Phase 7 RUNTIME test matrix from the Phase 4 brief:
   the 7-case layer combination matrix, REVOCATION semantics (role revoke
   leaves individual untouched; individual revoke doesn't touch role),
   ROLE CHANGE semantics (old role's Role Additional grants disappear,
   individual grants survive), CROSS-USER / CROSS-ROLE isolation,
   PROTECTED permissions (system.admin / system.users.manage can never
   become effective through ANY combination), and FAIL CLOSED behavior.

   The REAL wiring (permission-service.js -> role-permission-provider.js
   -> role-permission-overrides-store.js's live cache) would be exercised
   by a Puppeteer-level test the same way permission-runtime-invariant-
   check.mjs exercises the Individual Permission wiring — out of scope
   for this PURE suite by the same division of labor already established.

   Run: node scripts/role-permission-runtime-check.mjs (exit 0 = pass) */

import { normalizeOverrideRecord as normalizeRoleOverride } from '../js/permission-management/role-permission-overrides-rules.js';
import { normalizeOverrideRecord as normalizeIndividualOverride } from '../js/permission-management/user-permission-overrides-rules.js';
import { ROLE_PERMISSIONS } from '../js/config/role-permissions.js';
import { ROLES } from '../js/config/role-registry.js';

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };
const setsEqual = (a, b) => a.size === b.size && [...a].every((v) => b.has(v));

/* ── Local mirror of permission-service.js's base resolution. ────────── */
const _setCache = new Map();
function permissionSetFor(roleId, customRoleFixtures = []) {
  if (!roleId) return new Set();
  if (roleId in ROLE_PERMISSIONS) {
    if (!_setCache.has(roleId)) _setCache.set(roleId, new Set(ROLE_PERMISSIONS[roleId] || []));
    return _setCache.get(roleId);
  }
  const customRole = customRoleFixtures.find((r) => r.id === roleId) || null;
  if (!customRole || customRole.archived === true) return new Set();
  return new Set(customRole.permissions || []);
}

// This test's own discovery (see permission-service.js's
// NEVER_EFFECTIVE_VIA_OVERRIDE for the full account): user-permission-
// overrides-rules.js (Phase 1) only hard-blocks 'system.admin' at its
// own normalizeOverrideRecord(), NOT 'system.users.manage' — that file
// is on this phase's untouched list, so permission-service.js adds the
// missing floor itself, filtering ONLY override contributions (never
// `base`, so admin's own legitimate system.admin/system.users.manage
// base grant is untouched). Mirrored here identically since this
// function mirrors permission-service.js's real algorithm end-to-end.
const NEVER_EFFECTIVE_VIA_OVERRIDE = new Set(['system.admin', 'system.users.manage']);

/* ── Local mirror of permission-service.js's effectivePermissionSetFor()
   post-Phase-4: base ∪ roleAdditional ∪ individual. Both override halves
   call the REAL normalizeOverrideRecord() from their respective rules
   files — the same fail-closed/protected-permission-stripping functions
   the live caches apply on every RTDB snapshot. ─────────────────────── */
function effectivePermissionSetFor(roleId, rawRoleOverrideRecord, rawIndividualOverrideRecord, customRoleFixtures = []) {
  const base = permissionSetFor(roleId, customRoleFixtures);
  const roleAdditional = normalizeRoleOverride(rawRoleOverrideRecord);
  const individual = normalizeIndividualOverride(rawIndividualOverrideRecord);
  if (roleAdditional.size === 0 && individual.size === 0) return base;
  const merged = new Set(base);
  for (const p of roleAdditional) { if (!NEVER_EFFECTIVE_VIA_OVERRIDE.has(p)) merged.add(p); }
  for (const p of individual) { if (!NEVER_EFFECTIVE_VIA_OVERRIDE.has(p)) merged.add(p); }
  return merged;
}

console.log('\n1. Backward compatibility — no Role Additional AND no Individual override is byte-identical to pre-Phase-4 behavior');
for (const role of ROLES) {
  check(
    `${role.id}: effective(no overrides) === base permissionSetFor()`,
    setsEqual(effectivePermissionSetFor(role.id, null, null), permissionSetFor(role.id))
  );
}

console.log('\n2. The 7-case layer combination matrix (Phase 7 RUNTIME brief, cases 1-7)');
check('1. Base only', setsEqual(
  effectivePermissionSetFor('viewer', null, null),
  new Set(ROLE_PERMISSIONS.viewer)
));
check('2. Role Additional only (base role has zero grants to begin with — fabricate via unknown role id)', setsEqual(
  effectivePermissionSetFor('totally-unknown-role', { permissions: ['warehouse.view'] }, null),
  new Set(['warehouse.view'])
));
check('3. Individual only (same fabrication)', setsEqual(
  effectivePermissionSetFor('totally-unknown-role', null, { permissions: ['analytics.view'] }),
  new Set(['analytics.view'])
));
check('4. Base + Role Additional', setsEqual(
  effectivePermissionSetFor('viewer', { permissions: ['warehouse.view'] }, null),
  new Set([...ROLE_PERMISSIONS.viewer, 'warehouse.view'])
));
check('5. Base + Individual', setsEqual(
  effectivePermissionSetFor('viewer', null, { permissions: ['analytics.view'] }),
  new Set([...ROLE_PERMISSIONS.viewer, 'analytics.view'])
));
check('6. Role Additional + Individual (no base contribution — fabricated role id again)', setsEqual(
  effectivePermissionSetFor('totally-unknown-role', { permissions: ['warehouse.view'] }, { permissions: ['analytics.view'] }),
  new Set(['warehouse.view', 'analytics.view'])
));
check('7. Base + Role Additional + Individual', setsEqual(
  effectivePermissionSetFor('viewer', { permissions: ['warehouse.view'] }, { permissions: ['analytics.view'] }),
  new Set([...ROLE_PERMISSIONS.viewer, 'warehouse.view', 'analytics.view'])
));

console.log('\n3. Duplicate-permission semantics — the SAME permission across all three layers still counts once (per the Phase 4 brief\'s explicit example)');
check('warehouse.view granted via Base AND Role Additional AND Individual => effective set has it exactly once', (() => {
  const eff = effectivePermissionSetFor('bidang', { permissions: ['driver.schedule.view'] }, { permissions: ['driver.schedule.view'] });
  return eff.has('driver.schedule.view') && [...eff].filter((p) => p === 'driver.schedule.view').length === 1;
})());

console.log('\n4. REVOCATION semantics — role revoke leaves Individual untouched; Individual revoke leaves Role Additional untouched');
check('Role Additional grant present => effective', effectivePermissionSetFor('bidang', { permissions: ['warehouse.view'] }, null).has('warehouse.view'));
check('Role Additional REVOKED (record now null) => no longer effective from that layer', !effectivePermissionSetFor('bidang', null, null).has('warehouse.view'));
check('a user\'s Individual grant of the SAME permission survives a Role Additional revoke (independent layers, non-negotiable per the brief)', effectivePermissionSetFor('bidang', null, { permissions: ['warehouse.view'] }).has('warehouse.view'));
check('Individual grant present => effective', effectivePermissionSetFor('bidang', null, { permissions: ['analytics.view'] }).has('analytics.view'));
check('Individual REVOKED (record now null) => no longer effective from that layer, even with an unrelated Role Additional grant still active', !effectivePermissionSetFor('bidang', { permissions: ['warehouse.view'] }, null).has('analytics.view'));

console.log('\n5. ROLE CHANGE semantics — a user\'s role field changing means the OLD role\'s Role Additional grants no longer apply; a NEW resolution must never copy/migrate them');
{
  // Bidang has Role Additional = warehouse.view. User A is Bidang -> effective includes it.
  const asBidang = effectivePermissionSetFor('bidang', { permissions: ['warehouse.view'] }, null);
  check('User A as Bidang (Role Additional = warehouse.view) => effective includes it', asBidang.has('warehouse.view'));
  // User A's role changes to Driver. Driver has NO Role Additional grant of its own (null record).
  // The correct call site now passes Driver's OWN role override record, not Bidang's — this test
  // proves the FUNCTION never leaks a previous role's override into a new role's resolution (no
  // hidden global state / no "carry the old record forward" bug).
  const asDriverAfterChange = effectivePermissionSetFor('driver', null, null);
  check('User A after role change to Driver (Driver\'s own Role Additional is empty) => warehouse.view is GONE', !asDriverAfterChange.has('warehouse.view'));
  // Individual grants are keyed by username, not role — they must survive a role change untouched.
  const asDriverWithIndividual = effectivePermissionSetFor('driver', null, { permissions: ['pettycash.view'] });
  check('User A\'s Individual grant survives the SAME role change untouched', asDriverWithIndividual.has('pettycash.view'));
}

console.log('\n6. CROSS-ROLE isolation — Bidang\'s Role Additional grants never apply to a Driver session\'s resolution');
check('Driver resolved with Driver\'s own (empty) Role Additional record never inherits a value that was only ever passed for Bidang', !effectivePermissionSetFor('driver', null, null).has('warehouse.view'));
check('Two different roles resolved independently in the same process never bleed into each other', (() => {
  const bidangEff = effectivePermissionSetFor('bidang', { permissions: ['warehouse.view'] }, null);
  const driverEff = effectivePermissionSetFor('driver', { permissions: ['overtime.view'] }, null);
  return bidangEff.has('warehouse.view') && !bidangEff.has('overtime.view') && driverEff.has('overtime.view') && !driverEff.has('warehouse.view');
})());

console.log('\n7. CROSS-USER isolation — Individual overrides are per-username, never leak between two users sharing a role');
check('Two users with the SAME role but different Individual overrides resolve independently', (() => {
  const userAEff = effectivePermissionSetFor('viewer', null, { permissions: ['pettycash.view'] });
  const userBEff = effectivePermissionSetFor('viewer', null, { permissions: ['overtime.view'] });
  return userAEff.has('pettycash.view') && !userAEff.has('overtime.view') && userBEff.has('overtime.view') && !userBEff.has('pettycash.view');
})());

console.log('\n8. PROTECTED — system.admin and system.users.manage can NEVER become effective through ANY combination');
for (const dangerousId of ['system.admin', 'system.users.manage']) {
  check(`${dangerousId} via Role Additional alone => never effective`, !effectivePermissionSetFor('viewer', { permissions: [dangerousId] }, null).has(dangerousId));
  check(`${dangerousId} via Individual alone => never effective`, !effectivePermissionSetFor('viewer', null, { permissions: [dangerousId] }).has(dangerousId));
  check(`${dangerousId} via BOTH Role Additional and Individual simultaneously => still never effective`, !effectivePermissionSetFor('viewer', { permissions: [dangerousId] }, { permissions: [dangerousId] }).has(dangerousId));
  check(`${dangerousId} mixed with a valid permission in the same Role Additional record => the valid one lands, ${dangerousId} never does`, (() => {
    const eff = effectivePermissionSetFor('viewer', { permissions: [dangerousId, 'pettycash.view'] }, null);
    return eff.has('pettycash.view') && !eff.has(dangerousId);
  })());
}
check('admin already holds both protected ids via its own Base grant regardless of any override content (unchanged, pre-existing behavior)', (() => {
  const eff = effectivePermissionSetFor('admin', { permissions: ['pettycash.view'] }, { permissions: ['analytics.view'] });
  return eff.has('system.admin') && eff.has('system.users.manage');
})());

console.log('\n9. FAIL CLOSED — malformed/absent Role Additional data resolves to EMPTY_SET contribution, never throws, never grants');
check('null Role Additional record fails closed to base-only', setsEqual(effectivePermissionSetFor('viewer', null, null), permissionSetFor('viewer')));
check('malformed Role Additional record (permissions is a string) fails closed to base-only', setsEqual(effectivePermissionSetFor('viewer', { permissions: 'warehouse.view' }, null), permissionSetFor('viewer')));
check('malformed Role Additional record (permissions missing) fails closed to base-only', setsEqual(effectivePermissionSetFor('viewer', { updatedAt: 'x' }, null), permissionSetFor('viewer')));
check('non-object Role Additional record (garbage) fails closed to base-only', setsEqual(effectivePermissionSetFor('viewer', 'garbage', null), permissionSetFor('viewer')));
check('an unknown permission id inside an otherwise well-formed Role Additional record is silently dropped, valid entries survive', (() => {
  const eff = effectivePermissionSetFor('viewer', { permissions: ['totally.fake.permission', 'pettycash.view'] }, null);
  return eff.has('pettycash.view') && !eff.has('totally.fake.permission');
})());

console.log('\n10. Custom Role + Role Additional — agnostic union (Role Additional is only ever WRITTEN for System Roles by the store layer, but the runtime union does not need to know a role\'s type to stay correct)');
const activeCustom = [{ id: 'custom-warehouse-lead', name: 'Warehouse Lead', permissions: ['warehouse.view'], archived: false }];
check('a Custom Role with an (in practice never-written) Role Additional record still unions correctly if present', setsEqual(
  effectivePermissionSetFor('custom-warehouse-lead', { permissions: ['analytics.view'] }, null, activeCustom),
  new Set(['warehouse.view', 'analytics.view'])
));
check('a Custom Role with no Role Additional record (the real-world case) behaves exactly as Phase 2 already proved', setsEqual(
  effectivePermissionSetFor('custom-warehouse-lead', null, { permissions: ['pettycash.view'] }, activeCustom),
  new Set(['warehouse.view', 'pettycash.view'])
));

console.log('\n11. Set semantics — duplicates and re-grants across layers are naturally idempotent');
check('a Role Additional grant that duplicates the base role\'s own grant changes nothing observable', setsEqual(
  effectivePermissionSetFor('viewer', { permissions: ['driver.schedule.view'] }, null),
  permissionSetFor('viewer')
));
check('duplicate permission ids WITHIN one Role Additional record collapse to one entry\'s worth of effect', setsEqual(
  effectivePermissionSetFor('viewer', { permissions: ['warehouse.view', 'warehouse.view'] }, null),
  new Set([...ROLE_PERMISSIONS.viewer, 'warehouse.view'])
));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
