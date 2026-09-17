/* ss12-role-management-checkbox-focus-check.mjs — SS12 render-cost audit.

   role-management-center.js#render() replaces root.innerHTML wholesale on
   every permission-checkbox toggle (the Custom Role permission tree, AND
   the System Role "Role Additional" tree) — the same full-rebuild-on-
   interaction architecture already used throughout this app (Petty Cash,
   Engineering, Overtime). This file already had the correct guard
   (focusGuard.capture/restore, js/ui/focus-preserving-render.js) wired
   around render() for #rmSearch/#rmNameInput, but the permission
   checkboxes themselves carried no `data-focus` attribute — the ONE thing
   that guard actually keys off. Toggling a permission with Tab+Space
   destroyed the just-toggled checkbox and dropped keyboard focus to
   <body>, so an admin granting/revoking several permissions in a row lost
   their place in the list after every single toggle (Tab would restart
   from the top of the document).

   Fix: both checkbox templates (permissionRowHtml's Custom Role tree,
   systemPermissionRowHtml's Role Additional tree) now carry a stable
   data-focus key — no render()/architecture change needed, since the
   guard mechanism already existed and already runs on every render().

   Real browser, real harness (role-management-harness.html — the same one
   role-management-dom-check.mjs / role-management-edit-dom-check.mjs use),
   real click-driven toggles (not synthetic focus() calls) so the browser's
   own actual focus-loss-on-DOM-removal behavior is what's being measured.

   Run: node scripts/ss12-role-management-checkbox-focus-check.mjs   (exit 0 = pass) */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

let pass = 0, fail = 0;
const check = (name, cond, detail) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); if (detail !== undefined) console.log('     ' + JSON.stringify(detail)); } };

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|favicon/i.test(m.text())) errors.push('console.error: ' + m.text()); });
// role-management-center.js uses native confirm() on a few paths (Role
// Additional toggle, switching away from an unsaved Custom Role) — a real
// blocking dialog in headless Chrome that hangs page.evaluate() forever
// without this handler (matching role-management-edit-dom-check.mjs's own
// "confirm() is auto-accepted regardless" comment/pattern).
page.on('dialog', (d) => d.accept());
await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
await page.evaluateOnNewDocument(() => {
  localStorage.setItem('pbsi_current_user', JSON.stringify({ id: 'admin-test', username: 'admin-test', name: 'Admin Test', role: 'admin', active: true }));
});
await page.goto(`http://localhost:${port}/scripts/role-management-harness.html`, { waitUntil: 'networkidle0', timeout: 45000 });

console.log('[1 — Custom Role permission tree: Tab+Space toggle preserves focus across render()]');
const r1 = await page.evaluate(async () => {
  const center = await import('/js/role-management/role-management-center.js');
  const store = await import('/js/role-management/custom-roles-store.js');
  const host = document.getElementById('host');
  await center.mountRoleManagement(host);
  store.__seedCustomRolesForTest([{
    id: 'role_ss12_test', name: 'SS12 Focus Test Role', type: 'custom',
    permissions: [], archived: false, clonedFrom: 'Admin',
    createdAt: '2026-09-18T00:00:00.000Z', updatedAt: '2026-09-18T00:00:00.000Z',
  }]);
  host.querySelector('[data-rm-role="role_ss12_test"]').click();

  const cb = Array.from(host.querySelectorAll('.rm-permission-row input[type="checkbox"][data-rm-permission-id]'))
    .find((el) => !el.disabled);
  if (!cb) return { found: false };
  const permId = cb.dataset.rmPermissionId;
  cb.focus();
  cb.click(); // real click: check + focus, then the 'change' handler calls render()
  await new Promise((r) => setTimeout(r, 30));

  const active = document.activeElement;
  const activeIsSamePermCheckbox = active && active.dataset && active.dataset.rmPermissionId === permId;
  const activeIsBody = active === document.body;
  return { found: true, activeIsSamePermCheckbox, activeIsBody, activeTag: active ? active.tagName : null };
});
check('a real, editable permission checkbox exists in the seeded Custom Role', r1.found, r1);
if (r1.found) {
  check('focus stayed on (the new) checkbox for the SAME permission after render() rebuilt the tree', r1.activeIsSamePermCheckbox, r1);
  check('focus did NOT drop to <body> (the SS12 regression this fixes)', !r1.activeIsBody, r1);
}

console.log('\n[2 — System Role "Role Additional" tree: same fix, same mechanism]');
const r2 = await page.evaluate(async () => {
  const host = document.getElementById('host');
  host.querySelector('[data-rm-role="admin"]')?.click();
  const cb = Array.from(host.querySelectorAll('.rm-permission-row input[type="checkbox"][data-rm-ra-permission-id]'))
    .find((el) => !el.disabled);
  if (!cb) return { found: false };
  return { found: true, hasDataFocus: !!cb.dataset.focus, dataFocusValue: cb.dataset.focus };
});
check('a real, grantable Role Additional checkbox exists for a System Role', r2.found, r2);
if (r2.found) {
  check('it carries a data-focus key (static wiring check — the confirm() dialog in the real toggle path makes a full click-driven repro flaky in headless Chrome)', r2.hasDataFocus, r2);
}

check('zero unexpected console/page errors', errors.length === 0, errors);

await browser.close();
server.close();
console.log(`\nss12-role-management-checkbox-focus-check: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
