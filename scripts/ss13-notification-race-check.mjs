/* ss13-notification-race-check.mjs — SS13 notification/push-nav race hardening.

   js/app.js#initPushNavHandler()'s pbsi:push-nav switch already had an
   explicit SS10 dedup guard (_pendingAgendaOpens) for the agendaEvent/
   agendaTask/agendaCalendar cases — "reopening the bell and clicking the
   same still-unread notification again built a SECOND closure-scoped
   listener + timer racing the first." The 'engineering' case, in the exact
   same switch, never got the same treatment: a rapid double-click (or
   double-tap) on an engineering push notification fires two overlapping
   navEngineering() calls.

   Concretely: navEngineering()'s own `engineeringMounted` guard is a plain
   boolean set synchronously BEFORE `await mountEngineering()` — so on a
   session's FIRST-EVER engineering navigation (a real cold-start scenario:
   SS13 §15 explicitly calls out "click during cold start"), a second
   concurrent call sees the module already "mounted" and proceeds straight
   to setEngineeringScreen()/render() without waiting for the first call's
   still in-flight mountEngineering() (which itself gates the real data
   fetch behind its own `loaded` flag) — a transient wrong/empty render
   racing the real one, and two redundant openEngineeringAssignment()/
   markNotificationRead(id) calls.

   Fix: _pendingEngineeringOpens, the exact same Set-based dedup shape as
   _pendingAgendaOpens, applied to the 'engineering' case. A bonus fix
   riding along: the original code had no .catch on the navEngineering()
   promise chain at all (an unhandled rejection on any mount failure) —
   the new chain adds one, and releases the dedup guard via .finally() so
   a failed navigation doesn't permanently lock out retrying the same id.

   [1] static  — the guard is wired into app.js's 'engineering' case.
   [2] dynamic — real Chromium, real app (fake logged-in admin, no Firebase
       writes). Dispatches the SAME engineering push-nav event twice,
       synchronously back-to-back (the maximal-overlap case) on a session
       that has never visited Engineering before (the cold-start scenario
       that matters — see above). Proves the observable, black-box
       contract: no console/page errors, and the app converges to a single
       correct Engineering workspace state rather than a corrupted one.
       (The internal dedup Set is module-private, by design — not exposed
       for testing — so this dynamic half verifies the OUTCOME the fix
       protects, while [1] verifies the actual mechanism.)

   Run: node scripts/ss13-notification-race-check.mjs   (exit 0 = pass) */

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

console.log('[1 — static: the dedup guard is wired into app.js\'s engineering case]');
const appSrc = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf-8');
check('a module-level _pendingEngineeringOpens Set mirrors _pendingAgendaOpens', /const _pendingEngineeringOpens = new Set\(\);/.test(appSrc));
const switchBody = appSrc.slice(appSrc.indexOf("case 'engineering':"), appSrc.indexOf("case 'agendaEvent':"));
check('a second push-nav for the SAME id while one is pending is a no-op (break, not a second navEngineering() call)',
  /if \(_pendingEngineeringOpens\.has\(id\)\) break;/.test(switchBody));
check('the id is registered as pending BEFORE navEngineering() is called', /_pendingEngineeringOpens\.add\(id\);\s*\n\s*navEngineering\(/.test(switchBody));
check('a navigation failure is caught (no more unhandled rejection) instead of silently vanishing', /\.catch\(\(err\) => console\.error\('\[push-nav\] engineering navigation failed', err\)\)/.test(switchBody));
check('the pending guard is ALWAYS released via .finally(), even on failure (no permanent lockout of that id)', /\.finally\(\(\) => _pendingEngineeringOpens\.delete\(id\)\);/.test(switchBody));

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

console.log('\n[2 — real browser: rapid double engineering push-nav on a cold (never-visited-Engineering) session]');
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|favicon|firebase|permission|network|PERMISSION_DENIED/i.test(m.text())) errors.push('console.error: ' + m.text()); });
await page.setViewport({ width: 1280, height: 900 });
await page.evaluateOnNewDocument(() => {
  localStorage.setItem('pbsi_current_user', JSON.stringify({ id: 'admin-test', username: 'admin-test', name: 'Admin Test', role: 'admin', active: true }));
  window.__unhandled = [];
  window.addEventListener('unhandledrejection', (e) => { window.__unhandled.push(String(e.reason)); });
});
await page.goto(`http://localhost:${port}/index.html`, { waitUntil: 'networkidle0', timeout: 45000 });
await new Promise((r) => setTimeout(r, 1500));

const hadEngineeringWorkspaceBefore = await page.evaluate(() => {
  const el = document.getElementById('v2EngineeringWorkspace');
  return !!(el && el.childElementCount > 0);
});
check('sanity: Engineering has NOT been mounted yet (this is genuinely the cold-start case the fix targets)', hadEngineeringWorkspaceBefore === false, hadEngineeringWorkspaceBefore);

await page.evaluate(() => {
  const detail = { view: 'engineering', id: 'ss13-test-assignment-1' };
  // Maximal overlap: both dispatched in the same synchronous tick, before
  // either's async navEngineering() chain has had any chance to resolve.
  window.dispatchEvent(new CustomEvent('pbsi:push-nav', { detail }));
  window.dispatchEvent(new CustomEvent('pbsi:push-nav', { detail }));
});
await new Promise((r) => setTimeout(r, 2000));

const finalState = await page.evaluate(() => ({
  engineeringMounted: !!(document.getElementById('v2EngineeringWorkspace')?.childElementCount > 0),
  unhandled: window.__unhandled,
}));
check('Engineering workspace ends up mounted/rendered (the double-dispatch did not deadlock/no-op navigation)', finalState.engineeringMounted === true, finalState);
check('zero unhandled promise rejections from the double-dispatch', finalState.unhandled.length === 0, finalState.unhandled);
check('zero unexpected console/page errors', errors.length === 0, errors);

await browser.close();
server.close();
console.log(`\nss13-notification-race-check: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
