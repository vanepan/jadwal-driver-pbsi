/* dispatch-analytics-dom-check.mjs — Dispatch Intelligence Analytics (v1.17.0)
   DOM test. Serves the static app, loads the REAL engine + dashboard modules in
   headless Chromium, computes the analytics model from a seeded decision
   history, renders the dashboard, asserts every section is present + dark-mode
   safe + zero console errors, and captures light/dark/mobile screenshots.
   Run: node scripts/dispatch-analytics-dom-check.mjs (exit 0 = pass) */

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
  // Ignore static-asset 404s (favicon/fonts) from the bare harness — they are
  // environment noise, not dashboard render errors.
  if (/Failed to load resource/i.test(m.text())) return;
  consoleErrors.push('console.error: ' + m.text());
});

await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
// Isolated harness (platform tokens, no app boot) so the dashboard renders alone.
await page.goto(`http://localhost:${port}/scripts/dispatch-analytics-harness.html`, { waitUntil: 'networkidle0', timeout: 45000 });

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };

// Build model + render the dashboard into a clean full-viewport overlay host.
const result = await page.evaluate(async () => {
  const engine = await import('/js/analytics/dispatch-analytics-engine.js');
  const dash = await import('/js/components/dispatch-analytics-dashboard.js');

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
  const reasons = ['Driver tersedia, beban rendah', 'Kapasitas kendaraan sesuai', 'Tidak ada konflik jadwal'];
  const overrideReasons = ['Driver lebih familiar rute', 'Kapasitas lebih besar diperlukan', 'Permintaan khusus bidang'];

  let day = 24;
  for (let i = 0; i < 22; i++) {
    const id = 'r' + i;
    const recD = drivers[i % drivers.length];
    const recV = vehicles[i % vehicles.length];
    const outcome = outcomes[i % outcomes.length];
    const score = [96, 91, 88, 82, 74, 63][i % 6];
    const dnum = Math.max(1, day - Math.floor(i / 3));
    const dateStr = `2026-06-${String(dnum).padStart(2, '0')}`;
    const ts = `${dateStr}T${String(8 + (i % 8)).padStart(2, '0')}:30:00`;
    const bidang = bidangs[i % bidangs.length];
    requests.push({ id, requesterName: bidang, purpose: dests[i % dests.length], createdAt: `${dateStr}T07:00:00`, approvedAt: ts });
    const selD = outcome === 'DRIVER_OVERRIDE' || outcome === 'FULL_OVERRIDE' ? drivers[(i + 1) % drivers.length] : recD;
    const selV = outcome === 'VEHICLE_OVERRIDE' || outcome === 'FULL_OVERRIDE' ? vehicles[(i + 1) % vehicles.length] : recV;
    overrideLogs.push({
      recommendationId: id, recommendedDriverId: recD.id, recommendedVehicleId: recV.id,
      selectedDriverId: selD.id, selectedVehicleId: selV.id, dispatchScore: score,
      outcome, overridden: outcome !== 'ACCEPTED',
      reason: outcome !== 'ACCEPTED' ? overrideReasons[i % overrideReasons.length] : '',
      approvedBy: 'Admin Operasi', timestamp: ts,
    });
    requestRecommendations[id] = { requestId: id, recommendedDriverId: recD.id, recommendedVehicleId: recV.id, dispatchScore: score, reasonSummary: reasons[i % reasons.length], generatedAt: `${dateStr}T06:59:00` };
  }
  // assignments for capacity / conflict realism
  const assignments = [];
  for (let i = 0; i < 30; i++) {
    const d = drivers[i % drivers.length];
    const v = vehicles[i % vehicles.length];
    const dnum = 24 - (i % 20);
    assignments.push({ driverId: d.id, driver: d.name, vehicle: v.name, date: `2026-06-${String(Math.max(1, dnum)).padStart(2, '0')}`, startTime: '08:00', endTime: '11:00', status: 'assigned' });
  }
  // a double-booking to make conflict-avoidance < 100 for d1
  assignments.push({ driverId: 'd1', driver: 'Andi Saputra', vehicle: 'Toyota Avanza', date: '2026-06-24', startTime: '09:00', endTime: '12:00', status: 'assigned' });

  const model = engine.computeDispatchAnalyticsModel({ overrideLogs, requestRecommendations, requests, drivers, vehicles, assignments, now: NOW });

  dash.injectDispatchAnalyticsStyles();
  const host = document.createElement('div');
  host.id = 'daaTestHost';
  host.style.cssText = 'position:fixed;inset:0;overflow:auto;z-index:99999;padding:24px;background:var(--surface-2);';
  host.innerHTML = dash.renderDispatchAnalyticsDashboard(model, { trendWindow: '30d' });
  document.body.appendChild(host);

  const root = host.querySelector('.daa');
  const q = (s) => host.querySelector(s);
  const styleEl = document.getElementById('daa-dashboard-styles');
  // v1.18.5 — Executive UI structure. KPIs use .v2-analytics-kpi-card; sections
  // use the Driver Analytics shell (.v2-analytics-section + -header); tables use
  // .exec-table; sparkline is .exec-spark. The inner micro-viz (distribution/
  // funnel/timeline/reason chips) keep the shared .daa-* classes.
  const sections = [...host.querySelectorAll('.v2-analytics-section')];
  const firstTable = host.querySelector('.exec-table');
  // Broad emoji detector — the migration forbids ALL emoji (★ ratings now gone).
  const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}⭐★☆]/u;
  return {
    decisions: model.totals.decisions,
    hasRoot: !!root,
    header: (q('.exec-head__title') || {}).textContent || '',
    // Summary section is located by title (Status card + hero band precede it).
    kpiCount: (() => {
      const s = sections.find((e) => { const h = e.querySelector('.v2-analytics-section-header'); return h && h.textContent.trim() === 'Ringkasan Eksekutif'; });
      return s ? s.querySelectorAll('.v2-analytics-kpi-card').length : 0;
    })(),
    driverTable: !!firstTable && firstTable.querySelectorAll('tbody tr').length,
    sections: sections.length,
    funnelRows: host.querySelectorAll('.daa-funnel__row').length,
    timelineItems: host.querySelectorAll('.daa-tl__li').length,
    reasonItems: host.querySelectorAll('.daa-reasons__li').length,
    // v1.18.5.3 — hero stat band (3 figures), ONE Executive Status card, and the
    // premium entity spotlights.
    heroStats: host.querySelectorAll('.daa-hero-stat').length,
    statusCard: host.querySelectorAll('.daa-status').length,
    statusLevel: (q('.daa-status__level') || {}).textContent || '',
    spotlights: host.querySelectorAll('.daa-spot').length,
    // Performa Dispatch (merged Trend + Quality) carries the two movement
    // sparklines (acceptance + admin-change).
    trendSparks: (() => {
      const t = sections.find((e) => { const h = e.querySelector('.v2-analytics-section-header'); return h && h.textContent.trim() === 'Performa Dispatch'; });
      return t ? t.querySelectorAll('.exec-spark').length : 0;
    })(),
    toggleBtns: host.querySelectorAll('[data-daa-window]').length,
    exportBtns: host.querySelectorAll('[data-daa-export]').length,
    sparklines: host.querySelectorAll('.exec-spark').length,
    execTables: host.querySelectorAll('.exec-table').length,
    titles: sections.map((e) => { const h = e.querySelector('.v2-analytics-section-header'); return h ? h.textContent.trim() : ''; }),
    noEmoji: !EMOJI.test(host.textContent || ''),
    noHardWhite: styleEl ? !/#fff(\b|;)|#ffffff/i.test(styleEl.textContent) : false,
  };
});

