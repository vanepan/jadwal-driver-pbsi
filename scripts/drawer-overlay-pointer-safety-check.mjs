/* drawer-overlay-pointer-safety-check.mjs — V1 fix (intermittent "whole
   screen frozen / unclickable" on mobile, reported around opening the
   sidebar).

   ROOT CAUSE: the canonical drawer overlay (#appDrawerOverlay, js/components/
   drawer.js) is position:fixed; inset:0; z-index:10000, and its DOM removal
   is deferred ~260ms behind a CSS transition (and can be delayed further by
   a backgrounded tab, or left behind by a rapid open→close→open race). While
   it lingers it had NO pointer-events:none — so a closing/closed/stale
   overlay stayed an invisible full-viewport click-blocker above the whole
   app, the mobile sidebar included: every tap was swallowed → "frozen".
   (Blur was NOT the cause — no blur declarations were changed.)

   FIX:
     • platform.css: .drawer-overlay:not(.is-open) { pointer-events: none }
     • drawer.js: closeDrawer() sets overlay.style.pointerEvents='none'
       synchronously, and its deferred cleanup now removes the node
       UNCONDITIONALLY (never leaves it on a superseded-seq bail); openDrawer()
       hard-removes EVERY stale #appDrawerOverlay (querySelectorAll).
     • drawer.js: an external closeDrawer() (no arg) falls back to the
       drawer's own registered onClose, so the consumer is fully torn down.

   Real browser, deterministic. Run: node scripts/drawer-overlay-pointer-safety-check.mjs */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const check = (name, cond, detail) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); if (detail !== undefined) console.log('     ' + JSON.stringify(detail)); } };

const MIME = { '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, r));
const port = server.address().port;
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });

async function freshPage(vw = 390) {
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|favicon/i.test(m.text())) errs.push('err: ' + m.text().slice(0, 180)); });
  await page.setViewport({ width: vw, height: 800 });
  await page.goto(`http://localhost:${port}/scripts/drawer-overlay-pointer-safety-harness.html`, { waitUntil: 'networkidle0', timeout: 45000 });
  await page.evaluate(async () => {
    window.__d = await import('/js/components/drawer.js');
    window.__behindClicks = 0;
    document.getElementById('behind').addEventListener('click', () => { window.__behindClicks++; });
  });
  return { page, errs };
}

const OPEN = `window.__d.openDrawer({ title:'T', body:'<p>hi</p>', footer:[{label:'X',action:'x'}] })`;

/* ── 1. An OPEN drawer overlay does intercept pointers (baseline) ──────── */
console.log('\n[1 — while .is-open, the overlay is interactive]');
{
  const { page, errs } = await freshPage();
  const r = await page.evaluate(async (open) => {
    eval(open);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const o = document.getElementById('appDrawerOverlay');
    return { exists: !!o, isOpen: o.classList.contains('is-open'), pe: getComputedStyle(o).pointerEvents };
  }, OPEN);
  check('overlay exists and is .is-open', r.exists && r.isOpen, r);
  check('an OPEN overlay has interactive pointer-events (scrim click-to-dismiss still works)', r.pe !== 'none', r);
  check('no console errors', errs.length === 0, errs);
  await page.close();
}

/* ── 2. A CLOSING overlay stops capturing pointers IMMEDIATELY ─────────── */
console.log('\n[2 — the moment it closes, taps reach the app behind it (before the ~260ms removal)]');
{
  const { page, errs } = await freshPage();
  const r = await page.evaluate(async (open) => {
    eval(open);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    window.__d.closeDrawer();
    // synchronously after closeDrawer(), BEFORE the deferred removal:
    const o = document.getElementById('appDrawerOverlay');
    const stillInDom = !!o;
    const inlinePe = o ? o.style.pointerEvents : null;
    const computedPe = o ? getComputedStyle(o).pointerEvents : null;
    const isOpen = o ? o.classList.contains('is-open') : null;
    return { stillInDom, inlinePe, computedPe, isOpen };
  }, OPEN);
  check('right after closeDrawer(), the overlay is no longer .is-open', r.isOpen === false, r);
  check('right after closeDrawer(), inline pointer-events is "none"', r.inlinePe === 'none', r);
  check('right after closeDrawer(), COMPUTED pointer-events is "none" (CSS :not(.is-open) rule)', r.computedPe === 'none', r);

  // a real click at viewport centre now reaches the app content behind it
  await page.mouse.click(195, 400);
  const behindClicks = await page.evaluate(() => window.__behindClicks);
  check('a click during the fade-out reaches the app content behind the overlay (not swallowed)', behindClicks >= 1, { behindClicks });

  await new Promise(r => setTimeout(r, 350));
  const gone = await page.evaluate(() => !document.getElementById('appDrawerOverlay'));
  check('the overlay node is fully removed after the fade-out window', gone);
  check('no console errors', errs.length === 0, errs);
  await page.close();
}

