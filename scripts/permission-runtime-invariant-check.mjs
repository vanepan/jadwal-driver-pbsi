/* permission-runtime-invariant-check.mjs — Permission Runtime Migration,
   Sub-phase A (v1.30.5)

   DOM test, real wired code (not a mirror) — follows the
   role-management-edit-dom-check.mjs convention: serves the static app,
   drives headless Chromium against scripts/role-management-harness.html (no
   app.js boot), seeds a fake session in localStorage (never real Firebase
   auth — js/firebase.js always targets the real production database, even
   from local scripts).

   THE INVARIANT this guards, permanently: the effective permission set
   js/permission-service.js#listPermissions() returns for the CURRENT
   session must exactly match the set js/role-management/role-catalog.js
   #resolveGrantedSet() reports for that same role — the same computation
   Role Management's own Role Summary panel shows an admin. If these two
   ever silently fork, an admin could look at Role Management and see one
   answer while the runtime enforces another — precisely the "UI shows
   permissions it doesn't enforce" failure mode this whole migration exists
   to close (docs/USER_MANAGEMENT_INTEGRATION_REPORT_v1.30.4.md §9).

   Covers every System Role (config/role-registry.js ROLES) plus a seeded
   Custom Role (__seedCustomRolesForTest — bypasses Firebase, same
   test-only convention role-management-edit-dom-check.mjs already uses).
   No Firebase write is attempted anywhere in this script — can()/
   listPermissions()/resolveGrantedSet() are all pure reads.

   One KNOWN, INTENTIONAL exception is asserted explicitly rather than
   silently skipped: an ARCHIVED Custom Role's runtime access must be empty
   (fail-closed — permission-service.js's security contract), even though
   role-catalog.js#resolveGrantedSet() itself does not check archived status
   (it answers "what does this role definition list", an informational/
   historical question Role Management may reasonably ask about an archived
   role; it is never consulted for live enforcement). See permission-
   service.js's permissionSetFor() doc comment.

   Run: node scripts/permission-runtime-invariant-check.mjs (exit 0 = pass) */

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

await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
await page.goto(`http://localhost:${port}/scripts/role-management-harness.html`, { waitUntil: 'networkidle0', timeout: 45000 });

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };

const result = await page.evaluate(async () => {
  const svc = await import('/js/permission-service.js');
  const catalog = await import('/js/role-management/role-catalog.js');
  const store = await import('/js/role-management/custom-roles-store.js');
  const registry = await import('/js/config/role-registry.js');

  const setLoggedInAs = (role) => {
    localStorage.setItem('pbsi_current_user', JSON.stringify({
      id: 'invariant-test', username: 'invariant-test', name: 'Invariant Test', role, active: true,
    }));
  };
  const setsEqual = (a, b) => a.size === b.size && [...a].every((v) => b.has(v));

  const out = { systemRoleResults: [] };

  // ── Every System Role: runtime resolution must equal Role Summary's own
  //    computation, exactly. ──────────────────────────────────────────
  for (const role of registry.ROLES) {
    setLoggedInAs(role.id);
    const runtimeSet = new Set(svc.listPermissions());
    const summarySet = catalog.resolveGrantedSet({ id: role.id, type: 'system' });
    out.systemRoleResults.push({ roleId: role.id, ok: setsEqual(runtimeSet, summarySet), runtimeSize: runtimeSet.size, summarySize: summarySet.size });
  }

  // ── Seed one active Custom Role, log in as it, compare the same way. ──
  store.__seedCustomRolesForTest([
    { id: 'invariant-custom-active', name: 'Invariant Custom Role', permissions: ['warehouse.view', 'warehouse.item.edit', 'overtime.view'], archived: false },
    { id: 'invariant-custom-archived', name: 'Invariant Archived Role', permissions: ['system.admin'], archived: true },
  ]);

  setLoggedInAs('invariant-custom-active');
  const activeRuntimeSet = new Set(svc.listPermissions());
  const activeSummarySet = catalog.resolveGrantedSet({ id: 'invariant-custom-active', type: 'custom' });
  out.customActiveOk = setsEqual(activeRuntimeSet, activeSummarySet) && activeRuntimeSet.size === 3;

  // ── Archived Custom Role: runtime must fail closed regardless of what
  //    resolveGrantedSet() (an informational/historical lookup) reports. ──
  setLoggedInAs('invariant-custom-archived');
  const archivedRuntimeSet = new Set(svc.listPermissions());
  const archivedSummarySet = catalog.resolveGrantedSet({ id: 'invariant-custom-archived', type: 'custom' });
  out.archivedRuntimeFailsClosed = archivedRuntimeSet.size === 0;
  out.archivedSummaryStillShowsHistoricalGrant = archivedSummarySet.size === 1; // documents the intentional divergence

  // ── Unresolvable role id (never assigned to a real role) also fails closed. ──
  setLoggedInAs('totally-unknown-role-id');
  out.unknownRoleFailsClosed = svc.listPermissions().length === 0;

  return out;
});

for (const r of result.systemRoleResults) {
  check(`${r.roleId}: runtime permission set (${r.runtimeSize}) matches Role Summary (${r.summarySize}) exactly`, r.ok);
}
check('active Custom Role: runtime matches Role Summary exactly (3 permissions)', result.customActiveOk);
check('archived Custom Role: runtime enforcement fails closed (0 permissions)', result.archivedRuntimeFailsClosed);
check('archived Custom Role: Role Summary still reports its historical grant (1) — intentional, documented divergence, not a bug', result.archivedSummaryStillShowsHistoricalGrant);
check('an unresolvable role id fails closed at runtime', result.unknownRoleFailsClosed);

const fatal = consoleErrors.filter((e) =>
  /SyntaxError|ReferenceError|TypeError|is not a function|Failed to (load|fetch) module|Cannot use import|Unexpected token|does not provide an export/i.test(e)
);
check('zero fatal console errors (Firebase permission-denied noise is expected/informational)', fatal.length === 0);
if (fatal.length) fatal.forEach((e) => console.log('   ✗ fatal:', e));

console.log(`\n${pass} passed, ${fail} failed\n`);

await browser.close();
server.close();
process.exit(fail === 0 ? 0 : 1);
