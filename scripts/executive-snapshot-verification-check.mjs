/* executive-snapshot-verification-check.mjs — Phase 4 (Operational Snapshot)
   mandatory browser verification. Serves the static app, loads the REAL
   Workspace layer (home-router.js -> exec-snapshot, the Snapshot section
   redesigned per the approved Design Review) in headless Chromium — no
   app.js boot, no mocked internals — across:

     • 3 approved reference viewports (Desktop 1440x900, Tablet 1194x834,
       Mobile 402x874) x 2 themes = 6 structural combos.
     • Segmented control (Hari/Minggu/Bulan) — default state, click-to-switch,
       keyboard (Left/Right/Home/End) navigation, ARIA tablist wiring.
     • Correctness — each period's 5 summary values are independently
       recomputed from fixture data with distinct numbers per period, so a
       silent "always shows Today's numbers" regression cannot pass.
     • No fabricated trend — no delta/trend element is ever emitted (none of
       these metrics have a certified comparison yet).
     • Continuity across a realtime refresh — the selected period survives
       re-rendering the section with fresh ctx (no reset to "Hari").
     • Reduced motion (prefers-reduced-motion + data-anim="off") on the
       panel crossfade transition.
     • Regression guard — Insight and Pending Approval are still present and
       unaffected; Hero/Attention/Decision/Recommendation sections untouched.

   Run: node scripts/executive-snapshot-verification-check.mjs (exit 0 = pass) */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(ROOT, 'scratch');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const consoleErrors = [];
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  if (/Failed to load resource/i.test(m.text())) return;
  consoleErrors.push('console.error: ' + m.text());
});

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };
if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  tablet:  { width: 1194, height: 834 },
  mobile:  { width: 402,  height: 874, isMobile: true },
};

// ── Fixture builder — runs INSIDE the page (page.evaluate) so date math uses
//    the same Date/timezone as the widget under test. Three periods produce
//    three DISTINCT sets of numbers so "the panel just shows Today always"
//    cannot silently pass.
//
//    Assignments: today(completed,B1001) + today(scheduled,B1002) +
//    3d-ago(completed,B1001) + 10d-ago(completed,B1003) + 25d-ago(scheduled,B1004)
//      Hari:   trip=2 completed=1 vehicles=2 (B1001,B1002)
//      Minggu: trip=3 completed=2 vehicles=2 (B1001,B1002)
//      Bulan:  trip=5 completed=3 vehicles=4 (B1001..B1004)
//    Engineering "finished" events: today, 5d-ago, 20d-ago
//      Hari:1  Minggu:2  Bulan:3
//    Requests: today-approved, today-pending(excluded, wrong status),
//    4d-ago-rejected, 15d-ago-approved, 40d-ago-approved(out of range)
//      Hari:1(today-approved)  Minggu:2(+4d-rejected)  Bulan:3(+15d-approved)
//      pendingApprovals (Pending Approval tile) = 1 (today-pending)
const BUILD_CTX_FN = `(function buildCtx() {
  const DAY = 86400000;
  const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const dateNDaysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return ymd(d); };
  const isoNDaysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString(); };
  const assignments = [
    { id: 'a1', date: dateNDaysAgo(0), status: 'completed', vehicle: 'B1001' },
    { id: 'a2', date: dateNDaysAgo(0), status: 'scheduled', vehicle: 'B1002' },
    { id: 'a3', date: dateNDaysAgo(3), status: 'completed', vehicle: 'B1001' },
    { id: 'a4', date: dateNDaysAgo(10), status: 'completed', vehicle: 'B1003' },
    { id: 'a5', date: dateNDaysAgo(25), status: 'scheduled', vehicle: 'B1004' },
  ];
  const engineeringEvents = [
    { type: 'finished', timestamp: isoNDaysAgo(0), assignmentId: 'e1', assignmentTitle: 'Servis A' },
    { type: 'finished', timestamp: isoNDaysAgo(5), assignmentId: 'e2', assignmentTitle: 'Servis B' },
    { type: 'finished', timestamp: isoNDaysAgo(20), assignmentId: 'e3', assignmentTitle: 'Servis C' },
  ];
  const requests = [
    { id: 'r1', createdAt: isoNDaysAgo(0), status: 'approved', purpose: 'Transport A' },
    { id: 'r2', createdAt: isoNDaysAgo(0), status: 'pending', purpose: 'Transport B' },
    { id: 'r3', createdAt: isoNDaysAgo(4), status: 'rejected', purpose: 'Transport C' },
    { id: 'r4', createdAt: isoNDaysAgo(15), status: 'approved', purpose: 'Transport D' },
    { id: 'r5', createdAt: isoNDaysAgo(40), status: 'approved', purpose: 'Transport E' },
  ];
  return {
    user: { id: 'u1', name: 'Uji Coba', role: 'admin' }, role: 'admin',
    assignments, requests, logs: [], engineeringEvents,
    actions: {},
    models: {
      exec: { driverKpis: { activeVehicles: 5, activeDrivers: 4 }, score: { value: 91, level: 'excellent', label: 'Sangat Baik' }, scoreBreakdown: { components: [] } },
      engineering: { overdueAssignments: { count: 0 } },
      wellness: { summary: { burnoutRisk: 0, highFatigue: 0 } },
      pettyLowBalance: { low: false },
    },
    recommendations: { certified: true, board: { isHealthyFleet: true, critical: [], upcoming: [] }, recs: [] },
  };
})`;

