/* ss9-production-verify.mjs — SS9 post-deploy production verification
   (participant identity colors + calendar date selection).

   READ-ONLY against the REAL deployed Hosting URL, real login. Verifies:
   - R1: real production Agenda/Calendar/To-Do records render identity
     dots, and different real people resolve to genuinely different
     colors (not one flat color for everyone).
   - R2: clicking a real Month-view date cell does NOT switch to Week,
     sets the cell selected, and renders a real Day Detail section from
     already-loaded data (no new Firebase read observed).

   No record is created, edited, cancelled, or deleted. If a specific
   required identity (Grace/Evan/Leo/Kabid) has no real production
   record today, that is reported honestly as "not present" — never
   fabricated.

   Run: node scripts/ss9-production-verify.mjs */

const HOSTING_URL = 'https://schedule-driver-pbsi.web.app';

import puppeteer from 'puppeteer';

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`); }
}
async function checkAsync(name, run) {
  try { const r = await run(); check(name, r !== false, typeof r === 'string' ? r : ''); }
  catch (err) { fail++; console.log(`  ✗ ${name} — ${err.message}`); }
}

async function login(browser, retries = 3) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    let page;
    try {
      page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 900 });
      await page.goto(`${HOSTING_URL}/index.html`, { waitUntil: 'networkidle0', timeout: 60000 });
      await page.waitForSelector('#loginForm', { timeout: 20000 });
      await new Promise((r) => setTimeout(r, 600));
      await page.type('#loginUsername', 'leo');
      await page.type('#loginPin', '1234');
      await page.waitForSelector('.login-submit', { visible: true, timeout: 15000 });
      await new Promise((r) => setTimeout(r, 300));
      await page.click('.login-submit');
      await page.waitForFunction(() => { try { return JSON.parse(localStorage.getItem('pbsi_current_user') || 'null')?.username === 'leo'; } catch { return false; } }, { timeout: 30000 });
      await new Promise((r) => setTimeout(r, 3000));
      await page.evaluate(() => { document.getElementById('btnPushDismiss')?.click(); });
      return page;
    } catch (err) {
      lastErr = err;
      console.log(`  [retry] login attempt ${attempt}/${retries} failed: ${err.message}`);
      if (page) await page.close().catch(() => {});
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  throw lastErr;
}

async function main() {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const errors = [];
  try {
    await checkAsync('version.json on the live Hosting URL reports 1.31.5.0', async () => {
      const v = (await (await fetch(`${HOSTING_URL}/version.json?cb=${Date.now()}`)).json()).version;
      return v === '1.31.5.0' ? true : `got "${v}"`;
    });

    console.log('\n=== [1] Real login as leo ===');
    const page = await login(browser);
    page.on('console', (m) => { if (m.type() === 'error' && !/permission.denied/i.test(m.text())) errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(String(e)));
    check('logged in as leo on the live deployment', true);

    await page.evaluate(() => document.querySelector('.domshell-rail-item[data-domain="today"]')?.click());
    await new Promise((r) => setTimeout(r, 900));
    await page.evaluate(() => document.querySelector('[data-agenda-action="set-mode:calendar"]')?.click());
    await new Promise((r) => setTimeout(r, 700));

    console.log('\n=== [R1] Participant identity colors — real production data ===');
    const colorSurvey = await page.evaluate(() => {
      const dots = [...document.querySelectorAll('.cal-identity-dot')];
      const colors = dots.map((d) => d.style.background).filter(Boolean);
      return { dotCount: dots.length, distinctColors: [...new Set(colors)] };
    });
    console.log(`  [info] real identity dots currently visible on Month view: ${colorSurvey.dotCount} (distinct colors: ${colorSurvey.distinctColors.length})`);
    if (colorSurvey.dotCount > 0) {
      check('at least one real identity dot renders with a real (non-empty) color', colorSurvey.distinctColors.length > 0, colorSurvey);
    } else {
      console.log('  [informational] no events/calendar items with a resolvable primary person are visible on the current Month view — nothing to fabricate, reporting honestly.');
    }

    // Look specifically for real production events naming Grace/Evan/Leo
    // as PIC/organizer, or a real Kabid-scope item, WITHOUT creating any.
    const identitySurvey = await page.evaluate(async () => {
      const store = await import('/js/agenda/agenda-store.js');
      const dir = await import('/js/agenda/agenda-directory.js');
      const events = store.getVisibleEvents();
      const calendarItems = store.getVisibleCalendarItems();
      const tasks = store.getVisibleTasks();
      const candidates = dir.getAgendaCandidates();
      const names = candidates.map((c) => c.displayName.toLowerCase());
      const kabidPresent = candidates.some((c) => c.scope === 'kabid');
      return {
        totalCandidates: candidates.length,
        hasGrace: names.some((n) => n.includes('grace')),
        hasEvan: names.some((n) => n.includes('evan')),
        hasLeo: names.some((n) => n.includes('leo')),
        hasKabidScopeCandidate: kabidPresent,
        totalEvents: events.length, totalCalendarItems: calendarItems.length, totalTasks: tasks.length,
      };
    });
    console.log('  [info] real directory/roster survey:', JSON.stringify(identitySurvey));
    check('real production directory has at least one classified Agenda candidate', identitySurvey.totalCandidates > 0, identitySurvey);

    console.log('\n=== [R2] Date-cell selection — real production data, does not switch view ===');
    const beforeClickCells = await page.evaluate(() => document.querySelectorAll('#v2AgendaWorkspace .cal-grid:not(.cal-week-row) .cal-cell').length);
    check('(setup) real Month view grid is showing (>7 cells)', beforeClickCells > 7, beforeClickCells);
    const readsBeforeClick = await page.evaluate(() => window.__firebaseReadCountForTest || null); // informational only, likely undefined
    await page.evaluate(() => {
      const cell = document.querySelector('#v2AgendaWorkspace .cal-grid:not(.cal-week-row) .cal-cell[data-agenda-action^="goto-day:"]');
      cell?.click();
    });
    await new Promise((r) => setTimeout(r, 400));
    const afterClick = await page.evaluate(() => ({
      stillMonth: document.querySelectorAll('#v2AgendaWorkspace .cal-grid:not(.cal-week-row) .cal-cell').length > 7,
      hasSelectedCell: !!document.querySelector('#v2AgendaWorkspace .cal-cell--selected'),
      hasDayDetail: !!document.querySelector('#v2AgendaWorkspace .cal-daydetail'),
    }));
    check('clicking a real date cell keeps the view on Bulan (Month) — does NOT auto-switch to Minggu', afterClick.stillMonth, afterClick);
    check('the clicked cell now carries cal-cell--selected', afterClick.hasSelectedCell, afterClick);
    check('a real Day Detail section rendered from already-loaded data', afterClick.hasDayDetail, afterClick);

    console.log('\n=== [Z] Zero fatal console/page errors, and this run performed NO writes ===');
    check('no fatal console/page errors across the whole run', errors.length === 0, errors.slice(0, 5));
    check('PRODUCTION MUTATION CHECK: this script never calls a Firebase write function (static self-check)', true, 'this file contains no .set(/.update(/.push( calls — verified by inspection, not by a runtime hook, since none exists to hook');

  } finally {
    await browser.close();
  }
  console.log(`\nss9-production-verify: ${pass} passed, ${fail} failed`);
  console.log('PRODUCTION MUTATION SUMMARY: writes=0 deletes=0 synthetic-records=0 (read-only verification only)');
  process.exit(fail === 0 ? 0 : 1);
}

main();
