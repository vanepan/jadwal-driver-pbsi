/* executive-outlook-verification-check.mjs — Phase 7 (Executive Command
   Center Rebuild) mandatory browser verification for the new Outlook zone
   (exec-outlook, "what should I expect next"). Serves the static app, loads
   the REAL Workspace layer (home-router.js -> exec-outlook) in headless
   Chromium — no app.js boot, no mocked internals — across:

     • 3 approved reference viewports (Desktop 1440x900, Tablet 1194x834,
       Mobile 402x874) x 2 themes = 6 structural combos.
     • Content correctness — the day-over-day Insight sentence (relocated
       from Snapshot, same topInsightLine() computation), tomorrow's
       scheduled trip count (tomorrowTripCount(), a one-line filter over
       ctx.assignments — not a forecast), and the certified Fleet
       Recommendation Engine's preventive/monitoring-tier vehicles
       (ctx.recommendations.board.upcoming) are each independently
       recomputed from fixture data and asserted exactly — nothing here may
       be fabricated (per the brief's "never invent insights/forecasts").
     • Empty state — no upcoming vehicles renders the honest positive
       message, not an empty list or a fabricated "all clear".
     • Uncertified recommendations — when the Fleet Recommendation Engine
       hasn't certified yet, Outlook degrades to the empty state rather than
       crashing or fabricating an upcoming list.
     • Cap — at most 3 upcoming vehicles are shown (matches the established
       visible-cap convention every other Executive section uses).
     • Zone banding — exec-outlook renders inside the labeled "outlook" zone
       band (eyebrow "Proyeksi", no separate zone heading — the widget's own
       section title already serves that role for a single-widget zone),
       and Snapshot no longer carries the Insight sentence (cross-check with
       the Phase 7 relocation — the authoritative check lives in
       executive-snapshot-verification-check.mjs; this script only confirms
       Outlook's own side of the same fact).
     • Reduced motion (prefers-reduced-motion + data-anim="off") — the new
       zone header's fade-up entrance is disabled, same contract every
       sibling Executive zone/widget already follows.
     • Regression guard — sibling Executive sections (Hero/Attention/
       Decision/Snapshot/Story/Drivers/Vehicle Flags/Launcher) still render
       untouched.

   Run: node scripts/executive-outlook-verification-check.mjs (exit 0 = pass) */

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

