/* role-archive-guard-check.mjs — Role Assignment & Dependency (v1.30.3)
   PURE node test. Drives the REAL role-archive-guard.js directly (no
   Firebase, no auth.js). Covers: the injected-deps path (pure, isolated
   from the live provider) for allow/block decisions, and a second pass
   proving the guard is genuinely wired to the real role-usage-provider.js
   singleton — not a stub — by registering/resetting a real provider and
   watching the guard's decision change with it.
   Run: node scripts/role-archive-guard-check.mjs (exit 0 = pass) */

import { canArchiveRole } from '../js/role-management/role-archive-guard.js';
import { registerRoleUsageProvider, resetRoleUsageProvider } from '../js/role-management/role-usage-provider.js';

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };

const zeroUsage = () => ({ assignedUsers: 0, assignments: [], dependencies: [], consumers: [] });
const busyUsage = () => ({ assignedUsers: 2, assignments: ['a', 'b'], dependencies: [], consumers: [] });
const dependentUsage = () => ({ assignedUsers: 0, assignments: [], dependencies: ['workspace-widget'], consumers: [] });

console.log('\n1. Injected deps — pure decision logic, isolated from the live provider');
check('allowed when usage is zero (today\'s real case)', canArchiveRole('role_x', { getUsage: zeroUsage }).allowed === true);
check('reason is null when allowed', canArchiveRole('role_x', { getUsage: zeroUsage }).reason === null);
check('blocked when assignedUsers > 0', canArchiveRole('role_x', { getUsage: busyUsage }).allowed === false);
check('blocked reason mentions the assigned count', canArchiveRole('role_x', { getUsage: busyUsage }).reason.includes('2'));
check('blocked when dependencies is non-empty even with 0 assigned users', canArchiveRole('role_x', { getUsage: dependentUsage }).allowed === false);
check('every block carries a non-empty reason string', typeof canArchiveRole('role_x', { getUsage: busyUsage }).reason === 'string' && canArchiveRole('role_x', { getUsage: busyUsage }).reason.length > 0);
check('the raw usage is passed through on the result', canArchiveRole('role_x', { getUsage: busyUsage }).usage.assignedUsers === 2);

console.log('\n2. Wired to the REAL role-usage-provider.js singleton by default (no injection)');
resetRoleUsageProvider();
check('today\'s real (zero) provider allows archiving', canArchiveRole('role_admin').allowed === true);
registerRoleUsageProvider({ getUsage: () => ({ assignedUsers: 5, assignments: [], dependencies: [], consumers: [] }) });
check('registering a real provider actually changes the guard\'s decision', canArchiveRole('role_admin').allowed === false);
resetRoleUsageProvider();
check('resetting the provider restores the always-allowed default', canArchiveRole('role_admin').allowed === true);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
