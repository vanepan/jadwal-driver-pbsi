/* admin-write-access-gate-check.mjs — Design System Program Phase 11 (Administration)

   Regression check for Decision 1 (audit §9): konfigurasi.view's own
   catalog description promises write access ("View and manage") that it
   cannot actually grant — every /users and /settings RTDB write requires
   literal admin or the adminEquivalent claim (minted only from
   system.admin), a separate permission entirely. This verifies the
   client-side hardening added to mirror that boundary:

     - js/admin.js: openUserFormModal() goes read-only (Save hidden, fields
       disabled, Reset PIN hidden) for an ACTIVE, non-archived user when the
       session lacks real write access — not just for archived users.
     - js/admin.js: the Individual Permissions panel (ipmIsEditable()) is
       also read-only in that case, with a notice that names the REAL
       reason ("Anda hanya memiliki akses lihat"), not the pre-existing
       "Akun tidak aktif" message meant for a different case.
     - js/app.js: hasAdminWriteAccess()/buildUserCard()/renderV2AdminUsers()/
       renderV2AdminConfig() — verified via static source inspection
       (js/app.js has zero exports and would fire a real Firebase read
       against PRODUCTION if imported directly for a live DOM test — see
       [[design-system-program]] memory).

   Method for [1]: real DOM test, headless Chromium, the REAL js/admin.js
   against scripts/individual-permission-management-harness.html — same
   convention as individual-permission-management-dom-check.mjs, just with
   a NON-admin seeded session (role: 'bidang', which holds neither
   system.admin nor konfigurasi.view by default — sufficient to prove
   hasAdminWriteAccess() is false; which specific permission put a real
   session on this screen is irrelevant to this fix).

   Run: node scripts/admin-write-access-gate-check.mjs (exit 0 = pass) */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); if (detail !== undefined) console.log('     • ' + String(detail).slice(0, 300)); }
};

console.log('[Phase 11] Decision 1 — admin write-access gate (konfigurasi.view != write)\n');

/* ── [1] admin.js: real DOM test with a non-admin session ── */
console.log('[1] js/admin.js — openUserFormModal() + Individual Permissions, non-admin session');

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
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

await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
await page.evaluateOnNewDocument(() => {
  // 'bidang' holds neither system.admin nor konfigurasi.view in BASE_GRANTS
  // — hasAdminWriteAccess() must be false for this session regardless of
  // which permission a real deployment granted it via Custom Role/Role
  // Additional/Individual Override; this fix reacts to the write-access
  // check itself, not to konfigurasi.view specifically.
  localStorage.setItem('pbsi_current_user', JSON.stringify({
    id: 'bidang-test', username: 'bidang-test', name: 'Bidang Test', role: 'bidang', active: true,
  }));
});

await page.goto(`http://localhost:${port}/scripts/individual-permission-management-harness.html`, { waitUntil: 'networkidle0', timeout: 45000 });

const result = await page.evaluate(async () => {
  const usersStore = await import('/js/users.js');
  const admin = await import('/js/admin.js');

  usersStore.__seedUsersForTest([
    { username: 'active-user', displayName: 'Active User', role: 'viewer', active: true },
    { username: 'archived-user', displayName: 'Archived User', role: 'viewer', active: true, archived: true, archivedAt: '2026-01-01T00:00:00.000Z' },
  ]);
  await admin.initAdminUI();
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  // getUserPermissionOverrides() is a real one-shot RTDB read (denied, no
  // real auth session here) — waitUntil polls for the panel to leave its
  // loading state instead of a fixed sleep, matching
  // individual-permission-management-dom-check.mjs's own established
  // pattern for this exact async dependency.
  const waitUntil = async (predicate, { timeoutMs = 5000, intervalMs = 50 } = {}) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (predicate()) return true;
      await wait(intervalMs);
    }
    return predicate();
  };

  admin.openUserFormModal('active-user');
  await waitUntil(() => !!document.querySelector('.ipm-readonly-notice'));
  const activeSnapshot = {
    // Phase 11 — #modalUserFormTitle no longer exists; the canonical
    // drawer (js/components/drawer.js) carries the exact title string as
    // the panel's aria-label (and its visible text, but aria-label has no
    // icon markup to strip out).
    title: document.querySelector('.drawer')?.getAttribute('aria-label'),
    saveDisplay: document.getElementById('btnSaveUserForm')?.style.display,
    displayNameDisabled: document.getElementById('userFieldDisplayName')?.disabled,
    roleDisabled: document.getElementById('userFieldRole')?.disabled,
    resetPinDisplay: document.getElementById('btnResetPinFromEdit')?.style.display,
    ipmReadOnlyText: document.querySelector('.ipm-readonly-notice')?.textContent || null,
  };

  admin.openUserFormModal('archived-user');
  await wait(80);
  const archivedSnapshot = {
    // Phase 11 — #modalUserFormTitle no longer exists; the canonical
    // drawer (js/components/drawer.js) carries the exact title string as
    // the panel's aria-label (and its visible text, but aria-label has no
    // icon markup to strip out).
    title: document.querySelector('.drawer')?.getAttribute('aria-label'),
  };

  // Create-mode (no username) must also be locked out, not just Edit.
  admin.openUserFormModal(null);
  await wait(30);
  const createSnapshot = {
    saveDisplay: document.getElementById('btnSaveUserForm')?.style.display,
  };

  return { activeSnapshot, archivedSnapshot, createSnapshot };
});

