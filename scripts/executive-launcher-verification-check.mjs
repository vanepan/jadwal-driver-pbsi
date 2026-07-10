/* executive-launcher-verification-check.mjs — Phase 6 (Executive Launcher)
   mandatory browser verification. Serves the static app, loads the REAL
   Workspace layer (home-router.js -> exec-quick, "Peluncur Eksekutif") in
   headless Chromium — no app.js boot, no mocked internals — across:

     • 3 approved reference viewports (Desktop 1440x900, Tablet 1194x834,
       Mobile 402x874) x 2 themes = 6 structural combos.
     • Fixed order — the approved 9-destination sequence (Driver / Engineering
       / Kendaraan / Permintaan / Petty Cash / Analitik / Prediksi /
       Rekomendasi / Simulasi) never reorders, regardless of ctx.models.
     • Role visibility — hides, never reorders, destinations the current
       role lacks (a synthetic non-admin role is used ONLY to prove the
       filter mechanism is real; production routing never sends a non-admin
       role into this workspace, see workspace-registry.js).
     • Click wiring — every chip's data-wsp-action resolves to a real,
       distinct ctx.actions function (Prediction and Simulation share
       navDriverPrediction on purpose — Simulation is a panel inside the
       Prediction page, not a separate route, matching exec-simulation's
       own CTA).
     • Motion — the Launcher's own animation-delay is 600ms (Motion
       Language's "arrives last, quietly" beat), distinct from the generic
       nth-child cascade cap every earlier item shares.
     • Reduced motion (prefers-reduced-motion + data-anim="off") — the
       Launcher's entrance animation is fully disabled, same contract as
       every sibling Executive widget.
     • Keyboard — every destination is a native <button> (Enter/Space
       activate for free).
     • Accessibility — icons are decorative (aria-hidden), the visible label
       is the accessible name.
     • Regression guard — sibling Executive sections (Hero/Attention/
       Decision/Snapshot/Story) still render untouched.

   Run: node scripts/executive-launcher-verification-check.mjs (exit 0 = pass) */

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

const EXPECTED_ORDER = [
  { label: 'Driver', action: 'navDriverOps' },
  { label: 'Engineering', action: 'navEngineering' },
  { label: 'Kendaraan', action: 'navVehicles' },
  { label: 'Permintaan', action: 'navPending' },
  { label: 'Petty Cash', action: 'navPettyCash' },
  { label: 'Analitik', action: 'navAnalyticsDriver' },
  { label: 'Prediksi', action: 'navDriverPrediction' },
  { label: 'Rekomendasi', action: 'navRecommendationAccuracy' },
  { label: 'Simulasi', action: 'navDriverPrediction' },
];

// buildCtx accepts an optional role override + a "crisis" flag (adverse
// ctx.models/recommendations) — the crisis fixture proves order/membership
// never react to operational health, only role does.
const BUILD_CTX_FN = `(function buildCtx({ role = 'admin', crisis = false } = {}) {
  window.__actionCalls = [];
  const spy = (name) => (arg) => window.__actionCalls.push([name, arg]);
  const actionNames = ['navDriverOps','navEngineering','navVehicles','navPending','navPettyCash','navAnalyticsDriver','navDriverPrediction','navRecommendationAccuracy'];
  const actions = {};
  actionNames.forEach((n) => { actions[n] = spy(n); });
  return {
    user: { id: 'u1', name: 'Uji Coba', role }, role,
    assignments: [], requests: [], logs: [], engineeringEvents: [],
    actions,
    models: crisis ? {
      exec: { driverKpis: { activeVehicles: 1, activeDrivers: 1 }, score: { value: 12, level: 'attention', label: 'Kritis' }, scoreBreakdown: { components: [] } },
      engineering: { overdueAssignments: { count: 9 } },
      wellness: { summary: { burnoutRisk: 5, highFatigue: 5 } },
      pettyLowBalance: { low: true },
    } : {
      exec: { driverKpis: { activeVehicles: 5, activeDrivers: 4 }, score: { value: 91, level: 'excellent', label: 'Sangat Baik' }, scoreBreakdown: { components: [] } },
      engineering: { overdueAssignments: { count: 0 } },
      wellness: { summary: { burnoutRisk: 0, highFatigue: 0 } },
      pettyLowBalance: { low: false },
    },
    recommendations: crisis
      ? { certified: true, board: { isHealthyFleet: false, critical: [{ id: 'v1' }], upcoming: [] }, recs: [{ id: 'r1' }] }
      : { certified: true, board: { isHealthyFleet: true, critical: [], upcoming: [] }, recs: [] },
  };
})`;

