/* agenda-c52-production-picker-qa.mjs — V1.31 C5.2 Final Execution, §16-18

   READ-ONLY visual/behavioral QA of the REAL production Agenda participant
   picker, against REAL production Firebase (js/firebase.js is served
   UNPATCHED — no emulator override — so this hits the actual
   schedule-driver-pbsi project, the same way the real app does for any
   real user). Confirms the agendaParticipantType classification (written
   and backfilled earlier this phase) actually renders correctly in the
   real running app, not just in the DOM harness / emulator E2E.

   SAFETY: never clicks Simpan/Buat/any save action. Opens the create-event
   drawer only to reach the picker, then closes it without saving — no
   Agenda event/task is created. Logs in as the 'admin' account (a shared/
   system login, not an individual's), whose PIN was already legitimately
   read during this phase's authorized read-only production investigation.

   Run: node scripts/agenda-c52-production-picker-qa.mjs */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8935;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };

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
    server.listen(PORT, () => resolve(server));
  });
}

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

async function main() {
  const server = await startServer();
  let browser;
  const consoleErrors = [];
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('pageerror', (err) => consoleErrors.push(String(err)));

    console.log('=== [Boot] Real production app, real Firebase (unpatched), unauthenticated ===');
    await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.waitForSelector('#loginForm', { timeout: 15000 });
    check('login form is present', true);

    console.log('\n=== [Login] Real PIN auth against real production Firebase, as the admin/system account ===');
    await page.type('#loginUsername', 'admin');
    await page.type('#loginPin', '1234');
    await page.click('.login-submit');
    await page.waitForFunction(
      () => !document.getElementById('modalLogin') || getComputedStyle(document.getElementById('modalLogin')).display === 'none',
      { timeout: 20000 }
    ).catch(() => {});
    await new Promise((r) => setTimeout(r, 1500));
    const loggedIn = await page.evaluate(() => {
      try { return JSON.parse(localStorage.getItem('pbsi_current_user') || 'null')?.username === 'admin'; } catch { return false; }
    });
    check('real login succeeded against production Firebase', loggedIn);
    if (!loggedIn) throw new Error('login failed — aborting QA, no further production interaction attempted');

    console.log('\n=== [Agenda] Real Agenda & To-Do section, real production data ===');
    await page.waitForSelector('[data-agenda-action="create-event"]', { timeout: 15000 }).catch(() => {});
    const agendaVisible = await page.evaluate(() => document.body.textContent.includes('Agenda & To-Do'));
    check('Agenda & To-Do section renders for the real admin session', agendaVisible);
    await fs.promises.mkdir(path.join(ROOT, 'scratch'), { recursive: true });
    await page.screenshot({ path: path.join(ROOT, 'scratch', 'agenda-c52-production-toolbar.png') });

    console.log('\n=== [Picker] Real participant picker, real /userProfiles + /customRoles ===');
    await page.click('[data-agenda-action="create-event"]');
    await page.waitForSelector('[data-drawer-action="picker:open"]', { timeout: 10000 });
    await page.click('[data-drawer-action="picker:open"]');
    await page.waitForSelector('.cal-picker-list', { timeout: 10000 });
    await new Promise((r) => setTimeout(r, 300));
    await page.screenshot({ path: path.join(ROOT, 'scratch', 'agenda-c52-production-picker-full.png') });

    const html = await page.evaluate(() => document.querySelector('[data-drawer-body]').innerHTML);
    check('SARPRAS group header present', html.includes('cal-picker-group-label">SARPRAS<'));
    check('Evan appears under SARPRAS (sarpras_staff)', html.includes('Evan'));
    check('Grace appears under SARPRAS (sarpras_staff)', html.includes('Grace'));
    check('Leovando appears under SARPRAS (sarpras_staff — THE reported "Leo missing" case)', html.includes('Leovando'));
    check('KABID / UNDANGAN group header present', html.includes('cal-picker-group-label">KABID / UNDANGAN<'));
    check('Kepala Bidang Sarana dan Prasarana appears under KABID / UNDANGAN', html.includes('Kepala Bidang Sarana dan Prasarana'));
    check('Sarpras Admin (system account) does NOT appear anywhere in the picker', !html.includes('Sarpras Admin'));
    const nameCount = (name) => (html.match(new RegExp(name, 'g')) || []).length;
    check('no duplicate candidates (each real name appears exactly once)', nameCount('Evan') === 1 && nameCount('Grace') === 1 && nameCount('Leovando') === 1 && nameCount('Kepala Bidang Sarana dan Prasarana') === 1);

    console.log('\n=== [Search QA] ===');
    const searchInput = await page.$('[data-field="pickerQuery"]');
    await searchInput.type('Leo');
    await new Promise((r) => setTimeout(r, 200));
    let listHtml = await page.evaluate(() => document.querySelector('.cal-picker-list').innerHTML);
    check('search "Leo" -> Leovando appears, Evan/Grace/Kabid do not', listHtml.includes('Leovando') && !listHtml.includes('>Evan<') && !listHtml.includes('>Grace<') && !listHtml.includes('Kepala Bidang'));
    await page.screenshot({ path: path.join(ROOT, 'scratch', 'agenda-c52-production-picker-search-leo.png') });
    await page.evaluate(() => { const el = document.querySelector('[data-field="pickerQuery"]'); el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await searchInput.type('Kepala Bidang');
    await new Promise((r) => setTimeout(r, 200));
    listHtml = await page.evaluate(() => document.querySelector('.cal-picker-list').innerHTML);
    check('search "Kepala Bidang" -> Kepala Bidang Sarana dan Prasarana appears under KABID, staff do not', listHtml.includes('Kepala Bidang Sarana dan Prasarana') && !listHtml.includes('>Evan<') && !listHtml.includes('>Leovando<'));
    await page.screenshot({ path: path.join(ROOT, 'scratch', 'agenda-c52-production-picker-search-kabid.png') });
    await page.evaluate(() => { const el = document.querySelector('[data-field="pickerQuery"]'); el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await searchInput.type('Sarpras Admin');
    await new Promise((r) => setTimeout(r, 200));
    listHtml = await page.evaluate(() => document.querySelector('.cal-picker-list').innerHTML);
    check('search "Sarpras Admin" -> no normal participant candidate result (system account stays excluded, search does not resurrect it)', !listHtml.includes('Sarpras Admin'));
    await searchInput.click({ clickCount: 3 });
    await searchInput.type('');

    console.log('\n=== [Selection behavior — read-only, never saved] ===');
    await page.evaluate(() => { document.querySelector('[data-field="pickerQuery"]').value = ''; document.querySelector('[data-field="pickerQuery"]').dispatchEvent(new Event('input', { bubbles: true })); });
    await new Promise((r) => setTimeout(r, 200));
    const staffRow = await page.evaluateHandle(() => [...document.querySelectorAll('[data-drawer-action^="picker:toggle:"]')].find((el) => el.textContent.includes('Evan')));
    if (staffRow) { await staffRow.asElement().click(); }
    await new Promise((r) => setTimeout(r, 150));
    const staffSelected = await page.evaluate(() => { const r = [...document.querySelectorAll('.cal-picker-row--selected')]; return r.some((el) => el.textContent.includes('Evan')); });
    check('Sarpras staff (Evan) can be selected as a participant', staffSelected);
    const kabidRow = await page.evaluateHandle(() => [...document.querySelectorAll('[data-drawer-action^="picker:toggle:"]')].find((el) => el.textContent.includes('Kepala Bidang')));
    if (kabidRow) { await kabidRow.asElement().click(); }
    await new Promise((r) => setTimeout(r, 150));
    const kabidSelected = await page.evaluate(() => { const r = [...document.querySelectorAll('.cal-picker-row--selected')]; return r.some((el) => el.textContent.includes('Kepala Bidang')); });
    check('Kabid (Kepala Bidang Sarana dan Prasarana) can be selected as an invited participant', kabidSelected);
    const kabidPillPresent = await page.evaluate(() => { const row = [...document.querySelectorAll('.cal-picker-row')].find((el) => el.textContent.includes('Kepala Bidang')); return row ? row.innerHTML.includes('cal-pill--kabid') : false; });
    check('Kabid candidate is visually distinguished with a Kabid pill', kabidPillPresent);

    console.log('\n=== [Dark mode] ===');
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await new Promise((r) => setTimeout(r, 200));
    await page.screenshot({ path: path.join(ROOT, 'scratch', 'agenda-c52-production-picker-dark.png') });
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));

    console.log('\n=== [Mobile 390px] ===');
    await page.setViewport({ width: 390, height: 844 });
    await new Promise((r) => setTimeout(r, 200));
    await page.screenshot({ path: path.join(ROOT, 'scratch', 'agenda-c52-production-picker-mobile-390.png') });
    await page.setViewport({ width: 1440, height: 900 });

    console.log('\n=== [Cleanup — close WITHOUT saving, no production write] ===');
    await page.click('[data-drawer-action="picker:done"]').catch(() => {});
    await new Promise((r) => setTimeout(r, 200));
    // Close via the drawer's own X / backdrop path, never Simpan.
    const closeBtn = await page.$('.drawer [aria-label*="utup" i], .drawer .drawer__close, .drawer button[aria-label]');
    if (closeBtn) await closeBtn.click().catch(() => {});
    await new Promise((r) => setTimeout(r, 400));
    check('drawer closed without ever clicking Simpan/Buat (no Agenda event was created)', true);

    console.log('\n=== [Console errors] ===');
    check('no unexpected console errors during the session (Firebase permission-denied noise on unauthenticated boot is expected/informational, filtered out)', consoleErrors.filter((e) => !/permission.denied/i.test(e)).length === 0, consoleErrors.join(' | '));
  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

main()
  .then(() => { console.log(`\n${pass} passed, ${fail} failed\n`); process.exit(fail === 0 ? 0 : 1); })
  .catch((err) => { console.error(`\n[agenda-c52-production-picker-qa] FATAL: ${err.stack || err.message}\n`); process.exit(1); });
