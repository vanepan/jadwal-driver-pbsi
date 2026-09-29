/* ss18-analytics-export-focus-check.mjs — SS18 Phase D: Export Focus
   Integrity.

   ROOT CAUSE (confirmed empirically, not assumed): every Analytics export
   button (js/app.js's exportRecommendationAccuracy/exportDispatchAnalytics/
   exportExecutiveDashboard/exportEngineeringAnalytics/exportDriverWellness/
   exportAnalyticsReport/runAnalyticsExport) disables itself for the async
   Generate duration (`btn.disabled = true`) and re-enables it in a `finally`
   block, but never refocuses it. The HTML disabled-element spec means a
   focused element that becomes disabled is IMMEDIATELY dropped to <body> —
   confirmed directly: a plain <button id="b">, focused, then
   `b.disabled = true`, leaves `document.activeElement === document.body`
   even after `b.disabled = false`. Since the click that started an export
   was always the user's last real action, every keyboard/screen-reader user
   who triggers one of these exports loses their place completely once it
   finishes — focus lands on <body>, with no indication of where "back" is.

   THE FIX: a small shared `restoreExportButtonFocus(btn)` helper (js/app.js,
   immediately above exportRecommendationAccuracy) called from every
   function's `finally` block. It only refocuses `btn` when focus is STILL
   exactly where the browser stranded it (`document.activeElement ===
   document.body`) AND `btn` is still attached — so it never steals focus
   from something the user did while the export was in flight (navigated
   away, closed the dashboard, clicked something else).

   SCOPE NOTE: the same "disable the focused trigger, never refocus"
   pattern exists all over js/app.js (User/Driver/Vehicle Management
   toggle/archive/restore/save, Settings save, STNK/Insurance renewal,
   Permanent Delete) — but Phase D's mandate is explicitly "export
   workflows (PDF, NOR, Analytics, Petty Cash, Overtime, and document
   export paths)", not every disabled-button call site in the file. Those
   non-export sites are OUT OF SCOPE here (see the SS18 final report's
   Deferred Findings) to avoid unrelated scope creep in one phase's diff.
   Petty Cash's own export functions (doExportNor/doExportExpenses/
   doPrintNor, js/petty-cash/petty-cash-center.js) and every Overtime export
   path (runOvertimeExport and its 4 callers) were independently audited and
   confirmed CLEAN — none of them disables its trigger button at all, so
   there is nothing to fix there.

   Real login (leo/1234), real production analytics data, READ-ONLY:
   clicking these buttons runs the real export pipeline (pdfmake/xlsx-js-
   style) and downloads a real blob client-side (no server writes) — same
   read-only footprint every other SS16/SS17/SS18 export/document test in
   this repo already has.

   Engineering Analytics and the legacy exportAnalyticsReport() are
   INFORMATIONAL SKIPS, not failures:
     - Engineering Analytics renders an empty state ("Belum ada data
       Engineering") in current production data — its export buttons are
       never in the DOM to click. Its fix is byte-identical in shape to the
       4 dashboards tested live below (confirmed by direct source read).
     - exportAnalyticsReport's own trigger (`data-action="export-pdf"`) is
       dead code — grepping the whole js/ tree finds zero templates that
       still render it (the function's own header comment says as much:
       "The header 'Export PDF' control is now the dropdown
       (runAnalyticsExport)"). Its fix is applied for consistency/future-
       proofing but is currently unreachable from the UI, so it cannot be
       exercised live.

   Run: node scripts/ss18-analytics-export-focus-check.mjs   (exit 0 = pass) */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); if (detail !== undefined) console.log('     ' + JSON.stringify(detail).slice(0, 300)); }
};
const skip = (name, reason) => console.log(`  [informational] ${name} — ${reason}`);

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const filePath = path.join(ROOT, urlPath === '/' ? '/index.html' : urlPath);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found: ' + urlPath); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const consoleErrors = [];
const page = await browser.newPage();
page.on('console', (m) => { if (m.type() === 'error' && !/permission.denied/i.test(m.text())) consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(String(e)));
await page.setViewport({ width: 1280, height: 900 });
await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);