console.log('\n[model]');
check('seeded model has 22 decisions', result.decisions === 22);

console.log('\n[structure — Executive UI]');
check('dashboard root .daa renders', result.hasRoot);
check('Executive header title present (.exec-head__title)', result.header.trim() === 'Dispatch Intelligence');
check('4 Executive KPI cards in summary section (deduplicated)', result.kpiCount === 4);
check('hero stat band renders 3 headline figures', result.heroStats === 3);
check('ONE Executive Status card renders (not a checklist)', result.statusCard === 1);
check('Status card states a verdict level', result.statusLevel.trim().length > 0);
check('entity spotlights render (driver + vehicle + bidang)', result.spotlights === 3);
check('Executive tables render (driver/vehicle/bidang)', result.execTables >= 3);
check('driver table has rows', result.driverTable >= 1);
check('Executive section shells rendered (merged → 6)', result.sections >= 6);
check('quality funnel has 4 rows', result.funnelRows >= 4);
check('timeline renders events', result.timelineItems >= 1);
check('decision-history reason items render', result.reasonItems >= 1);
check('Performa Dispatch renders 2 movement sparklines', result.trendSparks === 2);
check('trend window toggle has 4 buttons (data-daa-window preserved)', result.toggleBtns === 4);
check('export buttons (PDF + Excel) present (data-daa-export preserved)', result.exportBtns === 2);
check('Executive sparklines render (SVG)', result.sparklines >= 1);

