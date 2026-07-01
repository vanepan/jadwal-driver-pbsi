/* executive-dashboard-dom-check.mjs — Executive Analytics Dashboard (v1.18.8)
   DOM test. Serves the static app, loads the REAL executive dashboard component
   in headless Chromium, assembles an aggregate model from EXISTING engine
   outputs (the Operational Health Score via computeExecutiveAnalytics + the real
   Driver Wellness and Fleet Asset models, plus documented-shape Dispatch /
   Recommendation summaries), renders the dashboard, asserts the full executive
   structure is present + emoji-free + dark-mode safe + quick-nav wired + zero
   console errors, and captures light/dark/mobile screenshots.
   Run: node scripts/executive-dashboard-dom-check.mjs (exit 0 = pass) */

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
  if (/Failed to load resource/i.test(m.text())) return; // bare-harness asset 404s
  consoleErrors.push('console.error: ' + m.text());
});

await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
await page.goto(`http://localhost:${port}/scripts/executive-dashboard-harness.html`, { waitUntil: 'networkidle0', timeout: 45000 });

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };

const result = await page.evaluate(async () => {
  const execEng = await import('/js/analytics/executive-analytics.js');
  const wellnessSvc = await import('/js/services/driver-wellness-service.js');
  const fleetSvc = await import('/js/services/vehicle-asset-service.js');
  const dash = await import('/js/components/executive-dashboard.js');

  const NOW = '2026-06-25';

  // ── Operational Health Score — the REAL engine (driver KPIs + no petty). ──
  const driverModel = { kpis: {
    total: 120, tripsWithoutVehicle: 20, tripsWithVehicle: 100,
    activeDrivers: 8, driversWithTrips: 6, activeVehicles: 5, vehiclesWithTrips: 4,
    compRate: 88, workloadTop: { name: 'Aria', score: 82 }, workloadLow: { name: 'Budi', score: 40 },
    workloadAvgScore: 60, totalActualHours: 200, totalOvertimeHours: 20, weekendAssignments: 5,
  } };
  const exec = execEng.computeExecutiveAnalytics({ driverModel, pettyModel: null, meta: { periodLabel: '30 Hari' } });

  // ── Driver Wellness — the REAL engine (seeded, mirrors the wellness harness). ──
  const drivers = [{ id: 'd1', name: 'Igo' }, { id: 'd2', name: 'Dedi' }, { id: 'd3', name: 'Aria' }, { id: 'd4', name: 'Grace' }];
  const assignments = [];
  for (const day of ['2026-06-19', '2026-06-20', '2026-06-21', '2026-06-22', '2026-06-23', '2026-06-24', '2026-06-25']) {
    assignments.push({ driver: 'Igo', vehicle: 'Innova', date: day, startTime: '07:00', endTime: '19:00', status: 'assigned', distanceTravelled: 150 });
  }
  for (const day of ['2026-06-10', '2026-06-15', '2026-06-20']) assignments.push({ driver: 'Dedi', vehicle: 'Avanza', date: day, startTime: '09:00', endTime: '12:00', status: 'assigned' });
  assignments.push({ driver: 'Aria', vehicle: 'Avanza', date: '2026-06-23', startTime: '10:00', endTime: '11:00', status: 'assigned' });
  const wellness = wellnessSvc.computeDriverWellnessModel({ drivers, assignments, now: NOW, window: '30d' });

  // ── Fleet Asset — the REAL engine (seeded; one vehicle under maintenance). ──
  const vehicles = [
    { id: 'v1', name: 'Innova', type: 'mobil', status: 'active' },
    { id: 'v2', name: 'Avanza', type: 'mobil', status: 'active' },
    { id: 'v3', name: 'HiAce', type: 'mobil', status: 'maintenance' },
    { id: 'v4', name: 'Ambulance 1', type: 'ambulance', status: 'active' },
  ];
  const fleet = fleetSvc.computeFleetAssetModel({ vehicles, now: NOW });

  // ── Dispatch + Recommendation — documented-shape summaries (their own engines
  //    have dedicated checks; here we only prove the presentation renders). ──
  const dispatch = { kpi: { dispatchAccuracy: 82, overrideRate: 12, recommendationAcceptance: 82, avgDispatchScore: 78, sampleSize: 40 } };
  const recommendation = {
    kpi: { acceptanceRate: 84, recommendationAccuracy: 84, overrideRate: 16, avgDispatchScore: 80, sampleSize: 40 },
    driverAccuracy: { rows: [
      { name: 'Aria', recommendations: 12, accepted: 11, accuracyPct: 92 },
      { name: 'Igo', recommendations: 9, accepted: 7, accuracyPct: 78 },
    ] },
  };

  const model = { generatedAt: new Date(NOW).toISOString(), exec, dispatch, recommendation, wellness, fleet, petty: null };
  window.__model = model;

  dash.injectExecutiveDashboardStyles();
  const host = document.getElementById('host');
  host.innerHTML = dash.renderExecutiveDashboard(model);

  const root = host.querySelector('.exa.daa');
  const q = (s) => root.querySelector(s);
  const qa = (s) => [...root.querySelectorAll(s)];
  const sections = qa('.v2-analytics-section');
  const sectionTitles = sections.map((e) => { const h = e.querySelector('.v2-analytics-section-header'); return h ? h.textContent.trim() : ''; });
  const kpiIn = (title) => {
    const s = sections.find((e) => { const h = e.querySelector('.v2-analytics-section-header'); return h && h.textContent.trim() === title; });
    return s ? s.querySelectorAll('.v2-analytics-kpi-card').length : 0;
  };

  const exaStyle = document.getElementById('exa-dashboard-styles');
  const daaStyle = document.getElementById('daa-dashboard-styles');
  const noHardWhite = (s) => (s ? !/#fff(\b|;)|#ffffff/i.test(s.textContent) : true);
  const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}⭐★☆]/u;

  return {
    execScore: exec && exec.score ? exec.score.value : null,
    hasRoot: !!root,
    header: (q('.exec-head__title') || {}).textContent || '',
    heroStats: qa('.daa-hero-stat').length,
    statusCard: qa('.daa-status').length,
    statusLevel: (q('.daa-status__level') || {}).textContent || '',
    statusMsg: (q('.daa-status__msg') || {}).textContent || '',
    kpiCount: kpiIn('Ringkasan Eksekutif'),
    highlightItems: qa('.daa-tl__li').length,
    overviewCards: qa('.exa-dom').length,
    overviewPills: qa('.exa-dom .exec-pill').length,
    spotlights: qa('.daa-spot').length,
    navCards: qa('.exa-nav__card').length,
    navKeys: qa('.exa-nav__card').map((b) => b.getAttribute('data-exa-nav')),
    sections: sections.length,
    titles: sectionTitles,
    noEmoji: !EMOJI.test(root.textContent || ''),
    reusesBaseStyles: !!daaStyle,
    hasSupplement: !!exaStyle,
    noHardWhite: noHardWhite(exaStyle) && noHardWhite(daaStyle),
  };
});