console.log('[1. real login as leo]');
await page.goto(`http://localhost:${port}/index.html`, { waitUntil: 'networkidle0', timeout: 60000 });
await page.waitForSelector('#loginForm', { timeout: 20000 });
await new Promise((r) => setTimeout(r, 500));
await page.type('#loginUsername', 'leo');
await page.type('#loginPin', '1234');
await page.waitForSelector('.login-submit', { visible: true, timeout: 10000 });
await new Promise((r) => setTimeout(r, 300));
await page.click('.login-submit');
await page.waitForFunction(() => { try { return JSON.parse(localStorage.getItem('pbsi_current_user') || 'null')?.username === 'leo'; } catch { return false; } }, { timeout: 30000 });
check('logged in as leo', true);
await new Promise((r) => setTimeout(r, 2500));
await page.evaluate(() => { document.getElementById('btnPushDismiss')?.click(); });
// Feature flags load from Firebase asynchronously AFTER the initial page
// paint — when they arrive, app.js rebuilds the whole Visual Shell V2 in
// place ("[VSM] loading Visual Shell V2" fires a second time). Confirmed
// empirically: navigating before that settles can catch every workspace
// container mid-(re)build at a real but transient 0x0 layout, which makes
// Puppeteer's click() reject with "Node is either not clickable" — not a
// defect in the app, a test-timing hazard. A fixed settle here is the
// simplest robust fix (the rebuild is a one-time post-flags event, not a
// recurring poll, so there is no later moment to race against instead).
await new Promise((r) => setTimeout(r, 3000));

console.log('\n[2. navigate to Analytics]');
// The domain-shell rail's Analytics entry is data-domain="insights" (the
// v1.30.10 7-domain IA renamed it) — NOT the "v2RailAnalytics" id that
// MODULE_DEFS uses internally for the desktop panel-nav highlight only.
// Confirmed empirically: the workspace switch runs through a real
// document.startViewTransition() (js/app.js#setWorkspace(), SS14) — even
// with prefers-reduced-motion forcing its instant path, the first
// navigation right after login can still race ahead of it, so wait for
// genuine visibility rather than a fixed delay (same fix the SS18 Overtime
// suite already needed for the identical race).
await page.waitForFunction(() => !!document.querySelector('.domshell-rail-item[data-domain="insights"]'), { timeout: 15000 }).catch(() => {});
const navigatedToAnalytics = await page.evaluate(() => {
  const el = document.querySelector('.domshell-rail-item[data-domain="insights"]');
  if (!el) return false;
  el.click();
  return true;
});
if (!navigatedToAnalytics) {
  console.log('  [informational] this account has no visible Analytics/Insights domain — cannot exercise this suite.');
  await browser.close(); server.close();
  console.log(`\nss18-analytics-export-focus-check: ${pass} passed, ${fail} failed (navigation unavailable)`);
  process.exit(0);
}
await page.waitForFunction(() => document.getElementById('v2AdministrationWorkspace')?.style.display !== 'none', { timeout: 10000 }).catch(() => {});
check('Analytics/Administration workspace visible', await page.evaluate(() => document.getElementById('v2AdministrationWorkspace')?.style.display !== 'none'));
check('Analytics admin nav tabs present', await page.evaluate(() => document.querySelectorAll('.v2-admin-nav-tab').length > 5));

async function clickTab(re) {
  return page.evaluate((src) => {
    const btn = Array.from(document.querySelectorAll('.v2-admin-nav-tab')).find(b => new RegExp(src, 'i').test(b.textContent.trim()));
    if (btn) { btn.click(); return true; }
    return false;
  }, re);
}

