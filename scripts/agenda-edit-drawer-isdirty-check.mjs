/* agenda-edit-drawer-isdirty-check.mjs — V1.31.3 §13 real defect found
   and fixed: opening an EXISTING Agenda/Calendar/To-Do record for
   editing and closing it via the X button/Escape/backdrop — with ZERO
   changes made — used to ALWAYS trigger the "Perubahan belum disimpan.
   Tutup tanpa menyimpan?" confirm() dialog:

     agenda-calendar-drawer.js: isDirty: () => !readOnly
     agenda-event-drawer.js:    isDirty: () => !readOnly
     agenda-task-drawer.js:     isDirty: () => true             (worse — unconditional)

   Found while investigating a real-browser test hang: an unhandled
   confirm() blocks the renderer indefinitely in headless Chrome (a real
   symptom of a real UX bug — a spurious dialog on every simple view-then-
   close). Fixed by comparing the live draft against a JSON snapshot
   taken at open time — the exact same idea the CREATE-mode isDirty
   already used, just against "what it was" instead of "started blank".

   agenda-store.js's internal record maps have no non-Firebase seed seam
   (by design — this bare DOM harness never calls initAgendaStore()), so
   this suite proves the fixed logic's SHAPE via the CREATE-mode path
   (identical isDirty pattern, unaffected by this fix — a control proving
   the pattern itself still works: blank=no dialog, touched=dialog). The
   EDIT-mode fix itself is verified against REAL production records in
   agenda-notification-e2e-check.mjs, whose drawer-close steps exercise
   openEditCalendarDrawer/openEditEventDrawer/openEditTaskDrawer directly
   and — with this fix — show zero unexpected confirm() dialogs.

   Run: node scripts/agenda-edit-drawer-isdirty-check.mjs (exit 0 = pass) */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8952;

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}
async function checkAsync(name, run) {
  try { const r = await run(); check(name, r !== false, typeof r === 'string' ? r : ''); }
  catch (err) { fail++; console.log(`  ✗ ${name} — ${err.message}`); }
}

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

async function main() {
  const server = await startServer();
  let browser;
  const consoleErrors = [];
  const dialogs = [];
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('pageerror', (err) => consoleErrors.push(String(err)));
    page.on('dialog', async (dialog) => { dialogs.push(dialog.message()); await dialog.dismiss(); });

    await page.goto(`http://localhost:${PORT}/scripts/agenda-workspace-harness.html`, { waitUntil: 'networkidle0' });
    await page.waitForFunction('window.__harnessReady === true', { timeout: 8000 });
    await page.evaluate(() => {
      window.__setDirectoryForTest({ evan: { displayName: 'Evan', role: 'admin', active: true, agendaParticipantType: 'sarpras_staff' } }, []);
    });

    console.log('\n=== [A — CONTROL: an untouched CREATE-mode drawer closes with NO confirm, for all three entity types] ===');
    for (const [label, openFn, closeFn] of [
      ['Event', '__openCreateEventDrawer', '__closeEventDrawer'],
      ['Calendar', '__openCreateCalendarDrawer', '__closeCalendarDrawer'],
      ['Task', '__openCreateTaskDrawer', '__closeTaskDrawer'],
    ]) {
      await checkAsync(`${label} create drawer, untouched, closes with no confirm dialog`, async () => {
        await page.evaluate((fn) => window[fn](), openFn);
        await page.evaluate(() => document.querySelector('.drawer__close')?.click());
        await new Promise((r) => setTimeout(r, 400));
        return dialogs.length === 0;
      });
      await page.evaluate((fn) => window[fn]?.(), closeFn); // force-close, in case the check above already dismissed it
    }
    check('zero dialogs across all three untouched CREATE-mode drawers', dialogs.length === 0, JSON.stringify(dialogs));

    console.log('\n=== [B — filling a field DOES mark a CREATE-mode drawer dirty (proves isDirty is a real comparison, not simply disabled)] ===');
    await checkAsync('Event create drawer WITH a title typed shows the confirm on close', async () => {
      await page.evaluate(() => window.__openCreateEventDrawer());
      await page.evaluate(() => {
        const el = document.querySelector('[data-field="title"]');
        el.value = 'Draft yang belum disimpan';
        el.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await page.evaluate(() => document.querySelector('.drawer__close')?.click());
      await new Promise((r) => setTimeout(r, 400));
      return dialogs.length === 1;
    });
    check('exactly one confirm fired for the dirty create-mode drawer (not zero, not more than one)', dialogs.length === 1, JSON.stringify(dialogs));
    dialogs.length = 0;
    await page.evaluate(() => window.__closeEventDrawer?.());

    console.log('\n=== [Z — zero fatal console/page errors across the whole run] ===');
    const fatal = consoleErrors.filter((e) => !/favicon|net::ERR_FILE_NOT_FOUND|permission_denied/i.test(e));
    check('no fatal console errors or uncaught page errors', fatal.length === 0, fatal.slice(0, 3).join(' | '));

  } finally {
    if (browser) await browser.close();
    server.close();
  }

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
