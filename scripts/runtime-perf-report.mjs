/* v1.20.9 — Runtime Performance Report (Objective 10: measure, don't estimate).
   Serves the static app, loads it in headless Chromium, and measures the
   UNAUTHENTICATED boot path (the one every role hits first, before role
   resolution — see docs/v1.20.9-native-runtime-excellence.md for why role
   resolution happens deep in startAuthenticatedSession() and can't be reached
   here without a real/faked login, which this repo has no harness for yet).

   Reports, with real numbers:
     1. Every JS module requested during boot, and its byte size.
     2. Confirms ZERO of the 12 modules converted to dynamic import() in A1
        (module-loader-registry.js) were requested — proof the workspace-aware
        boot claim holds, not just an assertion.
     3. Paint/interactive timing via the Performance API (first-paint markers,
        not total load — the "perceived performance" metric this sprint cares
        about, per the user's explicit mid-sprint guidance).
   Run: node scripts/runtime-perf-report.mjs */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.svg':'image/svg+xml', '.ico':'image/x-icon' };

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

await new Promise(r => server.listen(0, r));
const port = server.address().port;
const url = `http://localhost:${port}/index.html`;

// The 12 modules A1 converted to dynamic import() — must NEVER appear in the
// unauthenticated-boot request list.
const LAZY_MODULE_PATHS = [
  'components/vehicle-prediction-dashboard.js',
  'analytics/simulation-panel.js',
  'components/driver-wellness-dashboard.js',
  'analytics/dispatch-analytics-engine.js',
  'services/prediction-service.js',
  'engines/prediction-engine.js',
  'components/driver-prediction-dashboard.js',
  'analytics/petty-cash-analytics.js',
  'analytics/views/analytics-petty-cash-view.js',
  'components/executive-dashboard.js',
  'analytics/executive-analytics.js',
  'analytics/views/analytics-executive-view.js',
];

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();

const jsRequests = []; // { url, bytes }
page.on('response', async (res) => {
  const reqUrl = res.url();
  if (!/\.m?js(\?|$)/.test(reqUrl) || !reqUrl.includes(`localhost:${port}/js/`)) return;
  let bytes = 0;
  try { const buf = await res.buffer(); bytes = buf.length; } catch (_) { /* opaque/redirected */ }
  jsRequests.push({ url: reqUrl.replace(`http://localhost:${port}/js/`, ''), bytes });
});

await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
await new Promise(r => setTimeout(r, 3000)); // let bootstrap fully settle

const paintTiming = await page.evaluate(() => {
  const nav = performance.getEntriesByType('navigation')[0] || {};
  const paints = performance.getEntriesByType('paint').reduce((acc, p) => { acc[p.name] = Math.round(p.startTime); return acc; }, {});
  return {
    domContentLoaded: nav.domContentLoadedEventEnd ? Math.round(nav.domContentLoadedEventEnd) : null,
    loadEvent: nav.loadEventEnd ? Math.round(nav.loadEventEnd) : null,
    firstPaint: paints['first-paint'] ?? null,
    firstContentfulPaint: paints['first-contentful-paint'] ?? null,
  };
});

await browser.close();
server.close();

const totalBytes = jsRequests.reduce((s, r) => s + r.bytes, 0);
const leaked = jsRequests.filter(r => LAZY_MODULE_PATHS.some(p => r.url.includes(p)));

console.log('=== v1.20.9 Runtime Performance Report (unauthenticated boot) ===\n');
console.log(`JS modules requested at boot : ${jsRequests.length}`);
console.log(`Total JS bytes transferred   : ${(totalBytes / 1024).toFixed(1)} KB`);
console.log(`First Paint                  : ${paintTiming.firstPaint ?? 'n/a'} ms`);
console.log(`First Contentful Paint       : ${paintTiming.firstContentfulPaint ?? 'n/a'} ms`);
console.log(`DOMContentLoaded             : ${paintTiming.domContentLoaded ?? 'n/a'} ms`);
console.log(`Full load event              : ${paintTiming.loadEvent ?? 'n/a'} ms`);
console.log(`\nLazy modules leaked into boot: ${leaked.length} / ${LAZY_MODULE_PATHS.length} watched`);
if (leaked.length) leaked.forEach(r => console.log(`   ✗ ${r.url} (${r.bytes} bytes) — should NOT load at boot`));
else console.log('   ✓ none of the 12 A1-converted modules were requested');

const pass = leaked.length === 0;
console.log(`\nRESULT: ${pass ? 'PASS' : 'FAIL'}`);
process.exit(pass ? 0 : 1);
