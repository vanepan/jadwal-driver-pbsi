/* decision-replay-dom-check.mjs — Decision Replay & Explainable AI (v1.17.5)
   DOM test. Serves the static app, loads the REAL recommendation engines +
   decision-replay service + drawer in headless Chromium, builds a replay model
   from a seeded request, opens the Apple-style drawer, asserts every feature
   section renders + the ranking expands + dark-mode safe + responsive + zero
   console errors, and captures light/dark/mobile screenshots.
   Run: node scripts/decision-replay-dom-check.mjs (exit 0 = pass) */

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
await page.goto(`http://localhost:${port}/scripts/decision-replay-harness.html`, { waitUntil: 'networkidle0', timeout: 45000 });

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };

const result = await page.evaluate(async () => {
  const svc = await import('/js/services/request-intelligence-service.js');
  const ovr = await import('/js/services/override-workflow-service.js');
  const drawer = await import('/js/components/decision-replay-drawer.js');

  const NOW = '2026-06-25T12:00:00';
  const drivers = [
    { id: 'd1', name: 'Igo' }, { id: 'd2', name: 'Dedi' }, { id: 'd3', name: 'Aria' }, { id: 'd4', name: 'Grace' },
  ];
  const vehicles = [
    { id: 'v1', name: 'Toyota Avanza', capacity: 7, healthScore: 100 },
    { id: 'v2', name: 'Toyota Innova', capacity: 8, healthScore: 95 },
    { id: 'v3', name: 'Toyota Hiace', capacity: 15, healthScore: 90 },
  ];
  const assignments = [];
  for (let i = 0; i < 5; i++) assignments.push({ driver: 'Dedi', vehicle: 'Toyota Innova', date: '2026-06-23', startTime: '08:00', endTime: '10:00', status: 'assigned' });
  for (let i = 0; i < 3; i++) assignments.push({ driver: 'Aria', vehicle: 'Toyota Hiace', date: '2026-06-24', startTime: '08:00', endTime: '10:00', status: 'assigned' });

  const request = { id: 'req-100', date: '2026-06-25', startTime: '13:00', endTime: '16:00', passengers: 4, destination: 'Bandara', requesterName: 'Bidang Umum', createdAt: '2026-06-25T07:00:00' };
  const pkg = svc.buildRecommendationPackage({ request, drivers, vehicles, assignments, overrideLogs: [] }, { now: NOW });
  const rec = pkg.recommendedDispatch;
  const diag = pkg.dispatchRecommendation.diagnostics.find((d) => d.driverId === rec.driverId && d.vehicleId === rec.vehicleId);
  const stored = {
    hasRecommendation: true,
    recommendedDriver: diag.driverName, recommendedDriverId: rec.driverId,
    recommendedVehicle: diag.vehicleName, recommendedVehicleId: rec.vehicleId,
    dispatchScore: rec.dispatchScore, generatedAt: pkg.generatedAt,
  };
  // A recorded override so the Override Analysis section renders.
  const overrideRecord = ovr.createOverrideRecord({
    recommendationId: 'req-100', recommendedDriverId: diag.driverName, recommendedVehicleId: diag.vehicleName,
    selectedDriverId: 'Dedi', selectedVehicleId: diag.vehicleName, dispatchScore: stored.dispatchScore - 18,
    reason: 'Driver lebih familiar rute', approvedBy: 'Admin Operasi', timestamp: '2026-06-25T14:00:00',
  });
  const reqApproved = { ...request, status: 'approved', approvedAt: '2026-06-25T14:05:00' };

  drawer.openDecisionReplay({
    pkg, stored, request: reqApproved,
    recommended: { driver: stored.recommendedDriver, vehicle: stored.recommendedVehicle },
    overrideRecord,
  }, { now: '2026-06-25T13:30:00', onExport: (fmt) => { window.__lastExport = fmt; } });

  const root = document.getElementById('decisionReplayDrawer');
  const q = (s) => root.querySelector(s);
  const titles = [...root.querySelectorAll('.drx-sec__title')].map((e) => e.textContent.trim());

  // Expand the first ranking row to prove Feature 9 is interactive.
  const firstRankBtn = root.querySelector('.drx-rank__btn');
  if (firstRankBtn) firstRankBtn.click();
  const rankExpanded = root.querySelector('.drx-rank__item[data-expanded="true"]') != null;

  const styleEl = document.getElementById('drx-drawer-styles');
  return {
    state: pkg.state,
    hasDrawer: !!root,
    sheet: !!q('.drx-sheet'),
    recDriver: (q('.drx-rec__v') || {}).textContent || '',
    stars: (q('.drx-stars') || {}).textContent || '',
    sectionTitles: titles,
    replayStages: root.querySelectorAll('#decisionReplayDrawer .drx-sec:first-of-type .drx-tl li').length,
    whyItems: root.querySelectorAll('.drx-why li').length,
    cmpCards: root.querySelectorAll('.drx-cmp__cand').length,
    bdRows: root.querySelectorAll('.drx-bd__row').length,
    rankItems: root.querySelectorAll('.drx-rank__item').length,
    rankExpanded,
    timelineItems: root.querySelectorAll('.drx-tl li').length,
    overrideShown: titles.some((t) => t.includes('Override')),
    closeBtn: !!q('#drxCloseBtn'),
    exportBtn: !!q('#drxExportBtn'),
    exportPdf: !!q('#drxExportPdf'),
    exportExcel: !!q('#drxExportExcel'),
    noHardWhite: styleEl ? !/#fff(\b|;)|#ffffff/i.test(styleEl.textContent) : false,
  };
});

