/* agenda-home-search-adapter-check.mjs — V1.31.2 §7 (global clickability
   audit): proves the real gap found and fixed this phase — the always-
   visible topbar search box (#v2SearchInput) had NO adapter registered
   for the 'home' module (where Agenda/Kalender/To-Do lives), so it looked
   fully interactive but silently did nothing when the user was on Home.

   Fixed in js/app.js#registerSearchAdapters() by delegating 'home's query
   into the SAME existing [data-agenda-search] input's 'input' listener
   (agenda-workspace.js#wireHost()) — no second search implementation.

   Real login, real production data, READ-ONLY (search + clear only, no
   record created/edited/deleted). Whatever the session's real Agenda data
   currently is, this only asserts relative behavior (typing narrows the
   list; clearing restores it) — never a hardcoded title.

   Run: node scripts/agenda-home-search-adapter-check.mjs (exit 0 = pass) */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(req.url.split('?')[0]);
      const filePath = path.join(ROOT, urlPath === '/' ? '/index.html' : urlPath);
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('not found: ' + urlPath); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.listen(0, () => resolve(server));
  });
}

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}
async function checkAsync(name, run) {
  try { const r = await run(); check(name, r !== false, typeof r === 'string' ? r : ''); }
  catch (err) { fail++; console.log(`  ✗ ${name} — ${err.message}`); }
}

// Sets the value + dispatches a real 'input' event — exactly the DOM
// contract the app's own `v2SearchInput.addEventListener('input', ...)`
// listener reacts to; a real keystroke reaches the same code path.
async function typeIntoTopbarSearch(page, value) {
  await page.evaluate((v) => {
    const el = document.getElementById('v2SearchInput');
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
  await new Promise((r) => setTimeout(r, 250));
}

async function main() {
  const server = await startServer();
  const port = server.address().port;
  let browser;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    const consoleErrors = [];
    page.on('console', (msg) => { if (msg.type() === 'error' && !/permission_denied|Permission denied/i.test(msg.text())) consoleErrors.push(msg.text()); });
    page.on('pageerror', (err) => consoleErrors.push(String(err)));

    console.log('\n=== [1] Real login as leo, lands on Home ===');
    await page.goto(`http://localhost:${port}/index.html`, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.waitForSelector('#loginForm', { timeout: 20000 });
    await new Promise((r) => setTimeout(r, 500));
    await page.type('#loginUsername', 'leo');
    await page.type('#loginPin', '1234');
    await page.waitForSelector('.login-submit', { visible: true, timeout: 10000 });
    await new Promise((r) => setTimeout(r, 300));
    await page.click('.login-submit');
    await page.waitForFunction(() => { try { return JSON.parse(localStorage.getItem('pbsi_current_user') || 'null')?.username === 'leo'; } catch { return false; } }, { timeout: 30000 });
    await new Promise((r) => setTimeout(r, 4000));
    await page.evaluate(() => { document.getElementById('btnPushDismiss')?.click(); });
    check('logged in as leo', true);
    await page.waitForSelector('[data-agenda-search]', { timeout: 15000 }).catch(() => {});

    console.log('\n=== [2] Baseline: the global topbar search placeholder now names Agenda content on Home (was the generic default) ===');
    const placeholder = await page.evaluate(() => document.getElementById('v2SearchInput')?.placeholder);
    check('placeholder is the real "home" adapter\'s, not the generic "Cari…" fallback', placeholder && placeholder !== 'Cari…', `got "${placeholder}"`);

    const baselineRowCount = await page.evaluate(() => document.querySelectorAll('.cal-row, .cal-todo-row').length);
    console.log(`      (baseline visible Agenda rows: ${baselineRowCount})`);

    console.log('\n=== [3] Typing an IMPOSSIBLE query into the GLOBAL topbar box narrows the Agenda list to nothing — proves the box is now WIRED, not a no-op ===');
    await checkAsync('typing a query that matches nothing collapses the list to the empty state', async () => {
      await typeIntoTopbarSearch(page, 'zzz-impossible-query-zzz-nomatch');
      const rows = await page.evaluate(() => document.querySelectorAll('.cal-row, .cal-todo-row').length);
      const emptyVisible = await page.evaluate(() => !!document.querySelector('.cal-empty, .cal-empty-hint'));
      return rows === 0 && emptyVisible;
    });

    console.log('\n=== [4] The two search boxes share state — the inline Agenda box reflects what was typed in the topbar box (SAME underlying query, not a second parallel filter) ===');
    await checkAsync('[data-agenda-search]\'s own value now matches what was typed in the topbar box', () => page.evaluate(() =>
      document.querySelector('[data-agenda-search]')?.value === 'zzz-impossible-query-zzz-nomatch'
    ));

    console.log('\n=== [5] Clearing the GLOBAL topbar box (as clearModuleSearch() does on every navigation away from Home) restores the full list ===');
    await checkAsync('clearing the topbar query restores the baseline row count', async () => {
      await typeIntoTopbarSearch(page, '');
      const rows = await page.evaluate(() => document.querySelectorAll('.cal-row, .cal-todo-row').length);
      return rows === baselineRowCount;
    });

    console.log('\n=== [6] Navigating away from Home and back does not leave a stale query behind (matches every other adapter\'s documented reset-on-switch contract) ===');
    await checkAsync('switching module then returning to Home resets the topbar box to empty', async () => {
      await typeIntoTopbarSearch(page, 'stale-query-should-not-survive');
      // Real MODULE_DEFS rail ids only (v2Rail* also matches decorative
      // elements like the crest/avatar/theme button — never real nav).
      const NAV_RAIL_IDS = ['v2RailDriverOps', 'v2RailPettyCash', 'v2RailOvertime', 'v2RailAnalytics', 'v2RailKonfigurasi', 'v2RailEngineering', 'v2RailGudang', 'v2RailSarprasIntel'];
      const clickedOther = await page.evaluate((ids) => {
        const el = ids.map((id) => document.getElementById(id)).find((e) => e && e.offsetParent !== null);
        if (!el) return null;
        el.click();
        return el.id;
      }, NAV_RAIL_IDS);
      await new Promise((r) => setTimeout(r, 400));
      await page.evaluate(() => document.getElementById('v2RailHome')?.click());
      await new Promise((r) => setTimeout(r, 400));
      const val = await page.evaluate(() => document.getElementById('v2SearchInput')?.value);
      return val === '' ? true : `clicked "${clickedOther}" then Home; topbar box still holds "${val}"`;
    });

    console.log('\n=== [Z — zero fatal console/page errors across the whole run] ===');
    check('no fatal console errors or uncaught page errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

  } finally {
    if (browser) await browser.close();
    server.close();
  }

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
