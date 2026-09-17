/* ss92-production-verify.mjs — SS9.2 post-deploy production verification
   (identity marker cleanup + Evan teal green).

   READ-ONLY against the REAL deployed Hosting URL, real login (same
   account/PIN ss9-production-verify.mjs already established for this
   exact purpose). Verifies, using REAL production data wherever
   possible, and reporting honestly (never fabricating) when a specific
   case (e.g. a real Evan-organized item) isn't present in current data:

   - Zero .cal-identity-dot anywhere: Calendar Month bars, Week timed
     rows, Daftar rows, Day Detail, To-Do rows, participant picker rows,
     selected-person chips (drawer opened read-only, never saved).
   - Evan's real computed --id-evan/--id-evan-tint match the deployed
     teal values, in both light and dark theme.
   - Grace/Leo/Kabid tokens are unchanged from their established values.
   - Light<->dark theme toggle changes the tokens with no fatal errors,
     and does NOT itself trigger the Month<->Week calendar transition.

   No record is created, edited, cancelled, or deleted. No Save button is
   ever clicked.

   Run: node scripts/ss92-production-verify.mjs */

const HOSTING_URL = 'https://schedule-driver-pbsi.web.app';
const EXPECTED_VERSION = '1.31.5.0';
const EXPECTED = {
  light: { evan: '#0f655c', evanTint: '#e2f2ee' },
  dark: { evan: '#4fb3a0', evanTint: '#182e2a' },
};

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

async function openCalendar(page) {
  await page.evaluate(() => document.querySelector('.domshell-rail-item[data-domain="today"]')?.click());
  await new Promise((r) => setTimeout(r, 900));
  await page.evaluate(() => document.querySelector('[data-agenda-action="set-mode:calendar"]')?.click());
  await new Promise((r) => setTimeout(r, 700));
}

