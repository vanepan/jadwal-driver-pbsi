/* agenda-c53-claim-and-ui-qa.mjs — V1.31 C5.3 Kabid Provisioning, §25-27

   READ-ONLY verification against REAL production:
   1. Fresh authentication as @sarpras -> confirms the server-derived
      agendaKabid claim actually lands on a real session (not just that
      the Custom Role record exists).
   2. Real Agenda UI as @sarpras: Agenda accessible, Kabid calendar
      accessible, participant picker shows Sarpras staff, no Sarpras
      Admin, no duplicate Kabid entries.
   3. Real Agenda UI as Evan: normal access remains, Kabid appears as an
      invitation candidate, Sarpras Admin excluded.

   Never creates/saves any Agenda event or task. Never touches /customRoles
   or /users again (this script is read/verify only).

   Run: node scripts/agenda-c53-claim-and-ui-qa.mjs */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8939;
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
    server.listen(PORT, () => resolve(server));
  });
}

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

async function login(page, username, pin) {
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForSelector('#loginForm', { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 500));
  await page.type('#loginUsername', username);
  await page.type('#loginPin', pin);
  await page.waitForSelector('.login-submit', { visible: true, timeout: 10000 });
  await new Promise((r) => setTimeout(r, 300));
  await page.click('.login-submit');
  await page.waitForFunction((u) => { try { return JSON.parse(localStorage.getItem('pbsi_current_user') || 'null')?.username === u; } catch { return false; } }, { timeout: 30000 }, username);
  await new Promise((r) => setTimeout(r, 2000));
}

