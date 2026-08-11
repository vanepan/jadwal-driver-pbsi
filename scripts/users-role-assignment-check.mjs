/* users-role-assignment-check.mjs — v1.30.8 Custom Role Assignment &
   Activation, Phase 3/9/10 (Assignment Validation, Role Usage, Archive
   Guard re-test).

   DOM test, real wired code (not a mirror) — follows the
   role-management-edit-dom-check.mjs / permission-runtime-invariant-check.mjs
   convention: serves the static app, drives headless Chromium against
   scripts/role-management-harness.html (blank host, no app.js boot). Not a
   plain Node script: js/users.js imports js/firebase.js, which imports the
   Firebase SDK via bare `https://` specifiers Node's ESM loader cannot
   resolve at all (confirmed — the same constraint documented for auth.js
   and custom-roles-store.js elsewhere in this suite). A browser context
   resolves them fine, and no Firebase WRITE is attempted anywhere in this
   script — isValidRole()/getRoleUsageFromUsers()/canArchiveRole() are all
   pure reads over locally-seeded fixtures.

   Drives the REAL js/users.js#isValidRole() and getRoleUsageFromUsers()
   directly (not reimplemented) — the save-path enforcement Phase 3 of
   Custom Role Assignment & Activation depends on, and the Role Usage
   Provider Phase 9 depends on, both previously untested in isolation
   (createUser()/updateUser() themselves are not safe to exercise here —
   real writes against production, no local emulator for this collection —
   so the gate they both call is tested directly instead). Custom Role
   fixtures via custom-roles-store.js's existing test-only
   __seedCustomRolesForTest(); user fixtures via this version's new,
   identically-shaped js/users.js#__seedUsersForTest().

   Covers the brief's Phase 12 "ASSIGNMENT" and "USAGE" matrices, plus a
   Phase 10 archive-guard re-test composed against the REAL registered
   provider (role-archive-guard-check.mjs already proved the guard responds
   to ANY registered provider; this proves it responds to THIS ONE, the one
   that ships in production).

   Run: node scripts/users-role-assignment-check.mjs (exit 0 = pass) */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const consoleErrors = [];
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push('console.error: ' + m.text()); });

await page.goto(`http://localhost:${port}/scripts/role-management-harness.html`, { waitUntil: 'networkidle0', timeout: 45000 });

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };

