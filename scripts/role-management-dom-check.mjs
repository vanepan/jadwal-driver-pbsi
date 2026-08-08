/* role-management-dom-check.mjs — Role Management, Read-Only (v1.30.1)
   DOM test. Serves the static app, loads the REAL role-management-center.js
   in headless Chromium against scripts/role-management-harness.html (no
   app.js boot — see that file's own comment), seeds a fake admin session in
   localStorage BEFORE mounting (auth.js's getCurrentUser()/isAdmin() read
   localStorage synchronously — no real Firebase auth is needed for that),
   mounts into #host, and asserts: all 9 roles render in the role list;
   selecting a different role changes which checkboxes are checked; typing
   in search narrows visible permission rows; the module filter narrows to
   one module; summary stat values match hand-computed expectations for the
   admin role; every checkbox carries the disabled attribute; light + dark
   render with zero fatal console errors. Captures light/dark screenshots.
   Run: node scripts/role-management-dom-check.mjs (exit 0 = pass) */

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
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  consoleErrors.push('console.error: ' + m.text());
});

await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });

// Seed a fake admin session before any app code runs, so isAdmin()/
// getCurrentUser() (js/auth.js, localStorage-synchronous) resolve without
// needing real Firebase auth.
await page.evaluateOnNewDocument(() => {
  localStorage.setItem('pbsi_current_user', JSON.stringify({
    id: 'admin-test', username: 'admin-test', name: 'Admin Test', role: 'admin', active: true,
  }));
});

await page.goto(`http://localhost:${port}/scripts/role-management-harness.html`, { waitUntil: 'networkidle0', timeout: 45000 });

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };

const result = await page.evaluate(async () => {
  const mod = await import('/js/role-management/role-management-center.js');
  const host = document.getElementById('host');
  await mod.mountRoleManagement(host);

  const roleButtons = Array.from(host.querySelectorAll('[data-rm-role]'));
  const roleCount = roleButtons.length;
  const totalCheckboxesInitial = host.querySelectorAll('.rm-permission-row input[type="checkbox"]').length;
  const allDisabled = Array.from(host.querySelectorAll('.rm-permission-row input[type="checkbox"]')).every((cb) => cb.disabled);
  const adminCheckedInitial = host.querySelectorAll('.rm-permission-row input[type="checkbox"]:checked').length;
  const statValuesAdmin = Array.from(host.querySelectorAll('.v2-dq-stat-value')).map((el) => el.textContent);

  // Switch to 'viewer' (1 granted permission) via the real click handler.
  const viewerBtn = roleButtons.find((b) => b.dataset.rmRole === 'viewer');
  viewerBtn.click();
  const viewerCheckedAfterSwitch = host.querySelectorAll('.rm-permission-row input[type="checkbox"]:checked').length;
  const viewerActiveClass = host.querySelector('[data-rm-role="viewer"]').classList.contains('rm-role-item--active');

  // Search narrows visible rows.
  const searchInput = host.querySelector('#rmSearch');
  searchInput.value = 'warehouse';
  searchInput.dispatchEvent(new Event('input', { bubbles: true }));
  const rowsAfterSearch = host.querySelectorAll('.rm-permission-row').length;

  // Clear search, then module filter narrows to one module.
  searchInput.value = '';
  searchInput.dispatchEvent(new Event('input', { bubbles: true }));
  const moduleFilter = host.querySelector('#rmModuleFilter');
  moduleFilter.value = 'Warehouse';
  moduleFilter.dispatchEvent(new Event('change', { bubbles: true }));
  const rowsAfterModuleFilter = host.querySelectorAll('.rm-permission-row').length;
  const statValuesFiltered = Array.from(host.querySelectorAll('.v2-dq-stat-value')).map((el) => el.textContent);

  // Group collapse toggle. render() replaces root.innerHTML on every state
  // change, so the toggle button (and its sibling) must be re-queried after
  // the click — the pre-click element reference is detached once render()
  // rebuilds the tree, and reading through it would just echo the stale
  // pre-click state back.
  const bodyBeforeCollapse = host.querySelector('[data-rm-group-toggle]').nextElementSibling.style.display;
  host.querySelector('[data-rm-group-toggle]').click();
  const bodyAfterCollapse = host.querySelector('[data-rm-group-toggle]').nextElementSibling.style.display;

  return {
    roleCount, totalCheckboxesInitial, allDisabled, adminCheckedInitial, statValuesAdmin,
    viewerCheckedAfterSwitch, viewerActiveClass, rowsAfterSearch, rowsAfterModuleFilter,
    statValuesFiltered, bodyBeforeCollapse, bodyAfterCollapse,
  };
});

check('all 9 real roles render in the role list', result.roleCount === 9);
check('every permission row checkbox is disabled', result.allDisabled);
check('admin (46 permissions) starts with 46 checked boxes', result.adminCheckedInitial === 46);
check('summary stat cards render 4 values for admin', result.statValuesAdmin.length === 4 && result.statValuesAdmin[0] === '50');
check('switching to viewer updates checked-count to 1 (real role switching, not cosmetic)', result.viewerCheckedAfterSwitch === 1);
check('the selected role row carries the active class', result.viewerActiveClass);
check('searching "warehouse" narrows rows to the 6 Warehouse permissions', result.rowsAfterSearch === 6);
check('module filter "Warehouse" also narrows rows to 6', result.rowsAfterModuleFilter === 6);
check('summary stat cards reflect the filtered view (total = 6)', result.statValuesFiltered[0] === '6');
check('module group starts expanded', result.bodyBeforeCollapse === '');
check('clicking the group header collapses it', result.bodyAfterCollapse === 'none');

await page.screenshot({ path: path.join(SHOTS, 'role-management-light.png') });
await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
await page.screenshot({ path: path.join(SHOTS, 'role-management-dark.png') });

const fatal = consoleErrors.filter((e) =>
  /SyntaxError|ReferenceError|TypeError|is not a function|Failed to (load|fetch) module|Cannot use import|Unexpected token|does not provide an export/i.test(e)
);
check('zero fatal console errors (Firebase permission-denied noise is expected/informational)', fatal.length === 0);
if (fatal.length) fatal.forEach((e) => console.log('   ✗ fatal:', e));

console.log(`\n${pass} passed, ${fail} failed\n`);

await browser.close();
server.close();
process.exit(fail === 0 ? 0 : 1);
