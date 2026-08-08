/* role-management-detail-dom-check.mjs — Role Assignment & Dependency (v1.30.3)
   DOM test. Serves the static app, loads the REAL role-management-center.js
   in headless Chromium against the EXISTING scripts/role-management-
   harness.html (unchanged — it already loads platform.css and provides a
   bare #host to mount into). Seeds a fake admin session in localStorage,
   same convention as the v1.30.1/v1.30.2 DOM checks — never real Firebase
   auth (see those files' own comments for why).

   Seeds two Custom Roles directly into the store's local cache via the
   test-only __seedCustomRolesForTest() export (bypasses Firebase): one
   cloned from Admin (clonedFromId set — the new v1.30.3 lineage link) and
   one created from scratch (no lineage at all), so the Detail Panel's
   Relationship Info can be checked in both states.

   Covers: the panel starts collapsed and toggles open/closed; a role with
   no lineage renders a real zero-state placeholder (not blank/"undefined");
   a role with a resolvable clonedFromId shows its Derived-From label; the
   System Role (admin) with a live derived Custom Role shows it under
   Derived Roles; the archive (Delete) flow for a 0-usage Custom Role still
   behaves exactly as it did pre-Phase-4 (reaches the same graceful-
   rejection path as the v1.30.2 DOM check — this sandboxed environment has
   no real Firebase admin auth, so a persisted write can't succeed here;
   what this proves is that role-archive-guard.js's `allowed:true` for
   0-usage roles does not introduce a new blocking step); light+dark
   render with zero fatal console errors.
   Run: node scripts/role-management-detail-dom-check.mjs (exit 0 = pass) */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(ROOT, 'scratch');
fs.mkdirSync(SHOTS, { recursive: true });
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

  store.__seedCustomRolesForTest([
    {
      id: 'role_from_admin', name: 'From Admin Clone',
      permissions: ['system.admin'], archived: false,
      clonedFrom: 'Admin', clonedFromId: 'admin',
      createdAt: '2026-08-08T00:00:00.000Z', updatedAt: '2026-08-08T00:00:00.000Z',
    },
    {
      id: 'role_unlinked', name: 'From Scratch',
      permissions: ['warehouse.view'], archived: false,
      clonedFrom: null, clonedFromId: null,
      createdAt: '2026-08-08T00:00:00.000Z', updatedAt: '2026-08-08T00:00:00.000Z',
    },
  ]);

  const out = {};

  // ── admin selected by default: panel starts collapsed ──────────────
  out.toggleExistsBeforeExpand = !!host.querySelector('[data-rm-detail-toggle]');
  out.collapsedInitially = host.querySelector('[data-rm-detail-toggle]').getAttribute('aria-expanded') === 'false';
  out.gridHiddenInitially = !host.querySelector('.rm-detail-grid');

  // ── expand it ────────────────────────────────────────────────────
  host.querySelector('[data-rm-detail-toggle]').click();
  out.expandedAfterToggle = host.querySelector('[data-rm-detail-toggle]').getAttribute('aria-expanded') === 'true';
  out.gridShownAfterExpand = !!host.querySelector('.rm-detail-grid');

  // admin now has a live derived Custom Role (role_from_admin) — should
  // show up under Derived Roles, not a zero-state.
  out.adminDerivedRolesText = host.querySelector('.rm-detail-card .rm-detail-list')?.textContent || '';

  // admin's Usage Summary is genuinely zero (no User Management yet) —
  // must render the real empty-state helper, not blank/"undefined".
  const usageCard = Array.from(host.querySelectorAll('.rm-detail-card')).find((c) => c.textContent.includes('Assigned Users'));
  out.usageCardHtml = usageCard ? usageCard.innerHTML : '';
  out.usageShowsEmptyState = out.usageCardHtml.includes('wsp-empty');
  out.usageHasNoLiteralUndefined = !out.usageCardHtml.includes('undefined');

  // Future Assignment placeholder is present and visibly disabled/greyed.
  out.futureAssignmentCardPresent = !!host.querySelector('.rm-detail-card--future');
  out.futureAssignmentText = host.querySelector('.rm-detail-card--future')?.textContent || '';

  // Collapse it again.
  host.querySelector('[data-rm-detail-toggle]').click();
  out.collapsedAfterSecondToggle = host.querySelector('[data-rm-detail-toggle]').getAttribute('aria-expanded') === 'false';
  out.gridHiddenAfterCollapse = !host.querySelector('.rm-detail-grid');

  // ── role_from_admin: resolved Derived From ──────────────────────────
  // The detail toggle is a single global disclosure, not per-role — it
  // was left collapsed by the admin-flow's second toggle click above, so
  // expand it once here; switching selectedRoleId itself never touches it.
  host.querySelector('[data-rm-role="role_from_admin"]').click();
  host.querySelector('[data-rm-detail-toggle]').click();
  const relCardCloned = Array.from(host.querySelectorAll('.rm-detail-card')).find((c) => c.textContent.includes('Diturunkan Dari'));
  out.clonedDerivedFromText = relCardCloned ? relCardCloned.textContent : '';

  // ── role_unlinked: no lineage -> real zero-state, not blank ─────────
  // Panel is already expanded from the step above and stays expanded
  // across this role switch (it's a global toggle) — no click needed.
  host.querySelector('[data-rm-role="role_unlinked"]').click();
  const relCardUnlinked = Array.from(host.querySelectorAll('.rm-detail-card')).find((c) => c.textContent.includes('Diturunkan Dari'));
  out.unlinkedRelCardHtml = relCardUnlinked ? relCardUnlinked.innerHTML : '';
  out.unlinkedShowsEmptyState = out.unlinkedRelCardHtml.includes('wsp-empty');
  out.unlinkedHasNoLiteralUndefined = !out.unlinkedRelCardHtml.includes('undefined');

  // ── Archiving a 0-usage Custom Role: unchanged from pre-Phase-4 ─────
  // (no real Firebase admin auth in this sandbox, so the write itself is
  // rejected — this proves the archive guard did not add a NEW blocking
  // step for the ordinary 0-usage case, matching the v1.30.2 DOM check's
  // own "graceful rejection" pattern.)
  out.errorShownBeforeDeleteClick = !!host.querySelector('.rm-error');
  host.querySelector('[data-rm-action="delete"]').click();
  await new Promise((r) => setTimeout(r, 800));
  out.errorShownAfterRejectedDelete = !!host.querySelector('.rm-error');
  out.errorTextAfterDelete = host.querySelector('.rm-error')?.textContent || '';

  return out;
});