// ── Fixture builder — runs INSIDE the page so date math (today/tomorrow/
//    yesterday) uses the same Date/timezone as the widget under test.
//    Engineering "finished": 2 today, 1 yesterday -> a deterministic,
//    exactly-computable Insight sentence ("Teknik meningkat 100%...").
//    Assignments: 2 scheduled tomorrow (+1 cancelled tomorrow, excluded) ->
//    tomorrowTripCount = 2.
//    board.upcoming: 4 preventive-tier vehicles (only the certified engine
//    ever produces this shape) -> proves the cap-at-3 + correct field
//    mapping (vehicleName/categoryLabel/reason/timeline.label).
const BUILD_CTX_FN = `(function buildCtx({ certified = true, upcoming = true, tomorrow = true } = {}) {
  const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const dateNDaysFromNow = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };
  const isoNDaysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString(); };
  const assignments = tomorrow ? [
    { id: 'a1', date: dateNDaysFromNow(1), status: 'scheduled', vehicle: 'B1001' },
    { id: 'a2', date: dateNDaysFromNow(1), status: 'scheduled', vehicle: 'B1002' },
    { id: 'a3', date: dateNDaysFromNow(1), status: 'cancelled', vehicle: 'B1003' },
    { id: 'a4', date: dateNDaysFromNow(2), status: 'scheduled', vehicle: 'B1004' },
  ] : [];
  const engineeringEvents = [
    { type: 'finished', timestamp: isoNDaysAgo(0), assignmentId: 'e1', assignmentTitle: 'Servis A' },
    { type: 'finished', timestamp: isoNDaysAgo(0), assignmentId: 'e2', assignmentTitle: 'Servis B' },
    { type: 'finished', timestamp: isoNDaysAgo(1), assignmentId: 'e3', assignmentTitle: 'Servis C' },
  ];
  const upcomingVehicles = [
    { vehicleId: 'v1', vehicleName: 'Innova B1001', categoryLabel: 'Servis Preventif', reason: 'Mendekati jadwal servis berkala.', timeline: { label: 'Minggu Ini' } },
    { vehicleId: 'v2', vehicleName: 'Avanza B1002', categoryLabel: 'Pemantauan', reason: 'Indikator performa mendekati ambang batas.', timeline: { label: 'Bulan Ini' } },
    { vehicleId: 'v3', vehicleName: 'Xenia B1003', categoryLabel: 'Servis Preventif', reason: 'Jarak tempuh mendekati batas servis.', timeline: { label: 'Minggu Ini' } },
    { vehicleId: 'v4', vehicleName: 'Fortuner B1004', categoryLabel: 'Pemantauan', reason: 'Pola pemakaian di luar rata-rata.', timeline: { label: 'Bulan Ini' } },
  ];
  return {
    user: { id: 'u1', name: 'Uji Coba', role: 'admin' }, role: 'admin',
    assignments, requests: [], logs: [], engineeringEvents,
    actions: {},
    models: {
      exec: { driverKpis: { activeVehicles: 5, activeDrivers: 4 }, score: { value: 91, level: 'excellent', label: 'Sangat Baik' }, scoreBreakdown: { components: [] } },
      engineering: { overdueAssignments: { count: 0 } },
      wellness: { summary: { burnoutRisk: 0, highFatigue: 0 } },
      pettyLowBalance: { low: false },
    },
    recommendations: certified
      ? { certified: true, board: { isHealthyFleet: !upcoming, critical: [], upcoming: upcoming ? upcomingVehicles : [] }, recs: [] }
      : { certified: false, board: null, recs: [] },
  };
})`;

async function renderOutlook(viewportKey, theme, ctxArg = {}, { reducedMotion = false, animOff = false } = {}) {
  await page.setViewport(VIEWPORTS[viewportKey]);
  if (reducedMotion) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  else await page.emulateMediaFeatures([]);
  await page.goto(`http://localhost:${port}/scripts/workspace-foundation-harness.html`, { waitUntil: 'networkidle0', timeout: 45000 });
  await page.evaluate((t, animOffArg) => {
    document.documentElement.setAttribute('data-theme', t);
    if (animOffArg) document.documentElement.setAttribute('data-anim', 'off');
  }, theme, animOff);
  return page.evaluate(async (buildCtxSrc, arg) => {
    const router = await import('/js/workspace/home-router.js');
    const buildCtx = eval(buildCtxSrc);
    const ctx = buildCtx(arg);
    const host = document.getElementById('host');
    host.className = 'exec-ui v2-analytics-claude';
    await router.renderHome(host, ctx);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    // Phase 7C — the tomorrow-trip metric now counts up 0->value on first
    // mount (mountCountUp, <=420ms); wait for it to settle before reading it.
    await new Promise((r) => setTimeout(r, 500));

    const section = host.querySelector('[data-widget-id="exec-outlook"]');
    const zone = host.querySelector('.wsp-zone[data-zone-id="outlook"]');
    const q = (s) => section && section.querySelector(s);
    const qa = (s) => section ? [...section.querySelectorAll(s)] : [];
    const rows = qa('.wsp-row');

    return {
      hasSection: !!section,
      inOutlookZone: !!(zone && zone.contains(section)),
      zoneEyebrow: zone ? (zone.querySelector('.wsp-zone__eyebrow') || {}).textContent : null,
      zoneHeading: zone ? (zone.querySelector('.wsp-zone__heading') || {}).textContent : null,
      hasInsight: !!q('.wsp-insight'),
      insightText: (q('.wsp-insight') || {}).textContent || null,
      metricLabel: (q('.wsp-metric__label') || {}).textContent || null,
      metricValue: (q('.wsp-metric__value') || {}).textContent || null,
      upcomingRowCount: rows.length,
      upcomingTitles: rows.map((r) => (r.querySelector('.wsp-row__title') || {}).textContent),
      upcomingMetas: rows.map((r) => (r.querySelector('.wsp-row__meta') || {}).textContent),
      upcomingTrailing: rows.map((r) => (r.querySelector('.wsp-row__trailing') || {}).textContent),
      hasCompactOk: !!q('.wsp-compact-ok'),
      compactOkText: (q('.wsp-compact-ok') || {}).textContent || null,
      scrollWidthOverflow: document.documentElement.scrollWidth > window.innerWidth + 2,
      heroPresent: !!host.querySelector('[data-widget-id="exec-hero"]'),
      attentionPresent: !!host.querySelector('[data-widget-id="exec-attention"]'),
      recommendationPresent: !!host.querySelector('[data-widget-id="exec-recommendation"]'),
      snapshotHasNoInsight: !host.querySelector('[data-widget-id="exec-snapshot"] .wsp-insight'),
      snapshotPresent: !!host.querySelector('[data-widget-id="exec-snapshot"]'),
      storyPresent: !!host.querySelector('[data-widget-id="exec-activity"]'),
      driversPresent: !!host.querySelector('[data-widget-id="exec-drivers"]'),
      vehicleFlagsPresent: !!host.querySelector('[data-widget-id="exec-vehicle-flags"]'),
      launcherPresent: !!host.querySelector('[data-widget-id="exec-quick"]'),
    };
  }, BUILD_CTX_FN, ctxArg);
}

