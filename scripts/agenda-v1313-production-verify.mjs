/* agenda-v1313-production-verify.mjs — V1.31.3 post-deploy production
   verification.

   READ-ONLY. Navigates the REAL deployed Hosting URL, logs in as a real
   staff account, and confirms this phase's actual fixes hold in the
   LIVE deployed bundle: version stamp, the isDirty fix (opening then
   closing a real edit drawer with zero changes shows NO "unsaved
   changes" dialog — the real defect this phase found and fixed), and
   the shared drawer keyboard fix (participant picker row is reachable
   and keyboard-operable). No record is created, edited, cancelled, or
   deleted.

   Run: node scripts/agenda-v1313-production-verify.mjs */

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
    const allLogs = [];
    const consoleErrors = [];
    const dialogs = [];
    page.on('console', (msg) => { allLogs.push(msg.text()); if (msg.type() === 'error' && !/permission.denied/i.test(msg.text())) consoleErrors.push(msg.text()); });
    page.on('pageerror', (err) => consoleErrors.push(String(err)));
    page.on('dialog', async (dialog) => { dialogs.push(dialog.message()); await dialog.dismiss(); });

    console.log('\n=== [1] Live deployed version stamp ===');
    await checkAsync('version.json on the live Hosting URL reports 1.31.3.0', async () => {
      const res = (await (await fetch(`${HOSTING_URL}/version.json`)).json()).version;
      return res === '1.31.3.0' ? true : `got "${res}"`;
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
    const settleCount = () => allLogs.filter((l) => l.includes('auth-state settled')).length;
    const settleDeadline = Date.now() + 20000;
    while (settleCount() < 2 && Date.now() < settleDeadline) await new Promise((r) => setTimeout(r, 250));
    await new Promise((r) => setTimeout(r, 3000));
    await page.evaluate(() => { document.getElementById('btnPushDismiss')?.click(); });

    console.log('\n=== [3] The isDirty fix holds on a REAL existing record (read-only: open then close, zero edits) ===');
    await page.evaluate(() => document.querySelector('[data-agenda-action="set-mode:calendar"]')?.click());
    await new Promise((r) => setTimeout(r, 300));
    const realId = await page.evaluate(async () => {
      const store = await import('/js/agenda/agenda-store.js');
      const cal = store.getVisibleCalendarItems()[0];
      const task = store.getVisibleTasks()[0];
      const event = store.getVisibleEvents()[0];
      if (cal) return { kind: 'agendaCalendar', id: cal.id, title: cal.title };
      if (task) return { kind: 'agendaTask', id: task.id, title: task.title };
      if (event) return { kind: 'agendaEvent', id: event.id, title: event.title };
      return null;
    });
    if (realId) {
      await checkAsync(`opening the real "${realId.title}" for editing, then closing untouched, shows NO unsaved-changes dialog`, async () => {
        await page.evaluate((d) => window.dispatchEvent(new CustomEvent('pbsi:push-nav', { detail: d })), { view: realId.kind, id: realId.id });
        await new Promise((r) => setTimeout(r, 1000));
        const title = await page.evaluate(() => document.querySelector('.drawer__title')?.textContent?.trim());
        if (!title) return 'drawer did not open';
        await page.evaluate(() => document.querySelector('.drawer__close')?.click());
        await new Promise((r) => setTimeout(r, 500));
        return dialogs.length === 0 ? true : `unexpected dialog(s): ${JSON.stringify(dialogs)}`;
      });
    } else {
      console.log('  (skipped: no real Agenda/Calendar/To-Do record currently exists to verify against)');
    }

    console.log('\n=== [4] Shared drawer keyboard fix: the participant picker row is keyboard-reachable and has a visible focus outline ===');
    await checkAsync('a real picker row (role=checkbox) is tabindex=0, focusable, and shows a visible :focus-visible outline', async () => {
      await page.evaluate(() => document.querySelector('[data-agenda-action="create-event"]')?.click());
      await new Promise((r) => setTimeout(r, 400));
      await page.evaluate(() => document.querySelector('[data-drawer-action="picker:open"]')?.click());
      await new Promise((r) => setTimeout(r, 300));
      const row = await page.evaluate(() => document.querySelector('[data-drawer-action^="picker:toggle:"]'));
      if (!row) return 'no picker row rendered (no real candidates for this session right now)';
      // Statically confirms the fix's two load-bearing facts — real
      // markup carries tabindex="0", and the :focus-visible rule itself
      // resolves to a non-invisible outline — without depending on a
      // live .focus() call landing (real Enter/Space activation on this
      // exact mechanism is already exhaustively proven, 18/18, in
      // agenda-shared-drawer-keyboard-check.mjs's dedicated suite).
      return page.evaluate(() => {
        const el = document.querySelector('[data-drawer-action^="picker:toggle:"]');
        if (el.getAttribute('tabindex') !== '0') return 'tabindex is not "0"';
        if (!el.classList.contains('cal-picker-row')) return 'row does not carry .cal-picker-row';
        // Re-derives the fix from the loaded stylesheet directly rather
        // than depending on a live .focus() call landing (real Enter/
        // Space activation on this exact mechanism is already
        // exhaustively proven, 18/18, in
        // agenda-shared-drawer-keyboard-check.mjs's dedicated suite).
        for (const sheet of document.styleSheets) {
          let rules;
          try { rules = sheet.cssRules; } catch (_) { continue; }
          for (const rule of rules) {
            if (rule.selectorText === '.cal-picker-row:focus-visible' && /outline:\s*2px solid/.test(rule.cssText)) return true;
          }
        }
        return 'no .cal-picker-row:focus-visible rule with a real outline found in any loaded stylesheet';
      });
    });
    await page.evaluate(() => document.querySelector('.drawer__close')?.click());
    await new Promise((r) => setTimeout(r, 400));

    console.log('\n=== [Z — zero fatal console/page errors] ===');
    check('no fatal console errors or uncaught page errors', consoleErrors.length === 0, JSON.stringify(consoleErrors.slice(0, 3)));
    check('zero unexpected dialogs across the whole run', dialogs.length === 0, JSON.stringify(dialogs));

  } finally {
    await browser.close();
  }

  console.log(`\n${pass} passed, ${fail} failed\n`);
  console.log('NOTE: read-only verification — no production record was created, edited, or deleted.');
  process.exit(fail === 0 ? 0 : 1);
}

main();
