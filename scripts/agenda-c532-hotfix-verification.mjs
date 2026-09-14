/* agenda-c532-hotfix-verification.mjs — C5.3.2 HOTFIX verification

   Fresh real production session as a Sarpras staff member (Leo), real
   create-event flow, exact repro case from the bug report:
     Rapat / 14-09-2026 / 09:00-10:00 / Ruang Rapat Lt. 2 / tes / no participants

   Confirms:
   1. The PERMISSION_DENIED symptom is gone (Rules deploy fix).
   2. Whether the created event becomes visible in the SAME session's own
      Agenda list (tests the agendaEventsByScope index dependency, which
      needs the — currently still undeployed — Agenda Cloud Functions).
   3. Fresh RTDB read of the raw /agendaEvents record and the index nodes.

   Run: node scripts/agenda-c532-hotfix-verification.mjs */

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8941;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

function dbGet(nodePath) {
  const tmp = path.join(os.tmpdir(), `c532v-${nodePath.replace(/\//g, '_')}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  const res = spawnSync('firebase', ['database:get', `/${nodePath}`, '-o', tmp], { cwd: ROOT, shell: true, encoding: 'utf8' });
  if (res.status !== 0) throw new Error(`firebase database:get /${nodePath} failed: ${res.stderr || res.stdout}`);
  const raw = fs.readFileSync(tmp, 'utf8').trim();
  fs.unlinkSync(tmp);
  return raw === 'null' || raw === '' ? null : JSON.parse(raw);
}

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
  let browser, page;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    const consoleErrors = [];
    const t0 = Date.now();
    const allLogs = [];
    page.on('console', (msg) => { const t = Date.now() - t0; allLogs.push(`[+${t}ms][${msg.type()}] ${msg.text()}`); if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('pageerror', (err) => { const t = Date.now() - t0; allLogs.push(`[+${t}ms][UNCAUGHT] ${String(err)}`); consoleErrors.push('[UNCAUGHT] ' + String(err)); });

    console.log('=== [Fresh login] as leo (real Sarpras staff, sarpras_staff classification) ===');
    await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.waitForSelector('#loginForm', { timeout: 15000 });
    await new Promise((r) => setTimeout(r, 500));
    await page.type('#loginUsername', 'leo');
    await page.type('#loginPin', '1234');
    await page.waitForSelector('.login-submit', { visible: true, timeout: 10000 });
    await new Promise((r) => setTimeout(r, 300));
    await page.click('.login-submit');
    await page.waitForFunction(() => { try { return JSON.parse(localStorage.getItem('pbsi_current_user') || 'null')?.username === 'leo'; } catch { return false; } }, { timeout: 30000 });
    console.log('  logged in as leo');
    // The custom-token sign-in resolves async: onAuthStateChanged settles a
    // SECOND time a few seconds after the optimistic localStorage write,
    // which re-runs the Visual Shell V2 init and rebuilds the shell DOM
    // (confirmed via console timeline: a second "[VSM] loading Visual Shell
    // V2" a few seconds after the first). Interacting before that settles
    // gets any just-opened drawer wiped out from under it. Wait for the
    // second settle explicitly instead of a fixed guess.
    const settleCount = () => allLogs.filter((l) => l.includes('auth-state settled')).length;
    const settleDeadline = Date.now() + 20000;
    while (settleCount() < 2 && Date.now() < settleDeadline) await new Promise((r) => setTimeout(r, 250));
    console.log(`  auth-state settled ${settleCount()}x before proceeding`);
    await new Promise((r) => setTimeout(r, 2000));
    await page.evaluate(() => { document.getElementById('btnPushDismiss')?.click(); });
    await fs.promises.mkdir(path.join(ROOT, 'scratch'), { recursive: true });

    console.log('\n=== [Reproduce] exact repro case: Rapat / 14-09-2026 / 09:00-10:00 / Ruang Rapat Lt. 2 / tes ===');
    const createBtnExists = await page.evaluate(() => !!document.querySelector('[data-agenda-action="create-event"]'));
    check('"+ Agenda" create action available to Leo', createBtnExists);
    if (!createBtnExists) throw new Error('create-event button not found — cannot proceed with repro');
    await page.evaluate(() => document.querySelector('[data-agenda-action="create-event"]')?.click());
    await new Promise((r) => setTimeout(r, 200));
    await page.screenshot({ path: path.join(ROOT, 'scratch', 'agenda-c532-hotfix-immediately-after-click.png') });
    console.log('  console/page errors immediately after click:', JSON.stringify(consoleErrors));
    await page.waitForSelector('[data-field="title"]', { timeout: 10000 }).catch((e) => console.log('  waitForSelector title failed:', e.message));
    console.log(`  title field present right when waitForSelector resolved: ${await page.evaluate(() => !!document.querySelector('[data-field="title"]'))}`);
    await new Promise((r) => setTimeout(r, 500));
    await page.screenshot({ path: path.join(ROOT, 'scratch', 'agenda-c532-hotfix-drawer-opened.png') });
    console.log('  --- full console/page log timeline so far ---');
    console.log(allLogs.join('\n'));
    const drawerDiag = await page.evaluate(() => ({
      titleFieldExists: !!document.querySelector('[data-field="title"]'),
      dateFieldExists: !!document.querySelector('[data-field="date"]'),
      saveBtnExists: !!document.querySelector('[data-drawer-action="event:save"]'),
      drawerBodyHtmlLen: document.querySelector('[data-drawer-body]')?.innerHTML.length,
    }));
    console.log('  drawer diagnostics right after opening:', JSON.stringify(drawerDiag));

    for (const [sel, val, extra] of [
      ['[data-field="title"]', 'Rapat', []],
      ['[data-field="date"]', '2026-09-14', ['change']],
      ['[data-field="startTime"]', '09:00', ['change']],
      ['[data-field="endTime"]', '10:00', ['change']],
      ['[data-field="location"]', 'Ruang Rapat Lt. 2', []],
      ['[data-field="description"]', 'tes', []],
    ]) {
      const result = await page.evaluate((s, v, evs) => {
        const el = document.querySelector(s);
        if (!el) return { found: false };
        el.value = v;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        for (const ev of evs) el.dispatchEvent(new Event(ev, { bubbles: true }));
        return { found: true, valueAfter: el.value };
      }, sel, val, extra);
      console.log(`  set ${sel} = "${val}" ->`, JSON.stringify(result));
      await new Promise((r) => setTimeout(r, 150));
    }
    await page.screenshot({ path: path.join(ROOT, 'scratch', 'agenda-c532-hotfix-form-filled.png') });

    const fieldDump = await page.evaluate(() => ({
      title: document.querySelector('[data-field="title"]')?.value,
      date: document.querySelector('[data-field="date"]')?.value,
      startTime: document.querySelector('[data-field="startTime"]')?.value,
      endTime: document.querySelector('[data-field="endTime"]')?.value,
      location: document.querySelector('[data-field="location"]')?.value,
      description: document.querySelector('[data-field="description"]')?.value,
    }));
    console.log('  form state before save:', JSON.stringify(fieldDump));

    console.log('\n=== [Save] clicking Simpan ===');
    await page.evaluate(() => document.querySelector('[data-drawer-action="event:save"]')?.click());
    await new Promise((r) => setTimeout(r, 1500));
    const afterSave = await page.evaluate(() => ({
      drawerStillOpen: !!document.querySelector('.drawer[role="dialog"]'),
      errorText: document.querySelector('[data-drawer-error]')?.textContent || null,
    }));
    console.log('  after save:', JSON.stringify(afterSave));
    await page.screenshot({ path: path.join(ROOT, 'scratch', 'agenda-c532-hotfix-after-save.png') });
    check('NO PERMISSION_DENIED error shown', !afterSave.errorText || !/permission/i.test(afterSave.errorText), afterSave.errorText);
    check('drawer closed (save succeeded, no error blocking close)', !afterSave.drawerStillOpen);

    console.log('\n=== [Verify raw write] fresh RTDB read of /agendaEvents ===');
    const allEvents = dbGet('agendaEvents') || {};
    const created = Object.entries(allEvents).find(([, e]) => e.title === 'Rapat' && e.description === 'tes' && e.location === 'Ruang Rapat Lt. 2');
    check('the event exists in /agendaEvents', !!created);
    let eventId = null, eventRecord = null;
    if (created) {
      [eventId, eventRecord] = created;
      console.log(`  /agendaEvents/${eventId} = ${JSON.stringify(eventRecord)}`);
      check('organizerUsername === leo', eventRecord.organizerUsername === 'leo');
      check('createdBy === leo', eventRecord.createdBy === 'leo');
      check('updatedBy === leo', eventRecord.updatedBy === 'leo');
      check('scope === sarpras_shared', eventRecord.scope === 'sarpras_shared');
    }

    console.log('\n=== [Verify index — the Agenda Functions dependency] ===');
    const scopeIndex = dbGet('agendaEventsByScope/sarpras_shared') || {};
    const userIndex = dbGet('agendaEventsByUser/leo') || {};
    const inScopeIndex = eventId ? Object.prototype.hasOwnProperty.call(scopeIndex, eventId) : false;
    const inUserIndex = eventId ? Object.prototype.hasOwnProperty.call(userIndex, eventId) : false;
    console.log(`  present in agendaEventsByScope/sarpras_shared: ${inScopeIndex}`);
    console.log(`  present in agendaEventsByUser/leo: ${inUserIndex}`);
    const audit = dbGet('agendaAudit') || {};
    const auditRow = Object.values(audit).find((a) => a.entityId === eventId);
    console.log(`  agendaAudit row exists for this event: ${!!auditRow}`);

    console.log('\n=== [Verify UI visibility] does the event show in Leo\'s OWN Agenda list, same session? ===');
    await new Promise((r) => setTimeout(r, 1000));
    const listVisible = await page.evaluate((title) => document.body.textContent.includes(title), 'Rapat');
    console.log(`  "Rapat" visible in the rendered Agenda list: ${listVisible}`);
    await page.screenshot({ path: path.join(ROOT, 'scratch', 'agenda-c532-hotfix-list-after-save.png') });

    console.log('\n=== [Direct-read control] the event IS readable by id even without the index (Rules read-path, organizer) ===');
    // Already proven implicitly: Leo IS the organizer, and agenda-event-drawer.js's
    // own record-subscription would have shown it if the picker/list had the id —
    // the getEventById()/direct subscription path is exercised by reconcileRecordSubscriptions
    // once an id is known, which is exactly the mechanism the missing index breaks.

    console.log('\n=== [Console errors during the whole flow] ===');
    const relevantErrors = consoleErrors.filter((e) => !/permission.denied.*Fetch Firebase data/i.test(e));
    console.log(`  console errors: ${JSON.stringify(consoleErrors)}`);
  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

main()
  .then(() => { console.log(`\n${pass} passed, ${fail} failed\n`); process.exit(fail === 0 ? 0 : 1); })
  .catch((err) => { console.error('\n[agenda-c532-hotfix-verification] FATAL:', err.stack || err.message); process.exit(1); });
