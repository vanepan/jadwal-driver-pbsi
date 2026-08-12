/* individual-permission-management-dom-check.mjs — Individual Permission
   Assignment, Phase 3A/3B: User Management UX (v1.30.9.6 / v1.30.9.7)

   DOM test. Serves the static app, loads the REAL js/admin.js in headless
   Chromium against scripts/individual-permission-management-harness.html
   (the real #modalUserForm + the new #userIndividualPermissionsGroup
   section, copied verbatim from index.html) — same convention as
   admin-pin-reset-dom-check.mjs / user-management-role-picker-dom-check.mjs.

   Rendering assertions are driven through the new
   admin.js#__setIpmOverridesForTest() test-only seam (bypasses Firebase
   entirely, same pattern as users.js#__seedUsersForTest()/custom-roles-
   store.js#__seedCustomRolesForTest()). Grant/revoke assertions (tests
   15/16) drive the REAL grantUserPermission()/revokeUserPermission() store
   calls — this harness has no real Firebase Auth session (only a faked
   localStorage session, matching this codebase's established "js/firebase.js
   always hits real production, even locally" constraint), so the real
   write is genuinely attempted and genuinely DENIED by the live RTDB rule
   — proving the wiring calls the real API without ever risking a real
   production write. Never seeds or mutates production data.

   Run: node scripts/individual-permission-management-dom-check.mjs (exit 0 = pass) */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };

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
await page.evaluateOnNewDocument(() => {
  localStorage.setItem('pbsi_current_user', JSON.stringify({
    id: 'admin-test', username: 'admin-test', name: 'Admin Test', role: 'admin', active: true,
  }));
});

await page.goto(`http://localhost:${port}/scripts/individual-permission-management-harness.html`, { waitUntil: 'networkidle0', timeout: 45000 });

