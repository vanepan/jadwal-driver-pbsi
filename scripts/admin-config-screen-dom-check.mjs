/* admin-config-screen-dom-check.mjs — Design System Program Phase 11 (Administration)

   Test-coverage debt item from the Phase 11 Administration audit: js/app.js#
   renderV2AdminConfig() (the "Konfigurasi Global" / Settings V2 screen) had
   only ever been verified via STATIC source regex (admin-write-access-gate-
   check.mjs, [2]) — never actually rendered in a browser. This is the real
   DOM test admin-write-access-gate-check.mjs's own header names as missing.

   Method: js/app.js has zero exports (see [[design-system-program]] memory
   — importing it directly would fire a real Firebase read against
   PRODUCTION), so this drives the REAL user-facing path instead: a real
   boot of index.html, then real clicks through the new 7-domain shell
   (js/shell/domain-shell.js) — Control domain -> Settings tab — exactly
   what a real admin/non-admin session would do.

   The non-admin session cannot use any static System Role: per js/config/
   role-permissions.js's BASE_GRANTS, 'admin' is the ONLY System Role that
   holds konfigurasi.view at all — every other role would fail the Control
   domain's own module-visibility gate before ever reaching the Settings
   screen, which would test the wrong thing (module gating, not the write-
   access gate this file exists to cover). This is exactly audit finding
   Settings D1's scenario in miniature: konfigurasi.view granted WITHOUT
   admin/system.admin, reachable today only via a Custom Role, Role
   Additional, or Individual Override grant. A Custom Role is what's seeded
   here (custom-roles-store.js#__seedCustomRolesForTest(), same convention
   as role-management-edit-dom-check.mjs) — permissions: ['konfigurasi.view']
   only, deliberately excluding system.admin, so hasAdminWriteAccess() is
   false while the screen itself is genuinely reachable.

   DISCOVERY made while writing this test: js/auth.js's real
   onAuthStateChanged listener (_hydrateFromFirebaseUser) wipes ANY
   localStorage-only session the instant it settles with no real Firebase
   Auth user (`if (!user) { localStorage.removeItem(SESSION_KEY); ... }`) —
   there is no real Firebase Auth here (see [[firebase-prod-in-local-testing]]),
   so a fake session set only via evaluateOnNewDocument is gone by the time
   the domain shell first renders (getCurrentUser() resolves null, only the
   hardcoded-visible 'today'/Home domain shows). Every earlier Phase 11
   real-boot test happened to be immune (they never depended on a
   permission-gated render), so this is the first place it surfaced. Fixed
   here by re-seeding localStorage AFTER that auth-settle wipe has already
   fired once, then calling domain-shell.js's own exported
   refreshDomainShell(true) to force a fresh, now-correctly-gated render —
   no monkey-patching of Firebase itself.

   Run: node scripts/admin-config-screen-dom-check.mjs (exit 0 = pass) */

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

console.log('[Phase 11] renderV2AdminConfig() — real DOM render, Control -> Settings\n');

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  const content = fs.readFileSync(file);
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Content-Length': content.length });
  res.end(content);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const errors = [];
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });

/**
 * Real boot as `role` (a System Role id, e.g. 'admin'), or as a seeded
 * Custom Role when `customRole` is given — real clicks Control -> Settings,
 * snapshot the screen.
 * @param {string} role
 * @param {string} username
 * @param {{id: string, permissions: string[]}} [customRole]
 */