/* ── 3. Rapid open → close → open ×5 leaves exactly one, interactive ───── */
console.log('\n[3 — rapid open/close/open ×5: exactly one overlay, interactive; then a clean close]');
{
  const { page, errs } = await freshPage();
  const r = await page.evaluate(async (open) => {
    for (let i = 0; i < 5; i++) { eval(open); window.__d.closeDrawer(); eval(open); }
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const nodes = document.querySelectorAll('#appDrawerOverlay');
    const o = nodes[0];
    const openState = { count: nodes.length, isOpen: o?.classList.contains('is-open'), pe: o ? getComputedStyle(o).pointerEvents : null };
    window.__d.closeDrawer();
    await new Promise(r => setTimeout(r, 350));
    const afterClose = { count: document.querySelectorAll('#appDrawerOverlay').length };
    return { openState, afterClose };
  }, OPEN);
  check('exactly one #appDrawerOverlay after the rapid cycle', r.openState.count === 1, r.openState);
  check('it is .is-open and interactive', r.openState.isOpen === true && r.openState.pe !== 'none', r.openState);
  check('a following close removes it entirely (no lingering node)', r.afterClose.count === 0, r.afterClose);
  check('no console errors', errs.length === 0, errs);
  await page.close();
}

/* ── 4. A manually-injected stale overlay (no .is-open) never blocks ───── */
console.log('\n[4 — a stale #appDrawerOverlay left in the DOM without .is-open is inert]');
{
  const { page, errs } = await freshPage();
  const r = await page.evaluate(() => {
    const stale = document.createElement('div');
    stale.id = 'appDrawerOverlay';
    stale.className = 'v2-analytics-claude drawer-overlay'; // note: NO .is-open
    document.body.appendChild(stale);
    return { pe: getComputedStyle(stale).pointerEvents, z: getComputedStyle(stale).zIndex };
  });
  check('a stale drawer overlay computes pointer-events:none', r.pe === 'none', r);
  await page.mouse.click(195, 400);
  const behindClicks = await page.evaluate(() => window.__behindClicks);
  check('clicks pass straight through the stale overlay to the app', behindClicks >= 1, { behindClicks });
  check('no console errors', errs.length === 0, errs);
  await page.close();
}

/* ── 5. External closeDrawer() (no arg) still fires the registered onClose ─ */
console.log('\n[5 — an external closeDrawer() fully tears the consumer down (onClose fallback)]');
{
  const { page, errs } = await freshPage();
  const r = await page.evaluate(async () => {
    let closed = 0;
    window.__d.openDrawer({ title: 'T', body: '<p>x</p>', onClose: () => { closed++; } });
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    window.__d.closeDrawer(); // no onClose arg — must fall back to the registered one
    await new Promise(r => setTimeout(r, 350));
    return { closed, gone: !document.getElementById('appDrawerOverlay') };
  });
  check('the drawer\'s registered onClose ran even though closeDrawer() was called with no argument', r.closed === 1, r);
  check('the overlay is gone', r.gone === true, r);
  check('no console errors', errs.length === 0, errs);
  await page.close();
}

/* ── 6. Responsive — the inert-when-closed rule holds at every width ───── */
console.log('\n[6 — pointer-events:none on a closed overlay at every viewport width]');
for (const w of [320, 375, 390, 430, 475, 768, 1024, 1440]) {
  const { page, errs } = await freshPage(w);
  const pe = await page.evaluate(async (open) => {
    eval(open);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    window.__d.closeDrawer();
    const o = document.getElementById('appDrawerOverlay');
    return o ? getComputedStyle(o).pointerEvents : 'removed';
  }, OPEN);
  check(`@${w}px: a closing overlay is pointer-events:none`, pe === 'none' || pe === 'removed', { w, pe });
  check(`@${w}px: no console errors`, errs.length === 0, errs);
  await page.close();
}

await browser.close();
server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
