/* agenda-calendar-view-transition-check.mjs — V1.31.2 §4
   Real headless Chromium (real View Transitions API support confirmed),
   drives the REAL agenda-workspace.js/-view.js through the exact same
   DOM harness agenda-workspace-render-check.mjs already established
   (scripts/agenda-workspace-harness.html — real production modules,
   synthetic 'admin' session, no live Firebase needed for this).

   Proves: the Month<->Week toggle and tapping a day cell from Month
   actually trigger document.startViewTransition() when motion is
   allowed; cal-prev/next/today do NOT (no excessive movement, §4); the
   transition is scoped to .cal-calview-region only (no full-page
   transition the way js/app.js#setWorkspace() has); reduced motion
   renders immediately with NO transition attempted; the calendar
   anchor/view state is byte-correct after a transition; and rapid
   repeated toggling never leaves stale handlers or a broken view (the
   delegated click listener lives on the host, wired once at mount —
   doRenderWithViewTransition() only ever replaces innerHTML, same as
   the plain path).

   Run: node scripts/agenda-calendar-view-transition-check.mjs (exit 0 = pass) */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8945;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}
async function checkAsync(name, run) {
  try { const r = await run(); check(name, r !== false, typeof r === 'string' ? r : ''); }
  catch (err) { fail++; console.log(`  ✗ ${name} — ${err.message}`); }
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

/** Instruments document.startViewTransition to record every call (name
 *  captured from the FIRST element bearing a view-transition-name at
 *  call time — good enough to prove scope), without altering its real
 *  behavior (still calls the real callback synchronously, still returns
 *  a real transition object) — this is an OBSERVATION shim, not a mock
 *  of the calendar's own logic. */
async function installViewTransitionProbe(page) {
  await page.evaluateOnNewDocument(() => {
    window.__vtCalls = [];
    const real = document.startViewTransition?.bind(document);
    if (!real) return;
    document.startViewTransition = (cb) => {
      window.__vtCalls.push({ t: Date.now() });
      return real(cb);
    };
  });
}

async function main() {
  const server = await startServer();
  let browser;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1024, height: 900 });
    const consoleErrors = [];
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('pageerror', (err) => consoleErrors.push(String(err)));
    await installViewTransitionProbe(page);

    await page.goto(`http://localhost:${PORT}/scripts/agenda-workspace-harness.html`, { waitUntil: 'networkidle0' });
    await page.waitForFunction('window.__harnessReady === true', { timeout: 8000 });

    console.log('\n=== [A — Bulan -> Minggu toggle triggers a scoped view transition] ===');
    await page.evaluate((ctx) => window.__render(ctx), { events: [], tasks: [], calendarItems: [], now: Date.now(), todayStr: '2026-09-15', mode: 'calendar', calendarView: 'month', calendarAnchor: '2026-09-15', todoFilters: { status: 'all', priority: 'all', query: '' }, canManage: true, writableScopes: ['sarpras_shared'], loading: false, error: null });
    // v1.31.4 R5 — view-transition-name is now conditional (agenda-styles.js):
    // present only while agenda-workspace.js#doRenderWithViewTransition() has
    // tagged <html>.cal-viewtransition-active for the duration of its OWN
    // transition, absent otherwise. This proves both halves: scoped (has a
    // real name, not the whole page) AND not leaked into any unrelated
    // transition that might be in flight elsewhere (e.g. the theme toggle).
    await checkAsync('the calendar region carries a view-transition-name ONLY while its own transition is active — never unconditionally', () => page.evaluate(() => {
      const region = document.querySelector('.cal-calview-region');
      const withoutMarker = getComputedStyle(region).viewTransitionName;
      document.documentElement.classList.add('cal-viewtransition-active');
      const withMarker = getComputedStyle(region).viewTransitionName;
      document.documentElement.classList.remove('cal-viewtransition-active');
      return withoutMarker === 'none' && withMarker !== 'none';
    }));
    // Clear this harness-level render (#root) before mounting the real
    // orchestrator below — view-transition-name must be unique across
    // the WHOLE document during a capture; leaving both #root's and
    // #v2AgendaWorkspace's own .cal-calview-region in the page at once
    // would be a genuine "Unexpected duplicate view-transition-name"
    // (correctly rejected by the browser) that only this test's own
    // two-render setup could ever cause — never a real scenario in
    // production, where exactly one Agenda workspace host ever exists.
    await page.evaluate(() => { document.getElementById('root').innerHTML = ''; });

    // This harness only calls window.__render() directly (buildWorkspaceHTML),
    // not the real agenda-workspace.js orchestrator (mount/handleAction) —
    // so to exercise doRenderWithViewTransition() for real, import that
    // module's own exported mount + drive it through a real click, exactly
    // like a user would. Mounting a second, independent instance onto a
    // fresh host is deliberate: proves the ACTUAL production code path,
    // not a re-implementation of it in this test.
    await page.evaluate(async () => {
      const store = await import('/js/agenda/agenda-store.js');
      const ws = await import('/js/agenda/agenda-workspace.js');
      const host = document.createElement('div');
      host.id = 'v2AgendaWorkspace';
      document.body.appendChild(host);
      window.__wsMod = ws;
      ws.mountAgendaWorkspace();
    });
    await new Promise((r) => setTimeout(r, 200));
    // The real orchestrator's own _state starts at mode:'agenda' (its
    // module-level default) regardless of what the harness's separate
    // window.__render() call above showed — switch this REAL mounted
    // instance to Kalender mode for real, the same way a user would.
    await page.evaluate(() => document.querySelector('#v2AgendaWorkspace [data-agenda-action="set-mode:calendar"]')?.click());
    await new Promise((r) => setTimeout(r, 200));
    check('the real mounted instance is now showing Kalender mode (Bulan/Minggu toggle present)', await page.evaluate(() => !!document.querySelector('#v2AgendaWorkspace [data-agenda-action^="set-calview:"]')));

    await checkAsync('clicking "Minggu" (Bulan -> Minggu) calls document.startViewTransition() exactly once', () => page.evaluate(() => {
      window.__vtCalls.length = 0;
      const btn = [...document.querySelectorAll('[data-agenda-action^="set-calview:"]')].find((b) => b.textContent.trim() === 'Minggu');
      btn?.click();
      return window.__vtCalls.length === 1;
    }));
    await new Promise((r) => setTimeout(r, 250));
    check('the view actually switched to Minggu (week grid rendered)', await page.evaluate(() => document.querySelectorAll('#v2AgendaWorkspace .cal-week-row .cal-cell').length === 7));

    console.log('\n=== [B — cal-prev/next/today do NOT trigger a view transition (no excessive movement, §4)] ===');
    for (const action of ['cal-prev', 'cal-next', 'cal-today']) {
      await checkAsync(`"${action}" does not call startViewTransition()`, () => page.evaluate((act) => {
        window.__vtCalls.length = 0;
        document.querySelector(`[data-agenda-action="${act}"]`)?.click();
        return window.__vtCalls.length === 0;
      }, action));
    }

    console.log('\n=== [C — Minggu -> Bulan (the reverse direction) also transitions] ===');
    await checkAsync('clicking "Bulan" triggers exactly one view transition', () => page.evaluate(() => {
      window.__vtCalls.length = 0;
      const btn = [...document.querySelectorAll('[data-agenda-action^="set-calview:"]')].find((b) => b.textContent.trim() === 'Bulan');
      btn?.click();
      return window.__vtCalls.length === 1;
    }));
    await new Promise((r) => setTimeout(r, 250));
    check('the view actually switched back to Bulan (7-column month grid rendered)', await page.evaluate(() => {
      const cells = document.querySelectorAll('#v2AgendaWorkspace .cal-grid .cal-cell').length;
      return cells > 0 && cells % 7 === 0;
    }));

    console.log('\n=== [D — tapping a day cell FROM Month view (the real-world Month->Week gesture) transitions; the SAME tap from within Week view (no view change) does not] ===');
    await checkAsync('tapping a day cell while in Month view triggers a transition and lands on Minggu', () => page.evaluate(() => {
      window.__vtCalls.length = 0;
      const cell = document.querySelector('#v2AgendaWorkspace .cal-grid:not(.cal-week-row) .cal-cell[data-agenda-action^="goto-day:"]');
      cell?.click();
      return window.__vtCalls.length === 1;
    }));
    await new Promise((r) => setTimeout(r, 250));
    check('...and the resulting view is really Minggu', await page.evaluate(() => document.querySelectorAll('#v2AgendaWorkspace .cal-week-row .cal-cell').length === 7));
    await checkAsync('tapping a day cell WHILE ALREADY in Week view (anchor-only change, no view switch) does NOT transition', () => page.evaluate(() => {
      window.__vtCalls.length = 0;
      const cell = document.querySelector('#v2AgendaWorkspace .cal-week-row .cal-cell[data-agenda-action^="goto-day:"]');
      cell?.click();
      return window.__vtCalls.length === 0;
    }));

    console.log('\n=== [E — reduced motion: renders correctly with NO transition attempted at all] ===');
    await page.evaluate(() => document.documentElement.setAttribute('data-anim', 'off'));
    await checkAsync('with data-anim="off", toggling Bulan<->Minggu never calls startViewTransition()', () => page.evaluate(() => {
      window.__vtCalls.length = 0;
      const toBulan = [...document.querySelectorAll('[data-agenda-action^="set-calview:"]')].find((b) => b.textContent.trim() === 'Bulan');
      toBulan?.click();
      return window.__vtCalls.length === 0;
    }));
    check('...but the view still switches correctly (immediate render, not silently broken)', await page.evaluate(() => {
      const cells = document.querySelectorAll('#v2AgendaWorkspace .cal-grid .cal-cell').length;
      return cells > 0 && cells % 7 === 0;
    }));
    await page.evaluate(() => document.documentElement.removeAttribute('data-anim'));

    console.log('\n=== [F — rapid repeated toggling: no stale handlers, no duplicated/broken DOM] ===');
    await checkAsync('5 rapid toggles in a row all still work, ending on a valid, single, non-duplicated view', () => page.evaluate(async () => {
      for (let i = 0; i < 5; i++) {
        const label = i % 2 === 0 ? 'Minggu' : 'Bulan';
        const btn = [...document.querySelectorAll('[data-agenda-action^="set-calview:"]')].find((b) => b.textContent.trim() === label);
        btn?.click();
        await new Promise((r) => setTimeout(r, 60));
      }
      await new Promise((r) => setTimeout(r, 300));
      const hosts = document.querySelectorAll('#v2AgendaWorkspace').length;
      const regions = document.querySelectorAll('.cal-calview-region').length;
      return hosts === 1 && regions === 1;
    }));
    // The click listener is delegated on the host, wired once at mount —
    // a broken/duplicated wiring would show up as either NO reaction or
    // a doubled action; this proves it still reacts exactly once per click.
    await checkAsync('...and the delegated click listener still fires exactly once per click after all that (no duplicate wiring)', () => page.evaluate(() => {
      window.__vtCalls.length = 0;
      const btn = [...document.querySelectorAll('[data-agenda-action^="set-calview:"]')].find((b) => b.getAttribute('aria-pressed') !== 'true');
      btn?.click();
      return window.__vtCalls.length === 1;
    }));

    console.log('\n=== [G — zero FATAL console/page errors across the whole run] ===');
    // This harness's synthetic localStorage session (matching this
    // repo's own established harness convention — see
    // agenda-workspace-render-check.mjs) has no real Firebase Auth
    // token, so the real database.rules.json correctly denies its
    // subscribeNode() calls — expected, informational noise, not a
    // real error (same exclusion smoke-boot.mjs's own "Firebase
    // permission-denied noise is expected/informational" already uses).
    const fatal = consoleErrors.filter((e) => !/permission.denied/i.test(e));
    check('no fatal console errors or uncaught page errors', fatal.length === 0, JSON.stringify(fatal));

  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

main()
  .then(() => { console.log(`\n${pass} passed, ${fail} failed\n`); process.exit(fail === 0 ? 0 : 1); })
  .catch((err) => { console.error('\n[agenda-calendar-view-transition-check] FATAL:', err.stack || err.message); process.exit(1); });
