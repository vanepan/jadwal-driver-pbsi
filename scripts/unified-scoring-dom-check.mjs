/* unified-scoring-dom-check.mjs — DOM integration test for the Unified Scoring
   System (v1.17.3).
   Run: node scripts/unified-scoring-dom-check.mjs   (exit 0 = pass)

   Loads a harness with the REAL unified-scoring module + the REAL Dispatch
   Analytics dashboard and proves, IN A BROWSER, that every displayed score reads
   higher = better: the helpers are monotonic, the capacity column shows a
   normalized health score (idle → 100 green, overloaded → 0 red — never
   inverted), and every capacity pill's color class matches scoreColor of the
   number it displays. Zero console errors. */
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
const consoleErrors = [];
const page = await browser.newPage();
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push('console.error: ' + m.text()); });
await page.goto(`http://localhost:${port}/scripts/unified-scoring-harness.html`, { waitUntil: 'networkidle0', timeout: 45000 });
await page.waitForFunction('window.__ready === true', { timeout: 20000 });

/* ── helpers run in the REAL browser ESM ──────────────────────────────── */
console.log('\n[browser helpers]');
const helpers = await page.evaluate(() => {
  const toneRank = { danger: 0, warn: 1, info: 2, ok: 3 };
  let colorMono = true, capMono = true;
  for (let s = 0; s < 100; s++) {
    if (toneRank[window.__scoreColor(s + 1)] < toneRank[window.__scoreColor(s)]) colorMono = false;
    if (window.__capacityScore(s + 1) > window.__capacityScore(s)) capMono = false; // capacity: higher util → lower score
  }
  return {
    colorMono, capMono,
    capIdle: window.__capacityScore(0), capFull: window.__capacityScore(100),
    invert: window.__invertScore(30),
    bandHi: window.__scoreBand(95), bandLo: window.__scoreBand(10),
    confHi: window.__confidenceFromScore(95).stars, confLo: window.__confidenceFromScore(60).stars,
  };
});
check('scoreColor monotonic in-browser (higher → better-or-equal color)', helpers.colorMono === true);
check('capacityScore: idle 0%→100, overloaded 100%→0', helpers.capIdle === 100 && helpers.capFull === 0);
check('capacityScore monotonic (higher util → lower health score)', helpers.capMono === true);
check('invertScore(30)=70 in-browser', helpers.invert === 70);
check('band hi/lo correct', helpers.bandHi === 'very-good' && helpers.bandLo === 'critical');
check('confidence reused, higher score → more stars', helpers.confHi > helpers.confLo);

/* ── rendered dashboard: capacity column is normalized + non-inverted ─── */
console.log('\n[rendered dashboard capacity normalization]');
const rendered = await page.evaluate(() => {
  // Seed a few decisions so driver + vehicle rows render.
  const drivers = [{ id: 'd1', name: 'Andi' }, { id: 'd2', name: 'Budi' }];
  const vehicles = [{ id: 'v1', name: 'Innova' }, { id: 'v2', name: 'Hiace' }];
  const overrideLogs = [
    { recommendationId: 'r1', recommendedDriverId: 'd1', recommendedVehicleId: 'v1', selectedDriverId: 'd1', selectedVehicleId: 'v1', dispatchScore: 96, outcome: 'ACCEPTED', overridden: false, timestamp: '2026-06-20T09:00:00' },
    { recommendationId: 'r2', recommendedDriverId: 'd2', recommendedVehicleId: 'v2', selectedDriverId: 'd2', selectedVehicleId: 'v2', dispatchScore: 72, outcome: 'ACCEPTED', overridden: false, timestamp: '2026-06-21T09:00:00' },
  ];
  const assignments = [
    { id: 'a1', driver: 'Andi', vehicle: 'Innova', date: '2026-06-20', startTime: '08:00', endTime: '10:00', status: 'assigned' },
    { id: 'a2', driver: 'Budi', vehicle: 'Hiace', date: '2026-06-21', startTime: '08:00', endTime: '10:00', status: 'assigned' },
  ];
  window.__renderDispatch({ overrideLogs, drivers, vehicles, assignments, now: '2026-06-25T12:00:00' });

  // Find capacity pills in the driver + vehicle tables and verify each pill's
  // color class equals scoreColor(displayed number) — i.e., never inverted.
  const pills = Array.from(document.querySelectorAll('.daa-table .daa-pill'));
  const capPills = pills.filter((p) => p.getAttribute('title') && p.getAttribute('title').includes('Skor kapasitas'));
  let allConsistent = capPills.length > 0;
  let allInRange = true;
  for (const p of capPills) {
    const n = Number(p.textContent.trim());
    if (!(n >= 0 && n <= 100)) allInRange = false;
    const tone = window.__scoreColor(n);
    if (!p.className.includes('daa-pill--' + tone)) allConsistent = false;
  }
  return { capPillCount: capPills.length, allConsistent, allInRange, hasInfoStyle: !!document.querySelector('style#daa-dashboard-styles') };
});
check('capacity pills rendered (driver + vehicle)', rendered.capPillCount >= 2);
check('every capacity pill value is within 0–100', rendered.allInRange === true);
check('every capacity pill color = scoreColor(value) (no inverted badge)', rendered.allConsistent === true);

// Ignore favicon / resource-load 404 noise — the harness ships no favicon; we
// only care about render/script errors.
const renderErrors = consoleErrors.filter((e) => !/Failed to load resource/i.test(e));
check('no console errors during render', renderErrors.length === 0);
if (renderErrors.length) renderErrors.forEach((e) => console.log('     ✗', e.slice(0, 180)));

await browser.close();
server.close();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
