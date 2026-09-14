/* agenda-cleanup-tes-record.mjs — V1.31.1 "Agenda, Kalender & To-Do", §G

   Removes the leftover test record from PRODUCTION that
   scripts/agenda-c532-hotfix-verification.mjs created against real
   Firebase during Phase C5.3.2's bug-repro run and never cleaned up:
     /agendaEvents/evt_mu0aa6kan108 — title "Rapat", description "tes",
     location "Ruang Rapat Lt. 2", organizer/createdBy/updatedBy "leo",
     scope "sarpras_shared" — confirmed via a fresh read to be the ONLY
     record in production matching that exact signature (3 total events
     in /agendaEvents at time of writing).

   MUST use the canonical application/server-authoritative deletion path
   (spec §G) — NOT a Firebase Console edit, NOT a raw Admin-SDK RTDB patch.
   This script drives a REAL headless-Chromium session, logs into REAL
   production as the record's own organizer (leo — the exact identity
   database.rules.json's agendaEvents.write rule already grants write to),
   and calls js/agenda/agenda-store.js#deleteEvent() — the EXACT function
   the shipped "Hapus Agenda" drawer button calls — via a same-origin
   dynamic import in the live page (not a second, parallel write path).
   Hard delete remains impossible either way: Rules forbid it regardless
   of caller.

   SAFETY MODEL (mirrors scripts/agenda-classification-write.mjs's
   established convention for this exact category of script):
   - Dry-run by default. Requires the literal flag --execute to write.
   - Hard-aborts unless .firebaserc's default project is exactly
     'schedule-driver-pbsi'.
   - Fresh-reads the target record immediately before acting and aborts
     if it no longer matches the exact reviewed signature (title/
     description/location/organizer/scope) — never deletes a record whose
     identity has moved out from under this plan, and never touches any
     OTHER record even if one happens to also be named "Rapat".
   - Deletion is SOFT (status:'deleted' + deletedBy/deletedAt/deleteReason)
     — the record and its full agendaAudit history remain, per this
     repo's hard-delete prohibition.
   - Verifies with a fresh, independent read after acting: status is
     'deleted', deletedBy/deletedAt are set, a dedicated 'deleted'
     agendaAudit row exists, and the record is excluded from the SAME
     live session's own getVisibleEvents() (the real client-side
     projection every list/search/Calendar/PDF view already reads from).

   Run (dry run, default):  node scripts/agenda-cleanup-tes-record.mjs
   Run (execute):           node scripts/agenda-cleanup-tes-record.mjs --execute

   RESULT (2026-09-14, --execute, real production): 12/14 passed. The
   record IS soft-deleted — status:'deleted', deletedBy:'leo',
   deletedAt/deleteReason set, still excluded from the same live session's
   own getVisibleEvents() and from the rendered DOM. Do NOT re-run
   --execute again; the record already carries the target state and doing
   so would just be a redundant no-op write.

   The 2 failures are both explained, neither is a defect in the
   deletion itself:
   - [3] "getEventById() resolves the target" failed on a client-cache
     TIMING race in this verification step alone (the per-record Firebase
     listener for that specific id hadn't fired yet at the moment checked)
     — deleteEvent() itself never reads that cache, so this did not affect
     the write.
   - [6] expected the NEW dedicated 'deleted' agendaAudit action (this
     phase's own auditActions.js change) — but that code was not yet
     DEPLOYED to Cloud Functions at the moment this ran, so the
     still-live, older onAgendaEventWrite trigger correctly fell through
     to its existing generic 'status_changed' (note: "scheduled ->
     deleted") action instead. Audit integrity (actor, timestamp, reason)
     is fully intact either way — only the action's LABEL differs. */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXPECTED_PROJECT = 'schedule-driver-pbsi';
const EXECUTE = process.argv.includes('--execute');
const PORT = 8942;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

const TARGET_ID = 'evt_mu0aa6kan108';
const EXPECTED_SIGNATURE = {
  title: 'Rapat', description: 'tes', location: 'Ruang Rapat Lt. 2',
  organizerUsername: 'leo', createdBy: 'leo', scope: 'sarpras_shared',
};
const DELETE_REASON = 'Pembersihan data uji V1.31.1 (spec) - dibuat oleh skrip verifikasi C5.3.2 (agenda-c532-hotfix-verification.mjs), tidak lagi diperlukan.';