console.log('\n[model — reused engine outputs]');
check('Operational Health Score computed (0–100 or null)', result.execScore === null || (result.execScore >= 0 && result.execScore <= 100));

console.log('\n[structure — Executive UI]');
check('dashboard root .exa.daa renders', result.hasRoot);
check('Executive header title is "Executive Analytics"', result.header.trim() === 'Executive Analytics');
check('hero stat band renders 3 headline figures', result.heroStats === 3);
check('ONE Executive Status verdict card (not a checklist)', result.statusCard === 1);
check('Status card states a verdict level', result.statusLevel.trim().length > 0);
check('Status card states one supporting sentence', result.statusMsg.trim().length > 0);
check('6 Executive KPI cards in Ringkasan Eksekutif', result.kpiCount === 6);
check("Today's Highlights feed renders (≥1, ≤5)", result.highlightItems >= 1 && result.highlightItems <= 5);
check('Operational Overview renders 6 domain cards', result.overviewCards === 6);
check('every domain card carries a status pill', result.overviewPills === 6);
check('ONE Executive Spotlight renders', result.spotlights === 1);
check('Quick Navigation renders 6 premium cards', result.navCards === 6);
check('Quick Nav cards route to every page (data-exa-nav)',
  ['driver', 'dispatch', 'recommendation', 'wellness', 'vehicle', 'petty'].every((k) => result.navKeys.includes(k)));
check('Executive section shells rendered (5)', result.sections === 5);

console.log('\n[sections present]');
const want = ['Ringkasan Eksekutif', 'Sorotan Hari Ini', 'Tinjauan Operasional', 'Sorotan Eksekutif', 'Navigasi Cepat'];
for (const w of want) check(`§ ${w}`, result.titles.some((t) => t === w));
// Guard against regressing into a developer / AI / technical dashboard.
const banned = ['Confidence', 'Override', 'Calibration', 'Explainability', 'Burnout', 'Fatigue', 'Engine'];
for (const b of banned) check(`no technical/AI/medical term "${b}" in titles`, !result.titles.some((t) => t.includes(b)));

console.log('\n[design / regression]');
check('reuses the shared design system (.daa-* styles present)', result.reusesBaseStyles);
check('adds the .exa-* supplement stylesheet', result.hasSupplement);
check('zero emoji anywhere (operational briefing)', result.noEmoji);
check('no hard-coded white in any stylesheet (dark-mode safe)', result.noHardWhite);
check('no console errors during render', consoleErrors.length === 0);
if (consoleErrors.length) consoleErrors.forEach((e) => console.log('   • ' + e.slice(0, 200)));

// ── screenshots ──────────────────────────────────────────────────────────
if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });
async function shot(name) { await page.screenshot({ path: path.join(SHOTS, name), fullPage: true }); console.log(`  📸 scratch/${name}`); }
console.log('\n[screenshots]');
await new Promise((r) => setTimeout(r, 250));
await shot('executive-dashboard-desktop-light.png');

await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
await new Promise((r) => setTimeout(r, 200));
await shot('executive-dashboard-desktop-dark.png');

await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
await page.setViewport({ width: 390, height: 800, deviceScaleFactor: 2 });
await new Promise((r) => setTimeout(r, 250));
await shot('executive-dashboard-mobile-light.png');

const noOverflow = await page.evaluate(() => {
  const root = document.querySelector('.exa.daa');
  return root ? root.scrollWidth <= window.innerWidth + 2 : false;
});
check('no horizontal page overflow on mobile', noOverflow);

await browser.close();
server.close();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
