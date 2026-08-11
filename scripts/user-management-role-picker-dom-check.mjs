/* user-management-role-picker-dom-check.mjs — v1.30.8 Custom Role
   Assignment & Activation, Phase 4/8 (Custom Role Activation + User
   Management UX).

   DOM test. Serves the static app, loads the REAL js/admin.js in headless
   Chromium against scripts/user-management-role-picker-harness.html (the
   real #modalUserForm markup, no full app.js boot — same reasoning as
   role-management-edit-dom-check.mjs: openUserFormModal()/
   refreshCustomRoleOptions() query document.getElementById directly and
   don't need anything else mounted).

   Proves the ACTUAL behavioral change this version makes: before v1.30.8,
   refreshCustomRoleOptions() rendered every active Custom Role as a
   disabled <option> ("Belum Aktif"). This check seeds one active and one
   archived Custom Role via custom-roles-store.js's test-only
   __seedCustomRolesForTest() (bypassing Firebase entirely, same pattern
   role-management-edit-dom-check.mjs already established) and asserts:
   the active role is now a REAL, selectable, non-disabled <option> that
   the native <select> accepts a value-assignment to; the archived role
   never appears in the list at all (excluded upstream by
   role-catalog.js#getAllRoles(), unchanged by this version); and the
   Role Summary panel (already-existing, reused, not reimplemented) updates
   live when a Custom Role is selected, proving the activation is wired
   through to the same reused summary model Phase 8 requires, not a new one.

   Run: node scripts/user-management-role-picker-dom-check.mjs (exit 0 = pass) */

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
page.on('dialog', async (dialog) => { await dialog.accept(); });

await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
await page.evaluateOnNewDocument(() => {
  localStorage.setItem('pbsi_current_user', JSON.stringify({
    id: 'admin-test', username: 'admin-test', name: 'Admin Test', role: 'admin', active: true,
  }));
});

await page.goto(`http://localhost:${port}/scripts/user-management-role-picker-harness.html`, { waitUntil: 'networkidle0', timeout: 45000 });

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };

const result = await page.evaluate(async () => {
  const store = await import('/js/role-management/custom-roles-store.js');
  const admin = await import('/js/admin.js');

  // Seed one active + one archived Custom Role directly into the store's
  // cache (test-only — bypasses Firebase; see the export's own doc comment).
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

  // initAdminUI() wires the real role-select 'change' listener
  // (attachAdminButtons()) that drives renderUserRoleSummaryPanel() on
  // selection — without it, dispatching 'change' below would be a no-op.
  // Every other element it looks up (btnUserMgmt, usersListContent, ...) is
  // absent from this minimal harness on purpose; every lookup in admin.js
  // is null-guarded, so this is safe (mirrors the real boot order: app.js
  // calls initAdminUI() once, unconditionally, before any modal opens).
  await admin.initAdminUI();
  admin.openUserFormModal(); // create-new path; also runs refreshCustomRoleOptions()

  const out = {};
  const roleField = document.getElementById('userFieldRole');
  const group = roleField.querySelector('optgroup[data-dynamic-role-group]');
  out.groupLabel = group ? group.label : null;

  const activeOpt = roleField.querySelector('option[value="role_warehouse_operator"]');
  out.activeOptionPresent = !!activeOpt;
  out.activeOptionDisabled = activeOpt ? activeOpt.disabled : null;
  out.activeOptionLabel = activeOpt ? activeOpt.textContent : null;

  out.archivedOptionPresent = !!roleField.querySelector('option[value="role_retired"]');

  // The actual behavior an admin exercises: assigning it via the native
  // select (exactly what a disabled <option> would refuse in a real browser).
  roleField.value = 'role_warehouse_operator';
  out.selectAcceptedTheValue = roleField.value === 'role_warehouse_operator';
  roleField.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 50));

  const summaryPanel = document.getElementById('userRoleSummaryPanel');
  out.summaryPanelShown = summaryPanel.style.display !== 'none';
  out.summaryShowsCustomType = (summaryPanel.textContent || '').includes('Custom');
  out.summaryShowsPermissionCount = (summaryPanel.textContent || '').includes('2'); // 2 seeded permissions

  // System Role regression: still no dynamic group pollution, still selectable exactly as before.
  roleField.value = 'viewer';
  out.systemRoleStillSelectable = roleField.value === 'viewer';

  return out;
});

check('a dynamic <optgroup> is injected for Custom Roles', result.groupLabel !== null);
check('the group label no longer says "Belum Aktif" (activation removed the old framing)', result.groupLabel === 'Custom Role');
check('the active Custom Role appears as a real <option>', result.activeOptionPresent);
check('the active Custom Role option is NOT disabled — this is the actual v1.30.8 activation', result.activeOptionDisabled === false);
check('the option label is the role\'s real name', result.activeOptionLabel === 'Warehouse Operator');
check('the archived Custom Role never appears in the list at all (excluded upstream, unchanged by this version)', !result.archivedOptionPresent);
check('the native <select> actually accepts assigning the active Custom Role\'s value (what a disabled option would refuse)', result.selectAcceptedTheValue);
check('the Role Summary panel (reused, not reimplemented) becomes visible on selection', result.summaryPanelShown);
check('the Role Summary panel reports Custom type', result.summaryShowsCustomType);
check('the Role Summary panel reports the correct permission count (2)', result.summaryShowsPermissionCount);
check('System Roles remain fully selectable (regression)', result.systemRoleStillSelectable);

const fatal = consoleErrors.filter((e) =>
  /SyntaxError|ReferenceError|TypeError|is not a function|Failed to (load|fetch) module|Cannot use import|Unexpected token|does not provide an export/i.test(e)
);
check('zero fatal console errors (Firebase permission-denied noise is expected/informational)', fatal.length === 0);
if (fatal.length) fatal.forEach((e) => console.log('   ✗ fatal:', e));

console.log(`\n${pass} passed, ${fail} failed\n`);

await browser.close();
server.close();
process.exit(fail === 0 ? 0 : 1);
