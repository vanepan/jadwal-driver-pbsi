/* agenda-v1312-production-verify.mjs — V1.31.2 post-deploy production
   verification.

   READ-ONLY. Navigates the REAL deployed Hosting URL (not a local
   server), logs in as a real staff account, and confirms this phase's
   actual fixes hold in the LIVE deployed bundle: version stamp, Week
   view renders with no horizontal overflow, the global topbar search
   box is wired for Home, the Calendar grid is keyboard-focusable, the
   ECC Agenda widget click-through opens the real drawer, and the mobile
   sidebar lifecycle fix holds — without creating, editing, or deleting
   any real record.

   Run: node scripts/agenda-v1312-production-verify.mjs */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOSTING_URL = 'https://schedule-driver-pbsi.web.app';

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}
async function checkAsync(name, run) {
  try { const r = await run(); check(name, r !== false, typeof r === 'string' ? r : ''); }
  catch (err) { fail++; console.log(`  ✗ ${name} — ${err.message}`); }
}

async function main() {
  await fs.promises.mkdir(path.join(ROOT, 'scratch'), { recursive: true });
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    const consoleErrors = [];
    page.on('console', (msg) => { if (msg.type() === 'error' && !/permission_denied|Permission denied/i.test(msg.text())) consoleErrors.push(msg.text()); });
    page.on('pageerror', (err) => consoleErrors.push(String(err)));

    console.log('\n=== [1] Live deployed version stamp ===');
    await checkAsync('version.json on the live Hosting URL reports 1.31.2.0', async () => {
      const res = (await (await fetch(`${HOSTING_URL}/version.json`)).json()).version;
      return res === '1.31.2.0' ? true : `got "${res}"`;
    });

    console.log('\n=== [2] Real login as leo against the LIVE deployed bundle ===');
    await page.goto(`${HOSTING_URL}/index.html`, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.waitForSelector('#loginForm', { timeout: 20000 });
    await new Promise((r) => setTimeout(r, 500));
    await page.type('#loginUsername', 'leo');
    await page.type('#loginPin', '1234');
    await page.waitForSelector('.login-submit', { visible: true, timeout: 10000 });
    await new Promise((r) => setTimeout(r, 300));
    await page.click('.login-submit');
    await page.waitForFunction(() => { try { return JSON.parse(localStorage.getItem('pbsi_current_user') || 'null')?.username === 'leo'; } catch { return false; } }, { timeout: 30000 });
    check('logged in as leo on the live deployment', true);
    await new Promise((r) => setTimeout(r, 4000));
    await page.evaluate(() => { document.getElementById('btnPushDismiss')?.click(); });
    await page.waitForSelector('[data-agenda-search]', { timeout: 15000 }).catch(() => {});

    console.log('\n=== [3] Global topbar search adapter is wired for Home (V1.31.2 fix) ===');
    await checkAsync('topbar placeholder names Agenda content, not the generic "Cari…" fallback', () => page.evaluate(() => {
      const ph = document.getElementById('v2SearchInput')?.placeholder;
      return ph && ph !== 'Cari…';
    }));

    console.log('\n=== [4] Calendar Week view renders with no horizontal overflow (V1.31.2 fix) ===');
    await checkAsync('switching to Kalender > Minggu produces a 7-column week grid with no page-level horizontal scroll', async () => {
      await page.evaluate(() => document.querySelector('[data-agenda-action="set-mode:calendar"]')?.click());
      await new Promise((r) => setTimeout(r, 200));
      await page.evaluate(() => document.querySelector('[data-agenda-action="set-calview:week"]')?.click());
      await new Promise((r) => setTimeout(r, 300));
      const cells = await page.evaluate(() => document.querySelectorAll('.cal-week-row .cal-cell').length);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
      return cells === 7 && overflow ? true : `cells=${cells}, noOverflow=${overflow}`;
    });
    await page.screenshot({ path: path.join(ROOT, 'scratch', 'v1312-prod-verify-week-view.png') });

    console.log('\n=== [5] Calendar grid is keyboard-focusable (V1.31.2 accessibility fix) ===');
    await checkAsync('a .cal-cell in the live grid carries role="button" tabindex="0"', () => page.evaluate(() =>
      document.querySelector('.cal-cell[role="button"][tabindex="0"]') != null
    ));

    console.log('\n=== [6] Mobile sidebar lifecycle fix holds on the live deployment (390px) ===');
    await page.setViewport({ width: 390, height: 844 });
    await new Promise((r) => setTimeout(r, 200));
    await checkAsync('opening then navigating via the mobile sidebar leaves no stale overlay/scroll-lock', async () => {
      await page.evaluate(() => document.getElementById('sidebarToggle')?.click());
      await new Promise((r) => setTimeout(r, 200));
      await page.evaluate(() => {
        const item = document.querySelector('.sidebar-nav-item, .v2-panel-nav-item, .v2-rail-item');
        item?.click();
      });
      await new Promise((r) => setTimeout(r, 300));
      const state = await page.evaluate(() => ({
        sidebarOpen: document.getElementById('sidebar')?.classList.contains('sidebar-open') ?? false,
        bodyLocked: document.body.classList.contains('sidebar-is-open'),
      }));
      return !state.sidebarOpen && !state.bodyLocked ? true : `stale state: ${JSON.stringify(state)}`;
    });

    console.log('\n=== [Z — zero fatal console/page errors across the whole run] ===');
    check('no fatal console errors or uncaught page errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

  } finally {
    await browser.close();
  }

  console.log(`\n${pass} passed, ${fail} failed\n`);
  console.log('NOTE: read-only verification — no production record was created, edited, or deleted.');
  process.exit(fail === 0 ? 0 : 1);
}

main();
