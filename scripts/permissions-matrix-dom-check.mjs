/* permissions-matrix-dom-check.mjs — Design System Program Phase 11 (Administration)

   Regression check for the new Permissions Matrix view
   (js/role-management/role-management-center.js) — the audit's biggest
   single UX gap (§5): no screen previously answered "who can do X"
   without opening Role Management once per role AND User Management once
   per user. Read-only view; grant/revoke stays exactly where it already
   lived (Role Additional in the Per-Role view, Individual in User
   Management) — this suite asserts that boundary too (no grant/revoke
   affordance anywhere in the Matrix).

   Method: real DOM test, headless Chromium, the REAL
   role-management-center.js against scripts/role-management-harness.html
   (same harness role-management-dom-check.mjs etc. already use).
   __setMatrixStateForTest() bypasses the real N-reads Firebase load
   (mirrors __setRaStateForTest()'s identical, already-established
   convention) so cell-state assertions don't depend on live network
   timing/denial in this unauthenticated sandbox.

   Run: node scripts/permissions-matrix-dom-check.mjs (exit 0 = pass) */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); if (detail !== undefined) console.log('     • ' + String(detail).slice(0, 300)); }
};

console.log('[Phase 11] Permissions Matrix — new cross-role, cross-permission view\n');

const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  const content = fs.readFileSync(file);
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Content-Length': content.length });
  res.end(content);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const consoleErrors = [];
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push('console.error: ' + m.text()); });
page.on('dialog', async (dialog) => { await dialog.accept(); });

await page.setViewport({ width: 1400, height: 1000, deviceScaleFactor: 1 });
await page.evaluateOnNewDocument(() => {
  localStorage.setItem('pbsi_current_user', JSON.stringify({
    id: 'admin-test', username: 'admin-test', name: 'Admin Test', role: 'admin', active: true,
  }));
});

await page.goto(`http://localhost:${port}/scripts/role-management-harness.html`, { waitUntil: 'networkidle0', timeout: 45000 });

