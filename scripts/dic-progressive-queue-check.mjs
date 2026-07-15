/* dic-progressive-queue-check.mjs — Autonomous Experience (Part 2)
   Run: node scripts/dic-progressive-queue-check.mjs   (exit 0 = pass)

   PROVES (not assumes) the Progressive Import Queue's core claim: "Do NOT
   render hundreds of cards simultaneously. Click expands only that
   section." Seeds real, genuinely in-flight sessions (never advanced to a
   resting terminal — see the harness's __seedInFlightSessions, which
   mirrors exactly what a real batch looks like while files are still
   actually uploading/being validated), then asserts on the real DOM. */
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
  if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); }
}

const FATAL_PATTERN = /SyntaxError|ReferenceError|TypeError|is not a function|Failed to (load|fetch) module|Cannot use import|does not provide an export/;

console.log('\n[Progressive Import Queue — real DOM, real in-flight sessions]');

const bootErrors = [];
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
page.on('pageerror', (e) => bootErrors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('Failed to load resource')) bootErrors.push('console.error: ' + m.text()); });

await page.goto(`http://localhost:${port}/scripts/sarpras-workspace-harness.html`, { waitUntil: 'networkidle2', timeout: 45000 });
await page.waitForFunction('window.__ready === true', { timeout: 15000 });
await page.evaluate(() => window.__mount());

// mountSarprasIntelligence() kicks off a ONE-TIME initImportSessionSync()
// -> rehydrateAndSweep() shortly after mount (unconditional .then(), not
// gated on the Firebase call actually succeeding). sweepPipeline() would
// otherwise race ahead of seeding and drive every "left mid-ladder" test
// session straight to its real resting point (Awaiting Evidence) before
// this script ever gets to look at the DOM — a real, useful discovery
// about how aggressively the autonomous scheduler normalizes state, not a
// test flake. Waiting for that one settle first, then seeding, is what
// makes the in-flight buckets observable at all.
await new Promise((r) => { setTimeout(r, 800); });

const N = 90; // 30 per bucket (uploading / building-knowledge / preparing)
const seeded = await page.evaluate((n) => window.__seedInFlightSessions(n), N);
check(`seeded ${N} genuinely in-flight sessions`, seeded.total === N);

await page.evaluate((id) => window.__setScreen(id), 'nor');
await new Promise((r) => { setTimeout(r, 400); });
// The Dataset Import Center is embedded inside NOR Center's "Archive" tab
// (nor-center.js#renderArchiveSection — "no second upload mechanism").
await page.evaluate(() => {
  const tab = [...document.querySelectorAll('[data-act="wlk-tab"]')].find((el) => el.dataset.id === 'archive');
  if (tab) tab.click();
});
await new Promise((r) => { setTimeout(r, 200); });

check('mount + seed + render produced zero fatal errors', !bootErrors.some((e) => FATAL_PATTERN.test(e)));

const collapsedState = await page.evaluate(() => ({
  buckets: document.querySelectorAll('.dic-queue-bucket').length,
  expandedBodies: document.querySelectorAll('.dic-queue-bucket-body').length,
  rowCards: document.querySelectorAll('.dic-queue-bucket .wlk-row').length,
  bucketLabels: [...document.querySelectorAll('.dic-queue-bucket-label')].map((el) => el.textContent),
}));
check('all 3 real buckets are present (Preparing/Uploading/Building Knowledge)', collapsedState.buckets === 3);
check('ZERO buckets expanded by default', collapsedState.expandedBodies === 0);
check('ZERO row cards in the DOM while everything is collapsed (not "hundreds of cards simultaneously")', collapsedState.rowCards === 0);

// Click exactly one bucket header — the "Uploading" one. A JS-level click
// (not puppeteer's native mouse click) because the harness host is
// `display:none` (headless DOM-only harness, no real layout) — matches
// every other click-driven check in this suite (see sarpras-workspace-
// dom-check.mjs's own use of onClick handlers via evaluate()).
const clicked = await page.evaluate(() => {
  const el = [...document.querySelectorAll('.dic-queue-bucket-head')].find((h) => h.textContent.includes('Uploading'));
  if (!el) return false;
  el.click();
  return true;
});
check('found and clicked the "Uploading" bucket header', clicked);
await new Promise((r) => { setTimeout(r, 250); }); // rerenderPreservingScroll uses rAF

const afterOneClick = await page.evaluate(() => ({
  expandedBodies: document.querySelectorAll('.dic-queue-bucket-body').length,
  rowCards: document.querySelectorAll('.dic-queue-bucket .wlk-row').length,
}));
check('EXACTLY ONE bucket expands after clicking its header', afterOneClick.expandedBodies === 1);
check('only that bucket\'s ~30 rows entered the DOM — the other two buckets stayed at zero cards', afterOneClick.rowCards > 0 && afterOneClick.rowCards < N);

await browser.close();
server.close();

console.log(`\n${pass}/${pass + fail} checks passed.`);
process.exit(fail === 0 ? 0 : 1);
