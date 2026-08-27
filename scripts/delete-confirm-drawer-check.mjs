/* delete-confirm-drawer-check.mjs — Design System Program Phase 11 (Administration)

   Regression check for the Delete Confirm modal's canonical-drawer
   migration (js/app.js#openDeleteConfirmModal/closeDeleteConfirmModal/
   initDeleteConfirmModal). Also closes a real, pre-existing coverage gap
   the Phase 11 audit flagged (Users U-7): this modal directly gates
   deleteUser(), and had zero automated coverage before this file.

   Method: real unauthenticated boot of index.html (app.js has zero
   ES exports and would need a real Firebase session to run its
   DOMContentLoaded path any other way — see [[design-system-program]]
   memory). window.appDebug.openDeleteConfirmModal/closeDeleteConfirmModal
   are test-only access points added alongside this migration, same
   convention as the pre-existing openFormModal/closeFormModal.

   Run: node scripts/delete-confirm-drawer-check.mjs (exit 0 = pass) */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); if (detail !== undefined) console.log('     • ' + String(detail).slice(0, 300)); }
};

console.log('[Phase 11] Delete Confirm modal — canonical drawer migration\n');

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  const content = fs.readFileSync(file);
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Content-Length': content.length });
  res.end(content);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const errors = [];
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
await page.goto(`http://localhost:${port}/index.html`, { waitUntil: 'networkidle0', timeout: 45000 });
await page.waitForFunction(() => typeof window.appDebug?.openDeleteConfirmModal === 'function', { timeout: 10000 });

const result = await page.evaluate(() => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  return (async () => {
    const out = {};

    // ── Zero references: input group visible, DELETE required ──────────
    window.appDebug.openDeleteConfirmModal({ type: 'user', id: 'ghost-user', name: 'Ghost User', refCount: 0 });
    await wait(50);
    out.drawerOpen = document.getElementById('modalDeleteConfirm')?.style.display !== 'none';
    out.title = document.querySelector('.drawer')?.getAttribute('aria-label');
    out.inputGroupVisible = document.getElementById('deleteConfirmInputGroup')?.style.display !== 'none';
    out.confirmBtnDisabledInitially = document.getElementById('btnConfirmDelete')?.disabled === true;
    out.refsShowsOk = document.getElementById('deleteConfirmRefs')?.innerHTML.includes('v2-delete-refs-ok');

    const input = document.getElementById('deleteConfirmInput');
    input.value = 'DEL';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(20);
    out.confirmStaysDisabledOnPartialMatch = document.getElementById('btnConfirmDelete')?.disabled === true;

    input.value = 'DELETE';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(20);
    out.confirmEnabledOnExactMatch = document.getElementById('btnConfirmDelete')?.disabled === false;

    // Cancel closes it and does not leak a pending-entity across opens.
    document.getElementById('btnCancelDeleteConfirm').click();
    await wait(50);
    out.closesOnCancel = document.getElementById('modalDeleteConfirm')?.style.display === 'none';

    // ── Non-zero references: input group hidden, nothing to type ───────
    window.appDebug.openDeleteConfirmModal({ type: 'user', id: 'busy-user', name: 'Busy User', refCount: 3 });
    await wait(50);
    out.refCountBlocksInputGroup = document.getElementById('deleteConfirmInputGroup')?.style.display === 'none';
    out.refsShowsWarning = document.getElementById('deleteConfirmRefs')?.innerHTML.includes('3 referensi');
    out.confirmDisabledWhenBlocked = document.getElementById('btnConfirmDelete')?.disabled === true;

    // ── Reopening for a DIFFERENT entity resets state (no stale title/value) ──
    window.appDebug.closeDeleteConfirmModal();
    await wait(50);
    window.appDebug.openDeleteConfirmModal({ type: 'user', id: 'ghost-user', name: 'Ghost User', refCount: 0 });
    await wait(50);
    out.reopenResetsTitle = document.querySelector('.drawer')?.getAttribute('aria-label') === 'Hapus Permanen — Ghost User';
    out.reopenResetsInputValue = document.getElementById('deleteConfirmInput')?.value === '';
    out.reopenResetsConfirmDisabled = document.getElementById('btnConfirmDelete')?.disabled === true;

    // ── Robustness: open while a PREVIOUS instance is still attached
    //    (no intervening close) must not lose the content node ──────────
    window.appDebug.openDeleteConfirmModal({ type: 'user', id: 'a', name: 'A', refCount: 0 });
    window.appDebug.openDeleteConfirmModal({ type: 'user', id: 'b', name: 'B', refCount: 0 });
    await wait(50);
    out.rapidReopenSurvives = document.getElementById('modalDeleteConfirm') !== null
      && document.querySelector('.drawer')?.getAttribute('aria-label') === 'Hapus Permanen — B';

    window.appDebug.closeDeleteConfirmModal();
    return out;
  })();
});

check('drawer opens for a zero-reference entity', result.drawerOpen);
check('title reads "Hapus Permanen — Ghost User"', result.title === 'Hapus Permanen — Ghost User', result.title);
check('DELETE-to-confirm input group is visible when refCount=0', result.inputGroupVisible);
check('confirm button starts disabled', result.confirmBtnDisabledInitially);
check('references panel shows the "safe to delete" state', result.refsShowsOk);
check('confirm stays disabled on a partial match ("DEL")', result.confirmStaysDisabledOnPartialMatch);
check('confirm enables on an exact "DELETE" match', result.confirmEnabledOnExactMatch);
check('Batal closes the drawer', result.closesOnCancel);
check('refCount>0 hides the input group entirely (nothing to type)', result.refCountBlocksInputGroup);
check('references panel shows the real blocked count ("3 referensi")', result.refsShowsWarning);
check('confirm stays disabled when blocked by references', result.confirmDisabledWhenBlocked);
check('reopening for a fresh entity resets the title', result.reopenResetsTitle);
check('reopening for a fresh entity resets the typed input', result.reopenResetsInputValue);
check('reopening for a fresh entity resets confirm to disabled', result.reopenResetsConfirmDisabled);
check('opening again WITHOUT closing first (stale-drawer edge case) still works — content node survives', result.rapidReopenSurvives);
check('zero fatal console errors (Firebase permission-denied noise is expected/informational)',
  errors.filter((e) => !/Permission denied|permission_denied|Fetch Firebase/.test(e)).length === 0,
  errors.join(' | '));

await browser.close();
server.close();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
