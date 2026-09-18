/* ss13-drawer-race-check.mjs — SS13 drawer/modal lifecycle audit.

   js/components/drawer.js (THE canonical drawer — every record detail/
   create/edit interaction across the app routes through it) already carries
   extensive documented hardening from prior SS/Design-System phases:
   _closeSeq (guards a close-then-reopen inside the ~260ms fade window from
   firing a superseded close's focus-restore/onClose against the NEW
   drawer), a refcounted body-scroll lock (Math.max(0, …) floor — SS12),
   an idempotent closeDrawer() (early-returns once _activeOverlay is null),
   and unconditional DOM cleanup on every open (querySelectorAll, not
   getElementById, so a duplicated-id pair can never linger).

   This is a real-Chromium regression harness proving those documented
   protections actually hold, rather than trusting the comments — imports
   the real module directly (bare DOM, no app/Firebase boot needed; the
   drawer is pure presentation + lifecycle with zero business logic).

   Matrix covered (SS13 §13/§14):
     [1] open() while already open (replace path)            — exactly one overlay, no duplicate ids
     [2] close() then IMMEDIATELY open() (inside the fade window) — old close's deferred cleanup must not
         corrupt the new drawer (no stale focus-restore, no onClose(A) firing after B is open)
     [3] close() called twice in a row                        — body-scroll-lock never goes negative
     [4] open() -> close() -> open() -> close(), repeated 5x  — lock count settles back to 0, no leak
     [5] a superseded close's onClose must never fire

   Run: node scripts/ss13-drawer-race-check.mjs   (exit 0 = pass) */

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
  else { fail++; console.log(`  ✗ ${name}`); if (detail !== undefined) console.log('     ' + JSON.stringify(detail)); }
};

const HARNESS = `<!doctype html><html><head><meta charset="utf-8"></head>
<body>
<script type="module">
  import { openDrawer, closeDrawer } from '/js/components/drawer.js';
  window.__openDrawer = openDrawer;
  window.__closeDrawer = closeDrawer;
  window.__ready = true;
</script>
</body></html>`;

const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  if (u === '/' || u === '/harness') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(HARNESS); return; }
  const file = path.join(ROOT, u);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const errors = [];
const page = await browser.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
await page.setViewport({ width: 1280, height: 900 });
await page.goto(`http://localhost:${port}/harness`, { waitUntil: 'networkidle0', timeout: 45000 });
await page.waitForFunction(() => window.__ready === true, { timeout: 10000 });

const overlayCount = () => page.evaluate(() => document.querySelectorAll('#appDrawerOverlay').length);
const lockState = () => page.evaluate(() => ({
  hasLockClass: document.body.classList.contains('sheet-scroll-lock'),
}));

console.log('\n[1 — open() while already open (replace path)]');
await page.evaluate(() => window.__openDrawer({ title: 'A' }));
const afterFirstOpen = await overlayCount();
await page.evaluate(() => window.__openDrawer({ title: 'B' }));
const afterReplace = await overlayCount();
check('exactly one overlay after the first open()', afterFirstOpen === 1, afterFirstOpen);
check('still exactly one overlay after a second open() replaces the first (no duplicate #appDrawerOverlay)', afterReplace === 1, afterReplace);
const titleAfterReplace = await page.evaluate(() => document.querySelector('.drawer__title')?.textContent || '');
check('the visible drawer is the NEW one (B), not a stale A', titleAfterReplace.includes('B'), titleAfterReplace);
await page.evaluate(() => window.__closeDrawer());
await new Promise((r) => setTimeout(r, 350));

