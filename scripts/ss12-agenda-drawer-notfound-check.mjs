/* ss12-agenda-drawer-notfound-check.mjs — SS12 connectivity hardening.

   openEditEventDrawer/openEditTaskDrawer/openEditCalendarDrawer
   (js/agenda/agenda-*-drawer.js) each bare-returned with ZERO user
   feedback when the target id wasn't found — reachable via a plain click
   on a rendered Agenda/To-Do/Calendar row (agenda-workspace.js's
   'open-event'/'open-task'/'open-calendar' cases) for a genuinely
   deleted/cancelled/no-longer-accessible item: a real race in a
   multi-admin/kabid app where another session can delete between this
   session's last render and the click. Same bug class SS10 already fixed
   for js/modal.js#openDetailModal (the assignment detail drawer) — these
   three Agenda openers had the identical gap and were missed.

   Fix mirrors openDetailModal exactly: the drawer still opens, with an
   honest "tidak ditemukan" message, instead of silence.

   Drives the REAL functions directly (no app boot needed — each module's
   own in-memory getXById() starts empty before any store subscription
   populates it, so calling openEditXDrawer() with any id immediately
   exercises the not-found branch, same technique as
   ss10-detail-modal-notfound-check.mjs).

   Run: node scripts/ss12-agenda-drawer-notfound-check.mjs   (exit 0 = pass) */

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

console.log('[SS12] Agenda Event/Task/Calendar drawers — honest not-found state instead of silent no-op\n');

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

const CASES = [
  { module: 'agenda-event-drawer.js', fn: 'openEditEventDrawer', title: 'Agenda', keyword: 'agenda' },
  { module: 'agenda-task-drawer.js', fn: 'openEditTaskDrawer', title: 'Tugas', keyword: 'tugas' },
  { module: 'agenda-calendar-drawer.js', fn: 'openEditCalendarDrawer', title: 'Kalender', keyword: 'kalender' },
];

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

for (const c of CASES) {
  const result = await page.evaluate(async ({ module, fn }) => {
    document.querySelectorAll('.drawer-overlay, [class*="drawer"][class*="overlay"], .cdw-overlay, .drawer-backdrop').forEach((el) => el.remove());
    const mod = await import(`/js/agenda/${module}`);
    mod[fn]('does-not-exist-12345');
    await new Promise((r) => setTimeout(r, 80));
    const overlayCount = document.querySelectorAll('[class*="drawer"]').length;
    const bodyText = document.body.innerText || '';
    return {
      anyOverlayPresent: overlayCount > 0,
      bodyContainsNotFoundCopy: /tidak ditemukan/i.test(bodyText),
      fullBodySnippet: bodyText.slice(0, 400),
    };
  }, c);
  check(`${c.fn}: a drawer/overlay actually opened (not a silent no-op)`, result.anyOverlayPresent, result.fullBodySnippet);
  check(`${c.fn}: the drawer shows an honest "tidak ditemukan" (not found) message`, result.bodyContainsNotFoundCopy, result.fullBodySnippet);
}
check('zero console/page errors across all three cases', errors.length === 0, errors);

await browser.close();
server.close();

console.log(`\nss12-agenda-drawer-notfound-check: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