const result = await page.evaluate(async () => {
  const usersMod = await import('/js/users.js');
  const store = await import('/js/role-management/custom-roles-store.js');
  const guard = await import('/js/role-management/role-archive-guard.js');
  const provider = await import('/js/role-management/role-usage-provider.js');
  const { isValidRole, getRoleUsageFromUsers, __seedUsersForTest } = usersMod;
  const { canArchiveRole } = guard;
  const { registerRoleUsageProvider, resetRoleUsageProvider } = provider;

  store.__seedCustomRolesForTest([
    {
      id: 'role_warehouse_operator', name: 'Warehouse Operator', archived: false,
      permissions: ['warehouse.item.view', 'warehouse.item.edit'],
      createdAt: '2026-08-11T00:00:00.000Z', updatedAt: '2026-08-11T00:00:00.000Z',
    },
    {
      id: 'role_retired', name: 'Retired Role', archived: true,
      permissions: ['driver.schedule.view'],
      createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z', archivedAt: '2026-08-05T00:00:00.000Z',
    },
  ]);

  const out = {};

  // ── 1. isValidRole() — the save-path gate createUser()/updateUser() call ──
  out.standardRoleValid = isValidRole('bidang') === true;
  out.activeCustomRoleValid = isValidRole('role_warehouse_operator') === true;
  out.archivedCustomRoleInvalid = isValidRole('role_retired') === false;
  out.unknownRoleInvalid = isValidRole('role_does_not_exist') === false;
  out.emptyRoleInvalid = isValidRole('') === false && isValidRole(undefined) === false;
  out.engineeringRoleStillValid = isValidRole('engineering_coordinator') === true; // regression, pre-dates Custom Roles

  // ── 2. getRoleUsageFromUsers() — the REAL Role Usage Provider ──
  __seedUsersForTest([
    { username: 'alice', displayName: 'Alice', role: 'role_warehouse_operator', archived: false },
    { username: 'bob', displayName: 'Bob', role: 'role_warehouse_operator', archived: false },
    { username: 'carol', displayName: 'Carol', role: 'viewer', archived: false },
    { username: 'dave', displayName: 'Dave (archived user)', role: 'role_warehouse_operator', archived: true },
  ]);
  let usage = getRoleUsageFromUsers('role_warehouse_operator');
  out.usageCountsNonArchivedOnly = usage.assignedUsers === 2; // not 3 — dave is an archived USER
  out.usageListsRightUsernames = usage.assignments.map((a) => a.userId).sort().join(',') === 'alice,bob';
  out.unusedRoleReportsZero = getRoleUsageFromUsers('role_nobody_has_this').assignedUsers === 0;

  // ── 3. Usage reflects reassignment/removal in real time ──
  __seedUsersForTest([
    { username: 'alice', displayName: 'Alice', role: 'viewer', archived: false }, // reassigned away
    { username: 'bob', displayName: 'Bob', role: 'role_warehouse_operator', archived: false },
  ]);
  out.countDropsAfterReassignment = getRoleUsageFromUsers('role_warehouse_operator').assignedUsers === 1;
  __seedUsersForTest([
    { username: 'alice', displayName: 'Alice', role: 'viewer', archived: false },
    { username: 'bob', displayName: 'Bob', role: 'viewer', archived: false }, // last holder reassigned away
  ]);
  out.countReturnsToZero = getRoleUsageFromUsers('role_warehouse_operator').assignedUsers === 0;

  // ── 4. Composed with the REAL role-archive-guard.js (Phase 10 re-test) ──
  resetRoleUsageProvider();
  __seedUsersForTest([{ username: 'alice', displayName: 'Alice', role: 'role_warehouse_operator', archived: false }]);
  registerRoleUsageProvider({ getUsage: getRoleUsageFromUsers });
  const blocked = canArchiveRole('role_warehouse_operator');
  out.assignedRoleBlockedFromArchive = blocked.allowed === false;
  out.blockReasonCitesRealCount = blocked.reason.includes('1');
  __seedUsersForTest([]); // last holder removed entirely
  out.unassignedRoleArchivableAgain = canArchiveRole('role_warehouse_operator').allowed === true;
  out.neverAssignedRoleAlwaysArchivable = canArchiveRole('role_never_assigned').allowed === true;
  resetRoleUsageProvider();

  return out;
});

check('a standard System Role ("bidang") is valid', result.standardRoleValid);
check('an active Custom Role is valid', result.activeCustomRoleValid);
check('an ARCHIVED Custom Role is INVALID (denied, not merely hidden)', result.archivedCustomRoleInvalid);
check('an unknown/nonexistent role id is INVALID', result.unknownRoleInvalid);
check('empty/undefined role is INVALID', result.emptyRoleInvalid);
check('an Engineering role is still valid (regression — pre-dates Custom Roles)', result.engineeringRoleStillValid);
check('assignedUsers counts exactly the non-archived users holding this Custom Role (2, not 3 — one holder is an archived USER)', result.usageCountsNonArchivedOnly);
check('assignments lists the right usernames', result.usageListsRightUsernames);
check('a role nobody holds reports zero', result.unusedRoleReportsZero);
check('after reassigning one holder away, count drops accordingly', result.countDropsAfterReassignment);
check('after the last holder is reassigned away, count returns to zero', result.countReturnsToZero);
check('a Custom Role with 1 real assigned user is BLOCKED from archiving, through the actual production wiring (not an injected fake)', result.assignedRoleBlockedFromArchive);
check('the block reason cites the real assigned count', result.blockReasonCitesRealCount);
check('once genuinely unassigned, the SAME Custom Role becomes archivable again — through the same real wiring', result.unassignedRoleArchivableAgain);
check('a role nobody ever assigned was always archivable', result.neverAssignedRoleAlwaysArchivable);

const fatal = consoleErrors.filter((e) =>
  /SyntaxError|ReferenceError|TypeError|is not a function|Failed to (load|fetch) module|Cannot use import|Unexpected token|does not provide an export/i.test(e)
);
check('zero fatal console errors (Firebase permission-denied noise is expected/informational)', fatal.length === 0);
if (fatal.length) fatal.forEach((e) => console.log('   ✗ fatal:', e));

console.log(`\n${pass} passed, ${fail} failed\n`);

await browser.close();
server.close();
process.exit(fail === 0 ? 0 : 1);
