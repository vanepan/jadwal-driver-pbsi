/* mobile-performance-sanity-check.mjs — v1.31.4 R8.

   Real, measured interaction timing + a DOM-growth leak probe against the
   REAL running app (real login, READ-ONLY). Thresholds are deliberately
   generous (not tight ms assertions, which would be flaky across
   machines/CI) — this catches genuine regressions (an interaction that
   starts taking seconds, or DOM nodes that accumulate across repeated
   navigation) without asserting exact numbers. Actual measured medians
   at the time this was written (informational, not asserted): rail nav
   ~144ms, Calendar Month<->Week ~47ms, notification panel open ~43ms —
   all "feels immediate" already; this phase found no evidence of a real
   bottleneck in these specific flows once the measurement methodology
   itself was corrected (an earlier draft of this harness had bugs that
   produced inflated 300ms/5000ms readings purely from its own fixed
   delays/wrong selectors, not real app slowness).

   Run: node scripts/mobile-performance-sanity-check.mjs (exit 0 = pass)
*/

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`); }
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const filePath = path.join(ROOT, urlPath === '/' ? '/index.html' : urlPath);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const consoleErrors = [];
const page = await browser.newPage();
page.on('console', (msg) => { if (msg.type() === 'error' && !/permission_denied|Permission denied/i.test(msg.text())) consoleErrors.push(msg.text()); });
page.on('pageerror', (err) => consoleErrors.push(String(err)));
await page.setViewport({ width: 1280, height: 900 });

console.log('\n=== [1] Real login as leo ===');
await page.goto(`http://localhost:${port}/index.html`, { waitUntil: 'networkidle0', timeout: 60000 });
await page.waitForSelector('#loginForm', { timeout: 20000 });
await new Promise((r) => setTimeout(r, 500));
await page.type('#loginUsername', 'leo');
await page.type('#loginPin', '1234');
await page.waitForSelector('.login-submit', { visible: true, timeout: 10000 });
await new Promise((r) => setTimeout(r, 300));
await page.click('.login-submit');
await page.waitForFunction(() => { try { return JSON.parse(localStorage.getItem('pbsi_current_user') || 'null')?.username === 'leo'; } catch { return false; } }, { timeout: 30000 });
check('logged in as leo', true);
await new Promise((r) => setTimeout(r, 2500));
await page.evaluate(() => { document.getElementById('btnPushDismiss')?.click(); });

async function medianOf(fn, samples = 5) {
  const times = [];
  for (let i = 0; i < samples; i++) { const t = await fn(); if (t != null) times.push(t); }
  if (!times.length) return null;
  times.sort((a, b) => a - b);
  return { median: times[Math.floor(times.length / 2)], samples: times };
}

const SLOW_THRESHOLD_MS = 2000; // generous — real observed medians are all under 200ms

console.log('\n=== [2] Rail navigation (Today <-> Operations) stays well under 2s ===');
const railResult = await medianOf(async () => {
  const t0 = await page.evaluate(() => performance.now());
  await page.evaluate(() => document.querySelector('.domshell-rail-item[data-domain="operations"]')?.click());
  await page.waitForFunction(() => document.querySelector('.domshell-rail-item[data-domain="operations"]')?.classList.contains('domshell-rail-item--active'), { timeout: 5000 }).catch(() => {});
  const t1 = await page.evaluate(() => performance.now());
  await page.evaluate(() => document.querySelector('.domshell-rail-item[data-domain="today"]')?.click());
  await new Promise((r) => setTimeout(r, 350));
  return t1 - t0;
}, 8);
check('rail nav median is under 2s', railResult && railResult.median < SLOW_THRESHOLD_MS, railResult);
console.log('  (measured median: ' + (railResult ? Math.round(railResult.median) + 'ms' : 'n/a') + ')');

console.log('\n=== [3] Calendar Month<->Week toggle stays well under 2s ===');
const calResult = await medianOf(async () => {
  await page.evaluate(() => document.querySelector('[data-agenda-action="set-mode:calendar"]')?.click());
  await new Promise((r) => setTimeout(r, 400));
  const t0 = await page.evaluate(() => performance.now());
  await page.evaluate(() => document.querySelector('[data-agenda-action="set-calview:week"]')?.click());
  await page.waitForFunction(() => document.querySelector('[data-agenda-action="set-calview:week"]')?.getAttribute('aria-pressed') === 'true', { timeout: 5000 }).catch(() => {});
  const t1 = await page.evaluate(() => performance.now());
  await page.evaluate(() => document.querySelector('[data-agenda-action="set-calview:month"]')?.click());
  await new Promise((r) => setTimeout(r, 300));
  return t1 - t0;
}, 5);
check('calendar view toggle median is under 2s', calResult && calResult.median < SLOW_THRESHOLD_MS, calResult);
console.log('  (measured median: ' + (calResult ? Math.round(calResult.median) + 'ms' : 'n/a') + ')');

console.log('\n=== [4] Notification panel open stays well under 2s ===');
const notifBtnId = await page.evaluate(() => document.getElementById('btnHeaderNotif') ? 'btnHeaderNotif' : (document.getElementById('btnNotifications') ? 'btnNotifications' : null));
if (notifBtnId) {
  const notifResult = await medianOf(async () => {
    const t0 = await page.evaluate(() => performance.now());
    await page.evaluate((id) => document.getElementById(id)?.click(), notifBtnId);
    await page.waitForFunction(() => document.getElementById('modalNotifications')?.style.display === 'flex', { timeout: 5000 }).catch(() => {});
    const t1 = await page.evaluate(() => performance.now());
    await page.keyboard.press('Escape');
    await new Promise((r) => setTimeout(r, 150));
    return t1 - t0;
  }, 5);
  check('notification panel open median is under 2s', notifResult && notifResult.median < SLOW_THRESHOLD_MS, notifResult);
  console.log('  (measured median: ' + (notifResult ? Math.round(notifResult.median) + 'ms' : 'n/a') + ')');
} else {
  console.log('  [informational] no notification button found for this role — skipped');
}

console.log('\n=== [5] No unbounded DOM growth across repeated navigation (leak probe) ===');
const leakSample = [];
for (let i = 0; i < 6; i++) {
  await page.evaluate(() => document.querySelector('.domshell-rail-item[data-domain="operations"]')?.click());
  await new Promise((r) => setTimeout(r, 200));
  await page.evaluate(() => document.querySelector('.domshell-rail-item[data-domain="today"]')?.click());
  await new Promise((r) => setTimeout(r, 200));
  leakSample.push(await page.evaluate(() => document.querySelectorAll('*').length));
}
const growth = leakSample[leakSample.length - 1] - leakSample[0];
check('DOM node count does not grow across 6 repeated Today<->Operations cycles (same closed state each time)', growth === 0, { leakSample, growth });

console.log('\n=== [Z] Zero fatal console/page errors ===');
check('no fatal console errors or uncaught page errors', consoleErrors.length === 0, consoleErrors.slice(0, 3));

await browser.close();
server.close();
console.log(`\nmobile-performance-sanity-check: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