console.log('\n[setup]');
check('engine package READY', result.state === 'READY');
check('drawer overlay + sheet render', result.hasDrawer && result.sheet);

console.log('\n[Feature 10 — Explainability Drawer structure]');
const want = ['Decision Replay', 'Mengapa Driver Ini?', 'Mengapa Bukan Driver Lain?', 'Mengapa Kendaraan Ini?', 'Mengapa Bukan Kendaraan Lain?', 'Komposisi Skor', 'Evaluasi Policy', 'Peringkat Kandidat', 'Analisis Override Admin', 'Linimasa'];
for (const w of want) check(`§ ${w}`, result.sectionTitles.some((t) => t.includes(w)));

console.log('\n[content]');
check('header shows recommended driver', result.recDriver.length > 0);
check('confidence stars rendered (Feature 7)', /★/.test(result.stars));
check('replay stages render (Feature 1, ≥10)', result.replayStages >= 10);
check('why checklists render (Features 2/4)', result.whyItems >= 5);
check('why-not comparison cards render (Features 3/4)', result.cmpCards >= 1);
check('score breakdown rows render (Feature 5)', result.bdRows === 2);
check('candidate ranking rows render (Feature 9)', result.rankItems >= 2);
check('ranking row expands on click (Feature 9 expandable)', result.rankExpanded);
check('override analysis section present (Feature 8)', result.overrideShown);
check('lifecycle timeline renders (Feature 11)', result.timelineItems >= 6);

console.log('\n[Feature 12 — Export + actions]');
check('Close button present', result.closeBtn);
check('Export button + PDF + Excel options present', result.exportBtn && result.exportPdf && result.exportExcel);

console.log('\n[design / regression]');
check('scoped stylesheet uses CSS vars (no hard-coded white — dark-mode safe)', result.noHardWhite);
check('no console errors during render', consoleErrors.length === 0);
if (consoleErrors.length) consoleErrors.forEach((e) => console.log('   • ' + e.slice(0, 200)));

// Export click wiring fires the onExport callback.
await page.evaluate(() => { document.getElementById('drxExportBtn').click(); document.getElementById('drxExportPdf').click(); });
const exportFired = await page.evaluate(() => window.__lastExport);
check('Export PDF click fires onExport handler', exportFired === 'pdf');

// ── screenshots ──────────────────────────────────────────────────────────
if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });
async function shot(name) { await page.screenshot({ path: path.join(SHOTS, name) }); console.log(`  📸 scratch/${name}`); }
console.log('\n[screenshots]');
await new Promise((r) => setTimeout(r, 250));
await shot('decision-replay-desktop-light.png');

await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
await new Promise((r) => setTimeout(r, 200));
await shot('decision-replay-desktop-dark.png');

await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
await page.setViewport({ width: 390, height: 800, deviceScaleFactor: 2 });
await new Promise((r) => setTimeout(r, 250));
await shot('decision-replay-mobile-light.png');

// On mobile the sheet is full-width; nothing should exceed the viewport.
const overflow = await page.evaluate(() => {
  const sheet = document.querySelector('.drx-sheet');
  return sheet ? sheet.offsetWidth <= window.innerWidth + 2 : true;
});
check('mobile sheet does not exceed viewport width', overflow);

await browser.close();
server.close();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