check('detail toggle renders for the default-selected role', result.toggleExistsBeforeExpand);
check('detail panel starts collapsed', result.collapsedInitially);
check('detail grid is not in the DOM while collapsed', result.gridHiddenInitially);
check('clicking the toggle expands the panel', result.expandedAfterToggle);
check('detail grid renders once expanded', result.gridShownAfterExpand);
check('admin\'s live derived Custom Role (role_from_admin) appears under Derived Roles', result.adminDerivedRolesText.includes('From Admin Clone'));
check('Usage Summary renders the real empty-state helper for a genuine zero (not blank)', result.usageShowsEmptyState);
check('Usage Summary never renders a literal "undefined"', result.usageHasNoLiteralUndefined);
check('the Future Assignment placeholder card is present', result.futureAssignmentCardPresent);
check('the Future Assignment placeholder explains it awaits User Management', result.futureAssignmentText.includes('Manajemen User'));
check('clicking the toggle again collapses the panel', result.collapsedAfterSecondToggle);
check('detail grid is removed from the DOM once collapsed', result.gridHiddenAfterCollapse);
check('a role cloned via clonedFromId shows its resolved Derived-From label', result.clonedDerivedFromText.includes('Admin'));
check('an unlinked role\'s Derived From renders the real empty-state helper (not blank)', result.unlinkedShowsEmptyState);
check('an unlinked role\'s Derived From never renders a literal "undefined"', result.unlinkedHasNoLiteralUndefined);
check('no error is shown before the Delete click', !result.errorShownBeforeDeleteClick);
check('archiving a 0-usage Custom Role reaches the same graceful (unauthenticated-write) path as pre-Phase-4, not a new block', result.errorShownAfterRejectedDelete);
check('the post-delete error is the existing Firebase-rejection message, not an archive-guard block', !result.errorTextAfterDelete.toLowerCase().includes('dependensi') && !result.errorTextAfterDelete.toLowerCase().includes('digunakan oleh'));

await page.screenshot({ path: path.join(SHOTS, 'role-management-detail-light.png') });
await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
await page.screenshot({ path: path.join(SHOTS, 'role-management-detail-dark.png') });

const fatal = consoleErrors.filter((e) =>
  /SyntaxError|ReferenceError|TypeError|is not a function|Failed to (load|fetch) module|Cannot use import|Unexpected token|does not provide an export/i.test(e)
);
check('zero fatal console errors (Firebase permission-denied noise is expected/informational)', fatal.length === 0);
if (fatal.length) fatal.forEach((e) => console.log('   ✗ fatal:', e));

console.log(`\n${pass} passed, ${fail} failed\n`);

await browser.close();
server.close();
process.exit(fail === 0 ? 0 : 1);
