/* driver-wellness-dom-check.mjs — Driver Wellness Intelligence (v1.17.6)
   DOM test. Serves the static app, loads the REAL wellness service + dashboard +
   detail drawer in headless Chromium, builds a model from seeded drivers +
   assignments, renders the dashboard, opens the Apple-style detail drawer, and
   asserts every feature section renders + dark-mode safe + responsive + zero
   console errors; captures light/dark/mobile screenshots.
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

  const root = host.querySelector('.dwi');
  const q = (s) => root.querySelector(s);
  const qa = (s) => [...root.querySelectorAll(s)];

  // Open the detail drawer for the lowest-health driver (first row).
  const firstRow = root.querySelector('[data-dwi-driver]');
  const targetId = firstRow ? firstRow.getAttribute('data-dwi-driver') : null;
  const driver = svc.findDriverWellness(model, targetId);
  drawer.openDriverWellnessDrawer(driver);
  const drw = document.getElementById('driverWellnessDrawer');
  const drwTitles = drw ? [...drw.querySelectorAll('.dwd-sec__title')].map((e) => e.textContent.trim()) : [];

  const dashStyle = document.getElementById('dwi-dashboard-styles');
  const drwStyle = document.getElementById('dwd-drawer-styles');
  const noHardWhite = (s) => (s ? !/#fff(\b|;)|#ffffff/i.test(s.textContent) : false);

  // Explainability points (drawer) should sum to the driver's health score.
  const ptSum = drw ? [...drw.querySelectorAll('.dwd-bd__pts')].reduce((a, e) => a + (parseInt(e.textContent.replace('+', ''), 10) || 0), 0) : -1;

  return {
    windowToggle: qa('[data-dwi-window]').length,
    exportBtns: qa('[data-dwi-export]').length,
    kpiCards: qa('.dwi-kpi').length,
    distCharts: qa('.dwi-dist').length,
    trendCards: qa('.dwi-trendcard').length,
    spark: qa('.dwi-spark__col').length,
    driverRows: qa('[data-dwi-driver]').length,
    drawerOpen: !!drw,
    drawerSheet: !!(drw && drw.querySelector('.dwd-sheet')),
    drawerTitles: drwTitles,
    drawerHero: drw ? (drw.querySelector('.dwd-hero__num') || {}).textContent : '',
    explainRows: drw ? drw.querySelectorAll('.dwd-bd__row').length : 0,
    explainSum: ptSum,
    healthScore: driver ? driver.health.score : -2,
    riskMeters: drw ? drw.querySelectorAll('.dwd-risk').length : 0,
    timelineItems: drw ? drw.querySelectorAll('.dwd-tl li').length : 0,
    recItems: drw ? drw.querySelectorAll('.dwd-rec').length : 0,
    closeBtn: !!(drw && drw.querySelector('#dwdCloseBtn')),
    noHardWhite: noHardWhite(dashStyle) && noHardWhite(drwStyle),
  };
});

console.log('\n[Feature 6 — Executive dashboard]');
check('window toggle (Today/7/30/90/YTD = 5)', result.windowToggle === 5);
check('PDF + Excel export buttons', result.exportBtns === 2);
check('executive KPI cards render (≥7)', result.kpiCards >= 7);

console.log('\n[Feature 11 — Visualization]');
check('distribution charts render (health/capacity/fatigue/burnout = 4)', result.distCharts === 4);
check('trend cards render (Feature 12, ≥5)', result.trendCards >= 5);
check('trend sparkline renders', result.spark >= 1);

console.log('\n[driver table → drawer]');
check('driver rows render', result.driverRows >= 3);
check('detail drawer opens (Feature 7)', result.drawerOpen && result.drawerSheet);
check('drawer hero shows health score', /\d/.test(result.drawerHero || ''));

console.log('\n[Feature 7 — Drawer sections]');
const want = ['Ringkasan', 'Skor Kesehatan', 'Komponen Wellness', 'Risiko Kelelahan', 'Risiko Burnout', 'Capacity Health', 'Pemulihan & Waktu Kerja', 'Linimasa Wellness', 'Rekomendasi'];
for (const w of want) check(`§ ${w}`, result.drawerTitles.some((t) => t.includes(w)));

console.log('\n[Feature 10/3/4/8/9 — content]');
check('explainability rows render + sum to health score', result.explainRows >= 2 && result.explainSum === result.healthScore);
check('fatigue + burnout risk meters render', result.riskMeters === 2);
check('wellness timeline renders (Feature 8)', result.timelineItems >= 2);
check('recommendations render (Feature 9)', result.recItems >= 1);
check('drawer Close button present', result.closeBtn);

console.log('\n[design / regression]');
check('scoped stylesheets use CSS vars (no hard-coded white — dark-mode safe)', result.noHardWhite);
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