const result = await page.evaluate(async () => {
  const usersStore = await import('/js/users.js');
  const admin = await import('/js/admin.js');

  usersStore.__seedUsersForTest([
    { username: 'viewer-user', displayName: 'Viewer User', role: 'viewer', active: true },
    { username: 'bidang-user', displayName: 'Bidang User', role: 'bidang', active: true },
    { username: 'inactive-user', displayName: 'Inactive User', role: 'viewer', active: false },
    { username: 'archived-user', displayName: 'Archived User', role: 'viewer', active: true, archived: true, archivedAt: '2026-01-01T00:00:00.000Z' },
  ]);
  await admin.initAdminUI();

  const out = {};
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  // Polls instead of a fixed sleep for assertions that depend on a REAL
  // network round-trip (grant/revoke against the live, denied RTDB rule) —
  // more robust against variable production network latency than a fixed
  // wait(), without slowing down the common (fast) case.
  const waitUntil = async (predicate, { timeoutMs = 5000, intervalMs = 50 } = {}) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (predicate()) return true;
      await wait(intervalMs);
    }
    return predicate();
  };

  // ── 1. Section renders (Create-mode: hidden; Edit-mode: visible) ────────
  admin.openUserFormModal();
  out.hiddenOnCreate = document.getElementById('userIndividualPermissionsGroup').style.display === 'none';

  admin.openUserFormModal('viewer-user');
  out.visibleOnEdit = document.getElementById('userIndividualPermissionsGroup').style.display !== 'none';
  out.sectionHasTitle = document.getElementById('userIndividualPermissionsPanel').textContent.includes('Individual Permissions');

  // ── 18. Loading state — the synchronous state BEFORE the real (denied)
  //     network read resolves. Re-open to catch it fresh. ─────────────────
  admin.openUserFormModal('viewer-user');
  out.loadingStateShown = document.getElementById('userIndividualPermissionsPanel').textContent.includes('Memuat individual permissions');
  await waitUntil(() => !document.getElementById('userIndividualPermissionsPanel').textContent.includes('Memuat')); // let the real (denied) read resolve so it doesn't leak into later assertions

  // ── 2-5. Empty / one / multiple overrides / provenance — via the test seam ──
  admin.__setIpmOverridesForTest('viewer-user', []);
  out.emptyStateShown = document.getElementById('userIndividualPermissionsPanel').textContent.includes('Belum ada individual permission');
  out.emptyCountIsZero = document.getElementById('userIndividualPermissionsPanel').textContent.includes('0 permission');

  admin.__setIpmOverridesForTest('viewer-user', ['pettycash.view']);
  out.oneOverrideRow = document.querySelectorAll('.ipm-grant-row').length === 1;
  out.oneOverrideTitle = document.querySelector('.ipm-grant-row__title')?.textContent === 'View Petty Cash';
  out.oneOverrideBadge = document.querySelector('.ipm-grant-row__badge')?.textContent.trim() === 'Individual';
  out.oneOverrideCount = document.getElementById('userIndividualPermissionsPanel').textContent.includes('1 permission');

  admin.__setIpmOverridesForTest('viewer-user', ['pettycash.view', 'overtime.view']);
  out.multipleOverrideRows = document.querySelectorAll('.ipm-grant-row').length === 2;
  out.multipleOverrideCount = document.getElementById('userIndividualPermissionsPanel').textContent.includes('2 permission');
  out.allRowsHaveIndividualBadge = [...document.querySelectorAll('.ipm-grant-row__badge')].every((b) => b.textContent.trim() === 'Individual');

  // ── 6-9. Picker: opens, grouped, system.admin/system.users.manage absent ──
  const roleField = document.getElementById('userFieldRole');
  roleField.value = 'viewer';
  roleField.dispatchEvent(new Event('change', { bubbles: true }));

  document.getElementById('btnOpenIpmPicker').click();
  out.pickerOpens = !!document.querySelector('.ipm-picker');
  out.pickerHasModuleGroups = document.querySelectorAll('.ipm-picker-group__title').length > 0;
  out.pickerHasCategoryGroups = document.querySelectorAll('.ipm-picker-category__title').length > 0;
  out.pickerHasWarehouseModule = [...document.querySelectorAll('.ipm-picker-group__title')].some((el) => el.textContent === 'Warehouse');
  out.systemAdminAbsentFromPicker = !document.querySelector('[data-ipm-grant-id="system.admin"]');
  out.systemUsersManageAbsentFromPicker = !document.querySelector('[data-ipm-grant-id="system.users.manage"]');

  // ── 10. Inherited permission (viewer role grants driver.schedule.view) ──
  const inheritedRow = document.querySelector('[data-ipm-grant-id="driver.schedule.view"]');
  out.inheritedCheckboxDisabled = inheritedRow?.disabled === true;
  out.inheritedCheckboxChecked = inheritedRow?.checked === true;
  out.inheritedNoteShown = inheritedRow?.closest('label').textContent.includes('Sudah tersedia melalui Role');

  // ── 11. Already-individually-granted permission cannot duplicate ────────
  const alreadyGrantedRow = document.querySelector('[data-ipm-grant-id="pettycash.view"]');
  out.alreadyGrantedCheckboxDisabled = alreadyGrantedRow?.disabled === true;
  out.alreadyGrantedCheckboxChecked = alreadyGrantedRow?.checked === true;
  out.alreadyGrantedNoteShown = alreadyGrantedRow?.closest('label').textContent.includes('Sudah menjadi Individual Permission');

  // A genuinely grantable permission (not inherited, not already granted).
  const grantableRow = document.querySelector('[data-ipm-grant-id="analytics.view"]');
  out.grantableCheckboxEnabled = grantableRow && !grantableRow.disabled && !grantableRow.checked;

  // ── 15. Grant handler calls the REAL store API (denied, never succeeds) ──
  const beforeGrantCount = document.querySelectorAll('.ipm-grant-row').length;
  grantableRow.click();
  await waitUntil(() => document.getElementById('toast').style.display !== 'none'); // real network round-trip to the live (denied) RTDB rule
  out.grantAttemptedRealWrite = document.getElementById('toast').textContent.length > 0
    && document.getElementById('toast').style.display !== 'none';
  out.grantDeniedDidNotFabricateSuccess = document.querySelectorAll('.ipm-grant-row').length === beforeGrantCount;

  // ── 16. Revoke handler calls the REAL store API (denied, never succeeds) ──
  document.getElementById('toast').style.display = 'none';
  document.getElementById('toast').textContent = '';
  const revokeBtn = document.querySelector('[data-ipm-revoke="pettycash.view"]');
  const beforeRevokeCount = document.querySelectorAll('.ipm-grant-row').length;
  revokeBtn.click();
  await waitUntil(() => document.getElementById('toast').style.display !== 'none');
  out.revokeAttemptedRealWrite = document.getElementById('toast').textContent.length > 0
    && document.getElementById('toast').style.display !== 'none';
  out.revokeDeniedPreservedState = document.querySelectorAll('.ipm-grant-row').length === beforeRevokeCount
    && !!document.querySelector('[data-ipm-revoke="pettycash.view"]'); // still present — never removed on a denied write

  // ── 12/13. Inactive / archived users are read-only ───────────────────────
  admin.openUserFormModal('inactive-user');
  admin.__setIpmOverridesForTest('inactive-user', ['pettycash.view']);
  out.inactiveNoAddButton = !document.getElementById('btnOpenIpmPicker');
  out.inactiveNoRevokeButton = !document.querySelector('.ipm-revoke-btn');
  out.inactiveReadonlyNoticeShown = document.getElementById('userIndividualPermissionsPanel').textContent.includes('tidak aktif');
  out.inactiveStillShowsExistingGrant = !!document.querySelector('.ipm-grant-row__title');

  admin.openUserFormModal('archived-user');
  admin.__setIpmOverridesForTest('archived-user', ['pettycash.view']);
  out.archivedNoAddButton = !document.getElementById('btnOpenIpmPicker');
  out.archivedNoRevokeButton = !document.querySelector('.ipm-revoke-btn');
  out.archivedReadonlyNoticeShown = document.getElementById('userIndividualPermissionsPanel').textContent.includes('diarsipkan');

  // ── 14. Revoke button exists for an ACTIVE user with overrides ──────────
  admin.openUserFormModal('viewer-user');
  admin.__setIpmOverridesForTest('viewer-user', ['pettycash.view', 'overtime.view']);
  out.revokeButtonsForActiveUser = document.querySelectorAll('.ipm-revoke-btn').length === 2;

  // ── 17. USER SWITCHING — the critical identity-isolation test ───────────
  admin.__setIpmOverridesForTest('viewer-user', ['warehouse.item.edit']);
  out.userAHasItsOverride = document.getElementById('userIndividualPermissionsPanel').textContent.includes('Edit Item');
  admin.openUserFormModal('bidang-user'); // switch — synchronous check BEFORE the real read resolves
  out.userBDoesNotInheritUserAOverrideImmediately = !document.getElementById('userIndividualPermissionsPanel').textContent.includes('Edit Item');
  await waitUntil(() => !document.getElementById('userIndividualPermissionsPanel').textContent.includes('Memuat')); // let bidang-user's own (denied → empty) read resolve
  out.userBStillDoesNotHaveUserAOverrideAfterLoad = !document.getElementById('userIndividualPermissionsPanel').textContent.includes('Edit Item');

  // Switch back B -> A: A's own state must reload correctly, not stay stuck on B's.
  admin.openUserFormModal('viewer-user');
  admin.__setIpmOverridesForTest('viewer-user', ['warehouse.item.edit']); // simulate A's real state having reloaded
  out.switchingBackToUserARestoresItsOwnOverride = document.getElementById('userIndividualPermissionsPanel').textContent.includes('Edit Item');

  // ── 22. STALE-RESPONSE GUARD — close+reopen the SAME user while a
  //     grant is in flight; the superseded response must never clobber
  //     the fresh reload (found and fixed during the Phase 3 audit: a
  //     username-only check missed this exact case, since the username
  //     is unchanged across a close+reopen of the same user). ──────────
  admin.openUserFormModal('viewer-user');
  await waitUntil(() => !document.getElementById('userIndividualPermissionsPanel').textContent.includes('Memuat')); // let THIS open's own real load finish — no ghost calls left pending
  admin.__setIpmOverridesForTest('viewer-user', []);
  document.getElementById('btnOpenIpmPicker').click();
  const staleGrantRow = document.querySelector('[data-ipm-grant-id="analytics.view"]');
  staleGrantRow.click(); // real (denied) network call starts, NOT awaited — this is the "stale" operation under test
  admin.openUserFormModal('viewer-user'); // "close + reopen the same user" mid-flight — bumps the shared token
  await waitUntil(() => !document.getElementById('userIndividualPermissionsPanel').textContent.includes('Memuat')); // let the REOPEN's own real load finish too — no second ghost left pending
  admin.__setIpmOverridesForTest('viewer-user', ['overtime.view']); // the fresh reload's own, known, distinguishable state
  await wait(1500); // margin for the STALE grant's real round-trip to resolve — it must be silently discarded (no toast, no state change), not proven by a positive signal
  out.staleResponseDidNotClobberFreshState = document.getElementById('userIndividualPermissionsPanel').textContent.includes('Overtime')
    && !document.getElementById('userIndividualPermissionsPanel').textContent.includes('View Analytics');

  // ── 19. Error state (via the test seam — see admin.js's own header
  //     comment on why this isn't reachable through the real API today) ──
  admin.__setIpmOverridesForTest('viewer-user', [], { error: true });
  out.errorStateShown = document.getElementById('userIndividualPermissionsPanel').textContent.includes('Gagal memuat individual permissions');

  // ── STRESS/INTERACTION AUDIT — repeated open/close, repeated user
  //     switching, repeated picker open/close. The full-innerHTML-replace
  //     render pattern (every render replaces #userIndividualPermissionsPanel's
  //     entire subtree) means listener duplication is structurally
  //     impossible for anything inside it — this proves no accumulation
  //     actually occurs across many cycles, not just that the pattern
  //     should prevent it in theory. Static listeners (role-select change,
  //     backdrop click) are attached exactly once at initAdminUI() boot,
  //     never per-open, so they're not exercised again here. ─────────────
  for (let i = 0; i < 20; i++) {
    admin.openUserFormModal('viewer-user');
    admin.__setIpmOverridesForTest('viewer-user', ['pettycash.view']);
    document.getElementById('btnCloseUserForm').click();
  }
  for (let i = 0; i < 10; i++) {
    admin.openUserFormModal(i % 2 === 0 ? 'viewer-user' : 'bidang-user');
    admin.__setIpmOverridesForTest(i % 2 === 0 ? 'viewer-user' : 'bidang-user', []);
  }
  admin.openUserFormModal('viewer-user');
  admin.__setIpmOverridesForTest('viewer-user', ['pettycash.view']);
  for (let i = 0; i < 10; i++) {
    document.getElementById('btnOpenIpmPicker').click();
    document.getElementById('btnCloseIpmPicker').click();
  }
  document.getElementById('btnOpenIpmPicker').click();
  out.stressNoDuplicatePanels = document.querySelectorAll('.ipm-panel').length === 1;
  out.stressNoDuplicatePickers = document.querySelectorAll('.ipm-picker').length === 1;
  out.stressNoDuplicateGrantRows = document.querySelectorAll('.ipm-grant-row').length === 1; // still exactly the one seeded grant, not accumulated

  return out;
});

