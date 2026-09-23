/* ss16-focus-lifecycle-check.mjs — SS16: document-viewer.js's modal claims
   role="dialog" aria-modal="true" but never actually behaved like a modal
   dialog for keyboard/screen-reader users.

   Found during the SS16 accessibility audit (js/docs/document-viewer.js):
   SS12 fixed closeViewer() restoring focus to the trigger, but the OPEN
   half was still missing entirely —
     1. showViewer() never moved focus into the dialog. A keyboard user
        activating Preview/Cetak landed nowhere: focus stayed on the
        trigger (or wherever it was), so Tab continued into whatever the
        underlying page had next in DOM order — a control sighted behind
        the opaque overlay, not the dialog that visually opened.
     2. There was no Tab trap at all. Even a user who DID reach a control
        inside the dialog (e.g. via mouse click) could Tab straight out of
        it into the page behind, same hidden-focus problem from the other
        direction.

   Fix (js/docs/document-viewer.js):
     - showViewer() now focuses #docvClose on the real closed->open
       transition only (mirrors the existing wasOpen-gated scroll-lock —
       re-showing a second document while already open does not yank focus
       away from wherever the user has it).
     - A local _trapTab(), same shape as the canonical drawer's
       (js/components/drawer.js _trapTab), cycles Tab/Shift+Tab within
       .docv-modal. Wired into the SAME document-level keydown listener
       that already owned Escape, not a second listener.

   Direct module import (no app boot needed) — same harness contract as
   ss12-scroll-lock-double-open-check.mjs's part [1].

   Run: node scripts/ss16-focus-lifecycle-check.mjs   (exit 0 = pass) */

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

console.log('[A. showViewer() moves focus into the dialog on real open]');
{
  const r = await page.evaluate(async () => {
    const mod = await import('/js/docs/document-viewer.js');
    const btn = document.createElement('button');
    btn.id = 'ss16Trigger';
    document.body.appendChild(btn);
    btn.focus();
    const focusedBeforeOpen = document.activeElement === btn;
    const blob = new Blob(['%PDF-1.4 fake'], { type: 'application/pdf' });
    mod.showViewer(blob, 'a.pdf', { title: 'A' });
    const active = document.activeElement;
    const focusedCloseBtn = active && active.id === 'docvClose';
    mod.closeViewer();
    btn.remove();
    return { focusedBeforeOpen, focusedCloseBtn, activeId: active && active.id };
  });
  check('trigger genuinely had focus before open (sanity)', r.focusedBeforeOpen, r);
  check('focus moves to the dialog close button on open (was: stayed on the trigger)', r.focusedCloseBtn, r);
}

console.log('\n[B. re-showing a second document while already open does not steal focus back]');
{
  const r = await page.evaluate(async () => {
    const mod = await import('/js/docs/document-viewer.js');
    const blob = new Blob(['%PDF-1.4 fake'], { type: 'application/pdf' });
    mod.showViewer(blob, 'a.pdf', { title: 'A' });
    document.getElementById('docvDownload').focus();
    mod.showViewer(blob, 'b.pdf', { title: 'B' }); // re-show while wasOpen === true
    const active = document.activeElement;
    mod.closeViewer();
    return { activeId: active && active.id };
  });
  check('user\'s manual focus position survives a re-show while already open', r.activeId === 'docvDownload', r);
}

console.log('\n[C. Tab from the last control wraps to the first — real trap, no page leak]');
{
  const r = await page.evaluate(async () => {
    const mod = await import('/js/docs/document-viewer.js');
    const blob = new Blob(['%PDF-1.4 fake'], { type: 'application/pdf' });
    mod.showViewer(blob, 'a.pdf', { title: 'A' });
    document.getElementById('docvPrint').focus(); // last visible control (Share hidden: no navigator.share in headless)
    return { lastId: document.activeElement.id };
  });
  check('positioned on the last control (docvPrint) for the trap test', r.lastId === 'docvPrint', r);
  await page.keyboard.press('Tab');
  const afterTab = await page.evaluate(() => document.activeElement.id);
  check('Tab from the last control wraps to the dialog close button, not the page behind it', afterTab === 'docvClose', afterTab);
  await page.evaluate(async () => { const mod = await import('/js/docs/document-viewer.js'); mod.closeViewer(); });
}

console.log('\n[D. Shift+Tab from the first control wraps to the last]');
{
  await page.evaluate(async () => {
    const mod = await import('/js/docs/document-viewer.js');
    const blob = new Blob(['%PDF-1.4 fake'], { type: 'application/pdf' });
    mod.showViewer(blob, 'a.pdf', { title: 'A' });
  });
  const focused = await page.evaluate(() => document.activeElement.id);
  check('opens with focus on docvClose (first control)', focused === 'docvClose', focused);
  await page.keyboard.down('Shift');
  await page.keyboard.press('Tab');
  await page.keyboard.up('Shift');
  const afterShiftTab = await page.evaluate(() => document.activeElement.id);
  check('Shift+Tab from the first control wraps to the last (docvPrint)', afterShiftTab === 'docvPrint', afterShiftTab);
  await page.evaluate(async () => { const mod = await import('/js/docs/document-viewer.js'); mod.closeViewer(); });
}

console.log('\n[E. Escape still closes the dialog — unchanged SS-prior behavior]');
{
  await page.evaluate(async () => {
    const mod = await import('/js/docs/document-viewer.js');
    const blob = new Blob(['%PDF-1.4 fake'], { type: 'application/pdf' });
    mod.showViewer(blob, 'a.pdf', { title: 'A' });
  });
  await page.keyboard.press('Escape');
  const closed = await page.evaluate(() => !document.getElementById('docvOverlay').classList.contains('open'));
  check('Escape still closes the dialog', closed);
}

console.log('\n[console cleanliness]');
check('zero console/page errors across the whole sequence', errors.length === 0, errors.join(' | '));

await browser.close();
server.close();
console.log(`\nss16-focus-lifecycle-check: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
