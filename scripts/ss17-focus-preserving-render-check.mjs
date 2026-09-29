/* ss17-focus-preserving-render-check.mjs — SS17: js/ui/focus-preserving-
   render.js's createFocusGuard() was hardcoded to key off `data-focus`
   only, which meant re-render-heavy modules that already have their own
   stable action attribute (js/agenda/*'s `data-agenda-action`/
   `data-drawer-action`) had to either add a redundant SECOND attribute
   everywhere just for this, or (as Agenda did, pre-fix) simply drop focus
   to <body> on every action-driven re-render.

   Extended (backward-compatibly — default `attr: 'focus'` is unchanged)
   to accept a configurable dataset attribute, plus an optional `fallback`
   for restore() when the captured key no longer exists post-render (e.g.
   the acted-on element was itself removed) — without one, restore()
   silently no-ops, same as before.

   Direct module import against the real app shell (same harness contract
   as ss16-focus-lifecycle-check.mjs) — no login needed, pure DOM.

   Run: node scripts/ss17-focus-preserving-render-check.mjs   (exit 0 = pass) */

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

console.log('[A. default attr="focus" — byte-identical to the pre-SS17 contract]');
{
  const r = await page.evaluate(async () => {
    const { createFocusGuard } = await import('/js/ui/focus-preserving-render.js');
    const root = document.createElement('div');
    document.body.appendChild(root);
    root.innerHTML = '<input data-focus="q" value="abc">';
    const input = root.querySelector('input');
    input.focus();
    input.setSelectionRange(1, 2);
    const guard = createFocusGuard();
    guard.capture(root);
    root.innerHTML = '<input data-focus="q" value="abc">';
    guard.restore(root);
    const active = document.activeElement;
    const result = { refocused: active === root.querySelector('input'), start: active.selectionStart, end: active.selectionEnd };
    root.remove();
    return result;
  });
  check('default guard refocuses the element sharing data-focus', r.refocused, r);
  check('default guard restores the caret/selection range', r.start === 1 && r.end === 2, r);
}

console.log('\n[B. custom attr — keys off an existing action attribute, no data-focus needed]');
{
  const r = await page.evaluate(async () => {
    const { createFocusGuard } = await import('/js/ui/focus-preserving-render.js');
    const root = document.createElement('div');
    document.body.appendChild(root);
    root.innerHTML = '<button data-agenda-action="cal-next">Next</button>';
    root.querySelector('button').focus();
    const guard = createFocusGuard({ attr: 'agenda-action' });
    guard.capture(root);
    root.innerHTML = '<button data-agenda-action="cal-next">Next</button>';
    guard.restore(root);
    const refocused = document.activeElement === root.querySelector('button');
    root.remove();
    return { refocused };
  });
  check('custom-attr guard refocuses the element sharing data-agenda-action', r.refocused, r);
}

console.log('\n[C. restore() with no matching element and no fallback — silent no-op, same as pre-SS17]');
{
  const r = await page.evaluate(async () => {
    const { createFocusGuard } = await import('/js/ui/focus-preserving-render.js');
    const root = document.createElement('div');
    document.body.appendChild(root);
    root.innerHTML = '<button data-agenda-action="toggle-task-done:x1">Done</button>';
    root.querySelector('button').focus();
    const guard = createFocusGuard({ attr: 'agenda-action' });
    guard.capture(root);
    // The acted-on element (the filtered-out task) is genuinely gone post-render.
    root.innerHTML = '<div id="elsewhere" tabindex="0"></div>';
    let threw = false;
    try { guard.restore(root); } catch (_) { threw = true; }
    root.remove();
    return { threw };
  });
  check('no-op leaves focus wherever the browser already put it (no throw)', !r.threw, r);
}

console.log('\n[D. restore() with a fallback getter — SS17 audit\'s Repro B (picker->form transition)]');
{
  const r = await page.evaluate(async () => {
    const { createFocusGuard } = await import('/js/ui/focus-preserving-render.js');
    const root = document.createElement('div');
    document.body.appendChild(root);
    root.innerHTML = '<button data-drawer-action="picker:done">Selesai</button>';
    root.querySelector('button').focus();
    const guard = createFocusGuard({ attr: 'drawer-action' });
    guard.capture(root);
    root.innerHTML = '<button data-drawer-action="picker:open">+ Tambah</button><button class="drawer__close">X</button>';
    guard.restore(root, () => root.querySelector('[data-drawer-action="picker:open"]') || root.querySelector('.drawer__close'));
    const landedOnOpenBtn = document.activeElement === root.querySelector('[data-drawer-action="picker:open"]');
    root.remove();
    return { landedOnOpenBtn };
  });
  check('falls back to the "+ Tambah" button instead of stranding focus on <body>', r.landedOnOpenBtn, r);
}

console.log('\n[E. restore() with a fallback as a plain element (not a function)]');
{
  const r = await page.evaluate(async () => {
    const { createFocusGuard } = await import('/js/ui/focus-preserving-render.js');
    const root = document.createElement('div');
    document.body.appendChild(root);
    root.innerHTML = '<button data-drawer-action="picker:toggle:zzz">Row</button>';
    root.querySelector('button').focus();
    const guard = createFocusGuard({ attr: 'drawer-action' });
    guard.capture(root);
    const fallbackTarget = document.createElement('button');
    fallbackTarget.textContent = 'fallback';
    root.innerHTML = ''; // total teardown — old key AND the button itself both gone
    root.appendChild(fallbackTarget);
    guard.restore(root, fallbackTarget);
    const landed = document.activeElement === fallbackTarget;
    root.remove();
    return { landed };
  });
  check('accepts a plain element (not just a getter) as fallback', r.landed, r);
}

console.log('\n[console cleanliness]');
check('zero console/page errors across the whole sequence', errors.length === 0, errors.join(' | '));

await browser.close();
server.close();
console.log(`\nss17-focus-preserving-render-check: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