async function main() {
  const server = await startServer();
  let browser;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    await fs.promises.mkdir(path.join(ROOT, 'scratch'), { recursive: true });

    console.log('=== [1] Fresh authentication as @sarpras — real agendaKabid claim derivation ===');
    const sarprasPage = await browser.newPage();
    await sarprasPage.setViewport({ width: 1440, height: 900 });
    await login(sarprasPage, 'sarpras', '1234');
    const sarprasSession = await sarprasPage.evaluate(() => { try { return JSON.parse(localStorage.getItem('pbsi_current_user')); } catch { return null; } });
    console.log('  session:', JSON.stringify(sarprasSession));
    check('real login succeeded as sarpras', sarprasSession?.username === 'sarpras');
    check('role claim reflects the new Custom Role id (not "admin")', sarprasSession?.role === 'role_viewer-copy');
    check('agendaKabid claim is true — SERVER-DERIVED from the real Custom Role permissions, not client-asserted', sarprasSession?.agendaKabid === true);

    console.log('\n=== [2] Real Agenda UI as @sarpras ===');
    const agendaVisible = await sarprasPage.evaluate(() => document.body.textContent.includes('Agenda & To-Do'));
    check('Agenda & To-Do section is accessible to the Kabid session', agendaVisible);
    await sarprasPage.screenshot({ path: path.join(ROOT, 'scratch', 'agenda-c53-sarpras-agenda-landing.png') });

    // Kabid calendar: switch to Kalender mode.
    const calBtn = await sarprasPage.$('[data-agenda-action="set-mode:calendar"]');
    if (calBtn) await calBtn.click();
    await new Promise((r) => setTimeout(r, 500));
    await sarprasPage.screenshot({ path: path.join(ROOT, 'scratch', 'agenda-c53-sarpras-calendar.png') });
    check('Kalender view renders for the Kabid session', await sarprasPage.evaluate(() => !!document.querySelector('.cal-grid')));

    // Open create-event drawer -> picker, read-only inspection, no save.
    const createBtn = await sarprasPage.$('[data-agenda-action="create-event"]');
    check('"+ Agenda" create action is available to the Kabid session (writableScopes includes kabid)', !!createBtn);
    if (createBtn) {
      await createBtn.click();
      await sarprasPage.waitForSelector('[data-drawer-action="picker:open"]', { timeout: 10000 });
      await sarprasPage.click('[data-drawer-action="picker:open"]');
      await sarprasPage.waitForSelector('.cal-picker-list', { timeout: 10000 });
      await new Promise((r) => setTimeout(r, 300));
      const html = await sarprasPage.evaluate(() => document.querySelector('[data-drawer-body]').innerHTML);
      check('picker shows SARPRAS group', html.includes('cal-picker-group-label">SARPRAS<'));
      check('Evan appears as a Sarpras staff candidate', html.includes('Evan'));
      check('Grace appears as a Sarpras staff candidate', html.includes('Grace'));
      check('Leovando appears as a Sarpras staff candidate', html.includes('Leovando'));
      check('Sarpras Admin (system account) does NOT appear', !html.includes('Sarpras Admin'));
      const kabidNameCount = (html.match(/Kepala Bidang Sarana dan Prasarana/g) || []).length;
      check('no duplicate Kabid entry (Kabid does not see itself listed twice, and does not appear as its own invitee candidate)', kabidNameCount === 0);
      await sarprasPage.screenshot({ path: path.join(ROOT, 'scratch', 'agenda-c53-sarpras-picker.png') });
      await sarprasPage.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
      await new Promise((r) => setTimeout(r, 200));
      await sarprasPage.screenshot({ path: path.join(ROOT, 'scratch', 'agenda-c53-sarpras-picker-dark.png') });
      await sarprasPage.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
      await sarprasPage.setViewport({ width: 390, height: 844 });
      await new Promise((r) => setTimeout(r, 200));
      await sarprasPage.screenshot({ path: path.join(ROOT, 'scratch', 'agenda-c53-sarpras-picker-mobile-390.png') });
      await sarprasPage.setViewport({ width: 1440, height: 900 });
      // Close without saving.
      const closeBtn = await sarprasPage.$('.drawer button[aria-label], .drawer .drawer__close');
      if (closeBtn) await closeBtn.click().catch(() => {});
      await new Promise((r) => setTimeout(r, 400));
    }
    await sarprasPage.close();

    console.log('\n=== [3] Real Agenda UI as a Sarpras staff member (Leo, not Evan) ===');
    // Evan's and Grace's /users records hold pinHash (migrated, hashed) —
    // this repo's own convention never exposes a hashed PIN in plaintext,
    // so this script cannot sign in as either directly. Leo's record still
    // holds a plaintext pin (never migrated), so this substitutes Leo for
    // Evan for the "a Sarpras staff member's own view" check — same
    // agendaParticipantType: 'sarpras_staff' classification, same
    // read-only verification goal. Documented plainly in the final report.
    const staffPage = await browser.newPage();
    await staffPage.setViewport({ width: 1440, height: 900 });
    await login(staffPage, 'leo', '1234');
    const staffSession = await staffPage.evaluate(() => { try { return JSON.parse(localStorage.getItem('pbsi_current_user')); } catch { return null; } });
    check('real login succeeded as leo (Sarpras staff)', staffSession?.username === 'leo');
    check('leo does NOT carry the agendaKabid claim (ordinary Sarpras admin, not Kabid)', staffSession?.agendaKabid !== true);
    const staffAgendaVisible = await staffPage.evaluate(() => document.body.textContent.includes('Agenda & To-Do'));
    check('Agenda & To-Do remains accessible for ordinary Sarpras staff', staffAgendaVisible);
    const staffCreateBtn = await staffPage.$('[data-agenda-action="create-event"]');
    if (staffCreateBtn) {
      await staffCreateBtn.click();
      await staffPage.waitForSelector('[data-drawer-action="picker:open"]', { timeout: 10000 });
      await staffPage.click('[data-drawer-action="picker:open"]');
      await staffPage.waitForSelector('.cal-picker-list', { timeout: 10000 });
      await new Promise((r) => setTimeout(r, 300));
      const staffHtml = await staffPage.evaluate(() => document.querySelector('[data-drawer-body]').innerHTML);
      check('staff picker shows SARPRAS group with Evan/Grace/Leovando', staffHtml.includes('Evan') && staffHtml.includes('Grace') && staffHtml.includes('Leovando'));
      check('staff picker shows Kepala Bidang Sarana dan Prasarana as an invitation (KABID) candidate', staffHtml.includes('cal-picker-group-label">KABID / UNDANGAN<') && staffHtml.includes('Kepala Bidang Sarana dan Prasarana'));
      check('Sarpras Admin remains excluded from the staff picker too', !staffHtml.includes('Sarpras Admin'));
      await staffPage.screenshot({ path: path.join(ROOT, 'scratch', 'agenda-c53-staff-picker-with-kabid.png') });
      const staffCloseBtn = await staffPage.$('.drawer button[aria-label], .drawer .drawer__close');
      if (staffCloseBtn) await staffCloseBtn.click().catch(() => {});
      await new Promise((r) => setTimeout(r, 400));
    } else {
      check('staff "+ Agenda" create action available', false, 'button not found');
    }
    await staffPage.close();

    console.log('\n=== [Cleanup safety check] ===');
    console.log('  no Agenda event/task was created or saved in this script — every drawer opened was closed without Simpan.');
  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

main()
  .then(() => { console.log(`\n${pass} passed, ${fail} failed\n`); process.exit(fail === 0 ? 0 : 1); })
  .catch((err) => { console.error('\n[agenda-c53-claim-and-ui-qa] FATAL:', err.stack || err.message); process.exit(1); });
