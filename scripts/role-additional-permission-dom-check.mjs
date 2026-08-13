/* role-additional-permission-dom-check.mjs — Role-Level Permission
   Assignment, Phase 4 (v1.30.9.9)

   DOM test. Serves the static app, loads the REAL role-management-
   center.js in headless Chromium against scripts/role-management-
   harness.html (no app.js boot), seeds a fake admin session in
   localStorage — mirrors role-management-edit-dom-check.mjs's own
   established shape exactly, including its "no real Firebase auth in
   this sandbox, so any WRITE the app attempts is rejected by the real
   RTDB rule; this test asserts the app handles that rejection gracefully
   rather than asserting a successful persisted round-trip" discipline.

   Dedicated to the NEW behavior this phase introduces — Role Additional
   Permissions on a SYSTEM Role — kept as its own file rather than folded
   into role-management-edit-dom-check.mjs (which is about Custom Role
   editing) or role-management-dom-check.mjs (read-only baseline),
   mirroring how Individual Permission Assignment got its own dedicated
   individual-permission-management-dom-check.mjs rather than being
   crammed into an existing file.

   Because getRolePermissionOverrides()/grantRolePermission()/
   revokeRolePermission() all go through real Firebase calls with no real
   auth here, this file seeds role-permission-overrides-store.js's live
   cache via its test-only __seedRolePermissionOverridesForTest() export
   for the RENDERING assertions (three checkbox states must be provable
   without a real write succeeding), and separately exercises a REAL
   grant/revoke click to prove it fails gracefully (inline error, no
   crash, UI stays usable) rather than asserting a persisted round-trip.

   Run: node scripts/role-additional-permission-dom-check.mjs (exit 0 = pass) */

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

await page.goto(`http://localhost:${port}/scripts/role-management-harness.html`, { waitUntil: 'networkidle0', timeout: 45000 });

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };

const result = await page.evaluate(async () => {
  const center = await import('/js/role-management/role-management-center.js');
  const host = document.getElementById('host');
  await center.mountRoleManagement(host);

  const out = {};

  // ── Select the 'bidang' System Role (fewer base grants than admin —
  //    easier to reason about the three checkbox states) ───────────────
  host.querySelector('[data-rm-role="bidang"]').click();
  out.headerShowsSystemRole = (host.querySelector('.rm-header')?.textContent || '').includes('System Role');

  // Seed bidang's Role Additional grants via the module's own test-only
  // seam (bypasses the real one-shot Firebase read entirely — mirrors
  // js/admin.js#__setIpmOverridesForTest()'s identical convention/reason:
  // getRolePermissionOverrides() is a REAL Firebase call that would
  // resolve empty/denied in this unauthenticated sandbox, which is NOT
  // what these rendering assertions need to prove).
  center.__setRaStateForTest('bidang', ['warehouse.view']);

  // ── Three checkbox states are distinguishable ──────────────────────
  const baseRow = host.querySelector('.rm-permission-row--base');
  out.baseRowExists = !!baseRow;
  out.baseCheckboxDisabled = baseRow ? baseRow.querySelector('input[type="checkbox"]').disabled : false;
  out.baseCheckboxChecked = baseRow ? baseRow.querySelector('input[type="checkbox"]').checked : false;
  out.baseCheckboxHasNoRaDataAttr = baseRow ? !baseRow.querySelector('input[type="checkbox"]').hasAttribute('data-rm-ra-permission-id') : false;

  const protectedRow = Array.from(host.querySelectorAll('.rm-permission-row')).find((r) => r.textContent.includes('Full Administrator Access'));
  out.protectedRowExists = !!protectedRow;
  out.protectedCheckboxDisabled = protectedRow ? protectedRow.querySelector('input[type="checkbox"]').disabled : false;
  out.protectedCheckboxUnchecked = protectedRow ? !protectedRow.querySelector('input[type="checkbox"]').checked : false;

  const grantableRow = Array.from(host.querySelectorAll('.rm-permission-row')).find((r) => r.querySelector('input[data-rm-ra-permission-id="pettycash.view"]'));
  out.grantableRowExists = !!grantableRow;
  out.grantableCheckboxEnabled = grantableRow ? !grantableRow.querySelector('input[type="checkbox"]').disabled : false;
  out.grantableCheckboxUnchecked = grantableRow ? !grantableRow.querySelector('input[type="checkbox"]').checked : false;

  // ── The seeded Role Additional grant renders CHECKED + ENABLED with
  //    the right class ───────────────────────────────────────────────
  const raRow = host.querySelector('.rm-permission-row--role-additional');
  out.roleAdditionalRowExists = !!raRow;
  out.roleAdditionalCheckboxChecked = raRow ? raRow.querySelector('input[type="checkbox"]').checked : false;
  out.roleAdditionalCheckboxEnabled = raRow ? !raRow.querySelector('input[type="checkbox"]').disabled : false;

  // ── Stats cards show the 5-value System Role breakdown ─────────────
  const statLabels = Array.from(host.querySelectorAll('.v2-dq-stat-label')).map((el) => el.textContent);
  out.statsShowBaseLabel = statLabels.includes('Base Permissions');
  out.statsShowRoleAdditionalLabel = statLabels.includes('Role Additional');

  // ── Header no longer claims blanket "Read-only" ────────────────────
  out.headerHasNoOldReadOnlyPill = !Array.from(host.querySelectorAll('.rm-header span')).some((el) => el.textContent.trim() === 'Read-only');

  // ── A real grant click (rejected — unauthenticated in this sandbox)
  //    fails gracefully: no crash, inline error surfaces, UI stays
  //    interactive (mirrors the Custom Role save/clone/delete rejection
  //    pattern already established in role-management-edit-dom-check.mjs) ──
  const grantCb = host.querySelector('input[data-rm-ra-permission-id="analytics.view"]');
  grantCb.click();
  await new Promise((r) => setTimeout(r, 800));
  out.errorShownAfterRejectedGrant = !!host.querySelector('.rm-error');
  out.uiStillRespondsAfterRejectedGrant = !!host.querySelector('.rm-tree'); // did not crash/blank the panel

  // ── Selecting a Custom Role never shows the System-Role-only Role
  //    Additional affordances (structural isolation, not just hidden) ──
  host.querySelector('[data-rm-action="clone-open"]').click();
  host.querySelector('#rmCloneName').dispatchEvent(new Event('input', { bubbles: true }));
  host.querySelector('[data-rm-action="clone-cancel"]').click(); // no real clone needed; just confirm no leakage on a Custom Role via the seeded fixture instead
  const custom = (await import('/js/role-management/custom-roles-store.js'));
  custom.__seedCustomRolesForTest([{ id: 'role_test_ra', name: 'RA Test Role', permissions: ['warehouse.view'], archived: false, clonedFrom: 'Bidang', createdAt: '2026-08-13T00:00:00.000Z', updatedAt: '2026-08-13T00:00:00.000Z' }]);
  host.querySelector('[data-rm-role="role_test_ra"]').click();
  out.customRoleHasNoRaDataAttrs = host.querySelectorAll('[data-rm-ra-permission-id]').length === 0;
  out.customRoleHasNoRaStatsLabel = !Array.from(host.querySelectorAll('.v2-dq-stat-label')).map((el) => el.textContent).includes('Role Additional');

  return out;
});

