/* learning-dashboard-today-check.mjs — Autonomous Experience (Part 10)
   Run: node scripts/learning-dashboard-today-check.mjs   (exit 0 = pass)

   PROVES (not assumes) the Learning Dashboard's new "Hari Ini Platform
   Mempelajari" card reflects REAL recorded facts, not a placeholder:
   before any activity, it must honestly say zero; after recording one
   real Learning Event (through the actual live producer, recordCorrection
   — the same function dataset-import-center.js's Advanced Metadata save
   calls) and creating one real Knowledge item, the card's count must
   change by exactly the real amount, never fabricated. */
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

console.log('\n[Learning Dashboard — "Hari Ini" card reflects real recorded facts]');

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.goto(`http://localhost:${port}/scripts/sarpras-workspace-harness.html`, { waitUntil: 'networkidle2', timeout: 45000 });
await page.waitForFunction('window.__ready === true', { timeout: 15000 });
await page.evaluate(() => window.__mount());
await new Promise((r) => { setTimeout(r, 800); }); // let the one-time initial sync settle

await page.evaluate((id) => window.__setScreen(id), 'learning');
await new Promise((r) => { setTimeout(r, 400); });

const before = await page.evaluate(() => document.getElementById('host').textContent);
check('before any activity, the card honestly shows zero activity (not a fabricated nonzero)', before.includes('Belum ada aktivitas pembelajaran hari ini'));

// Record ONE real Learning Event + ONE real Knowledge item, through the
// actual live producer paths — not a fabricated number written directly.
const recorded = await page.evaluate(() => window.__recordTestCorrection('today-check-target-1'));
const created = await page.evaluate(() => window.__createKnowledgeItem('today-check-session-1'));
check('recordCorrection() (the real producer) succeeded', recorded);
check('a real KnowledgeItem was created', created);

// Re-render by revisiting the section.
await page.evaluate((id) => window.__setScreen(id), 'dashboard');
await page.evaluate((id) => window.__setScreen(id), 'learning');
await new Promise((r) => { setTimeout(r, 300); });

const after = await page.evaluate(() => document.getElementById('host').textContent);
check('the card now reports "1 fakta dokumen baru" — the real new Knowledge item', after.includes('1 fakta dokumen baru'));
check('the card now reports "1 koreksi tercatat" — the real recordCorrection() call', after.includes('1 koreksi tercatat'));
check('the card no longer shows the empty-state message once real activity exists', !after.includes('Belum ada aktivitas pembelajaran hari ini'));

await browser.close();
server.close();

console.log(`\n${pass}/${pass + fail} checks passed.`);
process.exit(fail === 0 ? 0 : 1);
