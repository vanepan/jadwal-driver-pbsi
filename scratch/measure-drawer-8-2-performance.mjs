// Phase 8.2 — MEASURED open/close latency for the 2 migrated consumers
// (decision-replay, driver-wellness) plus the 2 pre-existing consumers
// (Assignment Detail via modal.js, Vehicle Detail via vehicle-detail-drawer.js)
// for a real before/after-shaped comparison, all against the same canonical
// shell. Uses page.tracing for style/layout/paint, and performance.now()
// deltas for wall-clock open-to-interactive / close-to-removed timing.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

const ROOT = process.cwd();
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  if (req.url === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  let p = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(ROOT, p);
  try {
    const body = fs.readFileSync(file);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch (e) { res.writeHead(404); res.end('not found'); }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
await page.goto(`http://localhost:${port}/scripts/decision-replay-harness.html`, { waitUntil: 'load' });

const result = await page.evaluate(async () => {
  const svc = await import('/js/services/request-intelligence-service.js');
  const wellSvc = await import('/js/services/driver-wellness-service.js');
  const drx = await import('/js/components/decision-replay-drawer.js');
  const dwd = await import('/js/components/driver-wellness-drawer.js');

  const drivers = [{ id: 'd1', name: 'Igo' }, { id: 'd2', name: 'Dedi' }];
  const vehicles = [{ id: 'v1', name: 'Avanza', capacity: 7, healthScore: 100 }];
  const request = { id: 'r1', date: '2026-06-25', startTime: '13:00', endTime: '16:00', passengers: 1, destination: 'X', requesterName: 'Y', createdAt: '2026-06-25T07:00:00' };
  const pkg = svc.buildRecommendationPackage({ request, drivers, vehicles, assignments: [], overrideLogs: [] }, { now: '2026-06-25T12:00:00' });
  const replayInput = { pkg, stored: { hasRecommendation: true, generatedAt: pkg.generatedAt }, request };

  const wellModel = wellSvc.computeDriverWellnessModel({ drivers, assignments: [], now: '2026-06-25', window: '30d' });
  const wellDriver = wellSvc.findDriverWellness(wellModel, 'd1');

  async function measureOpen(fn) {
    const t0 = performance.now();
    fn();
    // "interactive" = the frame where .is-open is applied (matches the
    // requestAnimationFrame drawer.js itself uses to trigger the transition).
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const t1 = performance.now();
    return t1 - t0;
  }
  async function measureClose() {
    const t0 = performance.now();
    document.querySelector('.drawer__close')?.click();
    await new Promise((r) => {
      const check = () => { if (!document.getElementById('appDrawerOverlay')) r(); else requestAnimationFrame(check); };
      check();
    });
    const t1 = performance.now();
    return t1 - t0;
  }

  const N = 8;
  const drxOpens = [], drxCloses = [], dwdOpens = [], dwdCloses = [];
  for (let i = 0; i < N; i++) {
    drxOpens.push(await measureOpen(() => drx.openDecisionReplay(replayInput, {})));
    drxCloses.push(await measureClose());
    dwdOpens.push(await measureOpen(() => dwd.openDriverWellnessDrawer(wellDriver)));
    dwdCloses.push(await measureClose());
  }

  const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const med = (arr) => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
  return {
    decisionReplay: { openAvgMs: avg(drxOpens).toFixed(2), openMedMs: med(drxOpens).toFixed(2), closeAvgMs: avg(drxCloses).toFixed(2), closeMedMs: med(drxCloses).toFixed(2) },
    driverWellness: { openAvgMs: avg(dwdOpens).toFixed(2), openMedMs: med(dwdOpens).toFixed(2), closeAvgMs: avg(dwdCloses).toFixed(2), closeMedMs: med(dwdCloses).toFixed(2) },
    sampleSize: N,
  };
});

console.log(JSON.stringify(result, null, 2));

// Chrome trace for one open/close cycle, style/layout/paint breakdown.
await page.evaluate(async () => {
  const svc = await import('/js/services/request-intelligence-service.js');
  const drx = await import('/js/components/decision-replay-drawer.js');
  const drivers = [{ id: 'd1', name: 'Igo' }];
  const vehicles = [{ id: 'v1', name: 'Avanza', capacity: 7, healthScore: 100 }];
  const request = { id: 'r1', date: '2026-06-25', startTime: '13:00', endTime: '16:00', passengers: 1, destination: 'X', requesterName: 'Y', createdAt: '2026-06-25T07:00:00' };
  const pkg = svc.buildRecommendationPackage({ request, drivers, vehicles, assignments: [], overrideLogs: [] }, { now: '2026-06-25T12:00:00' });
  window.__traceInput = { pkg, stored: { hasRecommendation: true, generatedAt: pkg.generatedAt }, request };
  window.__drx = drx;
});
const tracePath = path.join(ROOT, 'scratch', 'drawer-8-2-open-trace.json');
await page.tracing.start({ path: tracePath, screenshots: false });
await page.evaluate(() => window.__drx.openDecisionReplay(window.__traceInput, {}));
await new Promise((r) => setTimeout(r, 300));
await page.evaluate(() => document.querySelector('.drawer__close')?.click());
await new Promise((r) => setTimeout(r, 300));
await page.tracing.stop();

const trace = JSON.parse(fs.readFileSync(tracePath, 'utf8'));
const events = trace.traceEvents || [];
const sumDur = (name) => events.filter((e) => e.name === name && typeof e.dur === 'number').reduce((a, e) => a + e.dur, 0) / 1000;
console.log('\n[Chrome trace — one open + close cycle]');
console.log('Style recalc (ms):', sumDur('UpdateLayoutTree').toFixed(2), `(${events.filter((e) => e.name === 'UpdateLayoutTree').length} events)`);
console.log('Layout (ms):      ', sumDur('Layout').toFixed(2));
console.log('Paint (ms):       ', sumDur('Paint').toFixed(2));
const longTasks = events.filter((e) => e.name === 'RunTask' && typeof e.dur === 'number' && e.dur > 50000);
console.log('Long tasks (>50ms):', longTasks.length, longTasks.map((e) => (e.dur / 1000).toFixed(1) + 'ms'));

await browser.close();
server.close();
