/* custom-role-protected-permission-dom-check.mjs — Custom Role Protected
   Permission Security Hardening (v1.30.9.10)

   DOM test. Serves the static app, loads the REAL role-management-
   center.js in headless Chromium against scripts/role-management-
   harness.html (no app.js boot) — mirrors role-management-edit-dom-
   check.mjs's own established shape exactly, including its "no real
   Firebase auth in this sandbox, so any WRITE the app attempts is
   rejected by the real RTDB rule; this test asserts the app handles
   that rejection gracefully rather than asserting a successful
   persisted round-trip" discipline.

   Dedicated to the NEW behavior this hardening task introduces —
   protected-permission rows in the Custom Role editor, and safe
   handling of a LEGACY-INVALID persisted record — kept as its own file
   rather than folded into role-management-edit-dom-check.mjs (which
   tests the ordinary toggle/save/cancel/review WORKFLOW with an
   ordinary, non-protected fixture after this task's own fixture fix),
   mirroring the established "new mechanism, new dedicated file"
   convention from Role-Level Permission Assignment, Phase 4.

   Run: node scripts/custom-role-protected-permission-dom-check.mjs
   (exit 0 = pass) */

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
  const store = await import('/js/role-management/custom-roles-store.js');
  const host = document.getElementById('host');
  await center.mountRoleManagement(host);

  const out = {};

  // ── Fixture 1: a LEGACY-INVALID Custom Role (persisted before this
  //    hardening existed) — must render TRANSPARENTLY, never silently
  //    hidden. ──────────────────────────────────────────────────────
  store.__seedCustomRolesForTest([
    {
      id: 'role_legacy', name: 'Legacy Custom Role', type: 'custom',
      permissions: ['warehouse.view', 'system.admin'],
      archived: false, clonedFrom: null,
      createdAt: '2026-08-13T00:00:00.000Z', updatedAt: '2026-08-13T00:00:00.000Z',
    },
    {
      id: 'role_clean', name: 'Clean Custom Role', type: 'custom',
      permissions: ['pettycash.view'],
      archived: false, clonedFrom: null,
      createdAt: '2026-08-13T00:00:00.000Z', updatedAt: '2026-08-13T00:00:00.000Z',
    },
  ]);

  host.querySelector('[data-rm-role="role_legacy"]').click();

  // ── 1. Protected permission is VISIBLE (not hidden), checked (accurately
  //    reflects the persisted legacy state), and disabled (not selectable). ──
  const adminRow = Array.from(host.querySelectorAll('.rm-permission-row')).find((r) => r.textContent.includes('Full Administrator Access'));
  out.legacyProtectedRowVisible = !!adminRow;
  out.legacyProtectedRowChecked = adminRow ? adminRow.querySelector('input[type="checkbox"]').checked : false;
  out.legacyProtectedRowDisabled = adminRow ? adminRow.querySelector('input[type="checkbox"]').disabled : false;
  out.legacyProtectedRowHasNoDataAttr = adminRow ? !adminRow.querySelector('input[type="checkbox"]').hasAttribute('data-rm-permission-id') : false;
  out.legacyProtectedRowHasClass = adminRow ? adminRow.classList.contains('rm-permission-row--protected') : false;

  // ── 2. A protected permission NOT granted (system.users.manage) is
  //    unchecked + disabled — normal protected state. ─────────────────
  const usersManageRow = Array.from(host.querySelectorAll('.rm-permission-row')).find((r) => r.textContent.includes('Manage Users'));
  out.notGrantedProtectedUnchecked = usersManageRow ? !usersManageRow.querySelector('input[type="checkbox"]').checked : false;
  out.notGrantedProtectedDisabled = usersManageRow ? usersManageRow.querySelector('input[type="checkbox"]').disabled : false;

  // ── 3. An ordinary, already-granted permission remains fully editable. ──
  const warehouseRow = Array.from(host.querySelectorAll('.rm-permission-row')).find((r) => r.querySelector('input[data-rm-permission-id="warehouse.view"]'));
  out.ordinaryGrantedEditable = warehouseRow ? !warehouseRow.querySelector('input[type="checkbox"]').disabled : false;
  out.ordinaryGrantedChecked = warehouseRow ? warehouseRow.querySelector('input[type="checkbox"]').checked : false;

  // ── 4. An ordinary, not-yet-granted permission remains selectable. ──
  const vehicleRow = Array.from(host.querySelectorAll('.rm-permission-row')).find((r) => r.querySelector('input[data-rm-permission-id="vehicle.view"]'));
  out.ordinaryGrantableEditable = vehicleRow ? !vehicleRow.querySelector('input[type="checkbox"]').disabled : false;

  // ── 5. Editing ANY permission auto-heals the draft: the legacy
  //    protected grant silently drops from the working draft the moment
  //    the first edit happens — verified via the checked-count arithmetic,
  //    not just visually. ────────────────────────────────────────────
  const beforeEditCheckedCount = host.querySelectorAll('.rm-permission-row input[type="checkbox"]:checked').length; // warehouse.view + system.admin = 2
  vehicleRow.querySelector('input[type="checkbox"]').click(); // grants vehicle.view — first edit, triggers ensureDraft()
  const afterEditCheckedCount = host.querySelectorAll('.rm-permission-row input[type="checkbox"]:checked').length; // warehouse.view + vehicle.view = 2 (system.admin dropped, vehicle.view added — net zero change, but COMPOSITION changed)
  const warehouseStillCheckedAfterEdit = host.querySelector('.rm-permission-row input[data-rm-permission-id="warehouse.view"]')?.checked === true;
  out.beforeEditCheckedCountWas2 = beforeEditCheckedCount === 2;
  out.afterEditCheckedCountStays2ButComposedDifferently = afterEditCheckedCount === 2 && warehouseStillCheckedAfterEdit;
  const adminRowAfterEdit = Array.from(host.querySelectorAll('.rm-permission-row')).find((r) => r.textContent.includes('Full Administrator Access'));
  out.protectedRowUnchecksAfterFirstEdit = adminRowAfterEdit ? !adminRowAfterEdit.querySelector('input[type="checkbox"]').checked : false;

  // ── 6. Saving surfaces the auto-heal TRANSPARENTLY: the Review modal's
  //    diff must show "Full Administrator Access" under Dicabut (removed) —
  //    proving it was never silently dropped, just made explicit on save. ──
  host.querySelector('[data-rm-action="save"]').click();
  const reviewBox = host.querySelector('.rm-review-box');
  out.reviewModalShown = !!reviewBox;
  out.reviewShowsAdminRemoved = (host.querySelector('.rm-review-col--removed')?.textContent || '').includes('Full Administrator Access');
  out.reviewShowsVehicleAdded = (host.querySelector('.rm-review-col--added')?.textContent || '').includes('Vehicle');

  // ── Confirming attempts a real write; unauthenticated -> rejected
  //    gracefully (same established pattern). ────────────────────────
  host.querySelector('[data-rm-action="review-confirm"]').click();
  await new Promise((r) => setTimeout(r, 800));
  out.errorShownAfterRejectedSave = !!host.querySelector('.rm-error');

  // ── Fixture 2: a CLEAN Custom Role — protected rows behave identically
  //    (unchecked+disabled), proving this isn't legacy-fixture-specific. ──
  host.querySelector('[data-rm-role="role_clean"]').click();
  const cleanAdminRow = Array.from(host.querySelectorAll('.rm-permission-row')).find((r) => r.textContent.includes('Full Administrator Access'));
  out.cleanRoleProtectedUnchecked = cleanAdminRow ? !cleanAdminRow.querySelector('input[type="checkbox"]').checked : false;
  out.cleanRoleProtectedDisabled = cleanAdminRow ? cleanAdminRow.querySelector('input[type="checkbox"]').disabled : false;
  out.cleanRoleProtectedNoDataAttr = cleanAdminRow ? !cleanAdminRow.querySelector('input[type="checkbox"]').hasAttribute('data-rm-permission-id') : false;

  // Attempting to interact with a protected row's checkbox structurally
  // cannot fire the app's own change handler at all — there is no
  // data-rm-permission-id for onChange's selector to match. Proven by
  // clicking it and confirming state is completely unchanged.
  const beforeProtectedClickChecked = cleanAdminRow.querySelector('input[type="checkbox"]').checked;
  cleanAdminRow.querySelector('input[type="checkbox"]').click();
  out.protectedCheckboxClickHadNoEffect = cleanAdminRow.querySelector('input[type="checkbox"]').checked === beforeProtectedClickChecked && !host.querySelector('.rm-save-bar');

  // An ORDINARY permission on the clean role remains fully toggleable, and
  // Save still works normally for valid permissions (no regression).
  const pettyRow = Array.from(host.querySelectorAll('.rm-permission-row')).find((r) => r.querySelector('input[data-rm-permission-id="pettycash.manage"]'));
  pettyRow.querySelector('input[type="checkbox"]').click();
  out.ordinarySaveBarAppears = !!host.querySelector('.rm-save-bar');
  host.querySelector('[data-rm-action="save"]').click();
  out.ordinarySaveOpensReview = !!host.querySelector('.rm-review-box');
  out.ordinaryReviewNeverMentionsProtected = !(host.querySelector('.rm-review-box')?.textContent || '').includes('Full Administrator Access');

  // ── Light regression smoke-checks (full dedicated coverage lives in
  //    role-management-dom-check.mjs / role-additional-permission-dom-
  //    check.mjs / individual-permission-management-dom-check.mjs, all
  //    re-run unmodified as part of this task's own regression) ───────
  host.querySelector('[data-rm-action="review-back"]')?.click();
  host.querySelector('[data-rm-role="admin"]').click(); // System Role — still read-only for Base
  const adminBaseCheckboxes = Array.from(host.querySelectorAll('.rm-permission-row--base input[type="checkbox"]'));
  out.systemRoleBaseStillReadOnly = adminBaseCheckboxes.length > 0 && adminBaseCheckboxes.every((cb) => cb.disabled);
  const raEnabledExists = Array.from(host.querySelectorAll('.rm-permission-row input[data-rm-ra-permission-id]')).length > 0;
  out.roleAdditionalStillPresentOnSystemRole = raEnabledExists;

  return out;
});