check('1. Section hidden in Create-mode (no user to grant an override to yet)', result.hiddenOnCreate);
check('1. Section visible in Edit-mode', result.visibleOnEdit);
check('1. Section renders the "Individual Permissions" title', result.sectionHasTitle);
check('18. Loading state shown synchronously before the real read resolves', result.loadingStateShown);
check('2. Empty state message shown for zero overrides', result.emptyStateShown);
check('2. Empty state count reads "0 permission"', result.emptyCountIsZero);
check('3. One override renders exactly one row', result.oneOverrideRow);
check('3. One override row shows the canonical registry title, not the raw id', result.oneOverrideTitle);
check('5. INDIVIDUAL provenance badge renders on the grant row', result.oneOverrideBadge);
check('3. Count reflects one override', result.oneOverrideCount);
check('4. Multiple overrides render one row each', result.multipleOverrideRows);
check('4. Count reflects multiple overrides', result.multipleOverrideCount);
check('5. Every override row carries the INDIVIDUAL badge', result.allRowsHaveIndividualBadge);
check('6. Picker opens', result.pickerOpens);
check('7. Picker groups permissions by module', result.pickerHasModuleGroups);
check('7. Picker groups permissions by category', result.pickerHasCategoryGroups);
check('7. Picker includes the real "Warehouse" module from the registry', result.pickerHasWarehouseModule);
check('8. system.admin is absent from the picker', result.systemAdminAbsentFromPicker);
check('9. system.users.manage is absent from the picker', result.systemUsersManageAbsentFromPicker);
check('10. An inherited (Role) permission is disabled in the picker', result.inheritedCheckboxDisabled);
check('10. An inherited permission shows as already checked (informational)', result.inheritedCheckboxChecked);
check('10. An inherited permission shows "Sudah tersedia melalui Role"', result.inheritedNoteShown);
check('11. An already-individually-granted permission is disabled (no duplicate)', result.alreadyGrantedCheckboxDisabled);
check('11. An already-individually-granted permission shows checked', result.alreadyGrantedCheckboxChecked);
check('11. An already-individually-granted permission shows "Sudah menjadi Individual Permission"', result.alreadyGrantedNoteShown);
check('sanity: a genuinely grantable permission is enabled and unchecked', result.grantableCheckboxEnabled);
check('15. Clicking a grantable permission calls the REAL store API (a toast appears from a real round-trip)', result.grantAttemptedRealWrite);
check('15. A denied grant never fabricates success in the UI', result.grantDeniedDidNotFabricateSuccess);
check('16. Clicking Cabut calls the REAL store API (a toast appears from a real round-trip)', result.revokeAttemptedRealWrite);
check('16. A denied revoke preserves existing state (never optimistically removed)', result.revokeDeniedPreservedState);
check('12. Inactive user: no "+ Tambah Permission" control', result.inactiveNoAddButton);
check('12. Inactive user: no "Cabut" controls', result.inactiveNoRevokeButton);
check('12. Inactive user: read-only notice explains why', result.inactiveReadonlyNoticeShown);
check('12. Inactive user: existing grants remain visible (view-only, not hidden)', result.inactiveStillShowsExistingGrant);
check('13. Archived user: no "+ Tambah Permission" control', result.archivedNoAddButton);
check('13. Archived user: no "Cabut" controls', result.archivedNoRevokeButton);
check('13. Archived user: read-only notice explains why', result.archivedReadonlyNoticeShown);
check('14. Active user: one Cabut button per individual grant', result.revokeButtonsForActiveUser);
check('17. IDENTITY: user A\'s override is visible while editing user A', result.userAHasItsOverride);
check('17. IDENTITY: switching to user B does NOT show user A\'s override, even before B\'s own read resolves', result.userBDoesNotInheritUserAOverrideImmediately);
check('17. IDENTITY: user B still does not have user A\'s override after B\'s own load completes', result.userBStillDoesNotHaveUserAOverrideAfterLoad);
check('17. IDENTITY: switching back from B to A correctly restores A\'s own override', result.switchingBackToUserARestoresItsOwnOverride);
check('22. STALE-RESPONSE GUARD: a grant in flight, superseded by closing+reopening the SAME user, never clobbers the fresh reload', result.staleResponseDidNotClobberFreshState);
check('19. Error state renders distinctly from the empty state', result.errorStateShown);
check('A7 STRESS: 20 repeated open/close cycles leave exactly one .ipm-panel (no accumulation)', result.stressNoDuplicatePanels);
check('A7 STRESS: repeated picker open/close leaves exactly one .ipm-picker (no duplicate listeners/nodes)', result.stressNoDuplicatePickers);
check('A7 STRESS: repeated cycles leave exactly the seeded grant count (no row accumulation)', result.stressNoDuplicateGrantRows);

