/* role-management-edit-dom-check.mjs — Role Management, Editable (v1.30.2)
   DOM test. Serves the static app, loads the REAL role-management-center.js
   in headless Chromium against scripts/role-management-harness.html (no
   app.js boot). Seeds a fake admin session in localStorage — NEVER real
   Firebase auth, since this sandboxed environment has no real admin
   credentials and js/firebase.js always targets the real production
   database, even from local scripts.

   Because of that, this check is deliberately scoped: a Custom Role is
   seeded directly into the store's local cache via the test-only
   __seedCustomRolesForTest() export (bypassing Firebase entirely) so the
   editable-UI rendering/interaction can be verified without a real write.
   Any action that WOULD write to Firebase (Save, Clone, Delete) is still
   exercised for real — since there is no real auth, the write is rejected
   by the customRoles RTDB rule (admin-only), and this check asserts the
   app handles that rejection gracefully (inline error, no crash, edits
   preserved) rather than asserting a successful persisted round-trip,
   which is not achievable in this environment. See
   docs/ROLE_MANAGEMENT_EDITABLE_REPORT_v1.30.2.md's Testing Summary.

   Run: node scripts/role-management-edit-dom-check.mjs (exit 0 = pass) */

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
// Every confirm()/alert() in the app is auto-accepted — this test verifies
// what happens AFTER a confirmed action, not the native dialog itself.
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
  const store = await import('/js/role-management/custom-roles-store.js');
  const host = document.getElementById('host');
  await center.mountRoleManagement(host);

  // Seed one fake Custom Role directly into the store's cache (test-only —
  // bypasses Firebase; see the export's own doc comment).
  store.__seedCustomRolesForTest([{
    id: 'role_test', name: 'Test Custom Role', type: 'custom',
    permissions: ['system.admin', 'warehouse.view'],
    archived: false, clonedFrom: 'Admin',
    createdAt: '2026-08-08T00:00:00.000Z', updatedAt: '2026-08-08T00:00:00.000Z',
  }]);

  const out = {};

  // ── Custom Role appears + is editable ──────────────────────────────
  out.customRoleInList = !!host.querySelector('[data-rm-role="role_test"]');
  host.querySelector('[data-rm-role="role_test"]').click();
  out.customBadgeShown = !!host.querySelector('.rm-role-type-badge');
  const checkboxesAfterSelect = Array.from(host.querySelectorAll('.rm-permission-row input[type="checkbox"]'));
  out.checkboxesEditable = checkboxesAfterSelect.every((cb) => !cb.disabled);
  out.checkedCountInitial = checkboxesAfterSelect.filter((cb) => cb.checked).length; // expect 2

  // ── Toggle a checkbox -> dirty + Save bar appears ──────────────────
  const toggleCb = host.querySelector('.rm-permission-row input[data-rm-permission-id="vehicle.view"]');
  toggleCb.checked = true; // jsdom-free real click is more faithful; use a real click instead
  toggleCb.dispatchEvent(new Event('change', { bubbles: true }));
  out.saveBarAfterToggle = !!host.querySelector('.rm-save-bar');
  out.checkedCountAfterToggle = host.querySelectorAll('.rm-permission-row input[type="checkbox"]:checked').length; // expect 3

  // ── Cancel discards the draft ──────────────────────────────────────
  host.querySelector('[data-rm-action="cancel"]').click();
  out.saveBarAfterCancel = !!host.querySelector('.rm-save-bar');
  out.checkedCountAfterCancel = host.querySelectorAll('.rm-permission-row input[type="checkbox"]:checked').length; // back to 2

  // ── Empty-name validation: Save is blocked, no Review modal ────────
  const nameInput = host.querySelector('#rmNameInput');
  nameInput.value = '   ';
  nameInput.dispatchEvent(new Event('input', { bubbles: true }));
  host.querySelector('[data-rm-action="save"]').click();
  out.errorShownForEmptyName = !!host.querySelector('.rm-error');
  out.noReviewModalForInvalidSave = !host.querySelector('.rm-review-box');

  // ── Valid rename + permission toggle -> Save -> Review shows correct diff ──
  const nameInput2 = host.querySelector('#rmNameInput');
  nameInput2.value = 'Renamed Custom Role';
  nameInput2.dispatchEvent(new Event('input', { bubbles: true }));
  const toggleCb2 = host.querySelector('.rm-permission-row input[data-rm-permission-id="warehouse.view"]');
  toggleCb2.click(); // unchecks warehouse.view (was granted)
  host.querySelector('[data-rm-action="save"]').click();
  out.reviewModalShown = !!host.querySelector('.rm-review-box');
  out.reviewShowsRename = (host.querySelector('.rm-review-box')?.textContent || '').includes('Renamed Custom Role');
  out.reviewShowsRemoved = (host.querySelector('.rm-review-col--removed')?.textContent || '').includes('Warehouse');

  // ── Confirming Review attempts a real write; unauthenticated -> rejected
  //    gracefully (inline error, edits preserved, no crash) ──────────
  host.querySelector('[data-rm-action="review-confirm"]').click();
  await new Promise((r) => setTimeout(r, 800)); // let the rejected Firebase write settle
  out.reviewModalClosedAfterConfirm = !host.querySelector('.rm-review-box');
  out.errorShownAfterRejectedSave = !!host.querySelector('.rm-error');
  out.saveBarStillShownAfterRejectedSave = !!host.querySelector('.rm-save-bar'); // edits preserved, not lost

  // ── Clone (System Role -> Custom Role): attempts a real write, also
  //    rejected gracefully ───────────────────────────────────────────
  host.querySelector('[data-rm-role="admin"]').click(); // no unsaved changes on role_test after the above, but confirm() is auto-accepted regardless
  host.querySelector('[data-rm-action="clone-open"]').click();
  out.clonePromptShown = !!host.querySelector('.rm-modal-box');
  host.querySelector('[data-rm-action="clone-confirm"]').click();
  await new Promise((r) => setTimeout(r, 800));
  out.clonePromptClosedAfterConfirm = !host.querySelector('.rm-modal-box:not(.rm-review-box)');
  out.errorShownAfterRejectedClone = !!host.querySelector('.rm-error');

  // ── System Role regression: still fully read-only ──────────────────
  out.systemCheckboxesStillDisabled = Array.from(host.querySelectorAll('.rm-permission-row input[type="checkbox"]')).every((cb) => cb.disabled);
  out.systemRoleHasNoDeleteButton = !host.querySelector('[data-rm-action="delete"]');

  // ── Delete (soft-archive) on the Custom Role: also rejected gracefully ──
  host.querySelector('[data-rm-role="role_test"]').click();
  host.querySelector('[data-rm-action="delete"]').click();
  await new Promise((r) => setTimeout(r, 800));
  out.errorShownAfterRejectedDelete = !!host.querySelector('.rm-error');

  return out;
});

