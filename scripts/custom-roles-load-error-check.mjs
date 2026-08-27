/* custom-roles-load-error-check.mjs — Design System Program Phase 11 (Administration)

   Regression check for audit finding Roles D-3: a denied/errored
   /customRoles collection read used to look identical to "no Custom Roles
   exist" — subState/loadState reset silently, no flag the UI could read,
   no listener notified. Now: hasCustomRolesLoadError() flips true and
   registerCustomRolesChangeListener()'s callback fires even on denial, so
   role-management-center.js can render a real "failed to load" banner
   instead of a misleadingly-empty role list.

   Method: real DOM test, headless Chromium, the REAL
   custom-roles-store.js + role-management-center.js against
   scripts/role-management-harness.html — no real Firebase Auth session in
   this sandbox (see [[firebase-prod-in-local-testing]] memory), so
   initCustomRolesStore()'s real subscribeNode() call is GENUINELY denied
   by the live production RTDB rules — this test observes the real
   onDenied path, not a simulated one.

   Run: node scripts/custom-roles-load-error-check.mjs (exit 0 = pass) */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css' };

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); if (detail !== undefined) console.log('     • ' + String(detail).slice(0, 300)); }
};

console.log('[Phase 11] Roles D-3 — Custom Roles load-failure now surfaces a real error banner\n');

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

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.evaluateOnNewDocument(() => {
  localStorage.setItem('pbsi_current_user', JSON.stringify({
    id: 'admin-test', username: 'admin-test', name: 'Admin Test', role: 'admin', active: true,
  }));
});
await page.goto(`http://localhost:${port}/scripts/role-management-harness.html`, { waitUntil: 'networkidle0', timeout: 45000 });

const result = await page.evaluate(async () => {
  const center = await import('/js/role-management/role-management-center.js');
  const store = await import('/js/role-management/custom-roles-store.js');
  const host = document.getElementById('host');

  const before = store.hasCustomRolesLoadError();
  await center.mountRoleManagement(host); // real, unauthenticated subscribeNode() -> genuinely denied
  await new Promise((r) => setTimeout(r, 1000)); // let the real denial settle
  const after = store.hasCustomRolesLoadError();
  const bannerText = host.querySelector('.rm-error')?.textContent || '';

  return { before, after, bannerText, bannerShown: !!host.querySelector('.rm-error') };
});

check('hasCustomRolesLoadError() starts false (module-fresh state)', result.before === false);
check('a real, unauthenticated /customRoles subscribe is genuinely denied and flips the flag true', result.after === true);
check('the denial renders a visible .rm-error banner (not a silent empty list)', result.bannerShown);
check('the banner text explains the data may be incomplete', result.bannerText.includes('Gagal memuat Custom Roles'));

await browser.close();
server.close();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
