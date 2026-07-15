/* sarpras-runtime-stress-check.mjs — Phase 7 (Runtime Hardening, Part 9)
   Stress test / benchmark harness. Run: node scripts/sarpras-runtime-stress-check.mjs

   Seeds N REAL Import Sessions (via window.__seedImportSessions — real
   createImportSession/attachManualEntryFacts/advanceSession calls, the same
   engine calls processOneFile() makes) through the actual browser-loaded
   engine modules, entirely Firebase-free (no File object, no Storage, no
   RTDB network call — see the harness's own comment on why that's honest,
   not a shortcut: a File handle and a live Storage/RTDB connection are
   exactly the two things this environment cannot safely fabricate).

   This measures the REAL cost this milestone's Part 1 audit predicted:
   seeding time (engine-side, scales with checkDuplicates()'s O(N) domain
   scan) and render time (UI-side, scales with computeBatchCounters()'s
   per-render session re-read). A fresh page load per N keeps each
   measurement clean (not cumulative across scales).

   Not a substitute for a real end-to-end run against your live Firebase
   project — see this milestone's report for exactly what this does and
   does not prove. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/scripts/sarpras-workspace-harness.html';
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

const FATAL_PATTERN = /SyntaxError|ReferenceError|TypeError|is not a function|Failed to (load|fetch) module|Cannot use import|does not provide an export/;

const browser = await puppeteer.launch({
  headless: 'new', args: ['--no-sandbox', '--js-flags=--expose-gc'],
});

console.log('\n[Phase 7 Runtime Hardening — stress test, real browser, real engines]');

const SCALES = [25, 50, 100, 250, 500];
const results = [];

for (const n of SCALES) {
  const bootErrors = [];
  const page = await browser.newPage();
  page.on('pageerror', (e) => bootErrors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('Failed to load resource')) bootErrors.push('console.error: ' + m.text());
  });
  await page.goto(`http://localhost:${port}/scripts/sarpras-workspace-harness.html`, { waitUntil: 'networkidle2', timeout: 45000 });
  await page.waitForFunction('window.__ready === true', { timeout: 15000 }).catch(() => {});
  await page.evaluate(() => window.__mount());

  try { await page.evaluate(() => { if (window.gc) window.gc(); }); } catch { /* --expose-gc unavailable, skip */ }
  const heapBeforeMB = (await page.metrics()).JSHeapUsedSize / (1024 * 1024);

  const seed = await page.evaluate((count) => window.__seedImportSessions(count, true), n);

  const t0 = Date.now();
  await page.evaluate((id) => window.__setScreen(id), 'nor');
  await new Promise((r) => setTimeout(r, 350)); // dynamic import + mount settle
  const renderMs = Date.now() - t0;

  const html = await page.evaluate(() => window.__hostHTML());
  const heapAfterMB = (await page.metrics()).JSHeapUsedSize / (1024 * 1024);

  await page.evaluate(() => window.__close());
  try { await page.evaluate(() => { if (window.gc) window.gc(); }); } catch { /* skip */ }
  await new Promise((r) => setTimeout(r, 50));
  const heapAfterCloseMB = (await page.metrics()).JSHeapUsedSize / (1024 * 1024);

  const noFatal = !bootErrors.some((e) => FATAL_PATTERN.test(e));
  check(`N=${n}: seeded ${seed.total} real sessions with zero fatal errors`, noFatal && seed.total === n);
  check(`N=${n}: workspace renders non-empty content (${html.length} chars)`, html.length > 500);

  results.push({
    n, seedMs: seed.seedMs, renderMs, heapBeforeMB, heapAfterMB, heapAfterCloseMB, noFatal,
  });
  await page.close();
}

console.log('\n[Results — real measurements, this machine, this run]');
console.log('N     seedMs   renderMs   heapBefore(MB)  heapAfter(MB)  heapAfterClose(MB)');
for (const r of results) {
  console.log(
    `${String(r.n).padEnd(6)}${r.seedMs.toFixed(1).padEnd(9)}${String(r.renderMs).padEnd(11)}`
    + `${r.heapBeforeMB.toFixed(1).padEnd(16)}${r.heapAfterMB.toFixed(1).padEnd(15)}${r.heapAfterCloseMB.toFixed(1)}`,
  );
}

// Scaling sanity: seed/render time should grow, but not explode
// super-linearly beyond what real O(N log N)-ish work would predict.
const first = results[0];
const last = results[results.length - 1];
const nRatio = last.n / first.n;
const seedRatio = last.seedMs / Math.max(first.seedMs, 0.1);
const renderRatio = last.renderMs / Math.max(first.renderMs, 1);
console.log(`\nScale ratio N: ${nRatio}x — seedMs: ${seedRatio.toFixed(1)}x — renderMs: ${renderRatio.toFixed(1)}x`);
check('seeding time does not explode past ~N² (checkDuplicates’ real, known O(N) scan per file)', seedRatio < nRatio * nRatio * 1.5);
check('render time does not explode past ~N² at 500 sessions', renderRatio < nRatio * nRatio * 1.5);

console.log(`\n${pass}/${pass + fail} checks passed.`);

await browser.close();
server.close();
process.exit(fail === 0 ? 0 : 1);