console.log('\n[sections present]');
// Executive briefing vocabulary (v1.18.5.3): merged sections, operational
// language only — no engineering terms and no leftover pre-merge section titles.
const want = ['Ringkasan Eksekutif', 'Performa Dispatch', 'Ringkasan Driver', 'Ringkasan Kendaraan', 'Ringkasan Bidang', 'Riwayat Keputusan'];
for (const w of want) check(`§ ${w}`, result.titles.some((t) => t.trim() === w));
// Guard against regressing to engineering vocabulary or un-merged sections.
const banned = ['Intelijen', 'Override', 'Confidence', 'Explainability', 'Linimasa', 'Distribusi', 'Kualitas Rekomendasi', 'Tren', 'Alasan'];
for (const b of banned) check(`no legacy/engineering term "${b}" in titles`, !result.titles.some((t) => t.includes(b)));

console.log('\n[design / regression]');
check('zero emoji anywhere (★ ratings replaced with numeric)', result.noEmoji);
check('scoped stylesheet uses CSS vars (no hard-coded white — dark-mode safe)', result.noHardWhite);
check('no console errors during render', consoleErrors.length === 0);
if (consoleErrors.length) consoleErrors.forEach((e) => console.log('   • ' + e.slice(0, 200)));

// ── screenshots ──────────────────────────────────────────────────────────
if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });
async function shot(name) {
  await page.screenshot({ path: path.join(SHOTS, name), fullPage: true });
  console.log(`  📸 scratch/${name}`);
}
console.log('\n[screenshots]');
// Hide the app's own chrome (boot splash etc.) so the captures show only the dashboard.
await page.evaluate(() => {
  [...document.body.children].forEach((el) => { if (el.id !== 'daaTestHost') el.style.display = 'none'; });
});
await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
await new Promise((r) => setTimeout(r, 150));
await shot('dispatch-analytics-desktop-light.png');

await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
await new Promise((r) => setTimeout(r, 150));
await shot('dispatch-analytics-desktop-dark.png');

await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
await page.setViewport({ width: 390, height: 800, deviceScaleFactor: 2 });
await new Promise((r) => setTimeout(r, 200));
await shot('dispatch-analytics-mobile-light.png');

// No horizontal PAGE scroll at mobile width. Wide tables are allowed to scroll
// internally inside `.exec-table-wrap` (an intentional, contained scroll region),
// so the only failure is a LAYOUT element wider than the viewport OUTSIDE that
// region (which would force the whole page to scroll sideways).
const overflow = await page.evaluate(() => {
  const h = document.getElementById('daaTestHost');
  const offenders = [...h.querySelectorAll('*')]
    .filter((el) => !el.closest('.exec-table-wrap') && el.offsetWidth > h.clientWidth + 2)
    .slice(0, 8)
    .map((el) => `${(el.className || el.tagName).toString().split(' ')[0]}[ow${el.offsetWidth}]`);
  const wrap = h.querySelector('.exec-table-wrap');
  return { clientW: h.clientWidth, offenders, tableContained: wrap ? wrap.offsetWidth <= h.clientWidth + 2 : true };
});
if (overflow.offenders.length) console.log('   offenders:', overflow.offenders.join(' | '));
check(`no layout element exceeds 390px (page does not scroll sideways)`, overflow.offenders.length === 0);
check('wide tables stay contained in their scroll region (offsetWidth ≤ viewport)', overflow.tableContained);

await browser.close();
server.close();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
