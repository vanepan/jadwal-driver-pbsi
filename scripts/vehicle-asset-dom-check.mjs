/* vehicle-asset-dom-check.mjs — Vehicle Asset Intelligence (v1.18.0)
   DOM test. Serves the static app, loads the REAL vehicle-asset service + Fleet
   Dashboard + Apple-style detail drawer in headless Chromium, builds a model from
   seeded vehicle records, renders the dashboard (executive cards + health + fleet
   analytics), opens the detail drawer, and asserts every feature renders +
   dark-mode safe + responsive + zero console errors; captures light/dark/mobile
   screenshots.
   Run: node scripts/vehicle-asset-dom-check.mjs (exit 0 = pass) */

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
await page.goto(`http://localhost:${port}/scripts/vehicle-asset-harness.html`, { waitUntil: 'networkidle0', timeout: 45000 });

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };

const result = await page.evaluate(async () => {
  const svc = await import('/js/services/vehicle-asset-service.js');
  const dash = await import('/js/components/fleet-dashboard.js');
  const drawer = await import('/js/components/vehicle-detail-drawer.js');

  const NOW = '2026-06-26';
  const vehicles = [
    { id: 'v1', name: 'Innova', type: 'mobil', status: 'active', plateNumber: 'B 1 AAA', capacity: 7,
      brand: 'Toyota', model: 'Innova', year: '2022', fuel: 'Solar', transmission: 'Otomatis',
      engineNumber: 'E1', chassisNumber: 'C1', owner: 'PBSI', registrationRegion: 'DKI', odometer: '45000',
      acquisitionDate: '2022-01-10', acquisitionValue: '400000000',
      stnkNumber: 'S1', stnkExpiry: '2026-07-10', annualTaxDue: '2026-07-10',
      insuranceCompany: 'Sinarmas', policyNumber: 'P1', coverage: 'All Risk', insuranceExpiry: '2027-02-01',
      taxHistory: [{ date: '2026-01-05', amount: '3500000', officer: 'Budi', notes: 'lunas' }],
      createdAt: '2022-01-10T00:00:00Z', updatedAt: '2026-01-05T00:00:00Z' },
    { id: 'v2', name: 'Beat', type: 'motor', status: 'active', plateNumber: 'B 2 BBB', capacity: 2, brand: 'Honda', year: '2024', fuel: 'Bensin', transmission: 'Otomatis' },
    { id: 'v3', name: 'Ambulance Pelatnas', type: 'ambulance', status: 'maintenance', plateNumber: 'B 3 CCC', capacity: 4, brand: 'Toyota', year: '2019', fuel: 'Solar', transmission: 'Manual', stnkExpiry: '2025-01-01' },
    { id: 'v4', name: 'Luxio', type: 'mobil', status: 'retired', plateNumber: 'B 4 DDD', capacity: 7, brand: 'Daihatsu', year: '2012', fuel: 'Bensin', transmission: 'Manual' },
  ];

  const model = svc.computeFleetAssetModel({ vehicles, now: NOW });
  window.__model = model;

  dash.injectFleetDashboardStyles();
  const host = document.getElementById('host');
  host.innerHTML = dash.renderFleetDashboard(model);

  const root = host.querySelector('.fld');
  const qa = (s) => [...root.querySelectorAll(s)];

  // Open the detail drawer for the first asset.
  const asset = svc.findVehicleAsset(model, 'v1');
  drawer.openVehicleDetailDrawer(asset);
  const drw = document.getElementById('vehicleDetailDrawer');
  const drwTitles = drw ? [...drw.querySelectorAll('.vad-sec__title')].map((e) => e.textContent.trim()) : [];

  const dashStyle = document.getElementById('fld-dashboard-styles');
  const drwStyle = document.getElementById('vad-drawer-styles');
  const noHardWhite = (s) => (s ? !/#fff(\b|;)|#ffffff/i.test(s.textContent) : false);

  return {
    kpiCards: qa('.fld-kpi').length,
    healthBlock: !!root.querySelector('.fld-health__num'),
    distCharts: qa('.fld-dist').length,
    distRows: qa('.fld-row').length,
    drawerOpen: !!drw,
    drawerSheet: !!(drw && drw.querySelector('.vad-sheet')),
    drawerTitles: drwTitles,
    drawerHero: drw ? (drw.querySelector('.vad-hero__num') || {}).textContent : '',
    healthBars: drw ? drw.querySelectorAll('.vad-bd__row').length : 0,
    taxHistoryItems: drw ? drw.querySelectorAll('.vad-tl li').length : 0,
    noGallery: drw ? !/gallery/i.test(drw.textContent) : false,
    closeBtn: !!(drw && drw.querySelector('#vadCloseBtn')),
    noHardWhite: noHardWhite(dashStyle) && noHardWhite(drwStyle),
  };
});

console.log('\n[Feature 10 — Fleet dashboard]');
check('executive KPI cards render (≥9: total/active/maint/inactive/retired/cars/motor/amb/tax/stnk)', result.kpiCards >= 9);
check('average asset health block renders (Feature 11)', result.healthBlock);

console.log('\n[Feature 12 — Fleet analytics]');
check('fleet analytics distribution cards render (composition/age/fuel/transmission/docs/tax = 6)', result.distCharts === 6);
check('distribution rows render', result.distRows >= 6);

console.log('\n[Feature 4 — Detail drawer]');
check('detail drawer opens', result.drawerOpen && result.drawerSheet);
check('drawer hero shows asset health score', /\d/.test(result.drawerHero || ''));
const want = ['Overview', 'Registration', 'Tax', 'Insurance', 'Timeline', 'History'];
for (const w of want) check(`§ ${w}`, result.drawerTitles.some((t) => t.includes(w)));
check('NO Gallery section (reserved for future roadmap)', result.noGallery);

console.log('\n[Feature 11/7 — drawer content]');
check('overview health bars render', result.healthBars >= 3);
check('tax history / timeline items render', result.taxHistoryItems >= 2);
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
await shot('vehicle-asset-desktop-light.png');

await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
await new Promise((r) => setTimeout(r, 200));
await shot('vehicle-asset-desktop-dark.png');

await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
await page.setViewport({ width: 390, height: 800, deviceScaleFactor: 2 });
await new Promise((r) => setTimeout(r, 250));
await shot('vehicle-asset-mobile-light.png');

const overflow = await page.evaluate(() => {
  const sheet = document.querySelector('.vad-sheet');
  return sheet ? sheet.offsetWidth <= window.innerWidth + 2 : true;
});
check('mobile drawer sheet does not exceed viewport width', overflow);

await browser.close();
server.close();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