// ── 21/B7. Viewport sanity across the three breakpoints the Phase 3B
//     authorization specifically named (mobile / tablet / small-desktop). ──
const VIEWPORTS = [
  { label: '390x844 (mobile)', width: 390, height: 844 },
  { label: '768x1024 (tablet)', width: 768, height: 1024 },
  { label: '1366x768 (small desktop)', width: 1366, height: 768 },
];
for (const vp of VIEWPORTS) {
  await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 1 });
  const vpResult = await page.evaluate(async () => {
    const admin = await import('/js/admin.js');
    admin.openUserFormModal('viewer-user');
    admin.__setIpmOverridesForTest('viewer-user', ['pettycash.view']);
    document.getElementById('btnOpenIpmPicker').click();
    const panel = document.getElementById('userIndividualPermissionsPanel');
    const modalBox = document.querySelector('#modalUserForm .modal-box');
    const revokeBtn = document.querySelector('.ipm-revoke-btn');
    return {
      panelVisible: panel.offsetParent !== null && panel.getClientRects().length > 0,
      noHorizontalOverflow: modalBox.scrollWidth <= modalBox.clientWidth + 2, // small AA/rounding tolerance
      controlsUsable: revokeBtn && revokeBtn.getClientRects().length > 0 && revokeBtn.getBoundingClientRect().width > 0,
    };
  });
  check(`B7. Viewport ${vp.label}: panel renders visibly`, vpResult.panelVisible);
  check(`B7. Viewport ${vp.label}: no horizontal overflow in the modal box`, vpResult.noHorizontalOverflow);
  check(`B7. Viewport ${vp.label}: grant/revoke controls remain usable (non-zero size)`, vpResult.controlsUsable);
}
await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 }); // restore default for anything after