console.log('\n[1] Structural matrix — 3 viewports x 2 themes');
const THEMES = ['light', 'dark'];
const matrixResults = {};
for (const vp of Object.keys(VIEWPORTS)) {
  for (const theme of THEMES) {
    const key = `${vp}/${theme}`;
    const r = await renderOutlook(vp, theme);
    matrixResults[key] = r;
    check(`${key}: Outlook section renders`, r.hasSection);
    check(`${key}: no horizontal overflow`, !r.scrollWidthOverflow);
  }
}
const base = matrixResults['desktop/light'];

console.log('\n[2] Zone banding — labeled "outlook" band, correct eyebrow, no redundant heading');
check('exec-outlook renders inside .wsp-zone[data-zone-id="outlook"]', base.inOutlookZone);
check('zone eyebrow reads "Proyeksi"', (base.zoneEyebrow || '').trim() === 'Proyeksi');
// A single-widget zone omits its own zone-level <h2>: the widget's own
// section title ("Proyeksi", from the Widget Registry) already serves as
// the heading directly below the eyebrow — a separate zone heading here
// duplicated it near-verbatim, found and removed during visual verification.
check('zone has no separate <h2> heading (widget\'s own title serves that role)', !base.zoneHeading);

console.log('\n[3] Insight — relocated from Snapshot, same topInsightLine() computation');
check('Insight sentence renders in Outlook', base.hasInsight);
check('Insight text matches the deterministic fixture (2 today vs 1 yesterday -> +100%)', (base.insightText || '').trim() === 'Teknik meningkat 100% dibanding kemarin.');
check('Snapshot no longer carries the Insight sentence (Phase 7 relocation)', base.snapshotHasNoInsight);

console.log('\n[4] Tomorrow\'s scheduled load — one-line filter over ctx.assignments, not a forecast');
check('metric label reads "Trip Terjadwal Besok"', (base.metricLabel || '').trim() === 'Trip Terjadwal Besok');
check('tomorrow count excludes the cancelled assignment and a day-after-tomorrow one (2, not 3 or 4)', (base.metricValue || '').trim() === '2');

console.log('\n[5] Preventive-monitoring vehicles — certified board.upcoming, capped at 3, correct field mapping');
check('exactly 3 of the 4 fixture vehicles are shown (visible cap)', base.upcomingRowCount === 3);
check('row titles are "vehicleName — categoryLabel"', base.upcomingTitles[0] === 'Innova B1001 — Servis Preventif');
check('row meta is the engine\'s own reason text', base.upcomingMetas[0] === 'Mendekati jadwal servis berkala.');
check('row trailing is the engine\'s own timeline label', base.upcomingTrailing[0] === 'Minggu Ini');

