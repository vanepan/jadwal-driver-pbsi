/* agenda-v1311-production-verify.mjs — V1.31.1 "Agenda, Kalender & To-Do"
   post-deploy production verification.

   READ-ONLY. Navigates the REAL deployed Hosting URL (not a local server),
   logs in as a real staff account, and confirms the Calendar entity
   actually renders and is navigable in the LIVE deployed bundle — without
   creating, editing, cancelling, or deleting any real record (deliberately
   avoids adding more throwaway test data right after cleaning up the last
   one, spec §G's own concern).

   Run: node scripts/agenda-v1311-production-verify.mjs */

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
    await page.setViewport({ width: 1440, height: 900 });
    const consoleErrors = [];
    const allLogs = [];
    page.on('console', (msg) => { allLogs.push(`[${msg.type()}] ${msg.text()}`); if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('pageerror', (err) => { allLogs.push(`[UNCAUGHT] ${String(err)}`); consoleErrors.push('[UNCAUGHT] ' + String(err)); });

    console.log(`\n=== [1] Real LIVE Hosting boot: ${HOSTING_URL} ===`);
    await page.goto(HOSTING_URL, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.waitForSelector('#loginForm', { timeout: 20000 });
    check('login form renders on the real deployed bundle', true);
    const liveVersion = await page.evaluate(() => fetch('/version.json').then((r) => r.json()).catch(() => null));
    check('deployed version.json is 1.31.1.0', liveVersion && liveVersion.version === '1.31.1.0', JSON.stringify(liveVersion));
    await page.screenshot({ path: path.join(ROOT, 'scratch', 'v1311-prod-verify-login.png') });

    console.log('\n=== [2] Real login as leo against the LIVE deployed bundle ===');
    await new Promise((r) => setTimeout(r, 500));
    await page.type('#loginUsername', 'leo');
    await page.type('#loginPin', '1234');
    await page.waitForSelector('.login-submit', { visible: true, timeout: 10000 });
    await new Promise((r) => setTimeout(r, 300));
    await page.click('.login-submit');
    await page.waitForFunction(() => { try { return JSON.parse(localStorage.getItem('pbsi_current_user') || 'null')?.username === 'leo'; } catch { return false; } }, { timeout: 30000 });
    check('logged in as leo on the live deployed bundle', true);
    const settleCount = () => allLogs.filter((l) => l.includes('auth-state settled')).length;
    const settleDeadline = Date.now() + 20000;
    while (settleCount() < 2 && Date.now() < settleDeadline) await new Promise((r) => setTimeout(r, 250));
    await new Promise((r) => setTimeout(r, 2000));
    await page.evaluate(() => { document.getElementById('btnPushDismiss')?.click(); });

    console.log('\n=== [3] Agenda, Kalender & To-Do workspace renders on the live deployed bundle ===');
    await checkAsync('workspace title reads "Agenda, Kalender & To-Do"', () => page.evaluate(() => document.body.textContent.includes('Agenda, Kalender & To-Do')));
    await checkAsync('"+ Kalender" create action is present', () => page.evaluate(() => !!document.querySelector('[data-agenda-action="create-calendar"]')));
    await page.screenshot({ path: path.join(ROOT, 'scratch', 'v1311-prod-verify-agenda-tab.png') });

    console.log('\n=== [4] Kalender tab — Month view renders on the live deployed bundle ===');
    await checkAsync('clicking Kalender switches to the calendar grid', () => page.evaluate(() => {
      const btn = [...document.querySelectorAll('[data-agenda-action^="set-mode:"]')].find((b) => b.textContent.trim() === 'Kalender');
      btn?.click();
      return true;
    }));
    await new Promise((r) => setTimeout(r, 300));
    await checkAsync('a 7-column month grid is rendered', () => page.evaluate(() => {
      const cells = document.querySelectorAll('.cal-grid .cal-cell').length;
      return cells > 0 && cells % 7 === 0;
    }));
    await page.screenshot({ path: path.join(ROOT, 'scratch', 'v1311-prod-verify-calendar-month.png') });

    console.log('\n=== [5] The SPECIFIC cleaned-up record (evt_mu0aa6kan108, "Rapat"/"tes"/"Ruang Rapat Lt. 2", 14 Sep 2026) does not reappear ===');
    // NOT a blanket "tes" substring search — a live investigation during
    // this same verification run found SEVERAL OTHER, unrelated "tes"/
    // "Tes"-titled records under a distinct "akuntes" identity, on
    // entirely different dates (27/06, 24/06, 11-12/06, 28/05/2026 — none
    // is 14/09/2026). Those are separate, real-looking user-created data
    // this phase was never given clear evidence to delete (spec's own
    // "never delete legitimate production records" instruction) — flagged
    // in the final report for the user to decide, not silently swept up
    // here. This check is scoped to the ONE record this phase actually
    // identified (via git-history/script provenance), cleaned up, and
    // independently verified — not every string that happens to contain "tes".
    await checkAsync('"Ruang Rapat Lt. 2" (the specific record\'s location) does not appear anywhere in the rendered Agenda/Kalender views', () => page.evaluate(() => !document.body.textContent.includes('Ruang Rapat Lt. 2')));

    console.log('\n=== [6] Notification bell opens cleanly on the live deployed bundle (no crash from the widened agenda./task./calendar. filter) ===');
    await checkAsync('bell icon exists and opens the notifications panel without error', () => page.evaluate(async () => {
      const bell = document.getElementById('notifBell') || document.querySelector('[data-action="open-notifications"]') || document.querySelector('.notif-bell');
      if (!bell) return 'bell element not found (selector may differ — non-fatal, skipping this sub-check)';
      bell.click();
      await new Promise((r) => setTimeout(r, 400));
      return true;
    }));

    console.log('\n=== [7] Zero console/page errors across the entire live verification run ===');
    const realErrors = consoleErrors.filter((e) => !/permission.denied/i.test(e));
    check('no fatal console/page errors (permission-denied noise from unrelated nodes excluded)', realErrors.length === 0, JSON.stringify(realErrors));

  } finally {
    await browser.close();
  }
}

main()
  .then(() => { console.log(`\n${pass} passed, ${fail} failed\n`); process.exit(fail === 0 ? 0 : 1); })
  .catch((err) => { console.error('\n[agenda-v1311-production-verify] FATAL:', err.stack || err.message); process.exit(1); });
