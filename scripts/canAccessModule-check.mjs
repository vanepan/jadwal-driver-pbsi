/* canAccessModule-check.mjs — Permission Runtime Migration, Sub-phase A (v1.30.5)
   PURE node test. js/app.js is DOM-coupled and not Node-loadable, so this
   mirrors js/app.js#MODULE_PERMISSIONS + #canAccessModule()'s permission
   lookup verbatim (kept in sync deliberately — same pattern
   permission-service-check.mjs already uses for permission-service.js) and
   asserts it against a hand-derived expected truth table for every role in
   config/role-registry.js ROLES across every gated module. This is the
   regression proof that migrating canAccessModule() off its old hardcoded
   isAdmin()/isEngineeringUser() switch onto can(permission) is exactly
   behavior-preserving for all 9 roles that exist today ('home' and
   'sarprasIntelligence' are excluded — the former is unconditional, the
   latter is a feature-gate allowlist, not a role permission; neither goes
   through MODULE_PERMISSIONS).
   Run: node scripts/canAccessModule-check.mjs (exit 0 = pass) */

import { ROLE_PERMISSIONS } from '../js/config/role-permissions.js';
import { ROLES } from '../js/config/role-registry.js';

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };

/* ── Mirror of js/app.js#MODULE_PERMISSIONS + #canAccessModule(). ────── */
const MODULE_PERMISSIONS = Object.freeze({
  engineering:    'eng.view',
  driverops:      'driver.schedule.view',
  pettycash:      'pettycash.view',
  overtime:       'overtime.view',
  analytics:      'analytics.view',
  konfigurasi:    'konfigurasi.view',
  roleManagement: 'system.admin',
  gudang:         'warehouse.view',
});
function canAccessModuleAs(roleId, name) {
  const permission = MODULE_PERMISSIONS[name];
  if (!permission) return false;
  return (ROLE_PERMISSIONS[roleId] || []).includes(permission);
}

console.log('\n1. Truth table — every role x every gated module matches the old hardcoded switch\'s behavior');
// Expected outcomes hand-derived from the PRE-migration canAccessModule()
// switch: `if (isAdmin()) return true;` then engineering: isEngineeringUser(),
// driverops: !isEngineeringUser(), pettycash/overtime/analytics/konfigurasi/
// roleManagement/gudang: admin-only (false for every non-admin branch).
const EXPECTED = {
  admin:                  { engineering: true,  driverops: true,  pettycash: true,  overtime: true,  analytics: true,  konfigurasi: true,  roleManagement: true,  gudang: true },
  bidang:                 { engineering: false, driverops: true,  pettycash: false, overtime: false, analytics: false, konfigurasi: false, roleManagement: false, gudang: false },
  driver:                 { engineering: false, driverops: true,  pettycash: false, overtime: false, analytics: false, konfigurasi: false, roleManagement: false, gudang: false },
  viewer:                 { engineering: false, driverops: true,  pettycash: false, overtime: false, analytics: false, konfigurasi: false, roleManagement: false, gudang: false },
  engineering_coordinator:{ engineering: true,  driverops: false, pettycash: false, overtime: false, analytics: false, konfigurasi: false, roleManagement: false, gudang: false },
  engineering_member:     { engineering: true,  driverops: false, pettycash: false, overtime: false, analytics: false, konfigurasi: false, roleManagement: false, gudang: false },
  ketua_umum:             { engineering: false, driverops: false, pettycash: false, overtime: false, analytics: false, konfigurasi: false, roleManagement: false, gudang: false },
  waketum:                { engineering: false, driverops: false, pettycash: false, overtime: false, analytics: false, konfigurasi: false, roleManagement: false, gudang: false },
  sekjen:                 { engineering: false, driverops: false, pettycash: false, overtime: false, analytics: false, konfigurasi: false, roleManagement: false, gudang: false },
};

check('EXPECTED covers every role in ROLES (no role forgotten)', ROLES.every((r) => Object.prototype.hasOwnProperty.call(EXPECTED, r.id)));
check('EXPECTED has no stale role not in ROLES', Object.keys(EXPECTED).every((id) => ROLES.some((r) => r.id === id)));

let allMatch = true;
for (const role of ROLES) {
  for (const moduleName of Object.keys(MODULE_PERMISSIONS)) {
    const expected = EXPECTED[role.id][moduleName];
    const actual = canAccessModuleAs(role.id, moduleName);
    if (expected !== actual) {
      allMatch = false;
      console.log(`    mismatch: ${role.id} / ${moduleName} expected ${expected}, got ${actual}`);
    }
  }
}
check('permission-driven canAccessModule() matches the pre-migration truth table for every role x module', allMatch);

console.log('\n2. Admin needs no bypass — every module permission is present in admin\'s own grant set');
check('admin holds a permission for every gated module (no special-case needed)',
  Object.values(MODULE_PERMISSIONS).every((perm) => (ROLE_PERMISSIONS.admin || []).includes(perm)));

console.log('\n3. Unknown module name denies by default');
check("canAccessModuleAs('admin', 'not-a-real-module') is false", !canAccessModuleAs('admin', 'not-a-real-module'));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
