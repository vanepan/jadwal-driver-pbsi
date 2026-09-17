/* ss10-detail-modal-notfound-check.mjs — SS10 notification hardening.

   openDetailModal(id) (js/modal.js) used to bare-return with zero UI
   feedback when the id wasn't in its local `assignments` cache --
   reachable both for a genuinely deleted/cancelled assignment and for
   any role whose cache never populates (setModalAssignments' own
   module-permission gate in js/app.js). The push-nav handler
   (initPushNavHandler, js/app.js) still called markNotificationRead(id)
   unconditionally right after: the rail would switch to Driver Ops,
   nothing would open, and the notification silently vanished from the
   unread bucket.

   Fix mirrors js/engineering/ui/engineering-drawer.js#renderDrawer's own
   null-`a` branch: the drawer still opens, with an honest not-found
   message, instead of silence.

   Real unauthenticated-ish boot of index.html (same technique
   notifications-panel-check.mjs uses: a fake localStorage user, then
   modal.js dynamically imported directly) -- modal.js's own
   `assignments` module state starts as [] before any setter call, so
   calling openDetailModal() with any id immediately exercises the
   not-found branch with no extra seam needed.

   Run: node scripts/ss10-detail-modal-notfound-check.mjs (exit 0 = pass) */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); if (detail !== undefined) console.log('     • ' + String(detail).slice(0, 300)); }
};

console.log('[SS10] Assignment Detail drawer — honest not-found state instead of silent no-op\n');

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
const page = await browser.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/permission_denied|Permission denied/i.test(m.text())) errors.push('console.error: ' + m.text()); });
await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
await page.evaluateOnNewDocument(() => {
  localStorage.setItem('pbsi_current_user', JSON.stringify({
    id: 'admin-test', username: 'admin-test', name: 'Admin Test', role: 'admin', active: true,
  }));
});
await page.goto(`http://localhost:${port}/index.html`, { waitUntil: 'networkidle0', timeout: 45000 });

const result = await page.evaluate(async () => {
  const modal = await import('/js/modal.js');
  modal.openDetailModal('does-not-exist-12345');
  await new Promise((r) => setTimeout(r, 60));
  const overlay = document.querySelector('.drawer-overlay, [class*="drawer"][class*="overlay"], .cdw-overlay, .drawer-backdrop');
  const bodyText = document.body.innerText || '';
  return {
    anyOverlayPresent: !!document.querySelector('[class*="drawer"]'),
    bodyContainsNotFoundCopy: /tidak ditemukan/i.test(bodyText),
    bodyContainsAccessCopy: /akses/i.test(bodyText),
    fullBodySnippet: bodyText.slice(0, 500),
  };
});

check('a drawer/overlay actually opened (not a silent no-op)', result.anyOverlayPresent, result.fullBodySnippet);
check('the drawer shows an honest "tidak ditemukan" (not found) message', result.bodyContainsNotFoundCopy, result.fullBodySnippet);
check('zero console/page errors', errors.length === 0, errors);

await browser.close();
server.close();

console.log(`\nss10-detail-modal-notfound-check: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