async function loadConfigScreenAs(role, username, customRole) {
  const label = customRole ? customRole.id : role;
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(`[${label}] pageerror: ` + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${label}] console.error: ` + m.text()); });
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  const sessionRole = customRole ? customRole.id : role;
  await page.evaluateOnNewDocument((u, r) => {
    localStorage.setItem('pbsi_current_user', JSON.stringify({ id: u, username: u, name: u, role: r, active: true }));
  }, username, sessionRole);
  await page.goto(`http://localhost:${port}/index.html`, { waitUntil: 'networkidle0', timeout: 45000 });

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const waitUntil = async (predicate, { timeoutMs = 5000, intervalMs = 50 } = {}) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (await page.evaluate(predicate)) return true;
      await wait(intervalMs);
    }
    return page.evaluate(predicate);
  };

  // The real (no-op-here) Firebase Auth listener has already wiped the
  // localStorage-only session by now (see file header) — restore it, then
  // force the domain shell to recompute visibility from the restored
  // session instead of reloading the page.
  await wait(200);
  await page.evaluate(async (u, r, cr) => {
    localStorage.setItem('pbsi_current_user', JSON.stringify({ id: u, username: u, name: u, role: r, active: true }));
    if (cr) {
      const rolesStore = await import('/js/role-management/custom-roles-store.js');
      rolesStore.__seedCustomRolesForTest([{
        id: cr.id, name: cr.id, type: 'custom', permissions: cr.permissions,
        archived: false, clonedFrom: null,
        createdAt: '2026-08-08T00:00:00.000Z', updatedAt: '2026-08-08T00:00:00.000Z',
      }]);
    }
    const shell = await import('/js/shell/domain-shell.js');
    shell.refreshDomainShell(true);
  }, username, sessionRole, customRole || null);

  // In-page .click() rather than page.click(): a stale .login-screen
  // overlay is never dismissed (real dismissal only happens via the real
  // login handshake's notifyAuthChange(), which this harness bypasses
  // entirely) and sits on top of the whole viewport, intercepting
  // Puppeteer's coordinate-based click — confirmed via elementFromPoint()
  // while debugging this test. The overlay is cosmetic-only dead DOM in
  // this scenario; dispatching the click directly on the element sidesteps
  // it without needing to touch the overlay itself.
  const clickIn = (sel) => page.evaluate((s) => document.querySelector(s)?.click(), sel);

  await waitUntil(() => !!document.querySelector('[data-domain="control"]'));
  await clickIn('[data-domain="control"]');
  await waitUntil(() => !!document.querySelector('[data-top="settings"]'));
  await clickIn('[data-top="settings"]');
  await waitUntil(() => !!document.getElementById('v2AdminConfigReadOnlyNotice'));
  await wait(50);

  const snapshot = await page.evaluate(() => {
    const btnIds = ['cfgSaveOps', 'cfgSaveNotif', 'cfgSaveSystem', 'cfgSaveTelegram'];
    return {
      containerHasContent: (document.getElementById('v2AdminSectionConfig')?.children.length || 0) > 0,
      bannerDisplay: document.getElementById('v2AdminConfigReadOnlyNotice')?.style.display,
      bannerText: document.getElementById('v2AdminConfigReadOnlyNotice')?.textContent?.trim() || null,
      saveButtonsDisabled: btnIds.map((id) => document.getElementById(id)?.disabled),
      workStartFieldExists: !!document.getElementById('cfgWorkStart'),
      workStartFieldDisabled: document.getElementById('cfgWorkStart')?.disabled,
    };
  });
  await page.close();
  return snapshot;
}

const adminSnapshot = await loadConfigScreenAs('admin', 'admin-test');
const customSnapshot = await loadConfigScreenAs(null, 'konf-viewer-test', { id: 'konf_viewer_role', permissions: ['konfigurasi.view'] });

console.log('[1] Admin session (real write access)');
check('Settings screen actually rendered (container has content)', adminSnapshot.containerHasContent);
check('read-only banner is hidden for an admin session', adminSnapshot.bannerDisplay === 'none', adminSnapshot.bannerDisplay);
check('all 4 Save buttons are enabled for an admin session', adminSnapshot.saveButtonsDisabled.every((d) => d === false), JSON.stringify(adminSnapshot.saveButtonsDisabled));
check('an input field (cfgWorkStart) is not disabled for an admin session', adminSnapshot.workStartFieldExists && adminSnapshot.workStartFieldDisabled === false);

console.log('\n[2] Non-admin session (Custom Role: konfigurasi.view only, no system.admin — audit finding Settings D1)');
check('Settings screen still renders (read-only, not blocked/blank)', customSnapshot.containerHasContent);
check('read-only banner is VISIBLE for a konfigurasi.view-only session', customSnapshot.bannerDisplay === '', customSnapshot.bannerDisplay);
check('the banner names the real reason ("akses lihat")', !!customSnapshot.bannerText && customSnapshot.bannerText.includes('akses lihat'), customSnapshot.bannerText);
check('all 4 Save buttons are DISABLED for a konfigurasi.view-only session', customSnapshot.saveButtonsDisabled.every((d) => d === true), JSON.stringify(customSnapshot.saveButtonsDisabled));

const fatal = errors.filter((e) =>
  /SyntaxError|ReferenceError|TypeError|is not a function|Failed to (load|fetch) module|Cannot use import|Unexpected token|does not provide an export/i.test(e)
);
check('zero fatal console errors across both sessions (Firebase permission-denied noise is expected/informational)', fatal.length === 0, fatal.join(' | '));

await browser.close();
server.close();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