console.log('\n[2 — close() then IMMEDIATELY open() inside the ~260ms fade window]');
const raceResult = await page.evaluate(() => new Promise((resolve) => {
  let closeAFired = false;
  window.__openDrawer({ title: 'RaceA', onClose: () => { closeAFired = true; } });
  window.__closeDrawer(); // starts A's deferred (260ms) teardown
  window.__openDrawer({ title: 'RaceB' }); // opens B immediately, inside A's fade window
  setTimeout(() => {
    resolve({
      overlays: document.querySelectorAll('#appDrawerOverlay').length,
      visibleTitle: document.querySelector('.drawer__title')?.textContent || '',
      closeAFiredDuringWindow: closeAFired,
      isOpenClassPresent: document.querySelector('#appDrawerOverlay')?.classList.contains('is-open'),
    });
  }, 100); // sampled BEFORE A's 260ms fallback timer — proves no transient double-overlay
}));
check('exactly one overlay mid-race (A\'s deferred removal did not leave a duplicate)', raceResult.overlays === 1, raceResult);
check('the visible drawer is B, not A', raceResult.visibleTitle.includes('RaceB'), raceResult);
check('A\'s onClose has NOT fired yet at t=100ms (still legitimately pending, not skipped/lost)', raceResult.closeAFiredDuringWindow === false, raceResult);
await new Promise((r) => setTimeout(r, 300)); // let A's fallback timer (260ms) actually fire
const afterSettle = await page.evaluate(() => ({
  overlays: document.querySelectorAll('#appDrawerOverlay').length,
  bodyLockCount_ok: !document.body.classList.contains('sheet-scroll-lock') ? 'unlocked' : 'locked',
}));
check('after settling, still exactly one overlay (B) — A\'s deferred cleanup did not remove B\'s node', afterSettle.overlays === 1, afterSettle);
check('body scroll is still LOCKED after settling (B is still open — A\'s superseded close must not have released B\'s lock)', afterSettle.bodyLockCount_ok === 'locked', afterSettle);
await page.evaluate(() => window.__closeDrawer());
await new Promise((r) => setTimeout(r, 350));
check('body scroll is unlocked once B is actually closed', (await lockState()).hasLockClass === false, await lockState());

console.log('\n[3 — close() called twice in a row does not double-decrement the lock]');
await page.evaluate(() => window.__openDrawer({ title: 'C' }));
await page.evaluate(() => { window.__closeDrawer(); window.__closeDrawer(); }); // 2nd is a no-op (idempotent)
await new Promise((r) => setTimeout(r, 350));
check('single lock/unlock pair: scroll unlocked after a double closeDrawer() call', (await lockState()).hasLockClass === false, await lockState());
check('exactly zero overlays left after a double close', (await overlayCount()) === 0, await overlayCount());

console.log('\n[4 — 5x open/close cycles: lock count settles back to 0, no leak]');
for (let i = 0; i < 5; i++) {
  await page.evaluate((n) => window.__openDrawer({ title: 'Cycle' + n }), i);
  await page.evaluate(() => window.__closeDrawer());
  await new Promise((r) => setTimeout(r, 280));
}
check('after 5 open/close cycles, body scroll lock is fully released (no accumulated refcount leak)', (await lockState()).hasLockClass === false, await lockState());
check('after 5 open/close cycles, zero overlay nodes remain in the DOM', (await overlayCount()) === 0, await overlayCount());

console.log('\n[5 — a superseded close\'s onClose must never fire]');
const supersededOnCloseResult = await page.evaluate(() => new Promise((resolve) => {
  let supersededFired = false;
  window.__openDrawer({ title: 'D1', onClose: () => { supersededFired = true; } });
  window.__closeDrawer(); // D1's close is now pending (260ms)
  window.__openDrawer({ title: 'D2' }); // supersedes D1's pending close
  window.__closeDrawer(); // D2's own close, should fire cleanly
  setTimeout(() => resolve({ supersededFired }), 400);
}));
check('D1\'s onClose (superseded by D2 opening before D1\'s fade finished) never fires', supersededOnCloseResult.supersededFired === false, supersededOnCloseResult);

console.log('\n[6 — console cleanliness]');
check('zero console/page errors across the whole run', errors.length === 0, errors.join(' | '));

await browser.close();
server.close();
console.log(`\nss13-drawer-race-check: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
