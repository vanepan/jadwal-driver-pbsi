/* sprint-11-2-procurement-uat-check.mjs — Sprint 11.2 (Adaptive Conversation,
   UAT Issues #1/#2/#3), Validation.

   Drives the REAL Home free-text entry point in an actual browser (reuses
   scripts/sarpras-workspace-harness.html unchanged, same harness
   problem-first-home-dom-check.mjs already uses) through the exact 4
   utterances the real UAT report named, asserting the 3 things production
   feedback said were broken:
     1. Correct NOR Type is detected (Pengadaan), never a clarification abort.
     2. The conversation continues (a real follow-up question is shown).
     3. Only the genuinely UNKNOWN facts are asked — never "Barang apa yang
        ingin dibeli?" again once the utterance itself already named the item.

   Run: node scripts/sprint-11-2-procurement-uat-check.mjs   (exit 0 = pass) */
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

let pass = 0; let fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); }
}

const FATAL_PATTERN = /SyntaxError|ReferenceError|TypeError|is not a function|Failed to (load|fetch) module|Cannot use import|does not provide an export/;
const REJECTION_TEXT = /Request not recognized|permintaan tidak dikenali/i;
const CLARIFICATION_TEXT = /belum cukup yakin|Boleh diperjelas/i;
const ITEM_QUESTION_TEXT = /Barang (atau jasa )?apa yang ingin dibeli/i;

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
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

async function submitUtterance(utterance) {
  await page.evaluate((text) => {
    const input = document.querySelector('#host [data-act="sic-conv-input"]');
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, utterance);
  await page.evaluate(() => document.querySelector('#host [data-act="sic-conv-start"]').click());
  await new Promise((r) => setTimeout(r, 80));
}

/** Resets back to the Home screen between scenarios so one utterance's
 *  conversation state never bleeds into the next (same isolation
 *  problem-first-home-dom-check.mjs's own scenarios rely on implicitly by
 *  each starting a brand new conversation via the Home input). */
async function resetToHome() {
  await page.evaluate(() => window.__setScreen('dashboard'));
  await new Promise((r) => setTimeout(r, 100));
}

const scenarios = [
  { u: 'permohonan pembelian kursi kerja', label: 'UAT #1 — "permohonan pembelian kursi kerja"' },
  { u: 'permohonan pembelian mesin potong rumput', label: 'UAT #2 — "permohonan pembelian mesin potong rumput"' },
  { u: 'pengajuan pembelian printer', label: 'UAT #3 — "pengajuan pembelian printer"' },
  { u: 'buat NOR pengadaan AC ruang rapat', label: 'UAT #4 — "buat NOR pengadaan AC ruang rapat"' },
];

for (const { u, label } of scenarios) {
  console.log(`\n[${label}]`);
  bootErrors.length = 0;
  await resetToHome();
  await submitUtterance(u);
  const text = await page.evaluate(() => window.__hostText());
  check('zero fatal errors', !bootErrors.some((e) => FATAL_PATTERN.test(e)));
  check('never aborts with "Request not recognized"', !REJECTION_TEXT.test(text));
  check('never falls to the clarification prompt ("I recognize X but...")', !CLARIFICATION_TEXT.test(text));
  check('conversation continues — a real follow-up question is shown', text.includes('?'));
  check('never re-asks "Barang apa yang ingin dibeli?" (the item was already named)', !ITEM_QUESTION_TEXT.test(text));
}

console.log('\n[Developer Mode — Problem Classification stage confirms Pengadaan, never Unknown]');
{
  await resetToHome();
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('#host [data-act="sic-mode"]')].find((b) => b.dataset.id === 'developer');
    if (btn) btn.click();
  });
  await new Promise((r) => setTimeout(r, 100));
  bootErrors.length = 0;
  await submitUtterance('permohonan pembelian kursi kerja');
  const text = await page.evaluate(() => window.__hostText());
  check('zero fatal errors with Developer Mode active', !bootErrors.some((e) => FATAL_PATTERN.test(e)));
  check('Problem Classification stage is shown', text.includes('Problem Classification'));
  check('classified category is procurement, never unknown', /procurement/i.test(text) && !/category.*unknown/i.test(text));
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('#host [data-act="sic-mode"]')].find((b) => b.dataset.id === 'normal');
    if (btn) btn.click();
  });
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