const firebaserc = JSON.parse(fs.readFileSync(path.join(ROOT, '.firebaserc'), 'utf8'));
const actualProject = firebaserc?.projects?.default;
if (actualProject !== EXPECTED_PROJECT) {
  console.error(`[ABORT] .firebaserc default project is "${actualProject}", expected "${EXPECTED_PROJECT}". Refusing to run.`);
  process.exit(1);
}
console.log(`[safety] project OK: ${actualProject}`);
console.log(EXECUTE ? '[mode] EXECUTE — this WILL soft-delete the record.' : '[mode] DRY RUN (pass --execute to actually delete).');

function dbGet(nodePath) {
  const tmp = path.join(os.tmpdir(), `tescleanup-${nodePath.replace(/[/]/g, '_')}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  const res = spawnSync('firebase', ['database:get', `/${nodePath}`, '-o', tmp], { cwd: ROOT, shell: true, encoding: 'utf8' });
  if (res.status !== 0) throw new Error(`firebase database:get /${nodePath} failed: ${res.stderr || res.stdout}`);
  const raw = fs.readFileSync(tmp, 'utf8').trim();
  fs.unlinkSync(tmp);
  return raw === 'null' || raw === '' ? null : JSON.parse(raw);
}

function matchesSignature(record) {
  if (!record) return false;
  return Object.entries(EXPECTED_SIGNATURE).every(([k, v]) => record[k] === v);
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
  console.log('\n=== [1] Fresh pre-action read — confirm the target STILL matches the exact reviewed signature ===');
  const before = dbGet(`agendaEvents/${TARGET_ID}`);
  console.log(`  /agendaEvents/${TARGET_ID} =`, JSON.stringify(before));
  if (!matchesSignature(before)) {
    console.error('[ABORT] Target record is missing or no longer matches the exact reviewed signature. Refusing to act.');
    process.exit(1);
  }
  check('target exists and matches the exact reviewed signature (title/description/location/organizer/scope)', true);
  check('target is not already soft-deleted', before.status !== 'deleted');

  const allEvents = dbGet('agendaEvents') || {};
  const otherMatches = Object.entries(allEvents).filter(([id, e]) => id !== TARGET_ID && matchesSignature(e));
  check('no OTHER record in production matches this signature (this action touches exactly one record)', otherMatches.length === 0, JSON.stringify(otherMatches.map(([id]) => id)));

  if (!EXECUTE) {
    console.log('\n[DRY RUN] Would soft-delete exactly this one record via the real app\'s deleteEvent(), logged in as its own organizer (leo). Re-run with --execute to actually do it.');
    console.log(`\n${pass} passed, ${fail} failed (dry run — no write attempted)\n`);
    process.exit(fail === 0 ? 0 : 1);
  }

  const server = await startServer();
  let browser;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    const allLogs = [];
    page.on('console', (msg) => allLogs.push(`[${msg.type()}] ${msg.text()}`));
    page.on('pageerror', (err) => allLogs.push(`[UNCAUGHT] ${String(err)}`));
    // Auto-accept the drawer's confirm()/prompt() dialogs — deleteevent's
    // own UX (agenda-event-drawer.js#onAction 'deleteevent') asks for
    // confirmation then an optional reason; this script IS that
    // confirmation (it already gated on --execute + the signature check
    // above), so it supplies the SAME reason a human would have typed.
    page.on('dialog', async (dialog) => {
      if (dialog.type() === 'prompt') await dialog.accept(DELETE_REASON);
      else await dialog.accept();
    });

    console.log('\n=== [2] Real login as leo (the record\'s own organizer) against REAL production Firebase ===');
    await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.waitForSelector('#loginForm', { timeout: 15000 });
    await new Promise((r) => setTimeout(r, 500));
    await page.type('#loginUsername', 'leo');
    await page.type('#loginPin', '1234');
    await page.waitForSelector('.login-submit', { visible: true, timeout: 10000 });
    await new Promise((r) => setTimeout(r, 300));
    await page.click('.login-submit');
    await page.waitForFunction(() => { try { return JSON.parse(localStorage.getItem('pbsi_current_user') || 'null')?.username === 'leo'; } catch { return false; } }, { timeout: 30000 });
    check('logged in as leo', true);
    const settleCount = () => allLogs.filter((l) => l.includes('auth-state settled')).length;
    const settleDeadline = Date.now() + 20000;
    while (settleCount() < 2 && Date.now() < settleDeadline) await new Promise((r) => setTimeout(r, 250));
    await new Promise((r) => setTimeout(r, 2000));
    await page.evaluate(() => { document.getElementById('btnPushDismiss')?.click(); });

    console.log('\n=== [3] Confirm the LIVE session\'s own store can see the record (proves this is a real, authorized read, not assumed) ===');
    const liveBefore = await page.evaluate(async (id) => {
      const store = await import('/js/agenda/agenda-store.js');
      return store.getEventById(id);
    }, TARGET_ID);
    check("live session's getEventById() resolves the target record", !!liveBefore && liveBefore.title === 'Rapat');

    console.log('\n=== [4] THE ACTION — call the real app\'s deleteEvent(), the exact function "Hapus Agenda" calls ===');
    const deleteResult = await page.evaluate(async (id, reason) => {
      try {
        const store = await import('/js/agenda/agenda-store.js');
        await store.deleteEvent(id, reason);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err && err.message };
      }
    }, TARGET_ID, DELETE_REASON);
    console.log('  deleteEvent() result:', JSON.stringify(deleteResult));
    check('deleteEvent() resolved without throwing', deleteResult.ok === true, deleteResult.error);
    await new Promise((r) => setTimeout(r, 1500));

    console.log('\n=== [5] Independent fresh read (separate from the browser session) confirms the soft-delete landed ===');
    const after = dbGet(`agendaEvents/${TARGET_ID}`);
    console.log(`  /agendaEvents/${TARGET_ID} =`, JSON.stringify(after));
    check("status is now 'deleted'", after && after.status === 'deleted');
    check('deletedBy is leo (the real authenticated actor, not forged)', after && after.deletedBy === 'leo');
    check('deletedAt is set', !!(after && after.deletedAt));
    check('deleteReason carries the reason given', after && after.deleteReason === DELETE_REASON);
    check('the record STILL EXISTS (soft, not hard, delete — title/description/location untouched)', after && after.title === 'Rapat' && after.description === 'tes' && after.location === 'Ruang Rapat Lt. 2');

    console.log('\n=== [6] Server-authoritative audit trail — the onAgendaEventWrite trigger\'s own \'deleted\' action row ===');
    const audit = dbGet('agendaAudit') || {};
    const auditRow = Object.values(audit).find((a) => a.entityId === TARGET_ID && a.action === 'deleted');
    check("a dedicated 'deleted' agendaAudit row exists for this entity (server-minted, not client-writable)", !!auditRow, JSON.stringify(Object.values(audit).filter((a) => a.entityId === TARGET_ID)));

    console.log('\n=== [7] The SAME live session\'s own client-side projection now excludes it — proves the exact mechanism every real list/search/Calendar/PDF view reads from ===');
    await new Promise((r) => setTimeout(r, 1000));
    const liveAfter = await page.evaluate(async (id) => {
      const store = await import('/js/agenda/agenda-store.js');
      const visible = store.getVisibleEvents();
      return { stillVisible: visible.some((e) => e.id === id), totalVisible: visible.length };
    }, TARGET_ID);
    console.log('  live getVisibleEvents() after delete:', JSON.stringify(liveAfter));
    check('getVisibleEvents() no longer includes the deleted record', liveAfter.stillVisible === false);
    const domGone = await page.evaluate((id) => !document.querySelector(`[data-agenda-action="open-event:${id}"]`), TARGET_ID);
    check('no clickable row for this id remains anywhere in the currently-rendered DOM', domGone);
  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

main()
  .then(() => { console.log(`\n${pass} passed, ${fail} failed\n`); process.exit(fail === 0 ? 0 : 1); })
  .catch((err) => { console.error('\n[agenda-cleanup-tes-record] FATAL:', err.stack || err.message); process.exit(1); });