async function readLauncher() {
  return page.evaluate(() => {
    const section = document.querySelector('[data-widget-id="exec-quick"]');
    const q = (s) => section && section.querySelector(s);
    const qa = (s) => section ? [...section.querySelectorAll(s)] : [];
    const chips = qa('.wsp-chip');
    return {
      hasSection: !!section,
      hasChips: !!q('.wsp-chips'),
      hasEmpty: !!q('.wsp-empty'),
      emptyText: (q('.wsp-empty') || {}).textContent || null,
      chipCount: chips.length,
      labels: chips.map((c) => c.querySelector('span:last-child').textContent.trim()),
      actionsInOrder: chips.map((c) => c.dataset.wspAction),
      allNativeButtons: chips.every((c) => c.tagName === 'BUTTON'),
      allHaveIcon: chips.every((c) => !!c.querySelector('.wsp-chip__icon svg')),
      allIconsAriaHidden: chips.every((c) => {
        const svg = c.querySelector('.wsp-chip__icon svg');
        return svg && svg.getAttribute('aria-hidden') === 'true';
      }),
      scrollWidthOverflow: document.documentElement.scrollWidth > window.innerWidth + 2,
      chipsFlexWrap: q('.wsp-chips') ? getComputedStyle(q('.wsp-chips')).flexWrap : null,
      chipsOverflowX: q('.wsp-chips') ? getComputedStyle(q('.wsp-chips')).overflowX : null,
      animationDelay: section ? getComputedStyle(section).animationDelay : null,
      heroPresent: !!document.querySelector('[data-widget-id="exec-hero"]'),
      attentionPresent: !!document.querySelector('[data-widget-id="exec-attention"]'),
      decisionPresent: !!document.querySelector('[data-widget-id="exec-decision"]'),
      snapshotPresent: !!document.querySelector('[data-widget-id="exec-snapshot"]'),
      storyPresent: !!document.querySelector('[data-widget-id="exec-activity"]'),
    };
  });
}

async function render(viewportKey, theme, ctxArg = {}, { reducedMotion = false, animOff = false } = {}) {
  await page.setViewport(VIEWPORTS[viewportKey]);
  if (reducedMotion) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  else await page.emulateMediaFeatures([]);
  await page.goto(`http://localhost:${port}/scripts/workspace-foundation-harness.html`, { waitUntil: 'networkidle0', timeout: 45000 });
  await page.evaluate((t, animOffArg) => {
    document.documentElement.setAttribute('data-theme', t);
    if (animOffArg) document.documentElement.setAttribute('data-anim', 'off');
  }, theme, animOff);
  await page.evaluate(async (buildCtxSrc, arg) => {
    const router = await import('/js/workspace/home-router.js');
    const buildCtx = eval(buildCtxSrc);
    const host = document.getElementById('host');
    host.className = 'exec-ui v2-analytics-claude';
    window.__ctx = buildCtx(arg);
    await router.renderHome(host, window.__ctx);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }, BUILD_CTX_FN, ctxArg);
  return readLauncher();
}

console.log('\n[1] Structural matrix — 3 viewports x 2 themes');
const THEMES = ['light', 'dark'];
const matrixResults = {};
for (const vp of Object.keys(VIEWPORTS)) {
  for (const theme of THEMES) {
    const key = `${vp}/${theme}`;
    const r = await render(vp, theme);
    matrixResults[key] = r;
    check(`${key}: Launcher section renders`, r.hasSection);
    check(`${key}: no horizontal overflow`, !r.scrollWidthOverflow);
    const shot = path.join(SHOTS, `launcher-${vp}-${theme}.png`);
    await page.screenshot({ path: shot, fullPage: true });
    console.log(`  📸 scratch/launcher-${vp}-${theme}.png`);
  }
}
const desktop = matrixResults['desktop/light'];
const mobile = matrixResults['mobile/light'];

console.log('\n[2] Fixed 9-destination order (admin, healthy fleet)');
check('exactly 9 chips render', desktop.chipCount === 9);
check('labels match the approved order exactly', JSON.stringify(desktop.labels) === JSON.stringify(EXPECTED_ORDER.map(d => d.label)));
check('actions match the approved order exactly', JSON.stringify(desktop.actionsInOrder) === JSON.stringify(EXPECTED_ORDER.map(d => d.action)));
check('Prediction and Simulation intentionally share navDriverPrediction', desktop.actionsInOrder[6] === 'navDriverPrediction' && desktop.actionsInOrder[8] === 'navDriverPrediction');