// ── B6. Accessibility basics ──────────────────────────────────────────────
const a11yResult = await page.evaluate(async () => {
  const admin = await import('/js/admin.js');
  admin.openUserFormModal('viewer-user');
  admin.__setIpmOverridesForTest('viewer-user', ['pettycash.view']);
  document.getElementById('btnOpenIpmPicker').click();
  const out = {};
  // Every interactive control is a real, natively-focusable/keyboard-operable
  // semantic element (button/input/label+checkbox) — no custom div-as-button.
  const revokeBtn = document.querySelector('.ipm-revoke-btn');
  const addBtn = document.getElementById('btnOpenIpmPicker');
  out.revokeIsRealButton = revokeBtn?.tagName === 'BUTTON' && revokeBtn.type === 'button';
  out.addIsRealButton = addBtn?.tagName === 'BUTTON' && addBtn.type === 'button';
  out.noPositiveTabindex = ![...document.querySelectorAll('#userIndividualPermissionsPanel [tabindex]')]
    .some((el) => parseInt(el.getAttribute('tabindex'), 10) > 0); // positive tabindex breaks natural tab order
  // The search input has an explicit accessible name beyond a placeholder
  // (placeholders are not reliably read as labels by assistive tech).
  out.searchHasAriaLabel = document.getElementById('ipmPickerSearch')?.getAttribute('aria-label') === 'Cari permission';
  // Every picker checkbox is wrapped in its own <label> — the standard,
  // no-extra-ARIA way to give a checkbox an accessible name from visible text.
  const pickerCheckbox = document.querySelector('[data-ipm-grant-id]');
  out.checkboxWrappedInLabel = pickerCheckbox?.closest('label')?.tagName === 'LABEL';
  // A disabled (inherited/already-granted) row's explanatory note is inside
  // the SAME <label>, so it's included in the checkbox's accessible name —
  // no separate aria-describedby needed.
  const disabledRow = document.querySelector('[data-ipm-grant-id][disabled]');
  out.disabledRowExplainsWhy = disabledRow?.closest('label')?.textContent.includes('Sudah');
  return out;
});
check('B6. Cabut is a real, keyboard-operable <button type="button">', a11yResult.revokeIsRealButton);
check('B6. "+ Tambah Permission" is a real, keyboard-operable <button type="button">', a11yResult.addIsRealButton);
check('B6. No positive tabindex breaking natural tab order', a11yResult.noPositiveTabindex);
check('B6. Search input has an explicit aria-label (not placeholder-only)', a11yResult.searchHasAriaLabel);
check('B6. Picker checkboxes are wrapped in a <label> (native accessible name, no extra ARIA)', a11yResult.checkboxWrappedInLabel);
check('B6. A disabled picker row explains why inline (no separate aria-describedby needed)', a11yResult.disabledRowExplainsWhy);

