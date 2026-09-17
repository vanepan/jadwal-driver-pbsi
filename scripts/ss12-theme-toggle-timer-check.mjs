/* ss12-theme-toggle-timer-check.mjs — SS12 timer-lifecycle hardening.

   js/app.js#applyTheme()'s non-View-Transition fallback path (used when
   document.startViewTransition is unsupported, OR whenever the user has
   prefers-reduced-motion/data-anim="off") adds the `.theme-anim` class and
   scheduled a bare setTimeout(..., 420) to remove it — with no way to
   cancel a still-pending timer from a PRIOR call. A rapid double-toggle
   (two clicks within 420ms) queued two independent timers; the FIRST one
   fired and removed .theme-anim while the SECOND toggle's own animation
   was still supposed to be running, snapping it to an unanimated end state
   ~100ms early.

   Fix: a module-level _themeAnimTimer tracks the pending timeout;
   applyTheme() clears it before scheduling a new one. The View Transition
   path (the default on modern browsers with motion allowed) was never
   affected — document.startViewTransition() has its own native
   overlap-handling per spec (a new call skips the in-flight one), which
   applyThemeState()'s idempotent full-state write already relies on.

   [1] static — the fix is actually wired in app.js (tracked timer,
       cleared before reschedule, nulled after firing).
   [2] real browser, dynamic — with startViewTransition deleted (forcing
       the fallback path) and reduced-motion irrelevant to this path once
       forced, two real clicks 100ms apart on the real theme toggle button
       leave .theme-anim present at a time point that the OLD code would
       already have removed it at (proves the fix changes real timing,
       not just source text).

   Run: node scripts/ss12-theme-toggle-timer-check.mjs   (exit 0 = pass) */

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

console.log('[1 — static: the fix is wired in app.js]');
const appSrc = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf-8');
check('a module-level _themeAnimTimer tracks the pending timeout', /let _themeAnimTimer = null;/.test(appSrc));
check('applyTheme() clears a pending timer before scheduling a new one',
  /if \(_themeAnimTimer\) clearTimeout\(_themeAnimTimer\);\s*\n\s*_themeAnimTimer = setTimeout/.test(appSrc));
check('the scheduled callback nulls _themeAnimTimer after removing the class (so a later toggle does not clear a stale, already-fired id)',
  /_themeAnimTimer = setTimeout\(\(\) => \{ document\.documentElement\.classList\.remove\('theme-anim'\); _themeAnimTimer = null; \}, 420\);/.test(appSrc));

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

console.log('\n[2 — real browser: rapid double-toggle on the fallback path]');
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|favicon|firebase|permission|network/i.test(m.text())) errors.push('console.error: ' + m.text()); });
await page.setViewport({ width: 1280, height: 900 });
await page.evaluateOnNewDocument(() => {
  localStorage.setItem('pbsi_current_user', JSON.stringify({ id: 'admin-test', username: 'admin-test', name: 'Admin Test', role: 'admin', active: true }));
  // Force the fallback path regardless of this browser's real capability —
  // the bug (and the fix) live entirely in that path.
  Object.defineProperty(document, 'startViewTransition', { value: undefined, configurable: true });
});
await page.goto(`http://localhost:${port}/index.html`, { waitUntil: 'networkidle0', timeout: 45000 });
await new Promise((r) => setTimeout(r, 1500));

const hasToggle = await page.evaluate(() => !!document.getElementById('v2TopbarThemeBtn'));
if (!hasToggle) {
  check('theme toggle button exists (v2TopbarThemeBtn) — cannot exercise the fix without it', false);
} else {
  const result = await page.evaluate(async () => {
    const btn = document.getElementById('v2TopbarThemeBtn');
    const t0 = performance.now();
    btn.click(); // toggle #1 at t=0
    await new Promise((r) => setTimeout(r, 100));
    btn.click(); // toggle #2 at t=~100ms — schedules its OWN removal at ~520ms
    // Sample at t=~480ms (60ms before toggle #2's own removal is due, but
    // 60ms AFTER toggle #1's now-superseded removal would have fired under
    // the old bug). Fixed: still present. Old buggy behavior: already gone.
    await new Promise((r) => setTimeout(r, 380));
    const presentAt480 = document.documentElement.classList.contains('theme-anim');
    // Then let it actually finish and confirm it DOES eventually clear —
    // this fix must not leave the class stuck forever.
    await new Promise((r) => setTimeout(r, 250));
    const clearedEventually = !document.documentElement.classList.contains('theme-anim');
    return { presentAt480, clearedEventually, elapsedMs: performance.now() - t0 };
  });
  check('after two clicks 100ms apart, .theme-anim is STILL present ~480ms after the first click (the second toggle\'s own animation window, not cut short by the first toggle\'s now-superseded timer)',
    result.presentAt480, result);
  check('.theme-anim is eventually removed (the fix does not leave it stuck forever)', result.clearedEventually, result);
}
check('zero unexpected console/page errors', errors.length === 0, errors);

await browser.close();
server.close();
console.log(`\nss12-theme-toggle-timer-check: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