check('seeded Custom Role appears in the role list', result.customRoleInList);
check('Custom Role badge is shown when selected', result.customBadgeShown);
check('Custom Role checkboxes are editable (not disabled)', result.checkboxesEditable);
check('initial checked count matches the seeded permissions (2)', result.checkedCountInitial === 2);
check('toggling a checkbox reveals the Save/Cancel bar', result.saveBarAfterToggle);
check('toggling a checkbox updates the live checked count (3)', result.checkedCountAfterToggle === 3);
check('Cancel hides the Save bar', !result.saveBarAfterCancel);
check('Cancel reverts the checked count to last-saved (2)', result.checkedCountAfterCancel === 2);
check('saving an empty name shows an inline error', result.errorShownForEmptyName);
check('an invalid save never opens the Review modal', result.noReviewModalForInvalidSave);
check('a valid rename + permission change opens the Review modal', result.reviewModalShown);
check('Review modal shows the new name', result.reviewShowsRename);
check('Review modal shows the removed permission', result.reviewShowsRemoved);
check('Review modal closes after confirming', result.reviewModalClosedAfterConfirm);
check('a rejected (unauthenticated) save shows a graceful inline error, not a crash', result.errorShownAfterRejectedSave);
check('a rejected save preserves the unsaved edits (Save bar still shown)', result.saveBarStillShownAfterRejectedSave);
check('Clone prompt opens for a System Role', result.clonePromptShown);
check('Clone prompt closes after confirming', result.clonePromptClosedAfterConfirm);
check('a rejected (unauthenticated) clone shows a graceful inline error, not a crash', result.errorShownAfterRejectedClone);
check('System Role checkboxes remain disabled (regression)', result.systemCheckboxesStillDisabled);
check('System Roles have no Delete button (regression)', result.systemRoleHasNoDeleteButton);
check('a rejected (unauthenticated) delete shows a graceful inline error, not a crash', result.errorShownAfterRejectedDelete);

const fatal = consoleErrors.filter((e) =>
  /SyntaxError|ReferenceError|TypeError|is not a function|Failed to (load|fetch) module|Cannot use import|Unexpected token|does not provide an export/i.test(e)
);
check('zero fatal console errors (Firebase permission-denied noise is expected/informational)', fatal.length === 0);
if (fatal.length) fatal.forEach((e) => console.log('   ✗ fatal:', e));

console.log(`\n${pass} passed, ${fail} failed\n`);

await browser.close();
server.close();
process.exit(fail === 0 ? 0 : 1);
