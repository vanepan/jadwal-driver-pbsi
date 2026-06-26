/* recommendation-accuracy-dom-check.mjs — Recommendation Accuracy Engine (v1.17.1)
   DOM test. Serves the static app, loads the REAL engine + dashboard modules in
   headless Chromium, computes the accuracy model from a seeded decision history,
   renders the dashboard, asserts every feature section is present + dark-mode safe
   + zero console errors, exercises live search + sort, and captures
   light/dark/mobile screenshots.
   Run: node scripts/recommendation-accuracy-dom-check.mjs (exit 0 = pass) */

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

await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
await page.goto(`http://localhost:${port}/scripts/recommendation-accuracy-harness.html`, { waitUntil: 'networkidle0', timeout: 45000 });

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };

const result = await page.evaluate(async () => {
  const engine = await import('/js/analytics/recommendation-accuracy-engine.js');
  const dash = await import('/js/components/recommendation-accuracy-dashboard.js');

  const NOW = '2026-06-25T12:00:00';
  const drivers = [
    { id: 'd1', name: 'Andi Saputra' }, { id: 'd2', name: 'Budi Hartono' },
    { id: 'd3', name: 'Citra Dewi' }, { id: 'd4', name: 'Dharma Putra' },
  ];
  const vehicles = [
    { id: 'v1', name: 'Toyota Avanza' }, { id: 'v2', name: 'Toyota Innova' }, { id: 'v3', name: 'Toyota Hiace' },
  ];
  const bidangs = ['Bidang Umum', 'Bidang Keuangan', 'Bidang SDM'];
  const dests = ['Bandara', 'Hotel Mawar', 'Pelabuhan', 'Kantor Pusat'];
  const requests = [];
  const overrideLogs = [];
  const requestRecommendations = {};
  const outcomes = ['ACCEPTED', 'ACCEPTED', 'ACCEPTED', 'DRIVER_OVERRIDE', 'VEHICLE_OVERRIDE', 'FULL_OVERRIDE'];
  const recScores = [96, 91, 88, 96, 74, 96];   // includes ★★★★★ that get overridden → false-high-confidence
  const overrideReasons = ['Driver sakit tidak tersedia', 'Kapasitas lebih besar diperlukan', 'Konflik jadwal bentrok', 'Servis kendaraan maintenance'];

  for (let i = 0; i < 24; i++) {
    const id = 'r' + i;
    const recD = drivers[i % drivers.length];
    const recV = vehicles[i % vehicles.length];
    const outcome = outcomes[i % outcomes.length];
    const recScore = recScores[i % recScores.length];
    const selScore = outcome === 'ACCEPTED' ? recScore : Math.max(40, recScore - (20 + (i % 25)));
    const dnum = Math.max(1, 24 - Math.floor(i / 3));
    const dateStr = `2026-06-${String(dnum).padStart(2, '0')}`;
    const ts = `${dateStr}T${String(8 + (i % 8)).padStart(2, '0')}:30:00`;
    requests.push({ id, requesterName: bidangs[i % bidangs.length], purpose: dests[i % dests.length], createdAt: `${dateStr}T07:00:00`, approvedAt: ts });
    const selD = outcome === 'DRIVER_OVERRIDE' || outcome === 'FULL_OVERRIDE' ? drivers[(i + 1) % drivers.length] : recD;
    const selV = outcome === 'VEHICLE_OVERRIDE' || outcome === 'FULL_OVERRIDE' ? vehicles[(i + 1) % vehicles.length] : recV;
    overrideLogs.push({
      recommendationId: id, recommendedDriverId: recD.id, recommendedVehicleId: recV.id,
      selectedDriverId: selD.id, selectedVehicleId: selV.id, dispatchScore: selScore,
      outcome, overridden: outcome !== 'ACCEPTED',
      reason: outcome !== 'ACCEPTED' ? overrideReasons[i % overrideReasons.length] : '',
      approvedBy: 'Admin Operasi', timestamp: ts,
    });
    requestRecommendations[id] = { requestId: id, recommendedDriverId: recD.id, recommendedVehicleId: recV.id, dispatchScore: recScore, reasonSummary: 'Driver tersedia, beban rendah', generatedAt: `${dateStr}T06:59:00` };
  }

  const model = engine.computeRecommendationAccuracyModel({ overrideLogs, requestRecommendations, requests, drivers, vehicles, now: NOW });

  dash.injectRecommendationAccuracyStyles();
  const host = document.createElement('div');
  host.id = 'raaTestHost';
  host.style.cssText = 'position:fixed;inset:0;overflow:auto;z-index:99999;padding:24px;background:var(--surface-2);';
  host.innerHTML = dash.renderRecommendationAccuracyDashboard(model, { trendWindow: '30d' });
  document.body.appendChild(host);

  const q = (s) => host.querySelector(s);
  const styleEl = document.getElementById('raa-dashboard-styles');
  const daaStyleEl = document.getElementById('daa-dashboard-styles');
  return {
    decisions: model.totals.decisions,
    hasRoot: !!q('.daa.raa'),
    header: (q('.daa-top__title') || {}).textContent || '',
    kpiCount: host.querySelectorAll('.daa-kpi').length,
    deltaChips: host.querySelectorAll('.raa-chip').length,
    sections: host.querySelectorAll('.daa-sec').length,
    tables: host.querySelectorAll('.daa-table').length,
    calRows: host.querySelectorAll('.raa-cal__row').length,
    sevSegs: host.querySelectorAll('.raa-sev__seg').length,
    insights: host.querySelectorAll('.raa-insight').length,
    bigs: host.querySelectorAll('.raa-big').length,
    searchInputs: host.querySelectorAll('[data-raa-search]').length,
    sortSelects: host.querySelectorAll('[data-raa-sort]').length,
    toggleBtns: host.querySelectorAll('[data-raa-window]').length,
    exportBtns: host.querySelectorAll('[data-raa-export]').length,
    sparkCols: host.querySelectorAll('.daa-spark__col').length,
    titles: [...host.querySelectorAll('.daa-sec__title')].map((e) => e.textContent.trim()),
    fhcPct: model.falseHighConfidence.falseHighConfidencePct,
    // base styles loaded (proves the design system is reused, not duplicated)
    reusesBaseStyles: !!daaStyleEl,
    noHardWhite: styleEl && daaStyleEl ? !/#fff(\b|;)|#ffffff/i.test(styleEl.textContent + daaStyleEl.textContent) : false,
  };
});