// ── B3. Effective permission summary (Base Role + Individual = Effective) ──
const b3Result = await page.evaluate(async () => {
  const admin = await import('/js/admin.js');
  const roleField = document.getElementById('userFieldRole');
  admin.openUserFormModal('viewer-user'); // viewer's own base grant: driver.schedule.view (1)
  roleField.value = 'viewer';
  roleField.dispatchEvent(new Event('change', { bubbles: true }));
  admin.__setIpmOverridesForTest('viewer-user', ['pettycash.view', 'overtime.view']); // +2 unique
  const text = document.getElementById('userIndividualPermissionsPanel').textContent;
  return {
    showsEffectiveLine: text.includes('Efektif:'),
    mathIsConsistent: text.includes('Efektif: 3 permission (1 dari Role, 2 Individual)'),
  };
});
check('B3. Effective permission summary line renders', b3Result.showsEffectiveLine);
check('B3. Effective = Role + Individual arithmetic is consistent (1 + 2 = 3)', b3Result.mathIsConsistent);

// ── B10. Audit log wiring — source-level, mirrors admin-pin-reset-dom-check.mjs's
//     own convention for asserting wiring that a real write would be needed to
//     observe live (logAction() itself writes to Firebase; this harness never
//     authenticates for real, so the write would be denied either way — the
//     source-level check proves the CALL is wired, not a network round-trip). ──
const adminSrc = fs.readFileSync(path.join(ROOT, 'js', 'admin.js'), 'utf8');
check('B10. Grant success path calls logAction() with individual_permission_granted', /logAction\(\{[\s\S]{0,200}action: auditAction/.test(adminSrc) && adminSrc.includes("'individual_permission_granted'"));
check('B10. Revoke success path is wired to individual_permission_revoked', adminSrc.includes("'individual_permission_revoked'"));
check('B10. Audit log call happens only after a CONFIRMED store success (inside the try, after nextSet resolves)', /const nextSet = await storeFn[\s\S]{0,400}logAction/.test(adminSrc));

// ── 20. Zero fatal console errors ────────────────────────────────────────
const fatal = consoleErrors.filter((e) =>
  /SyntaxError|ReferenceError|TypeError|is not a function|Failed to (load|fetch) module|Cannot use import|Unexpected token|does not provide an export/i.test(e)
);
check('20. Zero fatal console errors (Firebase permission-denied noise is expected/informational)', fatal.length === 0);
if (fatal.length) fatal.forEach((e) => console.log('   ✗ fatal:', e));

console.log(`\n${pass} passed, ${fail} failed\n`);

await browser.close();
server.close();
process.exit(fail === 0 ? 0 : 1);
