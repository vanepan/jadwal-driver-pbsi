/* role-status-check.mjs — Role Assignment & Dependency (v1.30.3)
   PURE node test. Drives the REAL role-status.js directly (no Firebase,
   no auth.js — Node-loadable by design, same split as Phase 1-3's pure
   logic files). Covers: enum values, priority order mirroring
   js/drivers-store.js#deriveStatus (archived flag wins over a stored
   status field, System Roles are always active), and safe defaults for
   malformed input.
   Run: node scripts/role-status-check.mjs (exit 0 = pass) */

import { ROLE_STATUS, deriveRoleStatus, roleStatusLabel } from '../js/role-management/role-status.js';

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };

console.log('\n1. Enum values');
check('ACTIVE is "active"', ROLE_STATUS.ACTIVE === 'active');
check('ARCHIVED is "archived"', ROLE_STATUS.ARCHIVED === 'archived');

console.log('\n2. deriveRoleStatus — priority order');
check('null role -> ARCHIVED (safe default)', deriveRoleStatus(null) === ROLE_STATUS.ARCHIVED);
check('System Role is always ACTIVE', deriveRoleStatus({ type: 'system' }) === ROLE_STATUS.ACTIVE);
check('System Role stays ACTIVE even with a stray archived:true', deriveRoleStatus({ type: 'system', archived: true }) === ROLE_STATUS.ACTIVE);
check('archived:true wins over an explicit status field', deriveRoleStatus({ type: 'custom', archived: true, status: ROLE_STATUS.ACTIVE }) === ROLE_STATUS.ARCHIVED);
check('an explicit valid status is honored when not archived', deriveRoleStatus({ type: 'custom', archived: false, status: ROLE_STATUS.ARCHIVED }) === ROLE_STATUS.ARCHIVED);
check('an invalid/unknown status string is ignored, defaults to ACTIVE', deriveRoleStatus({ type: 'custom', archived: false, status: 'bogus' }) === ROLE_STATUS.ACTIVE);
check('a plain non-archived custom role with no status defaults to ACTIVE', deriveRoleStatus({ type: 'custom', archived: false }) === ROLE_STATUS.ACTIVE);
check('archived:false (not just absent) does not accidentally archive', deriveRoleStatus({ type: 'custom' }) === ROLE_STATUS.ACTIVE);

console.log('\n3. roleStatusLabel');
check('ACTIVE label is Aktif', roleStatusLabel(ROLE_STATUS.ACTIVE) === 'Aktif');
check('ARCHIVED label is Arsip', roleStatusLabel(ROLE_STATUS.ARCHIVED) === 'Arsip');
check('unknown value falls back to the raw string', roleStatusLabel('mystery') === 'mystery');
check('null/undefined falls back to an empty string, never throws', roleStatusLabel(null) === '' && roleStatusLabel(undefined) === '');

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