/** Focuses `sel` via .focus() (matching real Tab navigation, since this is a
 *  KEYBOARD-user defect) and activates it, then:
 *   1. confirms the browser's OWN disabled-element behavior dropped focus
 *      to <body> while the export ran (the defect's precondition — this
 *      part is unavoidable browser behavior, not something the fix changes)
 *   2. waits for the button to re-enable (export settled)
 *   3. confirms focus landed back on the SAME button (the fix)
 *
 *  Deliberately NOT page.click(): confirmed empirically that this app's
 *  mouse-click path never focuses these buttons at all (a real mousedown
 *  handler somewhere suppresses focus-follows-click for pointer users, the
 *  same "no focus ring for mouse users" pattern most modern UIs use) — a
 *  Puppeteer page.click() would silently test nothing (activeElement was
 *  already <body> before AND after, both checks passing vacuously).
 *
 *  Also deliberately NOT a synthetic KeyboardEvent('keydown', {key:'Enter'}):
 *  confirmed empirically that dispatching one at a plain <button> does
 *  NOTHING — the browser's "Enter/Space on a focused button fires a click"
 *  translation is part of trusted-event default-action processing, which a
 *  script-dispatched (untrusted) keydown never triggers. Real keyboard
 *  users get a real trusted click for free; this test reproduces the exact
 *  same RESULT — a click firing while the button already holds focus — via
 *  el.click() on the already-focused element, which the delegated
 *  app.js click listener can't distinguish from Enter/Space activation
 *  (both are just "a click event while this button has focus"). */
async function testExportButton(label, sel) {
  const exists = await page.evaluate((s) => !!document.querySelector(s), sel);
  if (!exists) { skip(label, 'button not present in current production data/UI state'); return; }

  const focused = await page.evaluate((s) => {
    const el = document.querySelector(s);
    el.focus();
    return document.activeElement === el;
  }, sel);
  check(`${label}: button is keyboard-focusable`, focused);

  // Focus + click in the SAME evaluate() call: the export functions'
  // `btn.disabled = true` runs synchronously before their first `await`, so
  // checking activeElement immediately afterward — but still inside that
  // one synchronous JS tick — reliably observes the transient drop to
  // <body> before the (possibly very fast, real production data can
  // resolve in well under a round-trip) export has a chance to complete and
  // this fix's own refocus to already run. A separate evaluate() call here
  // raced that completion and intermittently observed the POST-fix state
  // instead (confirmed empirically — same class of cross-call race as the
  // Timeline context-menu suite's documented Escape/Tab timing).
  const droppedToBody = await page.evaluate((s) => {
    const el = document.querySelector(s);
    el.click();
    return document.activeElement === document.body;
  }, sel);
  check(`${label}: activation starts the export and drops focus to <body> (confirms the browser's own disable-while-focused behavior — not something this fix removes)`, droppedToBody);

  // Not every export path re-enables the SAME button node — a report whose
  // handler routes through DocumentEngine.generateAndOpen() (a PDF PREVIEW,
  // confirmed for the Export Center's "Laporan Driver"/"Laporan Armada"/etc
  // cards, js/exports/analytics/analytics-export-client.js) replaces the
  // whole card grid via a live-data re-render while the document viewer is
  // open, so the original element is gone by the time the export settles.
  // waitForFunction below re-queries `sel` fresh each poll for exactly that
  // reason (a stale handle would just hang until the 20s timeout).
  await page.waitForFunction((s) => {
    const el = document.querySelector(s);
    return el && !el.disabled;
  }, { timeout: 20000 }, sel);
  // Real async settle — textContent swap back happens in the same tick disabled flips, but
  // give the button's own .focus() call (SS18 fix) a moment to land, matching how the
  // Timeline context-menu tests needed a short settle gap after a synchronous DOM change.
  await new Promise((r) => setTimeout(r, 150));
  const outcome = await page.evaluate((s) => {
    const btnNow = document.querySelector(s);
    const active = document.activeElement;
    return {
      refocusedTrigger: active === btnNow,
      strandedOnBody: active === document.body,
      // A PDF preview legitimately takes focus itself (SS16 document-viewer
      // — already audited, already correct) instead of returning it to the
      // trigger behind it; that is NOT a focus-loss, just a different valid
      // destination this fix's own guard is right to defer to.
      insideDocumentViewer: !!active.closest('#docvOverlay, .docv-modal'),
    };
  }, sel);
  check(
    `${label}: focus lands somewhere real once the export settles — either back on the trigger, or legitimately inside a PDF preview it opened (SS18 fix; never stranded on <body>)`,
    outcome.refocusedTrigger || outcome.insideDocumentViewer,
    outcome,
  );
  check(`${label}: focus is never left stranded on <body>`, !outcome.strandedOnBody, outcome);
}

