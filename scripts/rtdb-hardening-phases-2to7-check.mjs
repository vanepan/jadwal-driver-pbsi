/* rtdb-hardening-phases-2to7-check.mjs — RTDB Security Hardening Program,
   Phases 2-7 (v1.30.6.5 through v1.30.6.11)

   PURE node test over the real database.rules.json — parses it directly
   and asserts the structural shape of every rule block these phases
   added or changed. Complements scripts/rtdb-sibling-rules-check.mjs
   (Phase 1), which now also asserts the Phase 7 root-cutover end state
   (updated in this same pass — see its own header).

   This script does NOT attempt to execute the Firebase rule-expression
   language itself (no RTDB emulator available offline); it asserts the
   exact expression strings and node shapes that were designed and
   reviewed, so any accidental edit to a rule's text is caught.

   Run: node scripts/rtdb-hardening-phases-2to7-check.mjs (exit 0 = pass) */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rules = JSON.parse(readFileSync(path.join(ROOT, 'database.rules.json'), 'utf8')).rules;

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };

const ADMIN_OR_EQUIV = "auth.token.role === 'admin' || auth.token.adminEquivalent === true";
const ADMIN_DEV_OR_EQUIV = "auth.token.role === 'admin' || auth.token.role === 'developer' || auth.token.adminEquivalent === true";

console.log('\n=== Phase 2 (v1.30.6.5) — Admin Nodes & Append-only Nodes ===');

console.log('\n1. logs / analytics_exports — append-only per-child, admin-family read');
for (const node of ['logs', 'analytics_exports']) {
  check(`${node}.read is admin/developer/adminEquivalent`, rules[node]?.['.read'] === ADMIN_DEV_OR_EQUIV);
  check(`${node} has no top-level .write (write only via $childId)`, rules[node]?.['.write'] === undefined);
  const childRuleKey = node === 'logs' ? '$logId' : '$exportId';
  check(`${node}/${childRuleKey}.write requires auth AND !data.exists() (append-only, no overwrite/delete)`,
    rules[node]?.[childRuleKey]?.['.write'] === "auth != null && !data.exists()");
}

console.log('\n2. feature_flags — broad authenticated read, client write fully closed');
check("feature_flags.read is 'auth != null'", rules.feature_flags?.['.read'] === 'auth != null');
check("feature_flags.write is 'false' (flags are ops-managed, not client-writable)", rules.feature_flags?.['.write'] === 'false');

console.log('\n3. settings — admin-family read/write at the general node, with a carved-out operations sub-path');
check('settings.read is admin/developer/adminEquivalent', rules.settings?.['.read'] === ADMIN_DEV_OR_EQUIV);
check('settings.write is admin/adminEquivalent', rules.settings?.['.write'] === ADMIN_OR_EQUIV);
check("settings/operations.read is broadened to 'auth != null' (workStartMins/workEndMins are read by every role's scheduling UI: timeline.js, modal.js, reimbursement.js)",
  rules.settings?.operations?.['.read'] === 'auth != null');
check('settings/operations.write stays admin-only (the read carve-out does not loosen write)',
  rules.settings?.operations?.['.write'] === ADMIN_OR_EQUIV);

console.log('\n=== Phase 3 (v1.30.6.6) — Internal System Nodes moved to Cloud Functions ===');
console.log('\n4. backups / reimbursement_counters have NO client rule block at all (fully Admin-SDK-only now)');
check("'backups' has no top-level rule block (client never touches it — only functions/src/maintenance/backupTick.js, via Admin SDK)", rules.backups === undefined);
check("'reimbursement_counters' has no top-level rule block (client never touches it — only functions/src/reimbursement/counter.js, via Admin SDK)", rules.reimbursement_counters === undefined);

console.log('\n=== Phase 4 (v1.30.6.7) — Roster Nodes (drivers/vehicles) ===');
console.log('\n5. drivers / vehicles — broad authenticated read (every role\'s scheduling UI resolves names), admin-only write');
for (const node of ['drivers', 'vehicles']) {
  check(`${node}.read is 'auth != null'`, rules[node]?.['.read'] === 'auth != null');
  check(`${node}.write is admin/adminEquivalent`, rules[node]?.['.write'] === ADMIN_OR_EQUIV);
}

console.log('\n=== Phase 5A (v1.30.6.8) — Driver Requests (ownership-scoped) ===');
console.log('\n6. driver_requests — broad authenticated read, per-record ownership-scoped write');
check("driver_requests.read is 'auth != null'", rules.driver_requests?.['.read'] === 'auth != null');
const reqWrite = rules.driver_requests?.$requestId?.['.write'] || '';
check('driver_requests write has no top-level .write (per-record only, via $requestId)', rules.driver_requests?.['.write'] === undefined);
check('admin/adminEquivalent can always write any request', reqWrite.includes(ADMIN_OR_EQUIV));
check("bidang can CREATE a new request only as themselves (!data.exists() && newData.requesterId === auth.uid)",
  reqWrite.includes("!data.exists() && newData.child('requesterId').val() === auth.uid"));
