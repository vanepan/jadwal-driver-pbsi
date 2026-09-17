/* ss12-cold-start-pushnav-ordering-check.mjs — SS12 connectivity hardening.

   js/app.js's bootstrap (DOMContentLoaded) called initPushNavHandler() —
   which registers the 'pbsi:push-nav' window listener that actually routes
   a tapped push notification to its content — only AFTER the
   `if (getCurrentUser()) { await Promise.race([startAuthenticatedSession(),
   ...]) }` fast path used for a RETURNING user with a persisted session.
   That path calls initPush() (js/push.js), whose _initNavigation() reads a
   cold-start `?view=&id=` from the URL and re-dispatches it as a plain,
   unbuffered `window.dispatchEvent(new CustomEvent('pbsi:push-nav', ...))`
   — synchronously, before the listener existed yet for this exact case.
   Result: for the ORDINARY case (a user who stayed logged in, which is
   most real usage) tapping an OS push notification opened the app at
   plain Home, silently dropping the intended deep link, every time.

   Fix: initPushNavHandler() now runs before anything that can trigger
   startAuthenticatedSession() (both the onAuthAvailable registration and
   the getCurrentUser() fast-path) — listener registration has no ordering
   dependency on the rest of bootstrap (it only closes over other
   function-hoisted top-level functions, not executed until the event
   actually fires).

   This test reproduces the REAL persisted-session cold-start path against
   real production data (read-only: opens a drawer, never saves) using the
   project's established 'leo' verification account:
     1. Real login (sets localStorage pbsi_current_user).
     2. A SECOND navigation to `index.html?view=agendaEvent&id=<real id>`
        in the SAME page/localStorage — exactly the "returning user,
        persisted session, notification-tap cold start" scenario.
     3. Assert the target Agenda event drawer actually opens (the deep
        link was NOT dropped).

   Run: node scripts/ss12-cold-start-pushnav-ordering-check.mjs   (exit 0 = pass) */

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

console.log('[1 — static: initPushNavHandler() is registered before any startAuthenticatedSession() trigger]');
const src = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf-8').replace(/\r\n/g, '\n');
const idxHandlerCall = src.indexOf('initPushNavHandler();');
const idxOnAuthAvailable = src.indexOf('onAuthAvailable(() => { startAuthenticatedSession(); });');
const idxGetCurrentUserFastPath = src.indexOf('startAuthenticatedSession(),\n      new Promise(resolve => setTimeout(resolve, 8000)),');
const handlerCallCount = (src.match(/initPushNavHandler\(\);/g) || []).length;
check('initPushNavHandler() is called exactly once', handlerCallCount === 1, handlerCallCount);
check('that call appears BEFORE onAuthAvailable(() => startAuthenticatedSession())',
  idxHandlerCall !== -1 && idxOnAuthAvailable !== -1 && idxHandlerCall < idxOnAuthAvailable,
  { idxHandlerCall, idxOnAuthAvailable });
check('that call appears BEFORE the getCurrentUser() persisted-session fast path',
  idxHandlerCall !== -1 && idxGetCurrentUserFastPath !== -1 && idxHandlerCall < idxGetCurrentUserFastPath,
  { idxHandlerCall, idxGetCurrentUserFastPath });

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
const BASE = `http://localhost:${port}`;

console.log('\n[2 — real browser: persisted-session cold-start deep link, real production data, read-only]');
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/permission.denied|Failed to load resource/i.test(m.text())) errors.push('console.error: ' + m.text()); });
await page.setViewport({ width: 1280, height: 900 });

// Step 1: a real login, exactly like the project's other production-data suites.
await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle0', timeout: 45000 });
await page.waitForSelector('#loginForm', { timeout: 20000 });
await new Promise((r) => setTimeout(r, 600));
await page.type('#loginUsername', 'leo');
await page.type('#loginPin', '1234');
await page.waitForSelector('.login-submit', { visible: true, timeout: 15000 });
await new Promise((r) => setTimeout(r, 300));
await page.click('.login-submit');
await page.waitForFunction(() => { try { return JSON.parse(localStorage.getItem('pbsi_current_user') || 'null')?.username === 'leo'; } catch { return false; } }, { timeout: 30000 });
await new Promise((r) => setTimeout(r, 2500));
await page.evaluate(() => { document.getElementById('btnPushDismiss')?.click(); });

// Grab a REAL, currently-existing agenda event id to target (read-only).
// Retried briefly — this races real Firebase data streaming in, not app logic.
await page.evaluate(() => document.querySelector('.domshell-rail-item[data-domain="today"]')?.click());
let realEventId = null;
for (let attempt = 0; attempt < 6 && !realEventId; attempt++) {
  await new Promise((r) => setTimeout(r, 1000));
  realEventId = await page.evaluate(() => {
    const el = document.querySelector('[data-agenda-action^="open-event:"]');
    return el ? el.dataset.agendaAction.split(':')[1] : null;
  });
}

if (!realEventId) {
  check('a real agenda event exists right now to target this test against', false, 'skipped: no real event in current production data — cannot exercise this deep link honestly without fabricating one');
} else {
  console.log(`  (using real event id: ${realEventId})`);
  // Step 2: the actual repro — a SECOND navigation, in the SAME localStorage
  // session (persisted user, no fresh login form), straight to the
  // cold-start deep-link URL. This is exactly initPush()'s
  // "returning user (persisted session restored)" path.
  await page.goto(`${BASE}/index.html?view=agendaEvent&id=${encodeURIComponent(realEventId)}`, { waitUntil: 'networkidle0', timeout: 45000 });
  // No login form this time — persisted session should resolve immediately.
  const sawLoginForm = await Promise.race([
    page.waitForSelector('#loginForm', { visible: true, timeout: 1500 }).then(() => true).catch(() => false),
  ]);
  check('persisted session resolved without showing the login form (this really is the "returning user" cold-start path)', !sawLoginForm);

  await new Promise((r) => setTimeout(r, 6000)); // openAgendaEntityWhenReady's own bounded wait is up to 8s
  const result = await page.evaluate(() => ({
    drawerOpen: !!document.querySelector('.agenda-drawer, [class*="drawer"][class*="overlay"], .cdw-overlay'),
    bodySnippet: document.body.innerText.slice(0, 200),
  }));
  check('the cold-start deep link actually opened the target Agenda event drawer (not silently dropped)', result.drawerOpen, result);
}
check('zero unexpected console/page errors', errors.length === 0, errors);

await browser.close();
server.close();
console.log(`\nss12-cold-start-pushnav-ordering-check: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