console.log('\n[model]');
check('seeded model has 24 decisions', result.decisions === 24);
check('false-high-confidence detected (★★★★★ overridden present)', result.fhcPct > 0);

console.log('\n[structure]');
check('dashboard root .daa.raa renders', result.hasRoot);
check('header title present', result.header.includes('Recommendation Accuracy'));
check('8 KPI cards (Feature 1)', result.kpiCount === 8);
check('previous-period delta chips render', result.deltaChips >= 1);
check('section shells rendered (≥ 8)', result.sections >= 8);
check('driver + vehicle accuracy tables render (Feature 2 & 3)', result.tables >= 2);
check('calibration chart rows render (Feature 4)', result.calRows === 4);
check('severity meter segments render (Feature 5)', result.sevSegs >= 1);
check('false-high / unexpected big tiles render (Feature 7 & 8)', result.bigs === 2);
check('learning-trend sparkline columns render (Feature 9)', result.sparkCols >= 1);
check('executive insight cards render (Feature 10)', result.insights >= 1);
check('search inputs present (driver + vehicle)', result.searchInputs === 2);
check('sort selects present (driver + vehicle)', result.sortSelects === 2);
check('learning-trend toggle has 4 buttons', result.toggleBtns === 4);
check('export buttons (PDF + Excel) present', result.exportBtns === 2);

