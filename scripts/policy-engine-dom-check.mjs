/* policy-engine-dom-check.mjs — DOM integration test for the Dispatch
   Intelligence Policy Engine (v1.17.2).
   Run: node scripts/policy-engine-dom-check.mjs   (exit 0 = pass)

   Part A — loads the REAL index.html (unauthenticated, like the boot smoke) and
   asserts the new request-form policy UI exists: the "Gunakan Ambulance" medical
   row (hidden for non-medical), the "Tanpa Driver" option, and zero fatal boot
   errors.
   Part B — loads a harness that imports the REAL policy engine + recommendation
   pipeline and proves the policy filters entities end-to-end in a browser:
   ambulance kept out of the normal pool, medical mode → ambulance-only, "Tanpa
   Driver" → vehicle-only package, admin override never blocked, and the analytics
   policy excludes ambulance + Akuntes without deleting data. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('not found'); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });

/* ── Part A: request-form policy UI in the REAL app shell ─────────────── */
console.log('\n[A: request-form policy UI]');
const bootErrors = [];
const pageA = await browser.newPage();
pageA.on('pageerror', (e) => bootErrors.push('pageerror: ' + e.message));
pageA.on('console', (m) => { if (m.type() === 'error') bootErrors.push('console.error: ' + m.text()); });
await pageA.goto(`http://localhost:${port}/index.html`, { waitUntil: 'networkidle2', timeout: 45000 });
await new Promise((r) => setTimeout(r, 4000));

const dom = await pageA.evaluate(() => {
  const has = (id) => !!document.getElementById(id);
  // v1.17.4 — the legacy "Gunakan Ambulance" checkbox row became a premium option
  // card (#reqModeCardAmbulance). The hidden source-of-truth input is unchanged.
  const ambCard = document.getElementById('reqModeCardAmbulance');
  return {
    useAmbulance: has('requestUseAmbulance'),
    noDriver: has('requestNoDriver'),
    medRow: !!ambCard,
    medHiddenDefault: ambCard ? (ambCard.hidden || getComputedStyle(ambCard).display === 'none') : false,
    requestForm: has('requestForm'),
  };
});
check('"Gunakan Ambulance" input present (#requestUseAmbulance)', dom.useAmbulance === true);
check('"Tanpa Driver" input present (#requestNoDriver)', dom.noDriver === true);
check('ambulance mode card exists (#reqModeCardAmbulance)', dom.medRow === true);
check('ambulance card hidden by default (non-medical user)', dom.medHiddenDefault === true);

const fatal = bootErrors.filter((e) =>
  /SyntaxError|ReferenceError|TypeError|is not a function|Failed to (load|fetch) module|Cannot use import|Unexpected token|does not provide an export/i.test(e));
check('no fatal boot errors with the Policy Engine wired in', fatal.length === 0);
if (fatal.length) fatal.forEach((e) => console.log('     ✗', e.slice(0, 200)));

/* ── Part B: policy filters entities end-to-end (real modules) ────────── */
console.log('\n[B: end-to-end policy filtering in a browser]');
const pageB = await browser.newPage();
pageB.on('pageerror', (e) => bootErrors.push('harness pageerror: ' + e.message));
await pageB.goto(`http://localhost:${port}/scripts/policy-engine-harness.html`, { waitUntil: 'networkidle2', timeout: 45000 });
await pageB.waitForFunction('window.__ready === true', { timeout: 20000 });

const res = await pageB.evaluate(() => {
  const drivers = [
    { id: 'd1', name: 'Andi', status: 'Aktif', active: true },
    { id: 'd2', name: 'Budi', status: 'Cuti', active: true },
  ];
  const vehicles = [
    { id: 'v1', name: 'Innova', capacity: 7, active: true },
    { id: 'vamb', name: 'Ambulance PBSI', capacity: 4, active: true },
  ];
  const request = { date: '2026-07-01', startTime: '08:00', endTime: '12:00', passengers: 3 };

  const normal = window.__applyDispatchPolicy({ drivers, vehicles, context: {} });
  const medical = window.__applyDispatchPolicy({ drivers, vehicles, context: { medicalMode: true } });
  const override = window.__applyDispatchPolicy({ drivers, vehicles, context: { adminOverride: true } });

  const noDriverPkg = window.__buildRecommendationPackage(
    { request, drivers, vehicles, assignments: [], overrideLogs: [] },
    { policy: { driverOptional: true } },
  );
  const normalPkg = window.__buildRecommendationPackage(
    { request, drivers, vehicles, assignments: [], overrideLogs: [] }, {},
  );

  const analytics = window.__applyAnalyticsPolicy({
    vehicles,
    requests: [{ id: 'r1', requesterName: 'Akuntes' }, { id: 'r2', requesterName: 'Pelatnas' }],
    assignments: [],
    overrideLogs: [],
  });

  return {
    normalVehicles: normal.vehicles.map((v) => v.id),
    normalDrivers: normal.drivers.map((d) => d.id),
    medicalVehicles: medical.vehicles.map((v) => v.id),
    overrideVehicles: override.vehicles.length,
    overrideDrivers: override.drivers.length,
    noDriverState: noDriverPkg.state,
    noDriverPolicySkipped: noDriverPkg.policyDiagnostics && noDriverPkg.policyDiagnostics.drivers.skipped,
    noDriverDispatchDriver: noDriverPkg.recommendedDispatch ? noDriverPkg.recommendedDispatch.driverId : 'n/a',
    normalHasPolicyDiag: !!normalPkg.policyDiagnostics,
    analyticsVehicles: analytics.vehicles.map((v) => v.id),
    analyticsRequests: analytics.requests.map((r) => r.requesterName),
  };
});

check('normal pool excludes ambulance', JSON.stringify(res.normalVehicles) === JSON.stringify(['v1']));
check('normal pool excludes on-leave driver', JSON.stringify(res.normalDrivers) === JSON.stringify(['d1']));
check('medical mode → ambulance-only pool', JSON.stringify(res.medicalVehicles) === JSON.stringify(['vamb']));
check('admin override → nothing blocked (2 drivers, 2 vehicles)', res.overrideVehicles === 2 && res.overrideDrivers === 2);
check('"Tanpa Driver" → recommendation READY without a driver', res.noDriverState === 'READY' && res.noDriverDispatchDriver === '');
check('"Tanpa Driver" → policy diagnostics record the skip', res.noDriverPolicySkipped === true);
check('every recommendation package carries policy diagnostics', res.normalHasPolicyDiag === true);
check('analytics policy excludes ambulance vehicle', JSON.stringify(res.analyticsVehicles) === JSON.stringify(['v1']));
check('analytics policy excludes Akuntes requester', JSON.stringify(res.analyticsRequests) === JSON.stringify(['Pelatnas']));

await browser.close();
server.close();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