check('legacy-invalid protected permission row is VISIBLE (not hidden)', result.legacyProtectedRowVisible);
check('legacy-invalid protected permission renders CHECKED (accurately reflects persisted state)', result.legacyProtectedRowChecked);
check('legacy-invalid protected permission renders DISABLED (not selectable/toggleable)', result.legacyProtectedRowDisabled);
check('legacy-invalid protected permission has NO data-rm-permission-id attribute (structurally un-toggleable)', result.legacyProtectedRowHasNoDataAttr);
check('legacy-invalid protected permission row carries the --protected class', result.legacyProtectedRowHasClass);
check('a protected permission NOT granted renders unchecked', result.notGrantedProtectedUnchecked);
check('a protected permission NOT granted renders disabled', result.notGrantedProtectedDisabled);
check('an ordinary already-granted permission remains editable', result.ordinaryGrantedEditable);
check('an ordinary already-granted permission renders checked', result.ordinaryGrantedChecked);
check('an ordinary not-yet-granted permission remains selectable', result.ordinaryGrantableEditable);
check('before any edit, checked count reflects the raw persisted legacy state (2: warehouse.view + system.admin)', result.beforeEditCheckedCountWas2);
check('after the FIRST edit, the draft has silently self-healed (system.admin dropped, warehouse.view still held, count stays 2 but composition changed)', result.afterEditCheckedCountStays2ButComposedDifferently);
check('the protected row visibly unchecks once editing begins (draft sanitization is real, not just arithmetic)', result.protectedRowUnchecksAfterFirstEdit);
check('Save opens the Review modal', result.reviewModalShown);
check('Review modal shows "Full Administrator Access" under Dicabut — the auto-heal is TRANSPARENT, never silent', result.reviewShowsAdminRemoved);
check('Review modal also shows the genuinely new Vehicle permission under Ditambahkan', result.reviewShowsVehicleAdded);
check('a rejected (unauthenticated) save shows a graceful inline error, not a crash', result.errorShownAfterRejectedSave);
check('a CLEAN Custom Role\'s protected row is unchecked (not legacy-fixture-specific behavior)', result.cleanRoleProtectedUnchecked);
check('a CLEAN Custom Role\'s protected row is disabled', result.cleanRoleProtectedDisabled);
check('a CLEAN Custom Role\'s protected row has no data attribute', result.cleanRoleProtectedNoDataAttr);
check('clicking a protected checkbox has NO effect whatsoever (no dirty state, no change)', result.protectedCheckboxClickHadNoEffect);
check('an ordinary permission toggle still reveals the Save bar (no regression)', result.ordinarySaveBarAppears);
check('Save still opens the Review modal for an ordinary valid change (no regression)', result.ordinarySaveOpensReview);
check('the Review modal for an ordinary change never mentions a protected permission', result.ordinaryReviewNeverMentionsProtected);
check('REGRESSION: System Role Base permissions remain fully read-only', result.systemRoleBaseStillReadOnly);
check('REGRESSION: Role Additional editable affordance still present on a System Role', result.roleAdditionalStillPresentOnSystemRole);

const fatal = consoleErrors.filter((e) =>
  /SyntaxError|ReferenceError|TypeError|is not a function|Failed to (load|fetch) module|Cannot use import|Unexpected token|does not provide an export/i.test(e)
);
check('zero fatal console errors (Firebase permission-denied noise is expected/informational)', fatal.length === 0);
if (fatal.length) fatal.forEach((e) => console.log('   ✗ fatal:', e));

console.log(`\n${pass} passed, ${fail} failed\n`);

await browser.close();
server.close();
process.exit(fail === 0 ? 0 : 1);
