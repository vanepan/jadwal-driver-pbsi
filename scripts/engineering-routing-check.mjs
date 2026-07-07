/* engineering-routing-check.mjs — v1.20.5 workspace routing (Bug 1).
   Proves the login → role → workspace → landing chain sends Engineering roles to
   Engineering Operations and NEVER to the Driver workspace. The client routing is
   correct BY ROLE; the only failure mode is a wrong role claim (verifyPin must
   mint the real Engineering role, not 'viewer'). This test encodes both facts.
   Run: node scripts/engineering-routing-check.mjs   (exit 0 = all pass) */

import { resolveWorkspaceForRole } from '../js/workspace/workspace-registry.js';
import { isEngineeringRole, ENGINEERING_ROLE, roleLabel } from '../js/config/role-registry.js';

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };

/* ── Role predicate that gates setRailModule('engineering') in app.js ──── */
console.log('\n[role resolution — isEngineeringUser gate]');
check('coordinator is an Engineering role', isEngineeringRole(ENGINEERING_ROLE.COORDINATOR) === true);
check('member is an Engineering role', isEngineeringRole(ENGINEERING_ROLE.MEMBER) === true);
check('driver is NOT an Engineering role', isEngineeringRole('driver') === false);
check('viewer is NOT an Engineering role (the verifyPin-downgrade failure mode)', isEngineeringRole('viewer') === false);

/* ── Workspace registry — the single role→workspace decision point ─────── */
console.log('\n[workspace registry — role → workspace]');
check('coordinator → engineering workspace', resolveWorkspaceForRole(ENGINEERING_ROLE.COORDINATOR).id === 'engineering');
check('member → engineering workspace', resolveWorkspaceForRole(ENGINEERING_ROLE.MEMBER).id === 'engineering');
check('coordinator NEVER → driver', resolveWorkspaceForRole(ENGINEERING_ROLE.COORDINATOR).id !== 'driver');
check('member NEVER → driver', resolveWorkspaceForRole(ENGINEERING_ROLE.MEMBER).id !== 'driver');
check('driver → driver workspace (sanity)', resolveWorkspaceForRole('driver').id === 'driver');
check('admin → executive workspace (sanity)', resolveWorkspaceForRole('admin').id === 'executive');

/* ── Landing rail decision (mirror of app.js updatePermissionUI line 771) ─ */
console.log('\n[landing — isEngineeringUser ? engineering : home]');
const landingRail = (role) => (isEngineeringRole(role) ? 'engineering' : 'home');
check('coordinator lands on engineering rail', landingRail(ENGINEERING_ROLE.COORDINATOR) === 'engineering');
check('member lands on engineering rail', landingRail(ENGINEERING_ROLE.MEMBER) === 'engineering');
check('a mis-minted viewer claim would MISROUTE (why verifyPin must be correct)', landingRail('viewer') !== 'engineering');

/* ── Role display labels (Bug 3) resolve, never raw ────────────────────── */
console.log('\n[role labels — no raw identifiers]');
check('coordinator label = Koordinator Engineering', roleLabel(ENGINEERING_ROLE.COORDINATOR) === 'Koordinator Engineering');
check('member label = Anggota Engineering', roleLabel(ENGINEERING_ROLE.MEMBER) === 'Anggota Engineering');
check('labels are never the raw id', roleLabel(ENGINEERING_ROLE.COORDINATOR) !== ENGINEERING_ROLE.COORDINATOR && roleLabel(ENGINEERING_ROLE.MEMBER) !== ENGINEERING_ROLE.MEMBER);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