check("bidang can only UPDATE a request they already own, and cannot reassign it to someone else (both data.requesterId AND newData.requesterId must equal auth.uid)",
  reqWrite.includes("data.exists() && data.child('requesterId').val() === auth.uid && newData.child('requesterId').val() === auth.uid"));
check("rule is scoped to role === 'bidang' (drivers/viewers get no special-case write path here)", reqWrite.includes("auth.token.role === 'bidang'"));

console.log('\n=== Phase 5B (v1.30.6.9) — Assignments (ownership-scoped) ===');
console.log('\n7. assignments — broad authenticated read, per-record ownership-scoped write (hardest rule in the program)');
check("assignments.read is 'auth != null'", rules.assignments?.['.read'] === 'auth != null');
const asgWrite = rules.assignments?.$assignmentId?.['.write'] || '';
check('assignments write has no top-level .write (per-record only, via $assignmentId)', rules.assignments?.['.write'] === undefined);
check('admin/adminEquivalent can always write any assignment', asgWrite.includes(ADMIN_OR_EQUIV));
check('non-admin writers cannot create a brand-new assignment record (data.exists() is required before any role-specific branch)',
  asgWrite.includes('data.exists()'));
check("non-admin writers cannot change driverUsername (newData.driverUsername === data.driverUsername enforced)",
  asgWrite.includes("newData.child('driverUsername').val() === data.child('driverUsername').val()"));
check("non-admin writers are locked out once status is 'completed' or 'cancelled' (terminal-state guard)",
  asgWrite.includes("data.child('status').val() !== 'completed'") && asgWrite.includes("data.child('status').val() !== 'cancelled'"));
check("a driver may write only their OWN assignment (role === 'driver' && driverUsername === auth.uid)",
  asgWrite.includes("auth.token.role === 'driver' && data.child('driverUsername').val() === auth.uid"));
check("a bidang self-drive writer may act only on an unassigned-driver record they themselves requested (role === 'bidang' && !driver && requestId cross-referenced against driver_requests.requesterId === auth.uid)",
  asgWrite.includes("auth.token.role === 'bidang' && !data.child('driver').val()") &&
  asgWrite.includes("root.child('driver_requests').child(data.child('requestId').val()).child('requesterId').val() === auth.uid"));
check("bidang branch requires requestId to be non-null before the cross-reference (data.child('requestId').val() !== null)",
  asgWrite.includes("data.child('requestId').val() !== null"));

console.log('\n=== Phase 6 (v1.30.6.10) — Users Split (data-model change) ===');
console.log('\n8. userProfiles — minimal broadly-readable mirror, client write fully closed (server-trigger-only)');
check("userProfiles.read is 'auth != null'", rules.userProfiles?.['.read'] === 'auth != null');
check("userProfiles.write is 'false' (only functions/src/users/onUserWrite.js, via Admin SDK, ever writes it)", rules.userProfiles?.['.write'] === 'false');

console.log('\n9. users — narrowed to admin-family or the record\'s own owner, both read AND write');
check('users has no top-level rule (per-record only, via $username)', rules.users?.['.read'] === undefined && rules.users?.['.write'] === undefined);
const usersRead = rules.users?.$username?.['.read'] || '';
const usersWrite = rules.users?.$username?.['.write'] || '';
check('users/$username.read is admin/adminEquivalent OR self (auth.uid === $username)', usersRead.includes(ADMIN_OR_EQUIV) && usersRead.includes('auth.uid === $username'));
check('users/$username.write is admin/adminEquivalent OR self (auth.uid === $username)', usersWrite.includes(ADMIN_OR_EQUIV) && usersWrite.includes('auth.uid === $username'));
check('read and write conditions are identical (no read/write asymmetry introduced on this node)', usersRead === usersWrite);

console.log('\n=== Phase 7 (v1.30.6.11) — Root Cutover ===');
console.log('\n10. Root is deny-by-default; every node a client touches must carry its own explicit rule now');
check("root .read is 'false' (was 'auth != null' through Phase 6)", rules['.read'] === 'false');
check("root .write is 'false' (was 'auth != null' through Phase 6)", rules['.write'] === 'false');
check('no stray documentation/comment key was left at the rules root (JSON has no comment syntax — a stray key would be parsed as a literal child-node rule)',
  Object.keys(rules).every((k) => !k.startsWith('_comment')));

console.log('\n11. Completeness spot-check — every top-level node the program touched still resolves to a real rule object (not accidentally deleted by a later phase\'s edit)');
for (const node of ['logs', 'analytics_exports', 'feature_flags', 'settings', 'drivers', 'vehicles', 'driver_requests', 'assignments', 'userProfiles', 'users']) {
  check(`'${node}' is present and is an object`, typeof rules[node] === 'object' && rules[node] !== null);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
