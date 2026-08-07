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
      complianceHistory: [
        { id: 'c1', type: 'annual_tax', renewalDate: '2025-07-01', expiryDate: '2026-07-10', amount: 3500000, paymentMethod: 'cash', receiptNumber: 'RC-1', notes: '', officer: 'Budi', createdAt: '2025-07-01T00:00:00Z', updatedAt: '2025-07-01T00:00:00Z' },
        // Phase 5 (v1.29.16) — Insurance Ledger: same complianceHistory array, type:'insurance'.
        { id: 'c-ins1', type: 'insurance', renewalDate: '2026-02-01', expiryDate: '2027-02-01', amount: 1200000, paymentMethod: 'transfer', receiptNumber: 'POL-1', notes: '', officer: 'Budi', createdAt: '2026-02-01T00:00:00Z', updatedAt: '2026-02-01T00:00:00Z' },
      ],
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

  // v1.18.2 — thin Executive Summary strip (.vms) + executive asset grid below.
  const root = host.querySelector('.vms');
  const qa = (s) => (root ? [...root.querySelectorAll(s)] : []);

  // Render the executive asset cards too (the inventory hero).
  const cardHost = document.createElement('div');
  cardHost.className = 'vm-grid';
  // buildVehicleCard lives in app.js; here we assert the model + drawer instead.

  // Open the detail drawer for the first asset (with lifecycle handlers so the
  // footer actions render — cards carry none; the drawer is the action surface).
  const asset = svc.findVehicleAsset(model, 'v1');
  const noop = () => {};
  const fullHandlers = { onEdit: noop, onToggle: noop, onArchive: noop, onRestore: noop, onDelete: noop, onRenewSTNK: noop, onRenewInsurance: noop };
  drawer.openVehicleDetailDrawer(asset, fullHandlers);
  const drw = document.getElementById('execDrawerOverlay');
  const drwTitles = drw ? [...drw.querySelectorAll('.exec-drawer-sec__h')].map((e) => e.textContent.trim()) : [];

  // ── Vehicle Compliance & Financial History ────────────────────────────────
  // openExecutiveDrawer's close of any PRIOR overlay is async (CSS transition
  // / 260ms fallback) — reopening back-to-back leaves two `#execDrawerOverlay`
  // nodes briefly coexisting, so every step below waits for the previous
  // drawer to actually finish removing before opening/querying the next one.
  const drainDrawer = () => new Promise((r) => setTimeout(r, 350));

  const renewBtn = drw ? drw.querySelector('[data-exec-drawer-action="renew-stnk"]') : null;
  const taxSectionText = drw ? (drw.textContent || '') : '';
  document.getElementById('execDrawerOverlay').querySelector('.exec-drawer__close').click();
  await drainDrawer();

  // Backward compat: callers that don't pass onRenewSTNK (e.g. the Prediction
  // view drawer) must not gain the button.
  drawer.openVehicleDetailDrawer(asset, { onEdit: noop, onToggle: noop, onArchive: noop, onRestore: noop, onDelete: noop });
  const drwNoRenew = document.getElementById('execDrawerOverlay');
  const noRenewBtnWhenOmitted = !drwNoRenew.querySelector('[data-exec-drawer-action="renew-stnk"]');
  const noInsuranceRenewBtnWhenOmitted = !drwNoRenew.querySelector('[data-exec-drawer-action="renew-insurance"]');
  drwNoRenew.querySelector('.exec-drawer__close').click();
  await drainDrawer();

  // 'renew-stnk' must NOT close the drawer (spec: "Do NOT close the drawer
  // automatically") — every other footer action still does (regression guard).
  drawer.openVehicleDetailDrawer(asset, fullHandlers);
  document.getElementById('execDrawerOverlay').querySelector('[data-exec-drawer-action="renew-stnk"]').click();
  await drainDrawer();
  const openAfterRenewClick = !!document.getElementById('execDrawerOverlay');

  document.getElementById('execDrawerOverlay').querySelector('[data-exec-drawer-action="toggle"]').click();
  await drainDrawer();
  const closedAfterToggleClick = !document.getElementById('execDrawerOverlay');

  // ── Insurance Ledger (Phase 5, v1.29.16) ─────────────────────────────────
  // 'renew-insurance' must also NOT close the drawer (same interaction
  // pattern as STNK). Also verifies the Insurance section shows its OWN
  // filtered ledger view (human-readable, not the raw type string) while the
  // Tax section's Riwayat Kepatuhan excludes insurance-type entries — one
  // ledger, no duplicate rendering of the same record in two sections.
  drawer.openVehicleDetailDrawer(asset, fullHandlers);
  const drwIns = document.getElementById('execDrawerOverlay');
  const insRenewBtn = drwIns.querySelector('[data-exec-drawer-action="renew-insurance"]');
  const secByTitle = (t) => {
    const h = [...drwIns.querySelectorAll('.exec-drawer-sec__h')].find((e) => e.textContent.trim() === t);
    return h ? h.closest('.exec-drawer-sec') : null;
  };
  const taxSecText = (secByTitle('Tax') || {}).textContent || '';
  const insSecText = (secByTitle('Insurance') || {}).textContent || '';
  drwIns.querySelector('[data-exec-drawer-action="renew-insurance"]').click();
  await drainDrawer();
  const openAfterInsuranceRenewClick = !!document.getElementById('execDrawerOverlay');
  document.getElementById('execDrawerOverlay').querySelector('.exec-drawer__close').click();
  await drainDrawer();

  // refreshVehicleDetailDrawer updates the SAME overlay element in place
  // (proves no close/reopen) and reflects a newly-added compliance record.
  drawer.openVehicleDetailDrawer(asset, fullHandlers);
  const overlayBeforeRefresh = document.getElementById('execDrawerOverlay');
  const vehiclesAfterRenewal = vehicles.map((v) => v.id !== 'v1' ? v : {
    ...v,
    complianceHistory: [...v.complianceHistory, {
      id: 'c2', type: 'annual_tax', renewalDate: '2026-07-05', expiryDate: '2027-07-10',
      amount: 3800000, paymentMethod: 'transfer', receiptNumber: 'RC-2', notes: '', officer: 'Siti',
    }],
  });
  const refreshedAsset = svc.findVehicleAsset(svc.computeFleetAssetModel({ vehicles: vehiclesAfterRenewal, now: NOW }), 'v1');
  const refreshOk = drawer.refreshVehicleDetailDrawer(refreshedAsset, fullHandlers);
  const overlayAfterRefresh = document.getElementById('execDrawerOverlay');
  const sameOverlayInstance = overlayBeforeRefresh === overlayAfterRefresh;
  const refreshedBodyText = overlayAfterRefresh.textContent || '';

  const dashStyle = document.getElementById('vm-summary-styles');
  const drwStyle = document.getElementById('vad-hero-styles');
  const noHardWhite = (s) => (s ? !/#fff(\b|;)|#ffffff/i.test(s.textContent) : false);
  // Emoji guard — the redesign forbids emoji in rendered output.
  const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

  return {
    summaryStrip: !!root,
    kpiCards: qa('.v2-analytics-kpi-card').length,
    dashNoEmoji: !EMOJI.test(host.textContent || ''),
    drawerOpen: !!drw,
    drawerSheet: !!(drw && drw.querySelector('.exec-drawer')),
    drawerTitles: drwTitles,
    drawerHero: drw ? (drw.querySelector('.exec-vad-hero__num') || {}).textContent : '',
    healthBars: drw ? drw.querySelectorAll('.exec-vad-bd__row').length : 0,
    taxHistoryItems: drw ? drw.querySelectorAll('.exec-drawer-tl__li').length : 0,
    operationalSection: drwTitles.some((t) => t.includes('Operational')),
    footerActions: drw ? !!(drw.querySelector('[data-exec-drawer-action="toggle"]') && drw.querySelector('[data-exec-drawer-action="archive"]') && drw.querySelector('[data-exec-drawer-action="edit"]')) : false,
    drawerNoEmoji: drw ? !EMOJI.test(drw.textContent || '') : false,
    noGallery: drw ? !/gallery/i.test(drw.textContent) : false,
    closeBtn: !!(drw && drw.querySelector('.exec-drawer__close')),
    noHardWhite: noHardWhite(dashStyle) && noHardWhite(drwStyle),
    // Vehicle Compliance & Financial History
    renewBtn: !!renewBtn,
    renewBtnIsPrimary: !!(renewBtn && renewBtn.classList.contains('exec-drawer-btn--primary')),
    noRenewBtnWhenOmitted,
    complianceTimelineHumanReadable: /STNK Diperpanjang/.test(taxSectionText) && /Rp\s*3\.500\.000/.test(taxSectionText) && !/annual_tax/.test(taxSectionText),
    openAfterRenewClick,
    closedAfterToggleClick,
    refreshOk,
    sameOverlayInstance,
    refreshedShowsNewRecord: /3\.800\.000/.test(refreshedBodyText),
    // Insurance Ledger (Phase 5, v1.29.16)
    insRenewBtn: !!insRenewBtn,
    noInsuranceRenewBtnWhenOmitted,
    openAfterInsuranceRenewClick,
    insuranceHistoryShowsOwnRecord: /Asuransi Diperpanjang/.test(insSecText) && /Rp\s*1\.200\.000/.test(insSecText) && !/\binsurance\b/.test(insSecText),
    taxSectionExcludesInsuranceEntries: /STNK Diperpanjang/.test(taxSecText) && !/Asuransi Diperpanjang/.test(taxSecText),
  };
});