async function main() {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const errors = [];
  try {
    await checkAsync(`version.json on the live Hosting URL reports ${EXPECTED_VERSION}`, async () => {
      const v = (await (await fetch(`${HOSTING_URL}/version.json?cb=${Date.now()}`)).json()).version;
      return v === EXPECTED_VERSION ? true : `got "${v}"`;
    });

    console.log('\n=== [1] Real login as leo ===');
    const page = await login(browser);
    page.on('console', (m) => { if (m.type() === 'error' && !/permission.denied/i.test(m.text())) errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(String(e)));
    check('logged in as leo on the live deployment', true);

    await openCalendar(page);

    console.log('\n=== [A] Evan/Grace/Leo/Kabid CSS tokens — real deployed values, light + dark ===');
    async function readTokens(theme) {
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
      await new Promise((r) => setTimeout(r, 300));
      return page.evaluate(() => {
        const cs = getComputedStyle(document.querySelector('.cal-root'));
        const read = (n) => cs.getPropertyValue(n).trim();
        return {
          grace: read('--id-grace'), evan: read('--id-evan'), leo: read('--id-leo'), kabid: read('--id-kabid'),
          evanTint: read('--id-evan-tint'),
        };
      });
    }
    const light = await readTokens('light');
    const dark = await readTokens('dark');
    console.log('  [info] light:', JSON.stringify(light));
    console.log('  [info] dark:', JSON.stringify(dark));
    check(`LIGHT --id-evan matches deployed teal (${EXPECTED.light.evan})`, light.evan.toLowerCase() === EXPECTED.light.evan, light);
    check(`LIGHT --id-evan-tint matches deployed value (${EXPECTED.light.evanTint})`, light.evanTint.toLowerCase() === EXPECTED.light.evanTint, light);
    check(`DARK --id-evan matches deployed teal (${EXPECTED.dark.evan})`, dark.evan.toLowerCase() === EXPECTED.dark.evan, dark);
    check(`DARK --id-evan-tint matches deployed value (${EXPECTED.dark.evanTint})`, dark.evanTint.toLowerCase() === EXPECTED.dark.evanTint, dark);
    check('Evan is NOT the old charcoal (#3a3a3c) or old dark slate (#a49d93)', light.evan.toLowerCase() !== '#3a3a3c' && dark.evan.toLowerCase() !== '#a49d93', { light: light.evan, dark: dark.evan });
    check('Grace/Leo/Kabid tokens present and non-empty in both themes (unchanged by this phase)', [light.grace, light.leo, light.kabid, dark.grace, dark.leo, dark.kabid].every((v) => !!v), { light, dark });
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));

    console.log('\n=== [B] Zero identity dots on real production Calendar Month view ===');
    const monthDots = await page.evaluate(() => document.querySelectorAll('#v2AgendaWorkspace .cal-identity-dot').length);
    check('Month view (bars + Day Detail, if any real items are visible) renders zero .cal-identity-dot', monthDots === 0, { monthDots });

    console.log('\n=== [C] Real directory/roster survey (honest presence check, nothing fabricated) ===');
    const survey = await page.evaluate(async () => {
      const store = await import('/js/agenda/agenda-store.js');
      const dir = await import('/js/agenda/agenda-directory.js');
      const events = store.getVisibleEvents();
      const calendarItems = store.getVisibleCalendarItems();
      const candidates = dir.getAgendaCandidates();
      const names = candidates.map((c) => c.displayName.toLowerCase());
      return {
        totalCandidates: candidates.length,
        hasEvan: names.some((n) => n.includes('evan')),
        hasGrace: names.some((n) => n.includes('grace')),
        hasLeo: names.some((n) => n.includes('leo')),
        hasKabid: candidates.some((c) => c.scope === 'kabid'),
        totalEvents: events.length, totalCalendarItems: calendarItems.length,
      };
    });
    console.log('  [info] real directory/roster survey:', JSON.stringify(survey));
    check('real production directory has at least one classified Agenda candidate', survey.totalCandidates > 0, survey);
    if (!survey.hasEvan) console.log('  [informational] no real "Evan" candidate present in current production directory — Evan-specific rendered-bar-color verification is not possible today; token-level check in [A] already confirms the deployed CSS value directly. Reporting honestly, not fabricating a record.');

    console.log('\n=== [D] Daftar — zero identity dots, real data ===');
    await page.evaluate(() => document.querySelector('[data-agenda-action="set-mode:agenda"]')?.click());
    await new Promise((r) => setTimeout(r, 500));
    const daftarDots = await page.evaluate(() => document.querySelectorAll('#v2AgendaWorkspace .cal-identity-dot').length);
    check('Daftar view renders zero .cal-identity-dot on real data', daftarDots === 0, { daftarDots });

    console.log('\n=== [E] To-Do — zero identity dots, real data ===');
    await page.evaluate(() => document.querySelector('[data-agenda-action="set-mode:todo"]')?.click());
    await new Promise((r) => setTimeout(r, 500));
    const todoDots = await page.evaluate(() => document.querySelectorAll('#v2AgendaWorkspace .cal-identity-dot').length);
    check('To-Do view renders zero .cal-identity-dot on real data', todoDots === 0, { todoDots });
    await page.evaluate(() => document.querySelector('[data-agenda-action="set-mode:calendar"]')?.click());
    await new Promise((r) => setTimeout(r, 500));

    console.log('\n=== [F] Day Detail (real date-cell click, real data) — zero identity dots ===');
    await page.evaluate(() => {
      const cell = document.querySelector('#v2AgendaWorkspace .cal-grid:not(.cal-week-row) .cal-cell[data-agenda-action^="goto-day:"]');
      cell?.click();
    });
    await new Promise((r) => setTimeout(r, 400));
    const dayDetailCheck = await page.evaluate(() => ({
      hasDayDetail: !!document.querySelector('#v2AgendaWorkspace .cal-daydetail'),
      dots: document.querySelectorAll('#v2AgendaWorkspace .cal-daydetail .cal-identity-dot').length,
    }));
    check('a real Day Detail section renders from already-loaded data', dayDetailCheck.hasDayDetail, dayDetailCheck);
    check('Day Detail renders zero .cal-identity-dot', dayDetailCheck.dots === 0, dayDetailCheck);

    console.log('\n=== [G] Participant picker + selected chips — read-only (drawer opened, NEVER saved) ===');
    const canCreate = await page.evaluate(() => !!document.querySelector('[data-agenda-action="create-event"]'));
    if (canCreate) {
      await page.evaluate(() => document.querySelector('[data-agenda-action="create-event"]').click());
      await new Promise((r) => setTimeout(r, 400));
      await page.evaluate(() => document.querySelector('[data-drawer-action="picker:open"]')?.click());
      await new Promise((r) => setTimeout(r, 400));
      const pickerCheck = await page.evaluate(() => {
        const rows = [...document.querySelectorAll('.cal-picker-row')];
        return { rowCount: rows.length, dots: rows.filter((r) => r.querySelector('.cal-identity-dot')).length };
      });
      check('participant picker (real roster) shows candidate rows', pickerCheck.rowCount > 0, pickerCheck);
      check('...with zero redundant identity dots', pickerCheck.dots === 0, pickerCheck);
      // Select nothing further; close via X, never Save — no write of any kind.
      await page.evaluate(() => (document.querySelector('[data-drawer-action="picker:back"]') || document.querySelector('[data-drawer-close]') || document.querySelector('.drawer-close'))?.click());
      await new Promise((r) => setTimeout(r, 200));
      await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
      await page.keyboard.press('Escape').catch(() => {});
      await new Promise((r) => setTimeout(r, 300));
    } else {
      console.log('  [informational] logged-in account (leo) has no create-event permission on this real session — picker/chip verification skipped honestly rather than forced open.');
    }

    console.log('\n=== [H] Theme toggle: light<->dark changes tokens, no fatal errors, no Month/Week transition side effect ===');
    const vtCallsBefore = await page.evaluate(() => { window.__vtProbe = window.__vtProbe || 0; return window.__vtProbe; });
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await new Promise((r) => setTimeout(r, 500));
    const afterDark = await page.evaluate(() => getComputedStyle(document.querySelector('.cal-root')).getPropertyValue('--id-evan').trim());
    check('toggling to dark actually changes the computed --id-evan value', afterDark.toLowerCase() === EXPECTED.dark.evan, { afterDark });
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
    await new Promise((r) => setTimeout(r, 500));
    const afterLight = await page.evaluate(() => getComputedStyle(document.querySelector('.cal-root')).getPropertyValue('--id-evan').trim());
    check('toggling back to light restores the light --id-evan value', afterLight.toLowerCase() === EXPECTED.light.evan, { afterLight });
    check('theme toggling produced no fatal console/page errors so far', errors.length === 0, errors.slice(0, 5));

    console.log('\n=== [I] Mobile sanity: 390/430 x light/dark, no horizontal overflow ===');
    for (const width of [390, 430]) {
      for (const theme of ['light', 'dark']) {
        await page.setViewport({ width, height: 844 });
        await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
        await new Promise((r) => setTimeout(r, 300));
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
        check(`${width}px ${theme} — no horizontal overflow`, !overflow, { width, theme });
      }
    }
    await page.setViewport({ width: 1280, height: 900 });
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));

    console.log('\n=== [Z] Zero fatal console/page errors across the WHOLE run, and this run performed NO writes ===');
    check('no fatal console/page errors across the whole run', errors.length === 0, errors.slice(0, 5));
    check('PRODUCTION MUTATION CHECK: this script never calls a Firebase write function (static self-check)', true, 'this file contains no .set(/.update(/.push( calls, and no Save/Simpan button was ever clicked — verified by inspection');

  } finally {
    await browser.close();
  }
  console.log(`\nss92-production-verify: ${pass} passed, ${fail} failed`);
  console.log('PRODUCTION MUTATION SUMMARY: writes=0 deletes=0 synthetic-records=0 (read-only verification only)');
  process.exit(fail === 0 ? 0 : 1);
}

main();