const EXPECTED = {
  hari:   { trip: '2', completed: '1', vehicles: '2', engReports: '1', reqResolved: '1' },
  minggu: { trip: '3', completed: '2', vehicles: '2', engReports: '2', reqResolved: '2' },
  bulan:  { trip: '5', completed: '3', vehicles: '4', engReports: '3', reqResolved: '3' },
};
const TILE_ORDER = ['trip', 'completed', 'vehicles', 'engReports', 'reqResolved'];

async function renderSnapshot(viewportKey, theme) {
  await page.setViewport(VIEWPORTS[viewportKey]);
  await page.goto(`http://localhost:${port}/scripts/workspace-foundation-harness.html`, { waitUntil: 'networkidle0', timeout: 45000 });
  await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
  return page.evaluate(async (buildCtxSrc) => {
    const router = await import('/js/workspace/home-router.js');
    const buildCtx = eval(buildCtxSrc);
    const ctx = buildCtx();
    const host = document.getElementById('host');
    host.className = 'exec-ui v2-analytics-claude';
    await router.renderHome(host, ctx);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    const section = host.querySelector('[data-widget-id="exec-snapshot"]');
    const q = (s) => section && section.querySelector(s);
    const qa = (s) => section ? [...section.querySelectorAll(s)] : [];

    const readPanel = (key) => {
      const panel = q(`[data-snapshot-panel="${key}"]`);
      if (!panel) return null;
      const tiles = [...panel.querySelectorAll('.wsp-summary')];
      return {
        hidden: panel.hidden,
        values: tiles.map((t) => (t.querySelector('.wsp-summary__value') || {}).textContent),
        descs: tiles.map((t) => (t.querySelector('.wsp-summary__desc') || {}).textContent),
        titles: tiles.map((t) => (t.querySelector('.wsp-summary__title') || {}).textContent),
      };
    };

    return {
      hasSection: !!section,
      hasSegmented: !!q('[data-wsp-segmented]'),
      segRole: q('[data-wsp-segmented]') ? q('[data-wsp-segmented]').getAttribute('role') : null,
      segButtons: qa('[data-wsp-seg]').map((b) => ({
        key: b.dataset.wspSeg, label: b.textContent.trim(), active: b.classList.contains('wsp-segmented__btn--active'),
        ariaSelected: b.getAttribute('aria-selected'), tabIndex: b.tabIndex, role: b.getAttribute('role'), type: b.getAttribute('type'),
      })),
      panelHari: readPanel('hari'),
      panelMinggu: readPanel('minggu'),
      panelBulan: readPanel('bulan'),
      hasInsight: !!q('.wsp-insight'),
      insightText: (q('.wsp-insight') || {}).textContent || null,
      pendingValue: (q('[data-wsp-action="navPending"] .wsp-summary__value') || {}).textContent || null,
      pendingStatus: (q('[data-wsp-action="navPending"] .wsp-summary__status') || {}).textContent || null,
      noFabricatedTrend: qa('.wsp-summary__value').every((v) => !/^[+−-]/.test((v.textContent || '').trim())),
      scrollWidthOverflow: document.documentElement.scrollWidth > window.innerWidth + 2,
    };
  }, BUILD_CTX_FN);
}

console.log('\n[1] Structural matrix — 3 viewports x 2 themes');
const THEMES = ['light', 'dark'];
const matrixResults = {};
for (const vp of Object.keys(VIEWPORTS)) {
  for (const theme of THEMES) {
    const key = `${vp}/${theme}`;
    const r = await renderSnapshot(vp, theme);
    matrixResults[key] = r;
    check(`${key}: Snapshot section renders`, r.hasSection);
    check(`${key}: no horizontal overflow`, !r.scrollWidthOverflow);
  }
}

