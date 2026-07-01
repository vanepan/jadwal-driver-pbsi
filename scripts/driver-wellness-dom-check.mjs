/* driver-wellness-dom-check.mjs — Driver Wellness (v1.18.7 Executive Migration)
   DOM test. Serves the static app, loads the REAL wellness service + dashboard +
   detail drawer in headless Chromium, builds a model from seeded drivers +
   assignments, renders the Executive-UI dashboard, asserts the executive
   structure is present + emoji-free + dark-mode safe + zero console errors, opens
   the detail drawer from a clickable Executive-table row, and captures
   light/dark/mobile screenshots.
   Run: node scripts/driver-wellness-dom-check.mjs (exit 0 = pass) */

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
await page.goto(`http://localhost:${port}/scripts/driver-wellness-harness.html`, { waitUntil: 'networkidle0', timeout: 45000 });

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };

const result = await page.evaluate(async () => {
  const svc = await import('/js/services/driver-wellness-service.js');
  const dash = await import('/js/components/driver-wellness-dashboard.js');
  const drawer = await import('/js/components/driver-wellness-drawer.js');

  const NOW = '2026-06-25';
  const drivers = [
    { id: 'd1', name: 'Igo' }, { id: 'd2', name: 'Dedi' }, { id: 'd3', name: 'Aria' }, { id: 'd4', name: 'Grace' },
  ];
  const assignments = [];
  for (const day of ['2026-06-19', '2026-06-20', '2026-06-21', '2026-06-22', '2026-06-23', '2026-06-24', '2026-06-25']) {
    assignments.push({ driver: 'Igo', vehicle: 'Innova', date: day, startTime: '07:00', endTime: '19:00', status: 'assigned', distanceTravelled: 150 });
  }
  assignments.push({ driver: 'Igo', vehicle: 'Innova', date: '2026-06-24', startTime: '22:00', endTime: '23:30', status: 'assigned' });
  for (const day of ['2026-06-10', '2026-06-15', '2026-06-20']) assignments.push({ driver: 'Dedi', vehicle: 'Avanza', date: day, startTime: '09:00', endTime: '12:00', status: 'assigned' });
  assignments.push({ driver: 'Aria', vehicle: 'Avanza', date: '2026-06-23', startTime: '10:00', endTime: '11:00', status: 'assigned' });

  const model = svc.computeDriverWellnessModel({ drivers, assignments, now: NOW, window: '30d' });
  window.__model = model;

  dash.injectDriverWellnessStyles();
  const host = document.getElementById('host');
  host.innerHTML = dash.renderDriverWellnessDashboard(model);

  const root = host.querySelector('.dwi.daa');
  const q = (s) => root.querySelector(s);
  const qa = (s) => [...root.querySelectorAll(s)];
  const sections = qa('.v2-analytics-section');
  const sectionTitles = sections.map((e) => { const h = e.querySelector('.v2-analytics-section-header'); return h ? h.textContent.trim() : ''; });

  // Open the detail drawer for the lowest-health driver (first clickable row).
  const firstRow = root.querySelector('.exec-tr--click');
  const targetId = firstRow ? firstRow.getAttribute('data-row-id') : null;
  const driver = svc.findDriverWellness(model, targetId);
  drawer.openDriverWellnessDrawer(driver);
  const drw = document.getElementById('driverWellnessDrawer');
  const drwTitles = drw ? [...drw.querySelectorAll('.dwd-sec__title')].map((e) => e.textContent.trim()) : [];

  const dashStyle = document.getElementById('dwi-dashboard-styles');
  const daaStyle = document.getElementById('daa-dashboard-styles');
  const drwStyle = document.getElementById('dwd-drawer-styles');
  const noHardWhite = (s) => (s ? !/#fff(\b|;)|#ffffff/i.test(s.textContent) : true);

  // Explainability points (drawer) should sum to the driver's health score.
  const ptSum = drw ? [...drw.querySelectorAll('.dwd-bd__pts')].reduce((a, e) => a + (parseInt(e.textContent.replace('+', ''), 10) || 0), 0) : -1;

  const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}⭐★☆]/u;

  return {
    driverCount: model.summary.driverCount,
    hasRoot: !!root,
    header: (q('.exec-head__title') || {}).textContent || '',
    heroStats: qa('.daa-hero-stat').length,
    statusCard: qa('.daa-status').length,
    statusLevel: (q('.daa-status__level') || {}).textContent || '',
    kpiCount: (() => {
      const s = sections.find((e) => { const h = e.querySelector('.v2-analytics-section-header'); return h && h.textContent.trim() === 'Ringkasan Eksekutif'; });
      return s ? s.querySelectorAll('.v2-analytics-kpi-card').length : 0;
    })(),
    perfSparks: (() => {
      const s = sections.find((e) => { const h = e.querySelector('.v2-analytics-section-header'); return h && h.textContent.trim() === 'Performa Wellness'; });
      return s ? s.querySelectorAll('.exec-spark').length : 0;
    })(),
    ladderRows: qa('.daa-funnel__row').length,
    spotlights: qa('.daa-spot').length,
    execTables: qa('.exec-table').length,
    clickRows: qa('.exec-tr--click').length,
    timelineItems: qa('.daa-tl__li').length,
    sections: sections.length,
    titles: sectionTitles,
    windowToggle: qa('[data-dwi-window]').length,
    exportBtns: qa('[data-dwi-export]').length,
    noEmoji: !EMOJI.test(root.textContent || ''),
    reusesBaseStyles: !!daaStyle,
    noHardWhite: noHardWhite(dashStyle) && noHardWhite(daaStyle) && noHardWhite(drwStyle),
    // drawer (unchanged component)
    drawerOpen: !!drw,
    drawerSheet: !!(drw && drw.querySelector('.dwd-sheet')),
    drawerTitles: drwTitles,
    drawerHero: drw ? (drw.querySelector('.dwd-hero__num') || {}).textContent : '',
    explainRows: drw ? drw.querySelectorAll('.dwd-bd__row').length : 0,
    explainSum: ptSum,
    healthScore: driver ? driver.health.score : -2,
    riskMeters: drw ? drw.querySelectorAll('.dwd-risk').length : 0,
    drawerTimeline: drw ? drw.querySelectorAll('.dwd-tl li').length : 0,
    recItems: drw ? drw.querySelectorAll('.dwd-rec').length : 0,
    closeBtn: !!(drw && drw.querySelector('#dwdCloseBtn')),
  };
});

