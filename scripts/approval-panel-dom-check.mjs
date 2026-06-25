/* approval-panel-dom-check.mjs — Auto Assignment Assistant (v1.16.4.12) DOM test.
   Serves the static app, loads the REAL ES modules in headless Chromium, builds a
   live recommendation package from the actual engines, mounts the approval
   intelligence panel, and asserts the 7 features render + interact correctly with
   no console errors. Run: node scripts/approval-panel-dom-check.mjs (exit 0 = pass) */

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
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push('console.error: ' + m.text()); });

// A blank page on the server origin so relative module imports resolve.
await page.goto(`http://localhost:${port}/index.html`, { waitUntil: 'domcontentloaded', timeout: 45000 });

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };

const result = await page.evaluate(async () => {
  const out = {};
  const ris = await import('/js/services/request-intelligence-service.js');
  const panel = await import('/js/components/approval-intelligence-panel.js');

  // Build a realistic package from the REAL engines (no mocking of scoring).
  const NOW = '2026-06-25T09:23:00';
  const request = { date: '2026-06-25', startTime: '08:00', endTime: '12:00', passengers: 6, destination: 'Bandara' };
  const drivers = [{ id: 'd_aria', name: 'Aria' }, { id: 'd_budi', name: 'Budi' }];
  const vehicles = [{ id: 'innova_01', name: 'Toyota Innova', capacity: 7, healthScore: 100 }, { id: 'hiace_01', name: 'Toyota Hiace', capacity: 14, healthScore: 100 }];
  const pkg = ris.buildRecommendationPackage({ request, drivers, vehicles, assignments: [], overrideLogs: [] }, { now: NOW });
  out.recDriverId = pkg.recommendedDispatch && pkg.recommendedDispatch.driverId;
  out.score = pkg.recommendedDispatch && pkg.recommendedDispatch.dispatchScore;

  const stored = {
    hasRecommendation: true,
    recommendedDriver: 'Aria', recommendedDriverId: 'd_aria',
    recommendedVehicle: 'Toyota Innova', recommendedVehicleId: 'innova_01',
    dispatchScore: out.score, generatedAt: NOW,
  };

  // Mount into a fresh host (independent of the app's own modal).
  const host = document.createElement('div');
  host.id = 'testHost';
  document.body.appendChild(host);
  panel.mountApprovalIntelligencePanel(host, {
    pkg, stored,
    request: { createdAt: '2026-06-25T09:20:00' },
    recommended: { driver: 'Aria', vehicle: 'Toyota Innova' },
    selection: { driver: '', vehicle: '' },
  });

  const q = (sel) => host.querySelector(sel);
  const txt = (sel) => { const e = q(sel); return e ? e.textContent : ''; };

  // Feature 1 — hero card
  out.brand = txt('.aip__brand').includes('Dispatch Intelligence');
  out.heroDriver = (() => { const rows = [...host.querySelectorAll('.aip__pair-row')]; return rows.length >= 2 && rows[0].textContent.includes('Aria') && rows[1].textContent.includes('Innova'); })();
  out.heroScore = txt('.aip__metric-num') === String(out.score);

  // Feature 2 — confidence badge: filled-star count matches band
  const glyph = txt('.aip__stars');
  out.filledStars = (glyph.match(/★/g) || []).length;
  out.confLabel = txt('.aip__conf-lbl');

  // Feature 3 — apply button present
  out.applyBtn = !!q('#aipApplyBtn') && q('#aipApplyBtn').textContent.includes('Terapkan');

  // Feature 5 — breakdown rows total to the displayed total
  const pts = [...host.querySelectorAll('.aip__bd-pts')].map((e) => parseInt(e.textContent.replace('+', ''), 10));
  const totalShown = parseInt((txt('.aip__bd-total').match(/(\d+)\s*$/) || [])[1], 10);
  out.bdRows = pts.length;
  out.bdSum = pts.reduce((a, b) => a + b, 0);
  out.bdTotal = totalShown;
  out.bdTotalsCorrectly = out.bdSum === totalShown && totalShown === out.score;

  // Feature 7 — explanation checklist
  out.whyCount = host.querySelectorAll('.aip__why li').length;
  out.whyAllOk = [...host.querySelectorAll('.aip__why li')].every((li) => li.getAttribute('data-ok') === 'true');

  // Feature 6 — timeline
  out.tlCount = host.querySelectorAll('.aip__tl li').length;
  out.tlHasGenerated = txt('.aip__tl').includes('Rekomendasi Dibuat');
  out.tlTime = !!txt('.aip__tl').match(/09:2\d/);

  // Feature 4 — comparison: no change initially, then override shows badges
  out.cmpInitialNone = txt('#aipComparisonRegion').includes('sama dengan rekomendasi');
  // driver-only override → "Driver Diubah" but not "Kendaraan Diubah"
  panel.updateApprovalComparison(host, { driver: 'Budi', vehicle: 'Toyota Innova' });
  out.cmpDriverBadge = txt('#aipComparisonRegion').includes('Driver Diubah');
  out.cmpNoVehicleBadge = !txt('#aipComparisonRegion').includes('Kendaraan Diubah');
  out.cmpOverrideTimeline = txt('.aip__tl').includes('Admin Override');
  // another update (both changed) must NOT duplicate the override timeline row
  panel.updateApprovalComparison(host, { driver: 'Budi', vehicle: 'Toyota Hiace' });
  out.cmpOverrideRowCount = host.querySelectorAll('.aip__tl [data-tl="override"]').length;
  // revert → badge gone, timeline override removed
  panel.updateApprovalComparison(host, { driver: 'Aria', vehicle: 'Toyota Innova' });
  out.cmpRevert = !txt('#aipComparisonRegion').includes('Diubah') && !txt('.aip__tl').includes('Admin Override');

  // Dark-mode safety: no hard-coded white backgrounds in the scoped stylesheet.
  const styleEl = document.getElementById('aip-panel-styles');
  out.noHardWhite = styleEl ? !/#fff(\b|;)|#ffffff/i.test(styleEl.textContent) : false;

  return out;
});

