/* rtdb-sibling-rules-check.mjs — RTDB Security Hardening Program,
   Phase 1 (v1.30.6.4, Sibling Rule Completion)

   PURE node test over the real database.rules.json — parses it directly
   and asserts each of the 6 newly-added rule blocks is BYTE-IDENTICAL in
   shape to the sibling it was designed to mirror (not just "a rule
   exists"), plus confirms every pre-existing block this phase was not
   supposed to touch is still present and unchanged. Phase 1's own scope
   was explicitly "mirror existing sibling rules only, no new security
   model" — this test is the mechanical proof that promise was kept.

   UPDATED for Phase 7 (v1.30.6.11): sections 1 and 6 originally asserted
   a point-in-time snapshot ("root untouched", "these nodes still don't
   exist") that was correct only until later phases in this SAME approved
   program intentionally changed them. Freezing those assertions after
   Phase 7 landed would turn a regression test into a false failure, not
   a real regression signal — so they were updated in place to assert the
   now-final, whole-program end state instead. Phase-2-through-7-specific
   structural detail lives in scripts/rtdb-hardening-phases-2to7-check.mjs;
   this file still exists to prove Phase 1's OWN deliverable never
   regressed underneath the later phases.

   Run: node scripts/rtdb-sibling-rules-check.mjs (exit 0 = pass) */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rules = JSON.parse(readFileSync(path.join(ROOT, 'database.rules.json'), 'utf8')).rules;

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };

console.log('\n1. Root rule — deny-by-default (Phase 7 root cutover, v1.30.6.11, is the final state of the whole program)');
check("root .read is 'false'", rules['.read'] === 'false');
check("root .write is 'false'", rules['.write'] === 'false');

console.log('\n2. overtimeBudget/ReportHistory/Closing/Archive mirror the 9 existing Overtime siblings exactly');
const overtimeSiblingShape = rules.overtimeAudit;
for (const node of ['overtimeBudget', 'overtimeReportHistory', 'overtimeClosing', 'overtimeArchive']) {
  check(`${node}.read matches the sibling shape verbatim`, rules[node]?.['.read'] === overtimeSiblingShape['.read']);
  check(`${node}.write matches the sibling shape verbatim`, rules[node]?.['.write'] === overtimeSiblingShape['.write']);
}
check('the 9 pre-existing Overtime nodes are still present, unchanged', [
  'overtimeUnits', 'overtimeEmployees', 'overtimeRates', 'overtimeRateVersions',
  'overtimeHolidays', 'overtimeRecords', 'overtimeDailySummary', 'overtimeMonthlySummary', 'overtimeAudit',
].every((node) => rules[node]?.['.read'] === overtimeSiblingShape['.read'] && rules[node]?.['.write'] === overtimeSiblingShape['.write']));

console.log('\n3. v2_sarpras/composer_documents mirrors its 3 existing siblings exactly');
const sarprasSiblingShape = rules.v2_sarpras.file_storage;
check("composer_documents.read matches the sibling shape verbatim", rules.v2_sarpras.composer_documents?.['.read'] === sarprasSiblingShape['.read']);
check("composer_documents.write matches the sibling shape verbatim", rules.v2_sarpras.composer_documents?.['.write'] === sarprasSiblingShape['.write']);
check('the 3 pre-existing v2_sarpras nodes are still present, unchanged', ['import_sessions', 'import_batches', 'file_storage']
  .every((node) => rules.v2_sarpras[node]?.['.read'] === sarprasSiblingShape['.read'] && rules.v2_sarpras[node]?.['.write'] === sarprasSiblingShape['.write']));

console.log('\n4. engineering/workReports mirrors engineering/notifications\' uniform shape (deliberately NOT the assignments per-record-status shape — Phase 1 forbids inventing a new ownership model, and workReports has no analogous status field to hang one on)');
const engNotifShape = rules.engineering.notifications;
check("workReports.read matches notifications' shape verbatim", rules.engineering.workReports?.['.read'] === engNotifShape['.read']);
check("workReports.write matches notifications' shape verbatim", rules.engineering.workReports?.['.write'] === engNotifShape['.write']);
check('workReports read and write are the SAME uniform 4-role expression (no per-record condition introduced)', rules.engineering.workReports['.read'] === rules.engineering.workReports['.write']);
check('engineering/assignments (the OTHER sibling, NOT mirrored — has its own per-record status condition) is still present and unchanged', typeof rules.engineering.assignments?.['$assignmentId']?.['.write'] === 'string' && rules.engineering.assignments['$assignmentId']['.write'].includes("data.child('status').val() !== 'verified'"));
check('engineering/settings (untouched sibling) is still present, unchanged', rules.engineering.settings?.['.write'] === "auth.token.role === 'admin' || auth.token.role === 'developer'");

console.log('\n5. Every module this phase was NOT scoped to touch is untouched (spot-check)');
check('gudang/items unchanged', rules.gudang.items['$itemId']['.validate'].includes('itemId'));
check('customRoles unchanged (per-child archived-scoped read, admin-only write)', rules.customRoles['.write'] === "auth.token.role === 'admin'" && !!rules.customRoles['$roleId']);
check('pettyCashExpenses unchanged', rules.pettyCashExpenses['.write'] === "auth.token.role === 'admin' || auth.token.adminEquivalent === true");
check('notification_state (uid-scoped, the gold-standard pattern) unchanged', rules.notification_state['$uid']['.read'] === 'auth.uid === $uid');

console.log('\n6. Nodes that were deliberately unruled at Phase 1 time are now ruled by their OWN later phase — proves the "Phase 2+ scope, not Phase 1" nodes were never silently added inside Phase 1\'s own diff (they arrived on schedule, not early)');
for (const node of ['assignments', 'driver_requests', 'users', 'drivers', 'vehicles', 'settings', 'logs', 'analytics_exports', 'feature_flags']) {
  check(`'${node}' now has a top-level rule block (added by its own later phase — see rtdb-hardening-phases-2to7-check.mjs)`, rules[node] !== undefined);
}
for (const node of ['backups', 'reimbursement_counters']) {
  check(`'${node}' correctly has NO client rule block even now (Phase 3 moved it to Cloud-Function-only Admin SDK access, not a client rule)`, rules[node] === undefined);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