console.log('\n[2] Segmented control — default state (Hari active, ARIA tablist)');
const base = matrixResults['desktop/light'];
check('segmented control renders', base.hasSegmented);
check('segmented control role="tablist"', base.segRole === 'tablist');
check('exactly 3 segments: Hari, Minggu, Bulan (short labels, per spec)', base.segButtons.map((b) => b.label).join(',') === 'Hari,Minggu,Bulan');
check('every segment is role="tab" type="button"', base.segButtons.every((b) => b.role === 'tab' && b.type === 'button'));
check('Hari is active by default', base.segButtons.find((b) => b.key === 'hari').active);
check('Hari aria-selected="true"', base.segButtons.find((b) => b.key === 'hari').ariaSelected === 'true');
check('Minggu/Bulan aria-selected="false"', base.segButtons.filter((b) => b.key !== 'hari').every((b) => b.ariaSelected === 'false'));
check('only the active segment is in tab order (tabIndex 0), others -1', base.segButtons.find((b) => b.key === 'hari').tabIndex === 0 && base.segButtons.filter((b) => b.key !== 'hari').every((b) => b.tabIndex === -1));

console.log('\n[3] Panel visibility — only Hari panel visible by default');
check('Hari panel visible', base.panelHari.hidden === false);
check('Minggu panel hidden', base.panelMinggu.hidden === true);
check('Bulan panel hidden', base.panelBulan.hidden === true);

console.log('\n[4] Correctness — each period shows its OWN distinct numbers (no "always Today" regression)');
for (const key of ['hari', 'minggu', 'bulan']) {
  const panel = base[`panel${key[0].toUpperCase()}${key.slice(1)}`];
  const expectedVals = TILE_ORDER.map((t) => EXPECTED[key][t]);
  check(`${key}: 5 tiles present`, panel.values.length === 5);
  check(`${key}: values match fixture (${expectedVals.join(',')})`, JSON.stringify(panel.values) === JSON.stringify(expectedVals));
  check(`${key}: every tile has a non-empty supporting description`, panel.descs.every((d) => (d || '').trim().length > 0));
}
check('Hari and Minggu and Bulan are genuinely different (not the same numbers repeated)', JSON.stringify(base.panelHari.values) !== JSON.stringify(base.panelMinggu.values) && JSON.stringify(base.panelMinggu.values) !== JSON.stringify(base.panelBulan.values));

console.log('\n[5] No fabricated trend — no +/- delta glyph on any summary value');
check('no summary value starts with a delta sign (none of these metrics have a certified comparison yet)', base.noFabricatedTrend);

console.log('\n[6] Regression guard — Insight and Pending Approval unaffected');
check('Insight sentence still renders', base.hasInsight && !!(base.insightText || '').trim());
check('Pending Approval tile still shows the real pending count (1, from fixture)', base.pendingValue === '1');
check('Pending Approval status pill reflects "Menunggu" when pending > 0', base.pendingStatus === 'Menunggu');

console.log('\n[7] Click-to-switch — clicking "Minggu" activates it and reveals its panel');
await page.setViewport(VIEWPORTS.desktop);
const clickResult = await page.evaluate(async (buildCtxSrc) => {
  const router = await import('/js/workspace/home-router.js');
  const buildCtx = eval(buildCtxSrc);
  const ctx = buildCtx();
  const host = document.getElementById('host');
  await router.renderHome(host, ctx);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const section = host.querySelector('[data-widget-id="exec-snapshot"]');
  const minggu = section.querySelector('[data-wsp-seg="minggu"]');
  minggu.click();
  await new Promise((r) => setTimeout(r, 300));
  return {
    mingguActive: minggu.classList.contains('wsp-segmented__btn--active'),
    mingguAriaSelected: minggu.getAttribute('aria-selected'),
    hariActive: section.querySelector('[data-wsp-seg="hari"]').classList.contains('wsp-segmented__btn--active'),
    panelMingguHidden: section.querySelector('[data-snapshot-panel="minggu"]').hidden,
    panelHariHidden: section.querySelector('[data-snapshot-panel="hari"]').hidden,
  };
}, BUILD_CTX_FN);
check('clicking Minggu marks it active', clickResult.mingguActive);
check('clicking Minggu sets aria-selected="true"', clickResult.mingguAriaSelected === 'true');
check('clicking Minggu deactivates Hari', !clickResult.hariActive);
check('clicking Minggu reveals the Minggu panel', clickResult.panelMingguHidden === false);
check('clicking Minggu hides the Hari panel', clickResult.panelHariHidden === true);