console.log('\n[engine package]');
check('engine recommends Aria', result.recDriverId === 'd_aria');
check('dispatch score present', typeof result.score === 'number' && result.score > 0);

console.log('\n[Feature 1 — Dispatch Intelligence card]');
check('🤖 Dispatch Intelligence brand renders', result.brand);
check('hero shows recommended driver + vehicle', result.heroDriver);
check('hero shows dispatch score', result.heroScore);

console.log('\n[Feature 2 — Confidence badge]');
const expectedStars = result.score >= 95 ? 5 : result.score >= 85 ? 4 : result.score >= 70 ? 3 : 2;
check(`confidence stars (${result.filledStars}) match score band (${expectedStars})`, result.filledStars === expectedStars);
check('confidence label present (Bahasa Indonesia)', /Sangat Tinggi|Tinggi|Sedang|Perlu Review/.test(result.confLabel));

console.log('\n[Feature 3 — Apply Recommendation]');
check('Terapkan Rekomendasi button renders', result.applyBtn);

console.log('\n[Feature 5 — Score breakdown]');
check('breakdown has rows', result.bdRows >= 2);
check(`breakdown totals correctly (${result.bdSum} = ${result.bdTotal} = score ${result.score})`, result.bdTotalsCorrectly);

console.log('\n[Feature 7 — Explain recommendation]');
check('explanation checklist renders (5 items)', result.whyCount === 5);
check('all checks pass for a clean recommendation', result.whyAllOk);

console.log('\n[Feature 6 — Timeline]');
check('timeline renders multiple events', result.tlCount >= 2);
check('timeline includes "Rekomendasi Dibuat"', result.tlHasGenerated);
check('timeline shows HH:MM from existing timestamps', result.tlTime);

console.log('\n[Feature 4 — Recommendation comparison]');
check('no override initially → "sama dengan rekomendasi"', result.cmpInitialNone);
check('override driver → "Driver Diubah" badge', result.cmpDriverBadge);
check('unchanged vehicle → no "Kendaraan Diubah" badge', result.cmpNoVehicleBadge);
check('override reflected on timeline (Admin Override)', result.cmpOverrideTimeline);
check('override timeline row not duplicated on repeated updates', result.cmpOverrideRowCount === 1);
check('revert to recommendation → badges + override timeline cleared', result.cmpRevert);

console.log('\n[design / regression]');
check('scoped stylesheet uses CSS vars (no hard-coded white — dark-mode safe)', result.noHardWhite);
check('no console errors during render', consoleErrors.length === 0);
if (consoleErrors.length) consoleErrors.forEach((e) => console.log('   • ' + e.slice(0, 200)));

await browser.close();
server.close();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
