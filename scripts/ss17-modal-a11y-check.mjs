/* ss17-modal-a11y-check.mjs — SS17: js/ui/modal-a11y.js is the new shared
   bolt-on focus-trap + Escape + focus-restore utility for the hand-rolled
   modal overlays that predate js/components/drawer.js and were too large/
   risky to migrate onto it wholesale this phase (Command Palette,
   Notifications/Activity Log, Profile/Settings, the 3 legacy assignment
   satellite modals in js/modal.js, Engineering's create/report modal).
   Same trap algorithm js/components/drawer.js's openDrawer() already uses
   internally, packaged for reuse instead of duplicated.

   This test exercises attachModalA11y() in isolation, including its
   distinguishing feature over a plain captured-element trap: `overlayRef`
   may be a () => element GETTER, so a caller whose overlay DOM node is
   destroyed and recreated on every re-render while open (Engineering's
   create modal, re-rendered on every personnel-search keystroke) still
   gets a live, non-stale trap.

   Direct module import against the real app shell — no login needed.

   Run: node scripts/ss17-modal-a11y-check.mjs   (exit 0 = pass) */

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

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/permission.denied/i.test(m.text())) errors.push('console.error: ' + m.text()); });
await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle0', timeout: 45000 });

console.log('[A. attach moves focus to the first focusable node by default]');
{
  const r = await page.evaluate(async () => {
    const { attachModalA11y } = await import('/js/ui/modal-a11y.js');
    const trigger = document.createElement('button'); trigger.id = 'a11yTrigger'; document.body.appendChild(trigger);
    trigger.focus();
    const overlay = document.createElement('div');
    overlay.innerHTML = '<button id="first">First</button><button id="last">Last</button>';
    document.body.appendChild(overlay);
    const handle = attachModalA11y(overlay);
    const focusedFirst = document.activeElement && document.activeElement.id === 'first';
    handle.release();
    const restoredToTrigger = document.activeElement === trigger;
    trigger.remove(); overlay.remove();
    return { focusedFirst, restoredToTrigger };
  });
  check('focus moves to the first focusable node on attach', r.focusedFirst, r);
  check('release() restores focus to the trigger (captured document.activeElement at attach time)', r.restoredToTrigger, r);
}

console.log('\n[B. Tab from the last node wraps to the first — real trap]');
{
  const r = await page.evaluate(async () => {
    const { attachModalA11y } = await import('/js/ui/modal-a11y.js');
    const overlay = document.createElement('div');
    overlay.innerHTML = '<button id="first">First</button><button id="mid">Mid</button><button id="last">Last</button>';
    document.body.appendChild(overlay);
    const handle = attachModalA11y(overlay);
    document.getElementById('last').focus();
    const ev = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    document.dispatchEvent(ev);
    const wrapped = document.activeElement && document.activeElement.id === 'first';
    const defaultPrevented = ev.defaultPrevented;
    handle.release();
    overlay.remove();
    return { wrapped, defaultPrevented };
  });
  check('Tab from the last node wraps to the first (page behind it never gets focus)', r.wrapped, r);
  check('the wrapping Tab keydown was preventDefault()ed', r.defaultPrevented, r);
}

console.log('\n[C. Shift+Tab from the first node wraps to the last]');
{
  const r = await page.evaluate(async () => {
    const { attachModalA11y } = await import('/js/ui/modal-a11y.js');
    const overlay = document.createElement('div');
    overlay.innerHTML = '<button id="first">First</button><button id="last">Last</button>';
    document.body.appendChild(overlay);
    const handle = attachModalA11y(overlay);
    document.getElementById('first').focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
    const wrapped = document.activeElement && document.activeElement.id === 'last';
    handle.release();
    overlay.remove();
    return { wrapped };
  });
  check('Shift+Tab from the first node wraps to the last', r.wrapped, r);
}

console.log('\n[D. Escape calls onEscape exactly once; omitting onEscape does not throw]');
{
  const r = await page.evaluate(async () => {
    const { attachModalA11y } = await import('/js/ui/modal-a11y.js');
    const overlay = document.createElement('div');
    overlay.innerHTML = '<button id="only">Only</button>';
    document.body.appendChild(overlay);
    let calls = 0;
    const handle = attachModalA11y(overlay, { onEscape: () => { calls++; } });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    handle.release();
    // A second overlay with NO onEscape must not throw on Escape (callers
    // that already own their own Escape handling elsewhere pass none).
    const overlay2 = document.createElement('div');
    overlay2.innerHTML = '<button id="only2">Only</button>';
    document.body.appendChild(overlay2);
    const handle2 = attachModalA11y(overlay2);
    let threw = false;
    try { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); } catch (_) { threw = true; }
    handle2.release();
    overlay.remove(); overlay2.remove();
    return { calls, threw };
  });
  check('onEscape is invoked exactly once per Escape press', r.calls === 1, r);
  check('omitting onEscape does not throw on Escape', !r.threw, r);
}

console.log('\n[E. restoreOnRelease:false skips the focus-restore step entirely]');
{
  const r = await page.evaluate(async () => {
    const { attachModalA11y } = await import('/js/ui/modal-a11y.js');
    const trigger = document.createElement('button'); document.body.appendChild(trigger);
    trigger.focus();
    const overlay = document.createElement('div');
    overlay.innerHTML = '<button id="only">Only</button>';
    document.body.appendChild(overlay);
    const handle = attachModalA11y(overlay, { restoreOnRelease: false });
    document.getElementById('only').focus();
    trigger.remove(); // simulate the trigger having been torn down mid-flow
    let threw = false;
    try { handle.release(); } catch (_) { threw = true; }
    const stillOnOverlayEl = document.activeElement === document.getElementById('only');
    overlay.remove();
    return { threw, stillOnOverlayEl };
  });
  check('release() with restoreOnRelease:false does not throw even if the original trigger is gone', !r.threw, r);
  check('release() with restoreOnRelease:false leaves focus untouched (no restore attempted)', r.stillOnOverlayEl, r);
}

console.log('\n[F. live getter — trap survives the overlay DOM node being replaced (Engineering create-modal re-render)]');
{
  const r = await page.evaluate(async () => {
    const { attachModalA11y } = await import('/js/ui/modal-a11y.js');
    const host = document.createElement('div');
    document.body.appendChild(host);
    host.innerHTML = '<div class="ov"><button id="first">First</button><button id="last">Last</button></div>';
    const handle = attachModalA11y(() => host.querySelector('.ov'));
    // Simulate a full re-render (a NEW .ov node, old one detached) —
    // exactly what host.innerHTML = ... does on every Engineering render()
    // while the create modal is open.
    host.innerHTML = '<div class="ov"><button id="first">First</button><button id="mid">Mid</button><button id="last">Last</button></div>';
    document.getElementById('last').focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    const wrappedAfterReRender = document.activeElement && document.activeElement.id === 'first';
    handle.release();
    host.remove();
    return { wrappedAfterReRender };
  });
  check('the trap still works against the POST-re-render DOM (not a stale detached node)', r.wrappedAfterReRender, r);
}

console.log('\n[console cleanliness]');
check('zero console/page errors across the whole sequence', errors.length === 0, errors.join(' | '));

await browser.close();
server.close();
console.log(`\nss17-modal-a11y-check: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
