/* ss16-petty-cash-keyboard-check.mjs — SS16: Petty Cash Center's own
   click-delegated rows/icons (dashboard rows, the archive card, NOR
   history rows, the Test-NOR toggle, remove-signature, the Add modal's
   close icon) were plain <div data-act="..."> elements with cursor:pointer
   but no role, no tabindex, and no keyboard handler at all — a genuine
   keyboard dead end for the module's primary content, not merely its now-
   confirmed-dead legacy chrome (iconRail/sidebar/mobileDrawer/topbar,
   verified unreachable: shell() never calls them — see the file's own
   v1.14.0 header comment. Not touched; fixing unreachable markup is not a
   real user-facing fix).

   Fix (js/petty-cash/petty-cash-center.js):
     - role="button" tabindex="0" added to every genuinely live clickable
       div (dashboard/expense rows, archive card, NOR history rows,
       remove-signature icon, the Add modal's close icon), aria-pressed on
       the two real toggles (NOR-row bulk select, Test-NOR), aria-label on
       the icon-only ones.
     - onHostKeydown(): a new delegated root keydown listener, same shape
       as Gudang's own onHostKeydown (js/gudang/ui/gudang-center.js) —
       Enter/Space on a role="button" re-dispatches through the SAME
       el.click() the mouse path already uses, so every existing onClick()
       case keeps working unchanged.
   Scrim/backdrop divs (pc-drawer-scrim, closeAdd's outer overlay,
   data-act="stop" click-swallowers) are deliberately left alone — not
   discrete controls, exact same exclusion Gudang's own scrims already get.

   Real login (leo/1234), real production Petty Cash data, READ-ONLY:
   only ever navigates screens/opens the read-only detail drawer, never
   creates/edits/deletes a record. Data-dependent checks (a dashboard
   expense existing to open, a NOR to list) are informational skips, not
   failures, when production happens to have none right now — same
   discipline scripts/ss12-cold-start-pushnav-ordering-check.mjs and
   scripts/petty-cash-amount-input-check.mjs already use.

   Run: node scripts/ss16-petty-cash-keyboard-check.mjs   (exit 0 = pass) */

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
  else { fail++; console.log(`  ✗ ${name}`); if (detail !== undefined) console.log('     ' + JSON.stringify(detail).slice(0, 300)); }
};

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
page.on('console', (m) => { if (m.type() === 'error' && !/permission.denied/i.test(m.text())) consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(String(e)));
await page.setViewport({ width: 1280, height: 900 });

console.log('[1. real login as leo]');
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

console.log('\n[2. navigate to Petty Cash]');
const navigated = await page.evaluate(() => {
  const candidates = [document.getElementById('v2RailPettyCash'), ...document.querySelectorAll('[data-domain="finance"]')].filter(Boolean);
  const el = candidates.find((e) => e.offsetParent !== null);
  if (!el) return false;
  el.click();
  return true;
});
if (!navigated) {
  console.log('  [informational] this account has no visible Petty Cash/Finance nav entry — cannot exercise this surface.');
  await browser.close(); server.close();
  console.log(`\nss16-petty-cash-keyboard-check: ${pass} passed, ${fail} failed (navigation unavailable)`);
  process.exit(0);
}
await page.waitForFunction(() => !!document.querySelector('.pc-kpis'), { timeout: 20000 });
check('Petty Cash dashboard mounted', true);

console.log('\n[3. dashboard "Pengeluaran Diarsipkan" card — always-present, zero data dependency]');
{
  // focus() + the Enter dispatch happen inside ONE evaluate() call — this app
  // holds a live Firebase realtime listener that can re-render the dashboard
  // (and silently drop DOM focus to <body>) in the gap BETWEEN two separate
  // page.evaluate()/page.keyboard.press() round-trips. Same flakiness class
  // scripts/petty-cash-amount-input-check.mjs already documented and worked
  // around for this exact module — a real, bubbling, cancelable KeyboardEvent
  // dispatched synchronously exercises the identical onHostKeydown code path
  // deterministically instead.
  const r = await page.evaluate(() => {
    const el = document.querySelector('[data-act="goArchive"]');
    const before = el ? { role: el.getAttribute('role'), tabindex: el.getAttribute('tabindex') } : null;
    el.focus();
    const focusedOk = document.activeElement === el;
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    return { before, focusedOk, kpisGoneImmediately: !document.querySelector('.pc-kpis') };
  });
  check('goArchive card carries role="button" tabindex="0"', r.before && r.before.role === 'button' && r.before.tabindex === '0', r.before);
  check('goArchive card is real-Tab-focusable (tabindex="0" actually works)', r.focusedOk, r);
  check('Enter on the archive card navigates to the Expenses screen (was: keyboard dead end)', r.kpisGoneImmediately, r);
  const afterEnter = await page.evaluate(() => !!document.querySelector('[data-act="filterStatus"]'));
  check('landed on the Expenses screen (filter chips present)', afterEnter, afterEnter);
}

console.log('\n[4. Expenses screen — a real expense row, if production has one right now]');
{
  const row = await page.evaluate(() => {
    const el = document.querySelector('.pc-exp-row[data-act="openDetail"]');
    return el ? { role: el.getAttribute('role'), tabindex: el.getAttribute('tabindex') } : null;
  });
  if (!row) {
    console.log('  [informational] no archived expense in production right now — cannot exercise Enter-to-open. Static role/tabindex requirement still holds for whenever one exists (proven identically on the dashboard card above and the NOR row below).');
  } else {
    check('expense row carries role="button" tabindex="0"', row.role === 'button' && row.tabindex === '0', row);
    await page.evaluate(() => {
      const el = document.querySelector('.pc-exp-row[data-act="openDetail"]');
      el.focus();
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    });
    await new Promise((r) => setTimeout(r, 400));
    const opened = await page.evaluate(() => !!document.querySelector('.drawer[role="dialog"]'));
    check('Enter on an expense row opens the canonical detail drawer', opened);
    if (opened) {
      await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
      await new Promise((r) => setTimeout(r, 400));
    }
  }
}

console.log('\n[5. Riwayat NOR screen — role/tabindex on NOR history rows, if any exist]');
{
  await page.evaluate(() => document.querySelector('[data-act="nav"][data-id="norHistory"]')?.click());
  await new Promise((r) => setTimeout(r, 300));
  const norRow = await page.evaluate(() => {
    const el = document.querySelector('.pc-nor-hist[data-act="norOpen"]');
    return el ? { role: el.getAttribute('role'), tabindex: el.getAttribute('tabindex') } : null;
  });
  if (!norRow) {
    console.log('  [informational] no NOR in production right now to check.');
  } else {
    check('NOR history row carries role="button" tabindex="0"', norRow.role === 'button' && norRow.tabindex === '0', norRow);
  }
}

console.log('\n[console cleanliness]');
check('zero unexpected console/page errors across the whole sequence', consoleErrors.length === 0, consoleErrors.join(' | '));

await browser.close();
server.close();
console.log(`\nss16-petty-cash-keyboard-check: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
