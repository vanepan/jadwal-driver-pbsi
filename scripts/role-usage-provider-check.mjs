/* role-usage-provider-check.mjs — Role Assignment & Dependency (v1.30.3)
   PURE node test. Drives the REAL role-usage-provider.js directly (no
   Firebase, no auth.js). Covers: the default zero-usage shape (today's
   only real case — no one can be assigned a Custom Role yet), swapping in
   a real provider, malformed-output coercion, a throwing provider never
   crashing the caller, registration validation, and reset restoring the
   default.
   Run: node scripts/role-usage-provider-check.mjs (exit 0 = pass) */

import {
  registerRoleUsageProvider,
  resetRoleUsageProvider,
  getRoleUsage,
} from '../js/role-management/role-usage-provider.js';

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };

console.log('\n1. Default zero-usage provider');
resetRoleUsageProvider();
const zero = getRoleUsage('admin');
check('assignedUsers is 0', zero.assignedUsers === 0);
check('assignments/dependencies/consumers are all empty arrays', Array.isArray(zero.assignments) && zero.assignments.length === 0 && Array.isArray(zero.dependencies) && zero.dependencies.length === 0 && Array.isArray(zero.consumers) && zero.consumers.length === 0);
check('behaves the same regardless of roleId (no per-role state assumed)', getRoleUsage('role_anything').assignedUsers === 0);

console.log('\n2. Swapping in a real provider');
registerRoleUsageProvider({
  getUsage: (roleId) => (roleId === 'role_b'
    ? { assignedUsers: 3, assignments: ['u1', 'u2', 'u3'], dependencies: ['dep1'], consumers: ['moduleX'] }
    : { assignedUsers: 0, assignments: [], dependencies: [], consumers: [] }),
});
check('a registered provider is actually consulted', getRoleUsage('role_b').assignedUsers === 3);
check('a registered provider\'s array fields pass through', getRoleUsage('role_b').assignments.length === 3 && getRoleUsage('role_b').dependencies[0] === 'dep1');
check('roles the provider has no data for still get a valid zero shape', getRoleUsage('role_other').assignedUsers === 0);

console.log('\n3. Malformed provider output is coerced, never trusted blindly');
registerRoleUsageProvider({ getUsage: () => ({ assignedUsers: 'not-a-number', assignments: null, dependencies: undefined }) });
const coerced = getRoleUsage('role_x');
check('non-number assignedUsers coerces to 0', coerced.assignedUsers === 0);
check('non-array assignments coerces to []', Array.isArray(coerced.assignments) && coerced.assignments.length === 0);
check('missing dependencies/consumers coerce to []', Array.isArray(coerced.dependencies) && Array.isArray(coerced.consumers));

console.log('\n4. A throwing provider degrades to zero usage, never crashes the caller');
registerRoleUsageProvider({ getUsage: () => { throw new Error('boom'); } });
let threw = false;
let fallback = null;
try { fallback = getRoleUsage('role_y'); } catch (_) { threw = true; }
check('getRoleUsage does not propagate the provider\'s throw', threw === false);
check('a throwing provider still yields the zero shape', fallback && fallback.assignedUsers === 0 && fallback.assignments.length === 0);

console.log('\n5. Registration validation + reset');
let rejected = false;
try { registerRoleUsageProvider({}); } catch (_) { rejected = true; }
check('a provider missing getUsage() is rejected', rejected === true);
try { registerRoleUsageProvider(null); } catch (_) { rejected = true; }
check('a null provider is rejected too', rejected === true);
resetRoleUsageProvider();
check('resetRoleUsageProvider restores the default zero provider', getRoleUsage('role_b').assignedUsers === 0);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
