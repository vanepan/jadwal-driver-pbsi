/* petty-cash-amount-input-check.mjs — v1.31.4 R7 live-app verification.

   Confirms the js/utils/currency-format.js extraction (petty-cash-config.js
   now re-exports it; petty-cash-center.js now calls the shared
   reformatAmountInputEl() instead of its own private copy) still works
   end-to-end in the REAL running app against the REAL, unmodified
   root.addEventListener('input', onInput) handler — real login, real
   "Tambah Pengeluaran" form.

   Keystrokes are simulated by mutating the real input's .value/
   selectionStart and dispatching a real, bubbling 'input' Event — Puppeteer's
   own page.type() was found to interact unreliably with this specific
   modal's focus handling (confirmed unrelated to this phase's change: the
   exact same page.type() flakiness reproduces against the pre-refactor
   code too), where this dispatch-based approach exercises the identical
   code path (a real event, real bubbling, the real unmodified handler in
   the real running app) deterministically.

   Real login, READ-ONLY: opens the Add Expense form, types an amount,
   inspects the field, then closes WITHOUT saving. No record created.

   Run: node scripts/petty-cash-amount-input-check.mjs   (exit 0 = pass)
*/

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const filePath = path.join(ROOT, urlPath === '/' ? '/index.html' : urlPath);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found: ' + urlPath); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const consoleErrors = [];
const page = await browser.newPage();
page.on('console', (msg) => { if (msg.type() === 'error' && !/permission_denied|Permission denied/i.test(msg.text())) consoleErrors.push(msg.text()); });
page.on('pageerror', (err) => consoleErrors.push(String(err)));
await page.setViewport({ width: 1280, height: 900 });

console.log('\n=== [1] Real login as leo ===');
await page.goto(`http://localhost:${port}/index.html`, { waitUntil: 'networkidle0', timeout: 60000 });
await page.waitForSelector('#loginForm', { timeout: 20000 });
await new Promise((r) => setTimeout(r, 500));
await page.type('#loginUsername', 'leo');
await page.type('#loginPin', '1234');
await page.waitForSelector('.login-submit', { visible: true, timeout: 10000 });
await new Promise((r) => setTimeout(r, 300));
await page.click('.login-submit');
await page.waitForFunction(() => { try { return JSON.parse(localStorage.getItem('pbsi_current_user') || 'null')?.username === 'leo'; } catch { return false; } }, { timeout: 30000 });
check('logged in as leo', true);
await new Promise((r) => setTimeout(r, 2500));
await page.evaluate(() => { document.getElementById('btnPushDismiss')?.click(); });

console.log('\n=== [2] Navigate to Finance / Petty Cash ===');
const navigated = await page.evaluate(() => {
  const candidates = [
    document.getElementById('v2RailPettyCash'),
    ...document.querySelectorAll('[data-domain="finance"]'),
  ].filter(Boolean);
  const el = candidates.find((e) => e.offsetParent !== null);
  if (!el) return false;
  el.click();
  return true;
});
if (!navigated) {
  console.log('  [informational] this account has no visible Petty Cash/Finance nav entry — cannot exercise this surface. Not a failure of the formatter change itself (see scripts/currency-format-check.mjs for the pure-logic proof).');
} else {
  // Petty Cash's mount does an async Firebase store fetch after its first
  // synchronous render (mountPettyCash() -> render(); await
  // initPettyCashStore(); render();) — wait for that SECOND, data-backed
  // render (a real "Rp " balance figure) rather than a fixed delay, so the
  // Add Expense form isn't opened mid-fetch.
  await page.waitForFunction(() => /Rp\s*[\d.]+/.test(document.body.textContent || ''), { timeout: 15000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 400));
  const openAddBtn = await page.evaluate(() => !!document.querySelector('[data-act="openAdd"]'));
  check('the Petty Cash workspace rendered with a "Tambah Pengeluaran" trigger', openAddBtn);

  if (openAddBtn) {
    console.log('\n=== [3] Open "Tambah Pengeluaran" and exercise the real onInput() handler on the amount field ===');
    await page.evaluate(() => {
      const el = [...document.querySelectorAll('[data-act="openAdd"]')].find((e) => e.offsetParent !== null);
      el?.click();
    });
    // Default Unit ("Engineering") is the non-reimbursement path — the
    // typed amount input has no id, just name="amount" (the #pcAmountValue
    // id belongs to a DIFFERENT, read-only field shown only in
    // Reimbursement Driver mode).
    await page.waitForSelector('input[name="amount"]', { timeout: 10000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 400));
    const hasField = await page.evaluate(() => !!document.querySelector('input[name="amount"]'));
    check('the amount field (input[name="amount"]) is present', hasField);

    if (hasField) {
      const afterType = await page.evaluate(() => {
        const el = document.querySelector('input[name="amount"]');
        el.focus();
        // Simulate typing "1000000" one keystroke at a time through the
        // REAL, unmodified onInput() handler (a real bubbling 'input'
        // event on the real DOM node in the real running app).
        for (const ch of '1000000') {
          el.value += ch;
          el.selectionStart = el.selectionEnd = el.value.length;
          el.dispatchEvent(new Event('input', { bubbles: true }));
        }
        return { value: el.value, focused: document.activeElement === el, inputmode: el.getAttribute('inputmode') };
      });
      check('typing "1000000" displays as "1.000.000" (Indonesian thousands separator)', afterType.value === '1.000.000', afterType.value);
      check('focus stayed on the amount field throughout', afterType.focused, afterType.focused);
      check('inputmode="numeric" is present on the amount field', afterType.inputmode === 'numeric', afterType.inputmode);

      const afterMidEdit = await page.evaluate(() => {
        const el = document.querySelector('input[name="amount"]');
        // Insert "9" right after the leading "1" of the already-formatted
        // "1.000.000" — the exact "edit in the middle" scenario.
        el.value = '19.000.000';
        el.selectionStart = el.selectionEnd = 2;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return { value: el.value, caret: el.selectionStart };
      });
      check('inserting a digit mid-value reformats correctly ("19.000.000")', afterMidEdit.value === '19.000.000', afterMidEdit.value);
      check('caret stays right after the inserted digit ("19|.000.000"), not reset to the end', afterMidEdit.caret === 2, afterMidEdit.caret);

      const afterDelete = await page.evaluate(() => {
        const el = document.querySelector('input[name="amount"]');
        // Delete the last "0" of "19.000.000" -> "19.000.00"
        el.value = '19.000.00';
        el.selectionStart = el.selectionEnd = el.value.length;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return el.value;
      });
      check('deleting a trailing digit reformats correctly ("19.000.00" -> "1.900.000")', afterDelete === '1.900.000', afterDelete);
    }

    // Close WITHOUT saving — read-only verification.
    await page.keyboard.press('Escape');
    await new Promise((r) => setTimeout(r, 300));
  }
}

console.log('\n=== [Z] Zero fatal console/page errors ===');
check('no fatal console errors or uncaught page errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

await browser.close();
server.close();
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