console.log('\n[3] Order never reacts to operational health (crisis fixture)');
const crisis = await render('desktop', 'light', { crisis: true });
check('same 9 labels, same order, under a critical/attention-needed fixture', JSON.stringify(crisis.labels) === JSON.stringify(EXPECTED_ORDER.map(d => d.label)));
check('same action order under crisis fixture', JSON.stringify(crisis.actionsInOrder) === JSON.stringify(EXPECTED_ORDER.map(d => d.action)));

console.log('\n[4] Role visibility — a real filter, not decorative (synthetic role)');
// Tested at the WIDGET level, not through renderHome(): home-router.js
// resolves role -> workspace BEFORE any widget renders (a non-admin role
// never reaches exec-quick's render() at all in production — it gets the
// 'request' workspace's widgets instead, per workspace-registry.js). This
// isolates exactly what Phase 6 changed: does exec-quick's OWN filter read
// ctx.role for real, independent of that outer routing decision.
const widgetLevel = await page.evaluate(async () => {
  const { widgets } = await import('/js/widgets/executive/index.js');
  const adminHtml = widgets['exec-quick'].render({ role: 'admin' });
  const bidangHtml = widgets['exec-quick'].render({ role: 'bidang' });
  const noRoleHtml = widgets['exec-quick'].render({});
  const count = (html) => (html.match(/wsp-chip"/g) || []).length;
  return {
    adminCount: count(adminHtml),
    bidangIsEmpty: /wsp-empty/.test(bidangHtml) && count(bidangHtml) === 0,
    noRoleIsEmpty: /wsp-empty/.test(noRoleHtml) && count(noRoleHtml) === 0,
  };
});
check('exec-quick.render({role:"admin"}) returns all 9 chips', widgetLevel.adminCount === 9);
check('exec-quick.render({role:"bidang"}) hides all 9 (real ctx.role read, not decorative)', widgetLevel.bidangIsEmpty);
check('exec-quick.render({}) (no role) fails safe to the empty state, not a crash', widgetLevel.noRoleIsEmpty);

console.log('\n[5] Click wiring — each destination calls its own real ctx.actions fn');
const clickResult = await page.evaluate(() => {
  const chips = [...document.querySelectorAll('[data-widget-id="exec-quick"] .wsp-chip')];
  chips[0].click(); // Driver
  chips[3].click(); // Permintaan
  return window.__actionCalls;
});
check('clicking "Driver" invokes navDriverOps', clickResult.some(([n]) => n === 'navDriverOps'));
check('clicking "Permintaan" invokes navPending', clickResult.some(([n]) => n === 'navPending'));

console.log('\n[6] Accessibility');
check('every chip is a native <button> (keyboard Enter/Space work for free)', desktop.allNativeButtons);
check('every chip has an icon svg', desktop.allHaveIcon);
check('every icon is aria-hidden (label text is the accessible name)', desktop.allIconsAriaHidden);

console.log('\n[7] Motion — arrives last, quietly (600ms), distinct from the generic cascade cap');
check('Launcher animation-delay is 600ms (0.6s)', /^0\.6s$|^600ms$/.test(desktop.animationDelay || ''));

console.log('\n[8] Reduced motion / data-anim=off — entrance animation fully disabled');
const reducedMotionResult = await render('desktop', 'light', {}, { reducedMotion: true });
check('prefers-reduced-motion disables the Launcher entrance animation', await page.evaluate(() => getComputedStyle(document.querySelector('[data-widget-id="exec-quick"]')).animationName === 'none'));
const animOffResult = await render('desktop', 'light', {}, { animOff: true });
check('data-anim="off" disables the Launcher entrance animation', await page.evaluate(() => getComputedStyle(document.querySelector('[data-widget-id="exec-quick"]')).animationName === 'none'));

console.log('\n[9] Responsive — mobile horizontal scroll, no new layout invented');
check('desktop: chips wrap (no horizontal scroll container)', desktop.chipsFlexWrap === 'wrap');
check('mobile: chips become a horizontal-scroll strip (nowrap + overflow-x auto)', mobile.chipsFlexWrap === 'nowrap' && mobile.chipsOverflowX === 'auto');

console.log('\n[10] Sibling Executive sections untouched (regression guard)');
check('Hero still renders', desktop.heroPresent);
check('Attention still renders', desktop.attentionPresent);
check('Decision Center still renders', desktop.decisionPresent);
check('Snapshot still renders', desktop.snapshotPresent);
check('Story still renders', desktop.storyPresent);

console.log('\n[11] Console errors');
check('zero console/page errors across the whole run', consoleErrors.length === 0);
if (consoleErrors.length) console.log(consoleErrors);

console.log(`\nEXECUTIVE LAUNCHER VERIFICATION: ${pass} passed, ${fail} failed`);
await browser.close();
server.close();
process.exit(fail ? 1 : 0);