check('active user: title is plain "Lihat User" (read-only, but NOT mislabeled "(Arsip)")',
  result.activeSnapshot.title === 'Lihat User', result.activeSnapshot.title);
check('active user: Save button hidden', result.activeSnapshot.saveDisplay === 'none');
check('active user: Nama field disabled', result.activeSnapshot.displayNameDisabled === true);
check('active user: Role field disabled', result.activeSnapshot.roleDisabled === true);
check('active user: Reset PIN button hidden', result.activeSnapshot.resetPinDisplay === 'none');
check('active user: Individual Permissions notice names the REAL reason ("akses lihat"), not "Akun tidak aktif"',
  !!result.activeSnapshot.ipmReadOnlyText && result.activeSnapshot.ipmReadOnlyText.includes('akses lihat'),
  result.activeSnapshot.ipmReadOnlyText);
check('archived user: title still correctly says "(Arsip)" (regression check — archived reason must not be swallowed by the new check)',
  result.archivedSnapshot.title === 'Lihat User (Arsip)', result.archivedSnapshot.title);
check('create mode: Save button also hidden for a non-admin session (not just Edit)',
  result.createSnapshot.saveDisplay === 'none');
check('zero fatal console errors (Firebase permission-denied noise + missing static assets in this minimal harness are expected/informational)',
  consoleErrors.filter((e) => !/Permission denied|permission_denied|Fetch Firebase|404 \(Not Found\)/.test(e)).length === 0,
  consoleErrors.join(' | '));

await browser.close();
server.close();

/* ── [2] app.js — static source verification (see file header for why) ── */
console.log('\n[2] js/app.js — static source verification');

const appJs = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');

check('hasAdminWriteAccess() helper defined (isAdmin() || can(\'system.admin\'))',
  /function hasAdminWriteAccess\(\)\s*\{\s*return isAdmin\(\)\s*\|\|\s*can\('system\.admin'\);/.test(appJs));
check('buildUserCard() computes canWrite via hasAdminWriteAccess()',
  /const canWrite = hasAdminWriteAccess\(\);/.test(appJs));
check('buildUserCard() active-user branch falls back to a view-only action when !canWrite',
  (() => {
    const idx = appJs.indexOf('const actionsHtml = canWrite');
    if (idx === -1) return false;
    const slice = appJs.slice(idx, idx + 600);
    return /: `<button class="v2-user-btn v2-user-btn--edit"/.test(slice) && /data-user-view=/.test(slice);
  })());
check('renderV2AdminUsers() toggles the "Tambah User" button via hasAdminWriteAccess()',
  /const canWriteUsers = hasAdminWriteAccess\(\);\s*\n\s*if \(addUserBtn\) addUserBtn\.style\.display = canWriteUsers \? '' : 'none';/.test(appJs));
check('renderV2AdminUsers() toggles the read-only banner',
  /if \(readOnlyNotice\) readOnlyNotice\.style\.display = canWriteUsers \? 'none' : '';/.test(appJs));
check('v2AdminUsersReadOnlyNotice banner element exists in the Users template',
  /id="v2AdminUsersReadOnlyNotice" class="v2-admin-readonly-banner"/.test(appJs));
check('renderV2AdminConfig() computes canWriteConfig via hasAdminWriteAccess()',
  /const canWriteConfig = hasAdminWriteAccess\(\);/.test(appJs));
check('v2AdminConfigReadOnlyNotice banner element exists in the Settings template',
  /id="v2AdminConfigReadOnlyNotice" class="v2-admin-readonly-banner"/.test(appJs));
check('renderV2AdminConfig() disables all 4 Save buttons when !canWriteConfig',
  /\['cfgSaveOps', 'cfgSaveNotif', 'cfgSaveSystem', 'cfgSaveTelegram'\]\.forEach/.test(appJs));

/* ── [3] platform.css — banner styling exists ── */
console.log('\n[3] platform.css — .v2-admin-readonly-banner defined');
const platformCss = fs.readFileSync(path.join(ROOT, 'platform.css'), 'utf8');
check('.v2-admin-readonly-banner rule exists', /\.v2-admin-readonly-banner\s*\{/.test(platformCss));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