console.log('\n[feature sections present]');
const want = ['Ringkasan Akurasi', 'Akurasi Rekomendasi Driver', 'Akurasi Rekomendasi Kendaraan', 'Kalibrasi Confidence', 'Keparahan Override', 'Analitik Alasan Override', 'Confidence vs Keputusan', 'Tren Pembelajaran', 'Insight Eksekutif'];
for (const w of want) check(`§ ${w}`, result.titles.some((t) => t.includes(w)));

console.log('\n[design / regression]');
check('reuses the Dispatch Analytics design system (.daa-* styles present)', result.reusesBaseStyles);
check('no hard-coded white in either stylesheet (dark-mode safe)', result.noHardWhite);
check('no console errors during render', consoleErrors.length === 0);
if (consoleErrors.length) consoleErrors.forEach((e) => console.log('   • ' + e.slice(0, 200)));

// ── interaction: live search filters the driver table ──────────────────────
console.log('\n[interaction]');
const searchResult = await page.evaluate(async () => {
  const host = document.getElementById('raaTestHost');
  const dash = await import('/js/components/recommendation-accuracy-dashboard.js');
  const engine = await import('/js/analytics/recommendation-accuracy-engine.js');
  // re-render with a driver search term and confirm filtering reduces rows
  // (use the same seed shape inline — just re-derive a model quickly).
  // Easiest: read the existing rows count, then re-render with a search.
  const before = host.querySelectorAll('.daa-table')[0].querySelectorAll('tbody tr').length;
  // grab the model from the window publish path is not set here (harness), so
  // rebuild a tiny model deterministically.
  const drivers = [{ id: 'd1', name: 'Andi Saputra' }, { id: 'd2', name: 'Budi Hartono' }];
  const overrideLogs = [
    { recommendationId: 'r1', recommendedDriverId: 'd1', recommendedVehicleId: 'v1', selectedDriverId: 'd1', selectedVehicleId: 'v1', dispatchScore: 96, outcome: 'ACCEPTED', overridden: false, timestamp: '2026-06-24T09:00:00' },
    { recommendationId: 'r2', recommendedDriverId: 'd2', recommendedVehicleId: 'v1', selectedDriverId: 'd2', selectedVehicleId: 'v1', dispatchScore: 90, outcome: 'ACCEPTED', overridden: false, timestamp: '2026-06-24T09:00:00' },
  ];
  const model = engine.computeRecommendationAccuracyModel({ overrideLogs, drivers, now: '2026-06-25T12:00:00' });
  host.innerHTML = dash.renderRecommendationAccuracyDashboard(model, { trendWindow: '30d', driverSearch: 'Andi' });
  const after = host.querySelectorAll('.daa-table')[0].querySelectorAll('tbody tr').length;
  return { before, after };
});
check('driver search "Andi" narrows the table to 1 row', searchResult.after === 1);

