/* sarpras-workspace-dom-check.mjs — DOM integration test for the four
   Sarpras Intelligence workspaces added in V2.0.18 (Dashboard was already
   real; NOR Center, Archive Center, Knowledge Center, Learning Dashboard).
   Run: node scripts/sarpras-workspace-dom-check.mjs   (exit 0 = pass)

   Mirrors organizational-memory-dom-check.mjs's pattern exactly: a local
   static server + puppeteer, asserting zero fatal boot errors and that
   mounting/switching screens never throws — this is the only way to catch
   a broken dynamic import() or a runtime TypeError in these presentation
   files (they were only syntax/import-checked under bare Node before this). */
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

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
console.log('\n[Sarpras Intelligence — V2.0.18 workspace completion, browser]');
const bootErrors = [];
const page = await browser.newPage();
page.on('pageerror', (e) => bootErrors.push('pageerror: ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('Failed to load resource')) bootErrors.push('console.error: ' + m.text());
});

await page.goto(`http://localhost:${port}/scripts/sarpras-workspace-harness.html`, { waitUntil: 'networkidle2', timeout: 45000 });
await page.waitForFunction('window.__ready === true', { timeout: 15000 }).catch(() => {});

await page.evaluate(() => window.__mount());
check('outer shell mounts with zero fatal boot errors', !bootErrors.some((e) => FATAL_PATTERN.test(e)));

const dashboardHtml = await page.evaluate(() => window.__hostHTML());
check('Dashboard renders the roadmap panel', dashboardHtml.includes('sic-roadmap'));
check('Dashboard shows zero "soon"-tier roadmap rows (no placeholder workspaces left)', !dashboardHtml.includes('sic-roadmap-status--soon'));

for (const screenId of ['nor', 'archive', 'knowledge', 'learning']) {
  bootErrors.length = 0;
  await page.evaluate((id) => window.__setScreen(id), screenId);
  // dynamic import() is async; give the module a tick to resolve and mount.
  await new Promise((r) => setTimeout(r, 300));
  const html = await page.evaluate(() => window.__hostHTML());
  const text = await page.evaluate(() => window.__hostText());
  check(`"${screenId}" screen mounts with zero fatal errors`, !bootErrors.some((e) => FATAL_PATTERN.test(e)));
  check(`"${screenId}" screen renders non-empty content`, html.length > 200);
  check(`"${screenId}" screen contains no literal "Coming Soon" text`, !text.includes('Coming Soon') && !text.includes('segera hadir'));

  // Click through every internal tab this nested workspace exposes (its
  // own .nc-tab / .wlk-tab bar) — this is the only way to exercise render
  // paths beyond each workspace's default first tab.
  const tabIds = await page.evaluate(() => [...document.querySelectorAll('#host .nc-tab, #host .wlk-tab')].map((b) => b.dataset.id));
  for (const tabId of tabIds) {
    bootErrors.length = 0;
    await page.evaluate((id) => {
      const btn = [...document.querySelectorAll('#host .nc-tab, #host .wlk-tab')].find((b) => b.dataset.id === id);
      if (btn) btn.click();
    }, tabId);
    check(`"${screenId}" -> "${tabId}" tab renders with zero fatal errors`, !bootErrors.some((e) => FATAL_PATTERN.test(e)));
  }
}

let closeError = null;
try {
  await page.evaluate(() => window.__close());
} catch (e) {
  closeError = e;
}
check('closeSarprasIntelligence() runs without throwing', closeError === null);

await browser.close();
server.close();

console.log(`\n${pass}/${pass + fail} checks passed.`);
if (fail > 0) process.exitCode = 1;
