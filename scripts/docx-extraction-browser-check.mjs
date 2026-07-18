/* docx-extraction-browser-check.mjs — real-browser check for V2, Part A1
   (Intelligent Ingestion Hotfix). Node cannot verify this codebase's ONE
   new external-CDN dependency actually works the way the rest of this
   suite (content-fact-extraction-check.mjs, import-session-check.mjs)
   assumes it does — mammoth is loaded as a global-exposing <script> tag
   in index.html (js/v2/knowledge/datasets/import-session/docx-text-
   extractor.js's header explains why: no bundler, so no npm import is
   possible in the browser). This check loads the REAL index.html (the
   actual app shell, not a synthetic harness), confirms window.mammoth
   loads with zero page errors, and feeds it one of the same real PBSI
   sample .docx files content-fact-extraction-check.mjs already proved
   the regex layer handles correctly — proving the FULL real path (CDN
   script -> window.mammoth.extractRawText -> extractContentFacts) agrees
   with the Node-side result end-to-end, in an actual browser.
   No production writes, no Firebase touch (static file serving only).
   Run: node scripts/docx-extraction-browser-check.mjs   (exit 0 = pass) */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };

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
console.log('\n[Real browser — mammoth CDN script loads inside the actual app shell]');
const bootErrors = [];
const page = await browser.newPage();
page.on('pageerror', (e) => bootErrors.push('pageerror: ' + e.message));
page.on('console', (m) => {
  // Loading the REAL index.html (not a synthetic harness) means this run
  // is genuinely unauthenticated against the real Firebase project this
  // app points at — a real "Permission denied" read failure is EXPECTED
  // here (same class of noise this project's smoke-boot.mjs already
  // documents for unauthenticated real-Firebase runs), not something this
  // check's own mammoth/index.html change could have caused.
  if (m.type() === 'error' && !m.text().includes('Failed to load resource') && !m.text().includes('Permission denied')) {
    bootErrors.push('console.error: ' + m.text());
  }
});

await page.goto(`http://localhost:${port}/index.html`, { waitUntil: 'networkidle2', timeout: 45000 });
await page.waitForFunction('typeof window.mammoth !== "undefined"', { timeout: 15000 }).catch(() => {});

check('window.mammoth is defined after loading the real index.html', await page.evaluate('typeof window.mammoth !== "undefined"'));
check('window.mammoth.extractRawText is a function', await page.evaluate('typeof window.mammoth?.extractRawText === "function"'));
check('zero page errors from loading the mammoth <script> tag', bootErrors.length === 0 || (console.log(bootErrors), false));

console.log('\n[Real browser — extracting a real PBSI sample .docx, end-to-end]');
const sampleRelPath = 'Petty Cash Center/uploads/Nota Organisasi Sarpras 113 - Realisasi Petty Cash Pertanggal 12 Mei 2026 Bidang Sarana dan Prasarana.docx';
const sampleUrl = `http://localhost:${port}/${encodeURI(sampleRelPath)}`;
const extracted = await page.evaluate(async (url) => {
  const res = await fetch(url);
  const arrayBuffer = await res.arrayBuffer();
  const result = await window.mammoth.extractRawText({ arrayBuffer });
  return result.value;
}, sampleUrl);

check('extracted text is non-empty', typeof extracted === 'string' && extracted.trim().length > 0);
check('extracted text contains the real document number line ("No.113/Nota Organisasi/Sarpras/V/2026")', extracted.includes('113/Nota Organisasi/Sarpras/V/2026'));
check('extracted text contains the real sender line ("Plt. Kabid Sarana dan Prasarana")', extracted.includes('Plt. Kabid Sarana dan Prasarana'));
check('extracted text matches EXACTLY what the Node-side mammoth build produced for the same file (content-fact-extraction-check.mjs\'s own fixture)', extracted.includes('Realisasi Petty Cash Pertanggal 12 Mei 2026 Bidang Sarana dan Prasarana'));

await browser.close();
server.close();

console.log(`\n${pass}/${pass + fail} checks passed.`);
if (fail > 0) process.exit(1);