console.log('\n[model]');
check('seeded model has 4 drivers', result.driverCount === 4);

console.log('\n[structure — Executive UI]');
check('dashboard root .dwi.daa renders', result.hasRoot);
check('Executive header title present (.exec-head__title)', result.header.trim() === 'Driver Wellness');
check('hero stat band renders 3 headline figures', result.heroStats === 3);
check('ONE Executive Status card renders (not a checklist)', result.statusCard === 1);
check('Status card states a verdict level', result.statusLevel.trim().length > 0);
check('4 Executive KPI cards in summary section', result.kpiCount === 4);
check('Performa Wellness renders 2 performance sparklines', result.perfSparks === 2);
check('health band ladder rows render', result.ladderRows >= 1);
check('driver spotlight renders (most-at-risk)', result.spotlights === 1);
check('Executive detail table renders', result.execTables >= 1);
check('driver rows are clickable Executive-table rows (≥3)', result.clickRows >= 3);
check('wellness event feed renders (Riwayat)', result.timelineItems >= 1);
check('Executive section shells rendered (merged → ≥4)', result.sections >= 4);
check('window toggle (Today/7/30/90/YTD = 5, data-dwi-window preserved)', result.windowToggle === 5);
check('PDF + Excel export buttons (data-dwi-export preserved)', result.exportBtns === 2);

console.log('\n[sections present]');
const want = ['Ringkasan Eksekutif', 'Performa Wellness', 'Kondisi Driver', 'Riwayat Wellness'];
for (const w of want) check(`§ ${w}`, result.titles.some((t) => t === w));
// Guard against regressing to a medical / developer / analytical dashboard.
const banned = ['Distribusi', 'Tren Historis', 'Fatigue', 'Burnout Risk', 'Explainability', 'Capacity Health'];
for (const b of banned) check(`no legacy/medical/engineering term "${b}" in titles`, !result.titles.some((t) => t.includes(b)));

console.log('\n[row → drawer (component unchanged)]');
check('detail drawer opens from a clickable row (data-row-id)', result.drawerOpen && result.drawerSheet);
check('drawer hero shows health score', /\d/.test(result.drawerHero || ''));
const wantDrawer = ['Ringkasan', 'Skor Kesehatan', 'Komponen Wellness', 'Risiko Kelelahan', 'Risiko Burnout', 'Capacity Health', 'Pemulihan & Waktu Kerja', 'Linimasa Wellness', 'Rekomendasi'];
for (const w of wantDrawer) check(`§ drawer ${w}`, result.drawerTitles.some((t) => t.includes(w)));
check('explainability rows render + sum to health score', result.explainRows >= 2 && result.explainSum === result.healthScore);
check('fatigue + burnout risk meters render', result.riskMeters === 2);
check('drawer wellness timeline renders', result.drawerTimeline >= 2);
check('drawer recommendations render', result.recItems >= 1);
check('drawer Close button present', result.closeBtn);

console.log('\n[design / regression]');
check('reuses the shared design system (.daa-* styles present)', result.reusesBaseStyles);
check('zero emoji anywhere (operational briefing, not a medical dashboard)', result.noEmoji);
check('no hard-coded white in any stylesheet (dark-mode safe)', result.noHardWhite);
check('no console errors during render', consoleErrors.length === 0);
if (consoleErrors.length) consoleErrors.forEach((e) => console.log('   • ' + e.slice(0, 200)));

// ── screenshots ──────────────────────────────────────────────────────────
if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });
async function shot(name) { await page.screenshot({ path: path.join(SHOTS, name) }); console.log(`  📸 scratch/${name}`); }
console.log('\n[screenshots]');
await new Promise((r) => setTimeout(r, 250));
await shot('driver-wellness-desktop-light.png');

await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
await new Promise((r) => setTimeout(r, 200));
await shot('driver-wellness-desktop-dark.png');

await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
await page.setViewport({ width: 390, height: 800, deviceScaleFactor: 2 });
await new Promise((r) => setTimeout(r, 250));
await shot('driver-wellness-mobile-light.png');

const overflow = await page.evaluate(() => {
  const sheet = document.querySelector('.dwd-sheet');
  return sheet ? sheet.offsetWidth <= window.innerWidth + 2 : true;
});
check('mobile drawer sheet does not exceed viewport width', overflow);

await browser.close();
server.close();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