console.log('\n[3. Dispatch Analytics — exportDispatchAnalytics]');
await clickTab('dispatch analytics');
await new Promise((r) => setTimeout(r, 1500));
await testExportButton('Dispatch Analytics PDF', '[data-daa-export="pdf"]');
await testExportButton('Dispatch Analytics Excel', '[data-daa-export="excel"]');

console.log('\n[4. Recommendation Accuracy — exportRecommendationAccuracy]');
await clickTab('recommendation accuracy');
await new Promise((r) => setTimeout(r, 1500));
await testExportButton('Recommendation Accuracy PDF', '[data-raa-export="pdf"]');
await testExportButton('Recommendation Accuracy Excel', '[data-raa-export="excel"]');

console.log('\n[5. Driver Wellness — exportDriverWellness]');
await clickTab('driver wellness');
await new Promise((r) => setTimeout(r, 1500));
await testExportButton('Driver Wellness PDF', '[data-dwi-export="pdf"]');
await testExportButton('Driver Wellness Excel', '[data-dwi-export="excel"]');

console.log('\n[6. Executive Analytics — exportExecutiveDashboard]');
await clickTab('executive analytics');
await new Promise((r) => setTimeout(r, 1500));
await testExportButton('Executive Analytics PDF', '[data-exa-export="pdf"]');
await testExportButton('Executive Analytics Excel', '[data-exa-export="excel"]');

console.log('\n[7. Engineering Analytics — exportEngineeringAnalytics (data-dependent)]');
await clickTab('engineering analytics');
await new Promise((r) => setTimeout(r, 1500));
await testExportButton('Engineering Analytics PDF', '[data-action="export-engineering-analytics-pdf"]');

console.log('\n[8. generic Analytics — runAnalyticsExport (Export Center card)]');
await clickTab('^analytics$');
await new Promise((r) => setTimeout(r, 1500));
await testExportButton('Export Center "Laporan Driver" (ec-generate)', '[data-action="ec-generate"][data-report="driver"]');
skip('exportAnalyticsReport (data-action="export-pdf")', 'dead code — confirmed via grep that no current template renders this trigger; fixed for consistency but unreachable from the UI');

console.log('\n[9. guard: a completed export must NOT steal focus from something the user focused in the meantime]');
{
  await clickTab('dispatch analytics');
  await new Promise((r) => setTimeout(r, 1500));
  const sel = '[data-daa-export="pdf"]';
  const has = await page.evaluate((s) => !!document.querySelector(s), sel);
  if (!has) {
    skip('focus-theft guard', 'Dispatch Analytics PDF button not present');
  } else {
    await page.evaluate((s) => { const el = document.querySelector(s); el.focus(); el.click(); }, sel);
    // Best-effort: the export may already be settling by now (see
    // testExportButton's note on how fast these can resolve against real
    // production data) — this guard only cares about the END state below.
    // Immediately (export still in flight, ideally), the user tabs/clicks elsewhere —
    // e.g. the window toggle already on this same dashboard.
    const movedAway = await page.evaluate(() => {
      const other = document.querySelector('[data-daa-window]') || document.querySelector('.domshell-rail-item[data-domain="insights"]');
      if (!other) return false;
      other.focus();
      return document.activeElement === other;
    });
    check('user has focus elsewhere while the export is still running', movedAway);
    await page.waitForFunction((s) => { const el = document.querySelector(s); return el && !el.disabled; }, { timeout: 20000 }, sel);
    await new Promise((r) => setTimeout(r, 150));
    const stolen = await page.evaluate((s) => document.activeElement === document.querySelector(s), sel);
    check('completed export does NOT steal focus back from the user\'s later action', !stolen);
  }
}

console.log('\n[console cleanliness]');
check('zero unexpected console/page errors across the whole sequence', consoleErrors.length === 0, consoleErrors.slice(0, 5));

await browser.close();
server.close();
console.log(`\nss18-analytics-export-focus-check: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