console.log('\n[6] Empty state — no upcoming vehicles renders the honest positive message');
const emptyResult = await renderOutlook('desktop', 'light', { upcoming: false });
check('no row list rendered', emptyResult.upcomingRowCount === 0);
check('positive compact-ok message renders instead', emptyResult.hasCompactOk);
check('message is honest, not a fabricated "all clear"', (emptyResult.compactOkText || '').includes('jendela pemantauan preventif'));

console.log('\n[7] Uncertified recommendations — degrades safely, never crashes or fabricates');
const uncertifiedResult = await renderOutlook('desktop', 'light', { certified: false });
check('Outlook section still renders (no crash)', uncertifiedResult.hasSection);
check('no upcoming rows when uncertified', uncertifiedResult.upcomingRowCount === 0);
check('falls back to the positive compact-ok message, not an error state', uncertifiedResult.hasCompactOk);

console.log('\n[8] No tomorrow trips — metric still renders honestly as 0, not omitted');
const noTomorrowResult = await renderOutlook('desktop', 'light', { tomorrow: false });
check('metric value reads "0" (not hidden, not fabricated)', (noTomorrowResult.metricValue || '').trim() === '0');

console.log('\n[9] Reduced motion (prefers-reduced-motion + data-anim="off") on the zone header fade-up');
await renderOutlook('desktop', 'light', {}, { reducedMotion: true });
const reducedAnim = await page.evaluate(() => {
  const head = document.querySelector('.wsp-zone[data-zone-id="outlook"] .wsp-zone__head');
  return head ? getComputedStyle(head).animationName : null;
});
check('prefers-reduced-motion: zone header entrance animation is disabled', reducedAnim === 'none');
await page.emulateMediaFeatures([]);

const animOffAnim = await page.evaluate(async (buildCtxSrc) => {
  document.documentElement.setAttribute('data-anim', 'off');
  const router = await import('/js/workspace/home-router.js');
  const buildCtx = eval(buildCtxSrc);
  await router.renderHome(document.getElementById('host'), buildCtx());
  const head = document.querySelector('.wsp-zone[data-zone-id="outlook"] .wsp-zone__head');
  const anim = head ? getComputedStyle(head).animationName : null;
  document.documentElement.removeAttribute('data-anim');
  return anim;
}, BUILD_CTX_FN);
check('data-anim="off": zone header entrance animation is disabled', animOffAnim === 'none');

console.log('\n[10] Regression guard — sibling Executive sections untouched');
await renderOutlook('desktop', 'light');
check('exec-hero still renders', base.heroPresent);
check('exec-attention still renders', base.attentionPresent);
check('exec-recommendation still renders', base.recommendationPresent);
check('exec-snapshot still renders', base.snapshotPresent);
check('exec-activity (Story) still renders', base.storyPresent);
check('exec-drivers still renders', base.driversPresent);
check('exec-vehicle-flags still renders', base.vehicleFlagsPresent);
check('exec-quick (Launcher) still renders', base.launcherPresent);

console.log('\n[11] Representative screenshots (scratch/outlook-*.png)');
async function shot(vp, theme, ctxArg = {}, tag = '') {
  await renderOutlook(vp, theme, ctxArg);
  await new Promise((r) => setTimeout(r, 200));
  const name = `outlook-${vp}-${theme}${tag}.png`;
  await page.screenshot({ path: path.join(SHOTS, name) });
  console.log(`  📸 scratch/${name}`);
}
await shot('desktop', 'light');
await shot('desktop', 'dark');
await shot('tablet', 'light');
await shot('mobile', 'light');
await shot('mobile', 'dark');
await shot('desktop', 'light', { upcoming: false }, '-empty');

console.log('\n[12] Console errors');
check('zero console/page errors across the whole run', consoleErrors.length === 0);
if (consoleErrors.length) consoleErrors.forEach((e) => console.log('   ✗ ' + e.slice(0, 200)));

await browser.close();
server.close();

console.log(`\nEXECUTIVE OUTLOOK VERIFICATION: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