// ── screenshots ────────────────────────────────────────────────────────────
if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });
async function shot(name) {
  await page.screenshot({ path: path.join(SHOTS, name), fullPage: true });
  console.log(`  📸 scratch/${name}`);
}
// re-render the full seeded dashboard for clean screenshots
await page.evaluate(async () => {
  const host = document.getElementById('raaTestHost');
  const dash = await import('/js/components/recommendation-accuracy-dashboard.js');
  const engine = await import('/js/analytics/recommendation-accuracy-engine.js');
  const drivers = [{ id: 'd1', name: 'Andi Saputra' }, { id: 'd2', name: 'Budi Hartono' }, { id: 'd3', name: 'Citra Dewi' }, { id: 'd4', name: 'Dharma Putra' }];
  const vehicles = [{ id: 'v1', name: 'Toyota Avanza' }, { id: 'v2', name: 'Toyota Innova' }, { id: 'v3', name: 'Toyota Hiace' }];
  const overrideLogs = []; const requestRecommendations = {};
  const outcomes = ['ACCEPTED', 'ACCEPTED', 'ACCEPTED', 'DRIVER_OVERRIDE', 'VEHICLE_OVERRIDE', 'FULL_OVERRIDE'];
  const recScores = [96, 91, 88, 96, 74, 96];
  const reasons = ['Driver sakit tidak tersedia', 'Kapasitas lebih besar diperlukan', 'Konflik jadwal bentrok', 'Servis kendaraan maintenance'];
  for (let i = 0; i < 24; i++) {
    const id = 'r' + i; const recD = drivers[i % drivers.length]; const recV = vehicles[i % vehicles.length];
    const outcome = outcomes[i % outcomes.length]; const rs = recScores[i % recScores.length];
    const ss = outcome === 'ACCEPTED' ? rs : Math.max(40, rs - (20 + (i % 25)));
    const dnum = Math.max(1, 24 - Math.floor(i / 3)); const dateStr = `2026-06-${String(dnum).padStart(2, '0')}`;
    const ts = `${dateStr}T${String(8 + (i % 8)).padStart(2, '0')}:30:00`;
    const selD = outcome === 'DRIVER_OVERRIDE' || outcome === 'FULL_OVERRIDE' ? drivers[(i + 1) % drivers.length] : recD;
    const selV = outcome === 'VEHICLE_OVERRIDE' || outcome === 'FULL_OVERRIDE' ? vehicles[(i + 1) % vehicles.length] : recV;
    overrideLogs.push({ recommendationId: id, recommendedDriverId: recD.id, recommendedVehicleId: recV.id, selectedDriverId: selD.id, selectedVehicleId: selV.id, dispatchScore: ss, outcome, overridden: outcome !== 'ACCEPTED', reason: outcome !== 'ACCEPTED' ? reasons[i % reasons.length] : '', timestamp: ts });
    requestRecommendations[id] = { requestId: id, recommendedDriverId: recD.id, recommendedVehicleId: recV.id, dispatchScore: rs, reasonSummary: 'Driver tersedia', generatedAt: `${dateStr}T06:59:00` };
  }
  const model = engine.computeRecommendationAccuracyModel({ overrideLogs, requestRecommendations, drivers, vehicles, now: '2026-06-25T12:00:00' });
  host.innerHTML = dash.renderRecommendationAccuracyDashboard(model, { trendWindow: '30d' });
});

console.log('\n[screenshots]');
await page.evaluate(() => {
  [...document.body.children].forEach((el) => { if (el.id !== 'raaTestHost') el.style.display = 'none'; });
});
await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
await new Promise((r) => setTimeout(r, 150));
await shot('recommendation-accuracy-desktop-light.png');

await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
await new Promise((r) => setTimeout(r, 150));
await shot('recommendation-accuracy-desktop-dark.png');

await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
await page.setViewport({ width: 390, height: 800, deviceScaleFactor: 2 });
await new Promise((r) => setTimeout(r, 200));
await shot('recommendation-accuracy-mobile-light.png');

const overflow = await page.evaluate(() => {
  const h = document.getElementById('raaTestHost');
  const offenders = [...h.querySelectorAll('*')]
    .filter((el) => !el.closest('.daa-tablewrap') && el.offsetWidth > h.clientWidth + 2)
    .slice(0, 8)
    .map((el) => `${(el.className || el.tagName).toString().split(' ')[0]}[ow${el.offsetWidth}]`);
  const wrap = h.querySelector('.daa-tablewrap');
  return { offenders, tableContained: wrap ? wrap.offsetWidth <= h.clientWidth + 2 : true };
});
if (overflow.offenders.length) console.log('   offenders:', overflow.offenders.join(' | '));
check('no layout element exceeds 390px (page does not scroll sideways)', overflow.offenders.length === 0);
check('wide tables stay contained in their scroll region', overflow.tableContained);

await browser.close();
server.close();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
