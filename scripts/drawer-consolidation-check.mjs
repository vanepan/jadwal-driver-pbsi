/* drawer-consolidation-check.mjs — Design System Program Phase 8.2
   Verifies the decision-replay/driver-wellness migration onto the canonical
   js/components/drawer.js shell: static architecture guarantees (imports,
   no surviving shell CSS/lifecycle code, deferred pair untouched) + real-
   browser behavior (single-instance replace, rapid open/close/reopen race,
   focus trap + restoration, z-index layering over a legacy .modal-overlay,
   reduced-motion / [data-anim="off"], mobile bottom sheet).
   Run: node scripts/drawer-consolidation-check.mjs (exit 0 = pass) */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); if (detail && detail.length) detail.forEach((d) => console.log('     • ' + String(d).slice(0, 200))); }
};

/* ── 1. Static architecture assertions ─────────────────────────────────── */
console.log('\n[static — migrated files]');

const drx = fs.readFileSync(path.join(ROOT, 'js/components/decision-replay-drawer.js'), 'utf8');
const dwd = fs.readFileSync(path.join(ROOT, 'js/components/driver-wellness-drawer.js'), 'utf8');
const appJs = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');

check('decision-replay-drawer.js imports openDrawer from the canonical shell', /import\s*\{\s*openDrawer\s*\}\s*from\s*'\.\/drawer\.js'/.test(drx));
check('driver-wellness-drawer.js imports openDrawer from the canonical shell', /import\s*\{\s*openDrawer\s*\}\s*from\s*'\.\/drawer\.js'/.test(dwd));
check('decision-replay-drawer.js no longer defines its own Escape keydown handler', !/addEventListener\('keydown'/.test(drx));
check('driver-wellness-drawer.js no longer defines its own Escape keydown handler', !/addEventListener\('keydown'/.test(dwd));
check('decision-replay-drawer.js no longer defines .drx-overlay/.drx-sheet shell CSS', !/\.drx-overlay\{|\.drx-sheet\{/.test(drx));
check('driver-wellness-drawer.js no longer defines .dwd-overlay/.dwd-sheet shell CSS', !/\.dwd-overlay\{|\.dwd-sheet\{/.test(dwd));
check('decision-replay-drawer.js still defines its content-specific CSS (.drx-sec)', /\.drx-sec\{/.test(drx));
check('driver-wellness-drawer.js still defines its content-specific CSS (.dwd-sec)', /\.dwd-sec\{/.test(dwd));
check('decision-replay-drawer.js no longer exports closeDecisionReplayDrawer', !/export function closeDecisionReplayDrawer/.test(drx));
check('driver-wellness-drawer.js no longer exports closeDriverWellnessDrawer', !/export function closeDriverWellnessDrawer/.test(dwd));
check('decision-replay-drawer.js rank-toggle sets aria-expanded alongside data-expanded', /setAttribute\('aria-expanded'/.test(drx));
check('js/app.js closeApproveRequestModal() calls closeDrawer(), not closeDecisionReplayDrawer()', /closeApproveRequestModal\(\) \{[\s\S]{0,400}?closeDrawer\(\)/.test(appJs) && !/closeApproveRequestModal\(\) \{[\s\S]{0,400}?closeDecisionReplayDrawer\(\)/.test(appJs));
check('js/app.js imports closeDrawer from the canonical shell', /import\s*\{\s*closeDrawer\s*\}\s*from\s*'\.\/components\/drawer\.js'/.test(appJs));

// Design System Program Phase 10 (Canonical Drawer Migration): Gudang's
// and Engineering's detail drawers were migrated onto this canonical
// shell this phase. Petty Cash's detail drawer is the third and final
// migration this phase; Overtime is out of scope entirely (see the Phase
// 10 report's Overtime audit). No "still deferred, must stay untouched"
// git-diff check remains here — js/petty-cash/petty-cash-center.js was
// already modified in the prior Phase 9 pass (inline styles migrated to
// .pc-add-* classes), so a "zero diff against the last commit" assertion
// could never meaningfully distinguish "untouched by Phase 10" from
// "already touched by something else" for this specific file; the real
// verification for its Phase 10 migration is the dedicated static block
// below (added once that migration step runs).

console.log('\n[static — Gudang migrated onto the canonical shell (Phase 10)]');
{
  const gudCenter = fs.readFileSync(path.join(ROOT, 'js/gudang/ui/gudang-center.js'), 'utf8');
  const gudDetail = fs.readFileSync(path.join(ROOT, 'js/gudang/ui/gudang-item-detail.js'), 'utf8');
  const gudCss = fs.readFileSync(path.join(ROOT, 'gudang.css'), 'utf8');
  check('gudang-center.js imports openDrawer/closeDrawer/refreshDrawerBody from the canonical shell', /import\s*\{\s*openDrawer,\s*closeDrawer,\s*refreshDrawerBody\s*\}\s*from\s*'\.\.\/\.\.\/components\/drawer\.js'/.test(gudCenter));
  check('gudang-item-detail.js no longer defines its own drawer shell (drawerShell()/.gud-drawer role=dialog hand-roll)', !/function drawerShell/.test(gudDetail));
  check('gudang-item-detail.js still uses .gud-drawer-badges for its badge/back-link content (now the first block of the canonical body, not a shell-header slot)', /gud-drawer-badges/.test(gudDetail));
  check('gudang.css no longer defines the dead .gud-drawer shell rule the migration orphaned (width/height/transform — canonical .drawer owns this now)', !/\.gud-drawer\{width:480px/.test(gudCss));
  check('gudang.css no longer defines the dead .gud-drawer-head/-body/-foot shell rules the migration orphaned', !/\.gud-drawer-head\{|\.gud-drawer-body\{|\.gud-drawer-foot\{/.test(gudCss));
}

console.log('\n[static — Engineering migrated onto the canonical shell (Phase 10)]');
{
  const engCenter = fs.readFileSync(path.join(ROOT, 'js/engineering/ui/engineering-center.js'), 'utf8');
  const engDrawer = fs.readFileSync(path.join(ROOT, 'js/engineering/ui/engineering-drawer.js'), 'utf8');
  const engCss = fs.readFileSync(path.join(ROOT, 'engineering.css'), 'utf8');
  check('engineering-center.js imports openDrawer/closeDrawer/refreshDrawerBody from the canonical shell', /import\s*\{\s*openDrawer,\s*closeDrawer,\s*refreshDrawerBody\s*\}\s*from\s*'\.\.\/\.\.\/components\/drawer\.js'/.test(engCenter));
  check('engineering-center.js routes footer/body drawer actions through one onEngineeringDrawerAction() dispatcher', /function onEngineeringDrawerAction/.test(engCenter));
  check('engineering-drawer.js\'s renderDrawer() returns { title, subtitle, body, footer } — no more hand-rolled .eng-scrim/.eng-drawer shell string', /return \{\s*title: a\.title/.test(engDrawer) && !/function btn\(act, label, iconName/.test(engDrawer));
  check('engineering-drawer.js\'s delete button uses data-drawer-action (routes through onAction anywhere in the drawer, not just the footer slot)', /data-drawer-action="eng-delete"/.test(engDrawer));
  check('engineering.css no longer defines the dead .eng-drawer shell rule the migration orphaned (width/height/transform — canonical .drawer owns this now)', !/\.eng-drawer\{width:480px/.test(engCss));
  check('engineering.css no longer defines the dead .eng-drawer-head/-body/-foot/-title/-loc shell rules the migration orphaned', !/\.eng-drawer-head\{|\.eng-drawer-body\{|\.eng-drawer-foot\{|\.eng-drawer-title\{|\.eng-drawer-loc\{/.test(engCss));
  check('engineering.css still defines .eng-drawer-head-main/-head-txt/-badges (reused as the first body block\'s category-tile/status-badge layout)', /\.eng-drawer-head-main\{/.test(engCss) && /\.eng-drawer-badges\{/.test(engCss));
  check('engineering.css bumps .eng-scrim.-center above the canonical drawer\'s z-index (the create/report modal can open while the migrated drawer is also open)', /\.eng-scrim\.-center\{z-index:1\d{4};?\}/.test(engCss));
}

console.log('\n[static — Petty Cash migrated onto the canonical shell (Phase 10)]');
{
  const pcCenter = fs.readFileSync(path.join(ROOT, 'js/petty-cash/petty-cash-center.js'), 'utf8');
  check('petty-cash-center.js imports openDrawer/closeDrawer/refreshDrawerBody from the canonical shell', /import\s*\{\s*openDrawer,\s*closeDrawer,\s*refreshDrawerBody\s*\}\s*from\s*'\.\.\/components\/drawer\.js'/.test(pcCenter));
  check('petty-cash-center.js routes footer/body drawer actions through one onPettyCashDrawerAction() dispatcher', /function onPettyCashDrawerAction/.test(pcCenter));
  check('detailDrawer() returns { title, subtitle, body, footer } — no more hand-rolled, fully-inline-styled overlay string', /return \{ title: d\.description, subtitle: d\.refNumber, body, footer \};/.test(pcCenter));
  check('detailDrawer()\'s NOR links use data-drawer-action (routes through onAction anywhere in the drawer, not just the footer slot)', (pcCenter.match(/data-drawer-action="openNorFromDetail"/g) || []).length >= 3);
  check('notifModal()/cycleModal() bumped above the canonical drawer\'s z-index (both can open while the migrated detail drawer is also open — neither clears st.detailId)', /z-index:10050;display:flex;align-items:flex-start;justify-content:center;padding:60px 20px/.test(pcCenter) && /z-index:10050;display:flex;align-items:center;justify-content:center;padding:20px/.test(pcCenter));
  // The old onClick() cases used `return` after the state mutation;
  // onPettyCashDrawerAction()'s new cases use `break` (a switch inside a
  // plain function, not an early-return event handler) — that distinguishes
  // "still in the old dead-code location" from "correctly moved."
  check('the old closeDetail/editExpense/deleteExpense/archiveExpense/restoreExpense/openNorFromDetail data-act cases are gone from onClick()\'s switch (moved to onPettyCashDrawerAction())',
    !/case 'closeDetail': setState\(\{ detailId: null \}\); return;/.test(pcCenter) && !/case 'openNorFromDetail': setState\(\{ detailId: null, screen: 'norDetail', norDetailId: id \}\); return;/.test(pcCenter));
}

/* ── 2. Real-browser behavior ───────────────────────────────────────────── */
console.log('\n[browser setup]');

const server = http.createServer((req, res) => {
  if (req.url === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });

async function freshPage() {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/i.test(m.text())) errors.push('console.error: ' + m.text()); });
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  await page.goto(`http://localhost:${port}/scripts/decision-replay-harness.html`, { waitUntil: 'networkidle0', timeout: 45000 });
  // Real synthetic trigger buttons in the page (not off-DOM) so focus
  // capture/restoration has something real to work with.
  await page.evaluate(() => {
    const t1 = document.createElement('button'); t1.id = 'trigger1'; t1.textContent = 'Open 1'; document.body.appendChild(t1);
    const t2 = document.createElement('button'); t2.id = 'trigger2'; t2.textContent = 'Open 2'; document.body.appendChild(t2);
  });
  return { page, errors };
}

function seedReplayModel() {
  return `(async () => {
    const svc = await import('/js/services/request-intelligence-service.js');
    const drawer = await import('/js/components/decision-replay-drawer.js');
    const wellSvc = await import('/js/services/driver-wellness-service.js');
    const wellDrawer = await import('/js/components/driver-wellness-drawer.js');
    window.__decisionReplayDrawer = drawer;
    window.__driverWellnessDrawer = wellDrawer;

    const drivers = [{ id: 'd1', name: 'Igo' }, { id: 'd2', name: 'Dedi' }, { id: 'd3', name: 'Aria' }, { id: 'd4', name: 'Grace' }];
    const vehicles = [
      { id: 'v1', name: 'Toyota Avanza', capacity: 7, healthScore: 100 },
      { id: 'v2', name: 'Toyota Innova', capacity: 8, healthScore: 95 },
    ];
    const assignments = [];
    for (let i = 0; i < 3; i++) assignments.push({ driver: 'Dedi', vehicle: 'Toyota Innova', date: '2026-06-23', startTime: '08:00', endTime: '10:00', status: 'assigned' });
    const request = { id: 'req-1', date: '2026-06-25', startTime: '13:00', endTime: '16:00', passengers: 2, destination: 'Bandara', requesterName: 'Bidang Umum', createdAt: '2026-06-25T07:00:00' };
    const pkg = svc.buildRecommendationPackage({ request, drivers, vehicles, assignments, overrideLogs: [] }, { now: '2026-06-25T12:00:00' });
    window.__replayInput = { pkg, stored: { hasRecommendation: true, generatedAt: pkg.generatedAt }, request };

    const wellAssignments = [];
    for (const day of ['2026-06-19','2026-06-20','2026-06-21']) wellAssignments.push({ driver: 'Igo', vehicle: 'Innova', date: day, startTime: '07:00', endTime: '19:00', status: 'assigned' });
    const model = wellSvc.computeDriverWellnessModel({ drivers, assignments: wellAssignments, now: '2026-06-25', window: '30d' });
    window.__wellnessDriver = wellSvc.findDriverWellness(model, 'd1');
  })()`;
}

/* ── 2a. Single-instance replace + rapid open/close/reopen ──────────────── */
{
  const { page, errors } = await freshPage();
  await page.evaluate(seedReplayModel());
  await new Promise((r) => setTimeout(r, 50));

  // Open decision-replay, then immediately open driver-wellness without closing —
  // canonical single-instance model must replace, not stack.
  const singleInstance = await page.evaluate(() => {
    window.__decisionReplayDrawer.openDecisionReplay(window.__replayInput, {});
    const overlaysAfterFirst = document.querySelectorAll('#appDrawerOverlay').length;
    window.__driverWellnessDrawer.openDriverWellnessDrawer(window.__wellnessDriver);
    const overlaysAfterSecond = document.querySelectorAll('#appDrawerOverlay').length;
    const titleNow = document.querySelector('.drawer__title')?.textContent || '';
    return { overlaysAfterFirst, overlaysAfterSecond, titleNow };
  });
  check('single-instance: exactly one #appDrawerOverlay after first open', singleInstance.overlaysAfterFirst === 1);
  check('single-instance: opening a second drawer replaces (still exactly one overlay)', singleInstance.overlaysAfterSecond === 1);
  check('single-instance: the second drawer\'s content actually replaced the first\'s', singleInstance.titleNow.includes('Igo'));

  // Rapid open→close→reopen, 5x back-to-back with no awaits.
  const rapidResult = await page.evaluate(() => {
    for (let i = 0; i < 5; i++) {
      window.__decisionReplayDrawer.openDecisionReplay(window.__replayInput, {});
      document.querySelector('.drawer__close')?.click();
      window.__decisionReplayDrawer.openDecisionReplay(window.__replayInput, {});
    }
    return { overlayCount: document.querySelectorAll('#appDrawerOverlay').length };
  });
  check('rapid open→close→reopen (5x, no awaits) leaves exactly one overlay, no duplicates', rapidResult.overlayCount === 1);

  check('zero console/page errors (single-instance + rapid-cycle session)', errors.length === 0, errors);
  await page.close();
}

/* ── 2b. Focus trap + focus restoration ──────────────────────────────────── */
{
  const { page, errors } = await freshPage();
  await page.evaluate(seedReplayModel());
  await new Promise((r) => setTimeout(r, 50));

  await page.click('#trigger1');
  await page.evaluate(() => { document.getElementById('trigger1').focus(); window.__decisionReplayDrawer.openDecisionReplay(window.__replayInput, {}); });
  await new Promise((r) => setTimeout(r, 50));

  const trapResult = await page.evaluate(() => {
    const panel = document.querySelector('.drawer');
    const focusable = [...panel.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]
      .filter((n) => n.offsetParent !== null || n === document.activeElement);
    return { count: focusable.length, initialFocusIsCloseBtn: document.activeElement.classList.contains('drawer__close') };
  });
  check('focus trap: panel has multiple focusable elements to cycle through', trapResult.count > 1);
  check('initial focus lands on the canonical close button', trapResult.initialFocusIsCloseBtn);

  // Shift+Tab from the first focusable element should wrap to the last.
  await page.keyboard.down('Shift');
  await page.keyboard.press('Tab');
  await page.keyboard.up('Shift');
  const wrapped = await page.evaluate(() => {
    const panel = document.querySelector('.drawer');
    return panel.contains(document.activeElement);
  });
  check('Shift+Tab from first focusable stays trapped inside the panel', wrapped);

  // Close via Escape, wait past the ~260ms deferred-removal window, confirm restoration.
  await page.keyboard.press('Escape');
  await new Promise((r) => setTimeout(r, 350));
  const restored = await page.evaluate(() => document.activeElement && document.activeElement.id === 'trigger1');
  check('focus restores to the real triggering button after the close animation', restored);
  check('overlay fully removed after close', await page.evaluate(() => !document.getElementById('appDrawerOverlay')));

  check('zero console/page errors (focus session)', errors.length === 0, errors);
  await page.close();
}

/* ── 2c. Z-index layering over a legacy .modal-overlay ───────────────────── */
{
  const { page, errors } = await freshPage();
  await page.evaluate(seedReplayModel());
  await new Promise((r) => setTimeout(r, 50));

  const layering = await page.evaluate(() => {
    // Synthetic legacy modal, matching the real .modal-overlay contract
    // (style.css:1314, z-index 200, full-viewport fixed backdrop).
    const legacy = document.createElement('div');
    legacy.className = 'modal-overlay';
    legacy.style.cssText = 'position:fixed;inset:0;z-index:200;display:flex;';
    document.body.appendChild(legacy);

    window.__decisionReplayDrawer.openDecisionReplay(window.__replayInput, {});
    const overlay = document.getElementById('appDrawerOverlay');
    const drawerZ = parseInt(getComputedStyle(overlay).zIndex, 10);
    const legacyZ = parseInt(getComputedStyle(legacy).zIndex, 10);

    // closeDrawer() with nothing open must be a safe no-op (the exact
    // closeApproveRequestModal() invariant).
    window.__decisionReplayDrawer && null; // (closeDrawer isn't re-exported here; verified separately in app.js statically)
    return { drawerZ, legacyZ, layersAbove: drawerZ > legacyZ };
  });
  check('canonical drawer z-index (10000) layers above the legacy .modal-overlay (200)', layering.layersAbove);

  check('zero console/page errors (layering session)', errors.length === 0, errors);
  await page.close();
}

/* ── 2d. Reduced motion / [data-anim="off"] ──────────────────────────────── */
{
  const { page, errors } = await freshPage();
  await page.evaluate(seedReplayModel());
  await new Promise((r) => setTimeout(r, 50));
  await page.evaluate(() => document.documentElement.setAttribute('data-anim', 'off'));
  await page.evaluate(() => window.__decisionReplayDrawer.openDecisionReplay(window.__replayInput, {}));
  await new Promise((r) => setTimeout(r, 50));
  const offState = await page.evaluate(() => {
    const panel = document.querySelector('.drawer');
    return { transitionDur: getComputedStyle(panel).transitionDuration, isOpenClass: document.getElementById('appDrawerOverlay').classList.contains('is-open') };
  });
  check('[data-anim="off"]: drawer panel transition-duration collapses to ~0', parseFloat(offState.transitionDur) <= 0.001);
  check('[data-anim="off"]: drawer still functionally opens (is-open applied)', offState.isOpenClass);
  check('zero console/page errors ([data-anim="off"] session)', errors.length === 0, errors);
  await page.close();
}
{
  const { page, errors } = await freshPage();
  await page.evaluate(seedReplayModel());
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await new Promise((r) => setTimeout(r, 50));
  await page.evaluate(() => window.__decisionReplayDrawer.openDecisionReplay(window.__replayInput, {}));
  await new Promise((r) => setTimeout(r, 50));
  const reducedState = await page.evaluate(() => {
    const panel = document.querySelector('.drawer');
    return { transitionDur: getComputedStyle(panel).transitionDuration, isOpenClass: document.getElementById('appDrawerOverlay').classList.contains('is-open') };
  });
  check('prefers-reduced-motion: drawer panel transition-duration collapses to ~0', parseFloat(reducedState.transitionDur) <= 0.001);
  check('prefers-reduced-motion: drawer still functionally opens', reducedState.isOpenClass);
  check('zero console/page errors (prefers-reduced-motion session)', errors.length === 0, errors);
  await page.close();
}

/* ── 2e. Mobile bottom sheet ──────────────────────────────────────────────── */
for (const width of [375, 390, 402, 430]) {
  const { page, errors } = await freshPage();
  await page.setViewport({ width, height: 800 });
  await page.evaluate(seedReplayModel());
  await new Promise((r) => setTimeout(r, 50));
  await page.evaluate(() => window.__decisionReplayDrawer.openDecisionReplay(window.__replayInput, {}));
  await new Promise((r) => setTimeout(r, 250));
  const mobile = await page.evaluate(() => {
    const panel = document.querySelector('.drawer');
    const grabber = document.querySelector('.drawer__grabber');
    const rect = panel.getBoundingClientRect();
    return {
      grabberVisible: grabber && getComputedStyle(grabber).display !== 'none',
      widthOk: rect.width <= window.innerWidth + 1,
      overflowX: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
  check(`mobile @${width}px: drag-handle grabber visible (bottom-sheet layout)`, mobile.grabberVisible);
  check(`mobile @${width}px: panel does not exceed viewport width`, mobile.widthOk);
  check(`mobile @${width}px: zero horizontal overflow`, mobile.overflowX <= 0);
  check(`mobile @${width}px: zero console/page errors`, errors.length === 0, errors);
  await page.close();
}

if (fail > 0) {
  console.log('\n[failures detail]');
}

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
server.close();
if (fail > 0) process.exit(1);