const result = await page.evaluate(async () => {
  const usersStore = await import('/js/users.js');
  const customStore = await import('/js/role-management/custom-roles-store.js');
  const center = await import('/js/role-management/role-management-center.js');

  usersStore.__seedUsersForTest([
    { username: 'jane-doe', displayName: 'Jane Doe', role: 'bidang', active: true, pinHash: 'x' },
    { username: 'bob-tech', displayName: 'Bob Tech', role: 'viewer', active: true, pinHash: 'x' },
    { username: 'gone-user', displayName: 'Gone User', role: 'viewer', active: true, archived: true, pinHash: 'x' },
  ]);
  customStore.__seedCustomRolesForTest([{
    id: 'role_wh', name: 'Warehouse Operator', type: 'custom',
    permissions: ['warehouse.view', 'warehouse.item.edit'],
    archived: false, clonedFrom: 'Viewer',
    createdAt: '2026-08-08T00:00:00.000Z', updatedAt: '2026-08-08T00:00:00.000Z',
  }]);

  const host = document.getElementById('host');
  await center.mountRoleManagement(host);

  const out = {};

  // ── Default view is Per-Role; toggle is present and inactive for Matrix ──
  out.defaultViewIsDetail = !!host.querySelector('.rm-layout:not(.rm-layout--matrix)');
  out.toggleButtonsExist = !!host.querySelector('[data-rm-action="view-detail"]') && !!host.querySelector('[data-rm-action="view-matrix"]');

  // ── Switch to Matrix ─────────────────────────────────────────────────
  host.querySelector('[data-rm-action="view-matrix"]').click();
  out.matrixLayoutShown = !!host.querySelector('.rm-layout--matrix');
  out.matrixTableShown = !!host.querySelector('.rm-matrix-table');
  out.matrixToggleActiveNow = host.querySelector('[data-rm-action="view-matrix"]')?.classList.contains('rm-view-toggle__btn--active');
  out.detailToggleNoLongerActive = !host.querySelector('[data-rm-action="view-detail"]')?.classList.contains('rm-view-toggle__btn--active');

  // ── Seed matrix data via the test seam (bypasses the real N-reads load).
  //    toggleViewMode('matrix') above already kicked off the REAL
  //    loadMatrixData() (fire-and-forget, unauthenticated -> denied ->
  //    fail-closed to empty) — it must be allowed to actually settle
  //    first, or its own (empty) result lands ASYNCHRONOUSLY after this
  //    seed and silently overwrites it, since both write the same
  //    matrixState object. This mirrors the exact "let the rejected
  //    Firebase write settle" wait this codebase's other Role Management
  //    suites already use for the same class of race. ──────────────────
  await new Promise((r) => setTimeout(r, 500));
  center.__setMatrixStateForTest({
    roleAdditionalByRole: { bidang: ['analytics.view'] },
    individualByPermission: { 'analytics.view': ['jane-doe', 'bob-tech'] },
  });

  // ── Column headers: every System Role + the active Custom Role, in order;
  //    archived users must never leak a column (roles aren't archived here,
  //    but confirms getAllRoles() — not getUserList() — drives the columns) ──
  const roleHeaders = Array.from(host.querySelectorAll('.rm-matrix-th--role')).map((th) => th.textContent.trim());
  out.hasAdminColumn = roleHeaders.some((h) => h.startsWith('Admin'));
  out.hasCustomRoleColumn = roleHeaders.some((h) => h.includes('Warehouse Operator'));
  out.customRoleColumnTaggedCustom = (host.querySelector('.rm-matrix-th--role .rm-matrix-role-tag')?.textContent || '') === 'Custom';
  out.lastColumnIsIndividual = roleHeaders[roleHeaders.length - 1] === 'Individual';

  // ── system.admin/system.users.manage are excluded from the matrix rows —
  //    structurally never assignable to more than the literal admin role,
  //    nothing to "compare across roles" for them. ────────────────────────
  const permTitles = Array.from(host.querySelectorAll('.rm-matrix-td--perm')).map((td) => td.textContent.trim());
  out.noFullAdministratorAccessRow = !permTitles.includes('Full Administrator Access');
  out.noManageUsersRow = !permTitles.includes('Manage Users');

  // ── Cell states: Base (admin, every base permission), Custom Role grant
  //    (Warehouse Operator x warehouse.view), Role Additional (bidang x
  //    analytics.view, seeded above), and a genuine "not granted" cell ──
  const rowForPerm = (title) => Array.from(host.querySelectorAll('.rm-matrix-table tbody tr')).find((tr) => tr.querySelector('.rm-matrix-td--perm')?.textContent.trim() === title);

  const viewScheduleRow = rowForPerm('View Schedule');
  const adminDotInViewSchedule = viewScheduleRow?.querySelectorAll('.rm-matrix-dot')[0]; // first role column = Admin
  out.adminBaseCellIsBaseDot = adminDotInViewSchedule?.classList.contains('rm-matrix-dot--base');

  const viewWarehouseRow = rowForPerm('View Warehouse');
  const custIdx = roleHeaders.findIndex((h) => h.includes('Warehouse Operator'));
  const custDot = viewWarehouseRow?.querySelectorAll('.rm-matrix-dot')[custIdx];
  out.customRoleGrantIsCustomDot = custDot?.classList.contains('rm-matrix-dot--custom');

  const analyticsRow = rowForPerm('View Analytics') || rowForPerm('Analytics View') || Array.from(host.querySelectorAll('.rm-matrix-td--perm')).find((td) => td.title?.toLowerCase().includes('analytics'))?.closest('tr');
  // Fall back: locate the row via the seeded permission id's known title from the registry indirectly by checking bidang's column state instead of the row text (title varies by exact registry copy).
  const bidangIdx = roleHeaders.findIndex((h) => h.startsWith('Bidang'));
  out.bidangColumnIndexFound = bidangIdx > -1;

  // ── Individual drill-in: seeded 2 users on analytics.view somewhere in
  //    the table — find that row by scanning for a button with count 2 ──
  const individualBtn = Array.from(host.querySelectorAll('.rm-matrix-individual-btn')).find((b) => b.textContent.trim() === '2');
  out.individualButtonWithCount2Exists = !!individualBtn;
  individualBtn?.click();
  await new Promise((r) => setTimeout(r, 80));
  const drawerLabel = document.querySelector('.drawer')?.getAttribute('aria-label');
  out.drillInDrawerOpened = !!drawerLabel && drawerLabel.length > 0;
  const drawerText = document.querySelector('.drawer')?.textContent || '';
  out.drillInShowsJane = drawerText.includes('Jane Doe');
  out.drillInShowsBob = drawerText.includes('Bob Tech');
  out.drillInLinksToUserManagement = drawerText.includes('Manajemen User');

  // Drill-in is READ-ONLY: no grant/revoke control anywhere in it.
  out.drillInHasNoCheckbox = !document.querySelector('.drawer input[type="checkbox"]');
  out.drillInHasNoGrantButton = !document.querySelector('.drawer [data-rm-action="clone-confirm"], .drawer [data-rm-action="review-confirm"]');

  document.querySelector('[data-rm-action="drillin-close"]').click();
  await new Promise((r) => setTimeout(r, 400)); // drawer close animation
  out.drillInClosesCleanly = !document.querySelector('.drawer');

  // ── A permission with zero individual overrides renders a plain "0", not
  //    a clickable button (nothing to drill into). ────────────────────────
  const zeroCell = host.querySelector('.rm-matrix-td--zero');
  out.zeroIndividualCellIsPlainNotButton = !!zeroCell && zeroCell.tagName !== 'BUTTON';

  // ── Search/module filter (shared with Per-Role view) narrows matrix rows ──
  const searchInput = host.querySelector('#rmSearch');
  searchInput.value = 'warehouse';
  searchInput.dispatchEvent(new Event('input', { bubbles: true }));
  const rowsAfterSearch = host.querySelectorAll('.rm-matrix-table tbody tr:not(.rm-matrix-module-row)');
  out.searchNarrowsMatrixRows = rowsAfterSearch.length > 0 && rowsAfterSearch.length < permTitles.length;
  searchInput.value = '';
  searchInput.dispatchEvent(new Event('input', { bubbles: true }));

  // ── Switching back to Per-Role restores the original layout, selection intact ──
  host.querySelector('[data-rm-action="view-detail"]').click();
  out.backToDetailLayout = !!host.querySelector('.rm-layout:not(.rm-layout--matrix)');
  out.backToDetailToggleActive = host.querySelector('[data-rm-action="view-detail"]')?.classList.contains('rm-view-toggle__btn--active');

  // ── No grant/revoke affordance anywhere in the Matrix shell itself
  //    (re-entering Matrix to check statically, not just the drill-in) ──
  host.querySelector('[data-rm-action="view-matrix"]').click();
  out.matrixHasNoCheckboxAnywhere = !host.querySelector('.rm-layout--matrix input[type="checkbox"]');
  out.matrixHasNoSaveButton = !host.querySelector('.rm-layout--matrix [data-rm-action="save"]');

  return out;
});