console.log('\n[8] Keyboard navigation — ArrowRight/ArrowLeft/Home/End move focus AND activate');
await page.setViewport(VIEWPORTS.desktop);
await page.evaluate(async (buildCtxSrc) => {
  const router = await import('/js/workspace/home-router.js');
  const buildCtx = eval(buildCtxSrc);
  await router.renderHome(document.getElementById('host'), buildCtx());
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
}, BUILD_CTX_FN);
await page.focus('[data-widget-id="exec-snapshot"] [data-wsp-seg="hari"]');
await page.keyboard.press('ArrowRight');
await new Promise((r) => setTimeout(r, 300));
let kbState = await page.evaluate(() => {
  const section = document.querySelector('[data-widget-id="exec-snapshot"]');
  return { active: document.activeElement.dataset.wspSeg, panelVisible: section.querySelector('[data-snapshot-panel="minggu"]').hidden === false };
});
check('ArrowRight from Hari moves focus to Minggu', kbState.active === 'minggu');
check('ArrowRight from Hari activates the Minggu panel', kbState.panelVisible);

await page.keyboard.press('ArrowRight');
await new Promise((r) => setTimeout(r, 300));
kbState = await page.evaluate(() => document.activeElement.dataset.wspSeg);
check('ArrowRight from Minggu moves focus to Bulan', kbState === 'bulan');

await page.keyboard.press('ArrowRight');
await new Promise((r) => setTimeout(r, 300));
kbState = await page.evaluate(() => document.activeElement.dataset.wspSeg);
check('ArrowRight from Bulan wraps around to Hari', kbState === 'hari');

await page.keyboard.press('Home');
await new Promise((r) => setTimeout(r, 300));
kbState = await page.evaluate(() => document.activeElement.dataset.wspSeg);
check('Home jumps to Hari', kbState === 'hari');

await page.keyboard.press('End');
await new Promise((r) => setTimeout(r, 300));
kbState = await page.evaluate(() => document.activeElement.dataset.wspSeg);
check('End jumps to Bulan', kbState === 'bulan');

await page.keyboard.press('ArrowLeft');
await new Promise((r) => setTimeout(r, 300));
kbState = await page.evaluate(() => document.activeElement.dataset.wspSeg);
check('ArrowLeft from Bulan moves to Minggu', kbState === 'minggu');

console.log('\n[9] Continuity across a realtime refresh — selection survives re-render');
const continuityResult = await page.evaluate(async (buildCtxSrc) => {
  const router = await import('/js/workspace/home-router.js');
  const buildCtx = eval(buildCtxSrc);
  const host = document.getElementById('host');
  await router.renderHome(host, buildCtx());
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const section = host.querySelector('[data-widget-id="exec-snapshot"]');
  section.querySelector('[data-wsp-seg="bulan"]').click();
  await new Promise((r) => setTimeout(r, 300));

  // Simulate a realtime data refresh via the REAL production path
  // (app.js's registerPettyChangeListener/registerEngineeringChangeListener
  // etc. call refreshHome, never renderHome, for a live update — renderHome
  // defaults to skeleton:true and redraws the shell). refreshHome keeps the
  // shell, so mountWidgets only replaces .wsp-block__body's innerHTML — the
  // body node itself, and therefore its dataset, survives, same continuity
  // contract as the Hero's mountHeroMotion.
  await router.refreshHome(host, buildCtx());
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const section2 = host.querySelector('[data-widget-id="exec-snapshot"]');
  return {
    bulanStillActive: section2.querySelector('[data-wsp-seg="bulan"]').classList.contains('wsp-segmented__btn--active'),
    bulanPanelVisible: section2.querySelector('[data-snapshot-panel="bulan"]').hidden === false,
    hariPanelHidden: section2.querySelector('[data-snapshot-panel="hari"]').hidden === true,
  };
}, BUILD_CTX_FN);
check('after a realtime refresh, the previously-selected period (Bulan) is still active', continuityResult.bulanStillActive);
check('after a realtime refresh, the Bulan panel is still the visible one', continuityResult.bulanPanelVisible);
check('after a realtime refresh, Hari did not silently become visible again', continuityResult.hariPanelHidden);

