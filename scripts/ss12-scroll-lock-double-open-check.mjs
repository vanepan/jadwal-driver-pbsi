/* ss12-scroll-lock-double-open-check.mjs — SS12 lifecycle hardening.

   js/ui/sheet-gesture.js's lockBodyScroll()/unlockBodyScroll() are
   reference-counted, shared by every drawer/bottom-sheet in the app. Two
   real call sites reached lockBodyScroll() twice for what the user
   experiences as ONE open — a single subsequent close only decrements
   once, permanently leaving `sheet-scroll-lock` on <body> (page
   unscrollable until reload):

     1. js/docs/document-viewer.js#showViewer() — synchronous, but had no
        guard against being invoked a second time before closeViewer() (a
        fast double-click on Export/Preview PDF while a caller like
        doc-engine.js's generateAndOpen() is still resolving, or re-showing
        a second document while the first is still open). Fixed by only
        locking on the closed->open transition (`!wasOpen`).
     2. js/admin.js#openProfileModal() — async, awaits getUserByUsername()
        BEFORE calling lockBodyScroll(); a real double-click/double-tap on
        #btnProfile before that await resolves ran the function twice
        concurrently. Fixed with an in-flight guard cleared in `finally`.

   Also verifies document-viewer.js#closeViewer() now restores focus to
   whatever triggered it (previously dropped to <body> on every close —
   found in the same audit pass).

   [1] document-viewer.js, direct module import (no app boot needed):
       double showViewer() before closeViewer() leaves body scrollable
       after ONE close; focus is restored to the trigger element.
   [2] admin.js's real #btnProfile, real login (established 'leo'
       account), a genuine rapid double-click, one close: body is
       scrollable afterward, not stuck.

   Run: node scripts/ss12-scroll-lock-double-open-check.mjs   (exit 0 = pass) */

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
  else { fail++; console.log(`  ✗ ${name}`); if (detail !== undefined) console.log('     ' + JSON.stringify(detail)); }
};

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

console.log('[1 — document-viewer.js: double showViewer() before one closeViewer()]');
{
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/permission.denied/i.test(m.text())) errors.push('console.error: ' + m.text()); });
  await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle0', timeout: 45000 });

  const result = await page.evaluate(async () => {
    const mod = await import('/js/docs/document-viewer.js');
    const btn = document.createElement('button');
    btn.id = 'ss12TestTrigger';
    document.body.appendChild(btn);
    btn.focus();
    const blob = new Blob(['%PDF-1.4 fake'], { type: 'application/pdf' });
    mod.showViewer(blob, 'a.pdf', { title: 'A' });
    mod.showViewer(blob, 'b.pdf', { title: 'B' }); // the double-invocation
    const lockedAfterDoubleShow = document.body.classList.contains('sheet-scroll-lock');
    mod.closeViewer(); // ONE close, matching one real user click
    const stuckAfterOneClose = document.body.classList.contains('sheet-scroll-lock');
    const focusRestoredToTrigger = document.activeElement === btn;
    btn.remove();
    return { lockedAfterDoubleShow, stuckAfterOneClose, focusRestoredToTrigger };
  });
  check('body is scroll-locked after showViewer() (sanity)', result.lockedAfterDoubleShow, result);
  check('after ONE close following a DOUBLE showViewer(), body is NOT stuck locked (the SS12 fix)', !result.stuckAfterOneClose, result);
  check('closeViewer() restores focus to the original trigger element (the SS12 focus fix)', result.focusRestoredToTrigger, result);
  check('[1] zero console/page errors', errors.length === 0, errors);
  await browser.close();
}

console.log('\n[2 — admin.js: real #btnProfile, real double-click, real login]');
{
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/permission.denied/i.test(m.text())) errors.push('console.error: ' + m.text()); });
  await page.setViewport({ width: 1280, height: 900 });
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

  const hasBtn = await page.evaluate(() => !!document.getElementById('btnProfile'));
  if (!hasBtn) {
    check('#btnProfile exists for this account — cannot exercise the fix without it', false);
  } else {
    // A genuine rapid double-click — both clicks fire before
    // getUserByUsername()'s await resolves in real conditions.
    await page.evaluate(() => { document.getElementById('btnProfile').click(); document.getElementById('btnProfile').click(); });
    await new Promise((r) => setTimeout(r, 2000)); // let both in-flight opens fully settle
    const lockedAfterDoubleClick = await page.evaluate(() => document.body.classList.contains('sheet-scroll-lock'));
    await page.evaluate(() => { document.getElementById('btnCloseProfile')?.click(); });
    await new Promise((r) => setTimeout(r, 300));
    const stuckAfterOneClose = await page.evaluate(() => document.body.classList.contains('sheet-scroll-lock'));
    check('body is scroll-locked after the double-click (sanity — the modal did open)', lockedAfterDoubleClick);
    check('after ONE close following a rapid double-click, body is NOT stuck locked (the SS12 fix)', !stuckAfterOneClose, { lockedAfterDoubleClick, stuckAfterOneClose });
  }
  check('[2] zero unexpected console/page errors', errors.length === 0, errors);
  await browser.close();
}

server.close();
console.log(`\nss12-scroll-lock-double-open-check: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
