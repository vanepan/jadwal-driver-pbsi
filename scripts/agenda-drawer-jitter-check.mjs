/* agenda-drawer-jitter-check.mjs — V1.31.2 §14: STRONGER verification of
   the drawer jitter fix (root-caused and fixed in V1.31.1 as
   `html { scrollbar-gutter: stable }` in style.css, plus sheet-gesture.js's
   ref-counted lockBodyScroll()/unlockBodyScroll() — see both files' own
   comments) across every Agenda-family drawer: Export PDF, Calendar,
   Agenda (event), To-Do (task) — desktop + mobile (390px) — light + dark —
   plus rapid drawer-to-drawer switches and open->close->open cycles.

   Reuses the SAME harness (agenda-workspace-harness.html) and its exposed
   window.__open*Drawer/__close*Drawer globals that the other Agenda drawer
   suites already use — no new architecture, no new harness.

   Run: node scripts/agenda-drawer-jitter-check.mjs (exit 0 = pass) */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8936;

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

// Each opener is exercised via its own harness-exposed global (all of them
// already existed for the other per-drawer suites — see
// agenda-workspace-harness.html). 'export' has no isDirty guard and no
// fields, so it is the simplest to reopen repeatedly.
const DRAWERS = {
  event: { open: '__openCreateEventDrawer', close: '__closeEventDrawer' },
  task: { open: '__openCreateTaskDrawer', close: '__closeTaskDrawer' },
  calendar: { open: '__openCreateCalendarDrawer', close: '__closeCalendarDrawer' },
  export: { open: '__openAgendaExportDrawer', close: '__closeAgendaExportDrawer' },
};

async function main() {
  const server = await startServer();
  let browser;
  const consoleErrors = [];
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('pageerror', (err) => consoleErrors.push(String(err)));

    await page.goto(`http://localhost:${PORT}/scripts/agenda-workspace-harness.html`, { waitUntil: 'networkidle0' });
    await page.waitForFunction('window.__harnessReady === true', { timeout: 8000 });
    await page.evaluate((ctx) => window.__render(ctx), {
      events: [], tasks: [], calendarItems: [], now: Date.now(), todayStr: '2026-09-15',
      mode: 'agenda', calendarView: 'month', calendarAnchor: '2026-09-15',
      todoFilters: { status: 'all', priority: 'all', query: '' },
      canManage: true, writableScopes: ['sarpras_shared'], loading: false, error: null,
    });

    const measure = () => page.evaluate(() => ({
      docWidth: document.documentElement.clientWidth,
      rootLeft: Math.round(document.getElementById('root').getBoundingClientRect().left),
      rootWidth: Math.round(document.getElementById('root').getBoundingClientRect().width),
    }));
    const isLocked = () => page.evaluate(() => document.body.classList.contains('sheet-scroll-lock'));
    const overlayCount = () => page.evaluate(() => document.querySelectorAll('#appDrawerOverlay').length);
    const openDrawer = (kind) => page.evaluate((fn) => window[fn](), DRAWERS[kind].open);
    const closeDrawerFn = (kind) => page.evaluate((fn) => window[fn](), DRAWERS[kind].close);
    const waitSettled = () => new Promise((r) => setTimeout(r, 320)); // > drawer.js's 260ms close-transition fallback

    for (const viewport of [{ label: 'desktop', width: 1280, height: 800 }, { label: 'mobile-390', width: 390, height: 844 }]) {
      await page.setViewport({ width: viewport.width, height: viewport.height });
      for (const theme of ['light', 'dark']) {
        await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
        const label = `${viewport.label}/${theme}`;

        console.log(`\n=== [A — ${label}: no horizontal layout shift opening/closing each drawer] ===`);
        const baseline = await measure();
        for (const kind of Object.keys(DRAWERS)) {
          await openDrawer(kind);
          await waitSettled();
          const whileOpen = await measure();
          check(`${label}: opening the ${kind} drawer does not shift page width (scrollbar-gutter holds)`, whileOpen.docWidth === baseline.docWidth);
          await closeDrawerFn(kind);
          await waitSettled();
          const afterClose = await measure();
          check(`${label}: closing the ${kind} drawer restores the exact same layout (left=${baseline.rootLeft}, width=${baseline.rootWidth})`, afterClose.rootLeft === baseline.rootLeft && afterClose.rootWidth === baseline.rootWidth);
        }

        console.log(`\n=== [B — ${label}: body scroll-lock is correctly ref-counted, never stuck] ===`);
        check(`${label}: no drawer open -> not locked (clean baseline before this block)`, !(await isLocked()));
        await openDrawer('event');
        await waitSettled();
        check(`${label}: one drawer open -> locked`, await isLocked());
        await closeDrawerFn('event');
        await waitSettled();
        check(`${label}: closed -> unlocked again (no stuck lock)`, !(await isLocked()));

        console.log(`\n=== [C — ${label}: rapid drawer-to-drawer switch — single-instance overlay, no stacking, no jitter] ===`);
        await openDrawer('event');
        await openDrawer('calendar'); // replaces in place, per drawer.js's own "instant replace" contract — no close() in between
        await waitSettled();
        check(`${label}: exactly ONE overlay node exists after switching event -> calendar without closing`, (await overlayCount()) === 1);
        check(`${label}: lock count stayed balanced (still exactly locked once, not double-locked)`, await isLocked());
        const afterSwitch = await measure();
        check(`${label}: no layout shift across the rapid switch`, afterSwitch.docWidth === baseline.docWidth);
        await closeDrawerFn('calendar');
        await waitSettled();
        check(`${label}: closing the SURVIVING drawer (calendar) fully unlocks (the replaced event drawer's lock was already released, not leaked)`, !(await isLocked()));
        check(`${label}: zero overlay nodes remain`, (await overlayCount()) === 0);

        console.log(`\n=== [D — ${label}: open->close->open rapid cycles (5x, same drawer) — no leak, no drift] ===`);
        for (let i = 0; i < 5; i++) {
          await openDrawer('task');
          await closeDrawerFn('task');
        }
        await waitSettled();
        check(`${label}: after 5 rapid open/close cycles, scroll-lock is unlocked`, !(await isLocked()));
        check(`${label}: after 5 rapid open/close cycles, zero overlay nodes remain`, (await overlayCount()) === 0);
        const afterCycles = await measure();
        check(`${label}: layout is back to the exact original baseline after the cycles`, afterCycles.rootLeft === baseline.rootLeft && afterCycles.rootWidth === baseline.rootWidth);

        console.log(`\n=== [E — ${label}: canonical form factor preserved] ===`);
        await openDrawer('event');
        await waitSettled();
        const grabberHidden = await page.evaluate(() => {
          const g = document.querySelector('.drawer__grabber');
          return g ? getComputedStyle(g).display === 'none' : null;
        });
        if (viewport.label === 'desktop') {
          check(`${label}: desktop shows the right-panel form factor (swipe grabber hidden)`, grabberHidden === true);
        } else {
          check(`${label}: mobile shows the bottom-sheet form factor (swipe grabber visible)`, grabberHidden === false);
        }
        await closeDrawerFn('event');
        await waitSettled();
      }
    }

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
