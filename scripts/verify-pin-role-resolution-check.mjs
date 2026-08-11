/* verify-pin-role-resolution-check.mjs — Permission Runtime Migration,
   Sub-phase B (v1.30.6)

   PURE node test. functions/src/auth/verifyPin.js cannot be required
   directly in a plain Node script — it calls firebase-admin's
   admin.initializeApp() at module load (functions/src/config/admin.js),
   which needs the Cloud Functions runtime's ambient service-account
   credentials and will throw/hang outside it. Same constraint this
   codebase's other check scripts already document for Firebase-touching
   client files (permission-service.js, custom-roles-store.js).

   This mirrors resolveRoleClaims()'s exact algorithm — parameterized by a
   fixture array standing in for the Admin SDK's db.ref('customRoles/...')
   read, the same dependency-injection pattern
   scripts/permission-service-check.mjs already uses for permission-
   service.js's Custom Role fallback.

   Run: node scripts/verify-pin-role-resolution-check.mjs (exit 0 = pass) */

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };

/* ── Mirror of verifyPin.js's VALID_ROLES + resolveRoleClaims(). ────────── */
const VALID_ROLES = [
  'admin', 'bidang', 'driver', 'viewer',
  'engineering_coordinator', 'engineering_member',
];

function resolveRoleClaimsAs(storedRole, customRoleFixtures = []) {
  if (VALID_ROLES.includes(storedRole)) {
    return { role: storedRole, extraClaims: {} };
  }
  const customRole = customRoleFixtures.find((r) => r.id === storedRole) || null;
  if (!customRole || customRole.archived === true) {
    return { role: 'viewer', extraClaims: {} };
  }
  const permissions = Array.isArray(customRole.permissions) ? customRole.permissions : [];
  return {
    role: storedRole,
    extraClaims: permissions.includes('system.admin') ? { adminEquivalent: true } : {},
  };
}

console.log('\n1. Legacy fast path — byte-for-byte unchanged for all 6 existing roles');
for (const role of VALID_ROLES) {
  const { role: resolvedRole, extraClaims } = resolveRoleClaimsAs(role);
  check(`${role}: role claim unchanged`, resolvedRole === role);
  check(`${role}: no extra claims minted`, Object.keys(extraClaims).length === 0);
}

console.log('\n2. Legacy fast path never falls through to a Custom Role lookup, even if one exists with the same id');
const shadowFixture = [{ id: 'admin', name: 'Shadow', permissions: ['nothing.relevant'], archived: false }];
const shadowed = resolveRoleClaimsAs('admin', shadowFixture);
check("a fixture named 'admin' never overrides the legacy 'admin' role's own fast path", shadowed.role === 'admin' && Object.keys(shadowed.extraClaims).length === 0);

console.log('\n3. Custom Role fallback — active role with system.admin mints adminEquivalent');
const adminEquivFixtures = [{ id: 'warehouse-admin-x1', name: 'Warehouse Admin', permissions: ['warehouse.view', 'system.admin'], archived: false }];
const adminEquivResult = resolveRoleClaimsAs('warehouse-admin-x1', adminEquivFixtures);
check('role claim mints the Custom Role id verbatim', adminEquivResult.role === 'warehouse-admin-x1');
check('adminEquivalent: true is minted (permissions include system.admin)', adminEquivResult.extraClaims.adminEquivalent === true);

console.log('\n4. Custom Role fallback — active role WITHOUT system.admin mints no extra claims');
const noAdminFixtures = [{ id: 'warehouse-lead-a1b2', name: 'Warehouse Lead', permissions: ['warehouse.view', 'warehouse.item.edit'], archived: false }];
const noAdminResult = resolveRoleClaimsAs('warehouse-lead-a1b2', noAdminFixtures);
check('role claim mints the Custom Role id verbatim', noAdminResult.role === 'warehouse-lead-a1b2');
check('no adminEquivalent claim minted (system.admin not granted)', Object.keys(noAdminResult.extraClaims).length === 0);

console.log('\n5. Archived Custom Role — downgrades to viewer, fail-safe, even if it holds system.admin');
const archivedFixtures = [{ id: 'retired-role-9z', name: 'Retired Role', permissions: ['system.admin'], archived: true }];
const archivedResult = resolveRoleClaimsAs('retired-role-9z', archivedFixtures);
check('archived Custom Role downgrades to viewer', archivedResult.role === 'viewer');
check('archived Custom Role mints no extra claims, regardless of its stored permissions', Object.keys(archivedResult.extraClaims).length === 0);

console.log('\n6. Unknown role id (no System Role, no Custom Role match) — downgrades to viewer, same as pre-v1.30.6 behavior');
const unknownResult = resolveRoleClaimsAs('totally-unknown-role-id', adminEquivFixtures);
check('unknown role id downgrades to viewer', unknownResult.role === 'viewer');
check('unknown role id mints no extra claims', Object.keys(unknownResult.extraClaims).length === 0);

console.log('\n7. Malformed Custom Role record (missing/non-array permissions) — never throws, never grants');
const malformedFixtures = [{ id: 'malformed-role', name: 'Malformed', archived: false }]; // no `permissions` field at all
let malformedThrew = false;
let malformedResult = null;
try { malformedResult = resolveRoleClaimsAs('malformed-role', malformedFixtures); } catch (_) { malformedThrew = true; }
check('a Custom Role record with no permissions field never throws', !malformedThrew);
check('a Custom Role record with no permissions field grants nothing extra', malformedResult && Object.keys(malformedResult.extraClaims).length === 0);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
