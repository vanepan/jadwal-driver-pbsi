/* role-label-drift-check.mjs — Design System Program Phase 11 (Administration)

   Regression check for audit finding Roles D-2: the topbar badge, V2 rail
   footer, and domain-shell rail identity all used to read a Custom-Role
   user's role via the Custom-Role-blind formatRole() (a bare re-export of
   role-registry.js#roleLabel(), System-Role-only) instead of
   role-catalog.js#resolveRoleInfo() — showing the raw internal slug id
   instead of the role's real display name. js/auth.js's #roleBadge/
   getRoleLabel() were deliberately left as-is (a genuine import-cycle
   risk, documented in place) — this check confirms that reasoning is
   still accurate (the cycle really would exist) rather than just trusting
   the comment.

   Method: static source verification (js/app.js has zero exports and
   would fire a real Firebase read against PRODUCTION if imported directly
   — see [[design-system-program]] memory).

   Run: node scripts/role-label-drift-check.mjs (exit 0 = pass) */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appJs = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
const authJs = fs.readFileSync(path.join(ROOT, 'js/auth.js'), 'utf8');
const customRolesStoreJs = fs.readFileSync(path.join(ROOT, 'js/role-management/custom-roles-store.js'), 'utf8');

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); if (detail !== undefined) console.log('     • ' + String(detail).slice(0, 300)); }
};

console.log('[Phase 11] Roles D-2 — role-label Custom-Role-blindness fixed at the 3 safe sites\n');

check('resolveRoleInfo is imported in app.js', /import \{ resolveRoleInfo \} from '\.\/role-management\/role-catalog\.js';/.test(appJs));
check('topbar role badge now uses resolveRoleInfo(...).label, not bare formatRole()',
  /topbarRole\.textContent = currentUser\?\.role \? resolveRoleInfo\(currentUser\.role\)\.label : '';/.test(appJs));
check('V2 rail footer role label now uses resolveRoleInfo(...).label',
  /v2FooterRoleLabel\.textContent = currentUser\?\.role \? resolveRoleInfo\(currentUser\.role\)\.label : '';/.test(appJs));
check('domain-shell config passes a resolveRoleInfo-backed formatRole wrapper, not the bare re-export',
  /formatRole: \(roleId\) => resolveRoleInfo\(roleId\)\.label,/.test(appJs));

// The deliberate non-fix in auth.js: confirm the reasoning (a real import
// cycle) is still true, not stale — custom-roles-store.js must still
// import isAdmin from auth.js for the cycle claim to hold.
check('custom-roles-store.js still imports isAdmin from auth.js (the exact edge that would cycle back)',
  /import \{ isAdmin \} from '\.\.\/auth\.js';/.test(customRolesStoreJs));
check('auth.js does NOT import from role-catalog.js (confirms no cycle was introduced)',
  !/from '\.\/role-management\/role-catalog\.js'/.test(authJs));
check('auth.js documents the deferral in place (not a silent omission)',
  /import cycle/.test(authJs) && /getRoleLabel/.test(authJs));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
