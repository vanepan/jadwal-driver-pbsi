/* recommendation-accuracy-dom-check.mjs — Recommendation Accuracy (v1.18.6)
   DOM test. Serves the static app, loads the REAL engine + dashboard modules in
   headless Chromium, computes the accuracy model from a seeded decision history,
   renders the Executive-UI dashboard, asserts the executive structure is present
   + emoji-free + dark-mode safe + zero console errors, exercises live search,
   and captures light/dark/mobile screenshots.
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
    // Spread across Mar–Jun 2026 so the monthly learning-trend series has ≥2
    // points (a "learning trend" is inherently multi-month; a single month can't
    // show movement).
    const mo = ['03', '04', '05', '06'][Math.floor(i / 6)];
    const dnum = (i % 6) * 4 + 1;
    const dateStr = `2026-${mo}-${String(dnum).padStart(2, '0')}`;
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
  host.innerHTML = dash.renderRecommendationAccuracyDashboard(model, { trendWindow: 'ytd' });
  document.body.appendChild(host);

  const q = (s) => host.querySelector(s);
  const styleEl = document.getElementById('raa-dashboard-styles');
  const daaStyleEl = document.getElementById('daa-dashboard-styles');
  // v1.18.6 — Executive UI structure. KPIs use .v2-analytics-kpi-card; sections
  // use the Driver Analytics shell (.v2-analytics-section + -header); tables use
  // .exec-table; sparkline is .exec-spark. The inner micro-viz (hero band, status,
  // spotlight, movement, calibration ladder) keep the shared .daa-* classes.
  const sections = [...host.querySelectorAll('.v2-analytics-section')];
  const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}⭐★☆]/u;
  return {
    decisions: model.totals.decisions,
    hasRoot: !!q('.daa.raa'),
    header: (q('.exec-head__title') || {}).textContent || '',
    kpiCount: (() => {
      const s = sections.find((e) => { const h = e.querySelector('.v2-analytics-section-header'); return h && h.textContent.trim() === 'Ringkasan Eksekutif'; });
      return s ? s.querySelectorAll('.v2-analytics-kpi-card').length : 0;
    })(),
    sections: sections.length,
    heroStats: host.querySelectorAll('.daa-hero-stat').length,
    statusCard: host.querySelectorAll('.daa-status').length,
    statusLevel: (q('.daa-status__level') || {}).textContent || '',
    spotlights: host.querySelectorAll('.daa-spot').length,
    calRows: host.querySelectorAll('.daa-funnel__row').length,
    trendSparks: (() => {
      const t = sections.find((e) => { const h = e.querySelector('.v2-analytics-section-header'); return h && h.textContent.trim() === 'Performa Akurasi'; });
      return t ? t.querySelectorAll('.exec-spark').length : 0;
    })(),
    execTables: host.querySelectorAll('.exec-table').length,
    searchInputs: host.querySelectorAll('[data-raa-search]').length,
    sortSelects: host.querySelectorAll('[data-raa-sort]').length,
    toggleBtns: host.querySelectorAll('[data-raa-window]').length,
    exportBtns: host.querySelectorAll('[data-raa-export]').length,
    titles: sections.map((e) => { const h = e.querySelector('.v2-analytics-section-header'); return h ? h.textContent.trim() : ''; }),
    fhcPct: model.falseHighConfidence.falseHighConfidencePct,
    noEmoji: !EMOJI.test(host.textContent || ''),
    reusesBaseStyles: !!daaStyleEl,
    noHardWhite: styleEl && daaStyleEl ? !/#fff(\b|;)|#ffffff/i.test(styleEl.textContent + daaStyleEl.textContent) : false,
  };
});

console.log('\n[model]');
check('seeded model has 24 decisions', result.decisions === 24);
check('false-high-confidence still computed (business value preserved)', result.fhcPct > 0);

console.log('\n[structure — Executive UI]');
check('dashboard root .daa.raa renders', result.hasRoot);
check('Executive header title present (.exec-head__title)', result.header.trim() === 'Recommendation Accuracy');
check('4 Executive KPI cards in summary section (reduced from 8)', result.kpiCount === 4);
check('hero stat band renders 3 headline figures', result.heroStats === 3);
check('ONE Executive Status card renders (not a checklist)', result.statusCard === 1);
check('Status card states a verdict level', result.statusLevel.trim().length > 0);
check('entity spotlights render (driver + vehicle)', result.spotlights === 2);
check('Executive tables render (driver + vehicle + history)', result.execTables >= 3);
check('Executive section shells rendered (merged → 5)', result.sections >= 5);
check('Performa Akurasi renders 2 movement sparklines', result.trendSparks === 2);
check('calibration ladder rows render', result.calRows >= 1);
check('search inputs present (driver + vehicle)', result.searchInputs === 2);
check('sort selects present (driver + vehicle)', result.sortSelects === 2);
check('learning-trend toggle has 4 buttons (data-raa-window preserved)', result.toggleBtns === 4);
check('export buttons (PDF + Excel) present (data-raa-export preserved)', result.exportBtns === 2);

console.log('\n[sections present]');
const want = ['Ringkasan Eksekutif', 'Performa Akurasi', 'Ringkasan Driver', 'Ringkasan Kendaraan', 'Riwayat Rekomendasi'];
for (const w of want) check(`§ ${w}`, result.titles.some((t) => t.trim() === w));
// Guard against regressing to engineering vocabulary or un-merged sections.
const banned = ['Kalibrasi', 'Confidence', 'Keparahan', 'Override', 'Analitik', 'Tren Pembelajaran', 'Insight', 'False High'];
for (const b of banned) check(`no legacy/engineering term "${b}" in titles`, !result.titles.some((t) => t.includes(b)));

console.log('\n[design / regression]');
check('reuses the shared design system (.daa-* styles present)', result.reusesBaseStyles);
check('zero emoji anywhere (★ ratings replaced with numeric)', result.noEmoji);
check('no hard-coded white in either stylesheet (dark-mode safe)', result.noHardWhite);
check('no console errors during render', consoleErrors.length === 0);
if (consoleErrors.length) consoleErrors.forEach((e) => console.log('   • ' + e.slice(0, 200)));

// ── interaction: live search filters the driver table ──────────────────────
console.log('\n[interaction]');
const searchResult = await page.evaluate(async () => {
  const host = document.getElementById('raaTestHost');
  const dash = await import('/js/components/recommendation-accuracy-dashboard.js');
  const engine = await import('/js/analytics/recommendation-accuracy-engine.js');
  const before = host.querySelectorAll('.exec-table')[0].querySelectorAll('tbody tr').length;
  const drivers = [{ id: 'd1', name: 'Andi Saputra' }, { id: 'd2', name: 'Budi Hartono' }];
  const overrideLogs = [
    { recommendationId: 'r1', recommendedDriverId: 'd1', recommendedVehicleId: 'v1', selectedDriverId: 'd1', selectedVehicleId: 'v1', dispatchScore: 96, outcome: 'ACCEPTED', overridden: false, timestamp: '2026-06-24T09:00:00' },
    { recommendationId: 'r2', recommendedDriverId: 'd2', recommendedVehicleId: 'v1', selectedDriverId: 'd2', selectedVehicleId: 'v1', dispatchScore: 90, outcome: 'ACCEPTED', overridden: false, timestamp: '2026-06-24T09:00:00' },
  ];
  const model = engine.computeRecommendationAccuracyModel({ overrideLogs, drivers, now: '2026-06-25T12:00:00' });
  host.innerHTML = dash.renderRecommendationAccuracyDashboard(model, { trendWindow: '30d', driverSearch: 'Andi' });
  const after = host.querySelectorAll('.exec-table')[0].querySelectorAll('tbody tr').length;
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
    const mo = ['03', '04', '05', '06'][Math.floor(i / 6)]; const dnum = (i % 6) * 4 + 1;
    const dateStr = `2026-${mo}-${String(dnum).padStart(2, '0')}`;
    const ts = `${dateStr}T${String(8 + (i % 8)).padStart(2, '0')}:30:00`;
    const selD = outcome === 'DRIVER_OVERRIDE' || outcome === 'FULL_OVERRIDE' ? drivers[(i + 1) % drivers.length] : recD;
    const selV = outcome === 'VEHICLE_OVERRIDE' || outcome === 'FULL_OVERRIDE' ? vehicles[(i + 1) % vehicles.length] : recV;
    overrideLogs.push({ recommendationId: id, recommendedDriverId: recD.id, recommendedVehicleId: recV.id, selectedDriverId: selD.id, selectedVehicleId: selV.id, dispatchScore: ss, outcome, overridden: outcome !== 'ACCEPTED', reason: outcome !== 'ACCEPTED' ? reasons[i % reasons.length] : '', timestamp: ts });
    requestRecommendations[id] = { requestId: id, recommendedDriverId: recD.id, recommendedVehicleId: recV.id, dispatchScore: rs, reasonSummary: 'Driver tersedia', generatedAt: `${dateStr}T06:59:00` };
  }
  const model = engine.computeRecommendationAccuracyModel({ overrideLogs, requestRecommendations, drivers, vehicles, now: '2026-06-25T12:00:00' });
  host.innerHTML = dash.renderRecommendationAccuracyDashboard(model, { trendWindow: 'ytd' });
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
    .filter((el) => !el.closest('.exec-table-wrap') && el.offsetWidth > h.clientWidth + 2)
    .slice(0, 8)
    .map((el) => `${(el.className || el.tagName).toString().split(' ')[0]}[ow${el.offsetWidth}]`);
  const wrap = h.querySelector('.exec-table-wrap');
  return { offenders, tableContained: wrap ? wrap.offsetWidth <= h.clientWidth + 2 : true };
});
if (overflow.offenders.length) console.log('   offenders:', overflow.offenders.join(' | '));
check('no layout element exceeds 390px (page does not scroll sideways)', overflow.offenders.length === 0);
check('wide tables stay contained in their scroll region', overflow.tableContained);

await browser.close();
server.close();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
