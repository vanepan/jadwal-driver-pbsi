/* ss13-view-transition-race-check.mjs — SS13 primary target.

   SS12 documented a known limitation: rapid double-click on the theme
   toggle under the View Transition path could produce a console
   "AbortError: Transition was skipped". Root cause — js/app.js#applyTheme()'s
   View Transition branch called document.startViewTransition() but never
   captured the returned transition object, so when a second toggle's
   startViewTransition() call natively skips a still-in-flight first one
   (per the View Transitions spec), the first transition's `ready`/
   `finished` promises reject with AbortError and NOTHING was listening —
   an unhandled promise rejection. setWorkspace() (Phase 8.5) already solved
   this exact shape of problem for workspace navigation; applyTheme() never
   got the same fix.

   Fix: capture the transition, catch `updateCallbackDone` (surfacing real
   callback failures, same as setWorkspace()), and absorb the benign
   `ready`/`finished` skip rejections — identical pattern, applied to the
   theme toggle's own View Transition call.

   A SECOND, real defect surfaced while verifying the above: the topbar
   toggle button computed its next theme by reading document.documentElement
   data-theme at click time. Per spec, startViewTransition()'s update
   callback runs in a QUEUED TASK, not synchronously — so two clicks handled
   back-to-back (a real rapid double-click can still land inside that same
   task-queue window) both read the SAME pre-toggle attribute value and both
   requested the SAME target theme, silently eating one of the two toggles
   (2 rapid clicks from light landed on dark, not back on light). Fixed by
   tracking _themeRequested — the last REQUESTED theme, written synchronously
   the instant a toggle is requested — and toggling relative to that instead
   of the (possibly stale) DOM attribute.

   [1] static  — the fix is wired in app.js (transition captured, all three
       promises handled), mirroring setWorkspace()'s existing pattern.
   [2] dynamic — real Chromium, real app (fake logged-in admin, no Firebase
       writes): single toggle both directions, rapid double toggle, rapid
       triple toggle. Asserts zero unhandled rejections/console errors and
       that the final theme matches the last click every time.

   Run: node scripts/ss13-view-transition-race-check.mjs   (exit 0 = pass) */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); if (detail !== undefined) console.log('     ' + JSON.stringify(detail)); }
};

console.log('[1 — static: the fix is wired in app.js, mirroring setWorkspace()]');
const appSrc = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf-8');
const applyThemeBody = appSrc.slice(appSrc.indexOf('function applyTheme('), appSrc.indexOf('function initThemeManager('));
check('applyTheme() captures the transition returned by startViewTransition()',
  /const transition = document\.startViewTransition\(\(\) => \{ applyThemeState\(theme\); \}\);/.test(applyThemeBody));
check('applyTheme() surfaces real update-callback failures via updateCallbackDone.catch(...)',
  /transition\.updateCallbackDone\.catch\(err => console\.error/.test(applyThemeBody));
check('applyTheme() absorbs the benign skip rejection on both ready and finished',
  /transition\.ready\.catch\(\(\) => \{\}\);\s*\n\s*transition\.finished\.catch\(\(\) => \{\}\);/.test(applyThemeBody));
check('applyTheme() records the requested theme synchronously, before any deferred View Transition work',
  /function applyTheme\(theme, animate = false\) \{\s*\n\s*_themeRequested = theme;/.test(appSrc));
check('the topbar toggle click handler reads _themeRequested (not a possibly-stale DOM attribute) to compute the next theme',
  /const current = _themeRequested \|\| document\.documentElement\.getAttribute\('data-theme'\)/.test(appSrc));

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

console.log('\n[2 — real browser: single, rapid-double, and rapid-triple theme toggles]');
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|favicon|firebase|permission|network/i.test(m.text())) errors.push('console.error: ' + m.text()); });
await page.setViewport({ width: 1280, height: 900 });
await page.evaluateOnNewDocument(() => {
  localStorage.setItem('pbsi_current_user', JSON.stringify({ id: 'admin-test', username: 'admin-test', name: 'Admin Test', role: 'admin', active: true }));
  window.__unhandled = [];
  window.addEventListener('unhandledrejection', (e) => { window.__unhandled.push(String(e.reason)); });
});
await page.goto(`http://localhost:${port}/index.html`, { waitUntil: 'networkidle0', timeout: 45000 });
await new Promise((r) => setTimeout(r, 1500));

const hasToggle = await page.evaluate(() => !!document.getElementById('v2TopbarThemeBtn'));
const supportsViewTransitions = await page.evaluate(() => typeof document.startViewTransition === 'function');
if (!hasToggle) {
  check('theme toggle button exists (v2TopbarThemeBtn) — cannot exercise the fix without it', false);
} else if (!supportsViewTransitions) {
  check('this Chromium build supports the View Transitions API — cannot exercise the primary path without it', false);
} else {
  const clickNTimes = (n) => page.evaluate((count) => {
    const btn = document.getElementById('v2TopbarThemeBtn');
    for (let i = 0; i < count; i++) btn.click();
  }, n);
  const currentTheme = () => page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  const settle = () => new Promise((r) => setTimeout(r, 400));

  console.log('  -- single toggle, Light -> Dark --');
  const startTheme = await currentTheme();
  check('starts on light', startTheme === 'light', startTheme);
  await clickNTimes(1); await settle();
  check('single click: theme is now dark', (await currentTheme()) === 'dark', await currentTheme());

  console.log('  -- single toggle, Dark -> Light --');
  await clickNTimes(1); await settle();
  check('single click: theme is now light', (await currentTheme()) === 'light', await currentTheme());

  const other = (t) => (t === 'dark' ? 'light' : 'dark');
  const expectAfterNClicks = (start, n) => (n % 2 === 0 ? start : other(start));

  console.log('  -- rapid double toggle (an even number of clicks must land back on the SAME theme) --');
  let before = await currentTheme();
  await clickNTimes(2); await settle();
  check(`rapid double toggle: final theme matches the final (2nd) click (${expectAfterNClicks(before, 2)}, started ${before})`,
    (await currentTheme()) === expectAfterNClicks(before, 2), await currentTheme());

  console.log('  -- rapid triple toggle (an odd number of clicks must land on the OTHER theme) --');
  before = await currentTheme();
  await clickNTimes(3); await settle();
  check(`rapid triple toggle: final theme matches the final (3rd) click (${expectAfterNClicks(before, 3)}, started ${before})`,
    (await currentTheme()) === expectAfterNClicks(before, 3), await currentTheme());

  const unhandled = await page.evaluate(() => window.__unhandled);
  check('zero unhandled promise rejections across single/double/triple toggles (the SS12 AbortError is gone)', unhandled.length === 0, unhandled);
}
check('zero unexpected console/page errors', errors.length === 0, errors);

await browser.close();
server.close();
console.log(`\nss13-view-transition-race-check: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