console.log('\n[Executive Summary — thin strip]');
check('summary strip renders (.vms)', result.summaryStrip);
check('exactly 5 executive KPI tiles', result.kpiCards === 5);
check('dashboard has zero emoji', result.dashNoEmoji);

console.log('\n[Detail drawer]');
check('detail drawer opens', result.drawerOpen && result.drawerSheet);
check('drawer hero shows asset health score', /\d/.test(result.drawerHero || ''));
const want = ['Overview', 'Operational', 'Registration', 'Tax', 'Insurance', 'Maintenance', 'History'];
for (const w of want) check(`§ ${w}`, result.drawerTitles.some((t) => t.includes(w)));
check('Operational section present (new)', result.operationalSection);
check('footer carries lifecycle actions (toggle/archive/edit)', result.footerActions);
check('drawer has zero emoji', result.drawerNoEmoji);
check('NO Gallery section (reserved for future roadmap)', result.noGallery);

console.log('\n[Feature 11/7 — drawer content]');
check('overview health bars render', result.healthBars >= 3);
check('tax history / timeline items render', result.taxHistoryItems >= 2);

console.log('\n[Vehicle Compliance & Financial History]');
check('footer shows Perpanjang STNK when onRenewSTNK supplied', result.renewBtn);
check('Perpanjang STNK is the primary footer action', result.renewBtnIsPrimary);
check('footer omits Perpanjang STNK when onRenewSTNK is not supplied (back-compat)', result.noRenewBtnWhenOmitted);
check('compliance timeline is human-readable (no raw type/field names)', result.complianceTimelineHumanReadable);
check('renew-stnk footer action does NOT close the drawer', result.openAfterRenewClick);
check('other footer actions still close the drawer (regression guard)', result.closedAfterToggleClick);
check('refreshVehicleDetailDrawer updates the SAME overlay instance (no close/reopen)', result.sameOverlayInstance);
check('refreshVehicleDetailDrawer reflects the newly-added compliance record', result.refreshOk && result.refreshedShowsNewRecord);
check('drawer Close button present', result.closeBtn);

console.log('\n[Insurance Ledger — Phase 5, v1.29.16]');
check('footer shows Perpanjang Asuransi when onRenewInsurance supplied', result.insRenewBtn);
check('footer omits Perpanjang Asuransi when onRenewInsurance is not supplied (back-compat)', result.noInsuranceRenewBtnWhenOmitted);
check('renew-insurance footer action does NOT close the drawer', result.openAfterInsuranceRenewClick);
check('Insurance section shows its own human-readable history (no raw type/field names)', result.insuranceHistoryShowsOwnRecord);
check('Tax section excludes insurance-type entries (one ledger, no duplicate rendering)', result.taxSectionExcludesInsuranceEntries);

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
  const sheet = document.querySelector('.exec-drawer');
  return sheet ? sheet.offsetWidth <= window.innerWidth + 2 : true;
});
check('mobile drawer sheet does not exceed viewport width', overflow);

await browser.close();
server.close();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