check('selecting a System Role shows the "System Role" badge', result.headerShowsSystemRole);
check('a Base-granted permission row carries the --base class', result.baseRowExists);
check('a Base-granted checkbox is disabled', result.baseCheckboxDisabled);
check('a Base-granted checkbox is checked', result.baseCheckboxChecked);
check('a Base-granted checkbox carries NO data-rm-ra-permission-id attribute (structurally un-toggleable, not just visually disabled)', result.baseCheckboxHasNoRaDataAttr);
check('the Full Administrator Access (system.admin) row exists for bidang', result.protectedRowExists);
check('the protected permission checkbox is disabled', result.protectedCheckboxDisabled);
check('the protected permission checkbox is unchecked (bidang does not hold it)', result.protectedCheckboxUnchecked);
check('a grantable (not-yet-granted, not protected) permission row exists', result.grantableRowExists);
check('a grantable checkbox is enabled', result.grantableCheckboxEnabled);
check('a grantable checkbox starts unchecked', result.grantableCheckboxUnchecked);
check('the seeded Role Additional grant renders with the --role-additional class', result.roleAdditionalRowExists);
check('the seeded Role Additional grant is checked', result.roleAdditionalCheckboxChecked);
check('the seeded Role Additional grant is ENABLED (revocable, unlike Base)', result.roleAdditionalCheckboxEnabled);
check('stats cards show a "Base Permissions" label for a System Role', result.statsShowBaseLabel);
check('stats cards show a "Role Additional" label for a System Role', result.statsShowRoleAdditionalLabel);
check('the header no longer shows a blanket "Read-only" pill', result.headerHasNoOldReadOnlyPill);
check('a rejected (unauthenticated) Role Additional grant shows a graceful inline error, not a crash', result.errorShownAfterRejectedGrant);
check('the permission tree remains rendered/interactive after a rejected grant', result.uiStillRespondsAfterRejectedGrant);
check('a Custom Role never renders any Role Additional checkbox (structural isolation, not just a hidden affordance)', result.customRoleHasNoRaDataAttrs);
check('a Custom Role never shows the "Role Additional" stats label', result.customRoleHasNoRaStatsLabel);

const fatal = consoleErrors.filter((e) =>
  /SyntaxError|ReferenceError|TypeError|is not a function|Failed to (load|fetch) module|Cannot use import|Unexpected token|does not provide an export/i.test(e)
);
check('zero fatal console errors (Firebase permission-denied noise is expected/informational)', fatal.length === 0);
if (fatal.length) fatal.forEach((e) => console.log('   ✗ fatal:', e));

console.log(`\n${pass} passed, ${fail} failed\n`);

await browser.close();
server.close();
process.exit(fail === 0 ? 0 : 1);