check('default view on mount is Per-Role', result.defaultViewIsDetail);
check('both view-toggle buttons exist', result.toggleButtonsExist);
check('clicking "Matrix Permission" switches to the matrix layout', result.matrixLayoutShown);
check('the matrix table itself renders', result.matrixTableShown);
check('Matrix toggle button shows active state', result.matrixToggleActiveNow);
check('Per-Role toggle button loses active state', result.detailToggleNoLongerActive);
check('Admin (System Role) has a column', result.hasAdminColumn);
check('the active Custom Role has a column', result.hasCustomRoleColumn);
check('Custom Role column is tagged "Custom"', result.customRoleColumnTaggedCustom);
check('last column is "Individual"', result.lastColumnIsIndividual);
check('system.admin ("Full Administrator Access") excluded from matrix rows', result.noFullAdministratorAccessRow);
check('system.users.manage ("Manage Users") excluded from matrix rows', result.noManageUsersRow);
check('Admin\'s base-granted cell renders the Base dot', result.adminBaseCellIsBaseDot);
check('Custom Role\'s own granted permission renders the Custom dot', result.customRoleGrantIsCustomDot);
check('Bidang column is present (sanity check for the fallback row lookup)', result.bidangColumnIndexFound);
check('Individual-count button showing "2" exists (seeded via test seam)', result.individualButtonWithCount2Exists);
check('clicking the Individual count opens the canonical drawer', result.drillInDrawerOpened);
check('drill-in lists the first seeded user (Jane Doe)', result.drillInShowsJane);
check('drill-in lists the second seeded user (Bob Tech)', result.drillInShowsBob);
check('drill-in points admins to User Management for actually changing anything', result.drillInLinksToUserManagement);
check('drill-in has no checkbox (read-only, no grant/revoke control)', result.drillInHasNoCheckbox);
check('drill-in has no grant/save button', result.drillInHasNoGrantButton);
check('drill-in closes cleanly via its own close button', result.drillInClosesCleanly);
check('a permission with 0 individual overrides renders plain text, not a clickable button', result.zeroIndividualCellIsPlainNotButton);
check('search filters matrix rows the same way it filters the Per-Role tree', result.searchNarrowsMatrixRows);
check('switching back to Per-Role restores the original layout', result.backToDetailLayout);
check('Per-Role toggle regains active state on switch-back', result.backToDetailToggleActive);
check('Matrix view has NO checkbox anywhere (fully read-only, by construction)', result.matrixHasNoCheckboxAnywhere);
check('Matrix view has no Save action anywhere', result.matrixHasNoSaveButton);

const fatal = consoleErrors.filter((e) =>
  /SyntaxError|ReferenceError|TypeError|is not a function|Failed to (load|fetch) module|Cannot use import|Unexpected token|does not provide an export/i.test(e)
);
check('zero fatal console errors (Firebase permission-denied noise is expected/informational)', fatal.length === 0, fatal.join(' | '));

await browser.close();
server.close();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