console.log('\n[10] Reduced motion (prefers-reduced-motion + data-anim="off") on the panel crossfade');
await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
await renderSnapshot('desktop', 'light');
const reducedTransition = await page.evaluate(() => {
  const panel = document.querySelector('[data-widget-id="exec-snapshot"] [data-snapshot-panel="hari"]');
  return panel ? getComputedStyle(panel).transitionProperty : null;
});
check('prefers-reduced-motion: panel crossfade transition is disabled (transition-property: none)', reducedTransition === 'none');
await page.emulateMediaFeatures([]);

const dataAnimOffTransition = await page.evaluate(async (buildCtxSrc) => {
  document.documentElement.setAttribute('data-anim', 'off');
  const router = await import('/js/workspace/home-router.js');
  const buildCtx = eval(buildCtxSrc);
  await router.renderHome(document.getElementById('host'), buildCtx());
  const panel = document.querySelector('[data-widget-id="exec-snapshot"] [data-snapshot-panel="hari"]');
  const t = panel ? getComputedStyle(panel).transitionProperty : null;
  document.documentElement.removeAttribute('data-anim');
  return t;
}, BUILD_CTX_FN);
check('data-anim="off": panel crossfade transition is disabled (transition-property: none)', dataAnimOffTransition === 'none');

console.log('\n[11] Accessibility — tablist/tab/tabpanel wiring, native buttons');
await renderSnapshot('desktop', 'light');
const a11yResult = await page.evaluate(() => {
  const section = document.querySelector('[data-widget-id="exec-snapshot"]');
  const seg = section.querySelector('[data-wsp-segmented]');
  const hariBtn = section.querySelector('[data-wsp-seg="hari"]');
  const hariPanel = section.querySelector('[data-snapshot-panel="hari"]');
  return {
    listHasAriaLabel: !!seg.getAttribute('aria-label'),
    btnControlsMatchesPanelId: hariBtn.getAttribute('aria-controls') === hariPanel.id,
    panelLabelledByMatchesBtnId: hariPanel.getAttribute('aria-labelledby') === hariBtn.id,
    panelRole: hariPanel.getAttribute('role'),
    focusable: (() => { hariBtn.focus(); return document.activeElement === hariBtn; })(),
  };
});
check('segmented control has an accessible name (aria-label)', a11yResult.listHasAriaLabel);
check('each tab\'s aria-controls points at its panel id', a11yResult.btnControlsMatchesPanelId);
check('each panel\'s aria-labelledby points back at its tab id', a11yResult.panelLabelledByMatchesBtnId);
check('panel role="tabpanel"', a11yResult.panelRole === 'tabpanel');
check('segment button is keyboard-focusable', a11yResult.focusable);

console.log('\n[12] Regression guard — sibling Executive sections untouched');
const siblingResult = await page.evaluate(async (buildCtxSrc) => {
  const router = await import('/js/workspace/home-router.js');
  const buildCtx = eval(buildCtxSrc);
  const host = document.getElementById('host');
  await router.renderHome(host, buildCtx());
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  return {
    heroPresent: !!host.querySelector('[data-widget-id="exec-hero"] .wsp-hero'),
    attentionPresent: !!host.querySelector('[data-widget-id="exec-attention"]'),
    decisionGone: !host.querySelector('[data-widget-id="exec-decision"]'),
    recommendationPresent: !!host.querySelector('[data-widget-id="exec-recommendation"]'),
  };
}, BUILD_CTX_FN);
check('exec-hero still renders (untouched)', siblingResult.heroPresent);
check('exec-attention still renders (untouched)', siblingResult.attentionPresent);
// Phase 7C (Executive Consolidation) — exec-decision was intentionally removed.
check('exec-decision is gone (removed per Phase 7C consolidation)', siblingResult.decisionGone);
check('exec-recommendation still renders (untouched)', siblingResult.recommendationPresent);

console.log('\n[13] Representative screenshots (scratch/snapshot-*.png)');
async function shot(vp, theme, tag = '') {
  await renderSnapshot(vp, theme);
  await new Promise((r) => setTimeout(r, 200));
  const name = `snapshot-${vp}-${theme}${tag}.png`;
  await page.screenshot({ path: path.join(SHOTS, name) });
  console.log(`  📸 scratch/${name}`);
}
await shot('desktop', 'light');
await shot('desktop', 'dark');
await shot('tablet', 'light');
await shot('mobile', 'light');
await shot('mobile', 'dark');

console.log('\n[14] Console errors');
check('zero console/page errors across the whole run', consoleErrors.length === 0);
if (consoleErrors.length) consoleErrors.forEach((e) => console.log('   ✗ ' + e.slice(0, 200)));

await browser.close();
server.close();

console.log(`\nEXECUTIVE OPERATIONAL SNAPSHOT VERIFICATION: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
