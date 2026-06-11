/* Measure the reimbursement template's real page count via headless Chrome.
   Serves the repo, opens framework-poc.html, and uses window.__measureRmb()
   to render the actual PDF and parse its page count from the blob.

   Does NOT touch the Document Engine / PdfExporter / PrintManager — it only
   renders the existing template and reports measurements.

   Run: node scripts/measure-reimbursement.mjs
*/
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
               '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const filePath = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath);
  if (!filePath.startsWith(ROOT) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404); res.end('not found'); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
});

const A4_USABLE_PT = 841.89 - 37 - 31;   // pageHeight − marginTop − marginBottom

const measure = (page, h) => page.evaluate(rh => window.__measureRmb(rh), h);

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/framework-poc.html`;

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  page.on('console', m => { if (m.type() === 'error') console.log('  [page error]', m.text()); });
  await page.goto(url, { waitUntil: 'networkidle0' });
  await page.waitForFunction('window.__ready === true', { timeout: 20000 });
  // warm up pdfmake
  await measure(page, 0);

  const current = await measure(page, 320);
  console.log(`\nUsable content height (A4 − margins): ${A4_USABLE_PT.toFixed(2)} pt`);
  console.log(`Current RECEIPT_H = 320 → pages: ${current.pages}, size: ${current.size.toLocaleString('en-US')} bytes`);

  // Binary search: largest integer receiptH that still yields a single page.
  let lo = 60, hi = 360, best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const { pages } = await measure(page, mid);
    if (pages <= 1) { best = mid; lo = mid + 1; } else { hi = mid - 1; }
  }

  const fixedRest = A4_USABLE_PT - best;
  const overflow320 = 320 - best;
  console.log(`\nThreshold: max RECEIPT_H for 1 page = ${best} pt`);
  console.log(`Everything except receipt box consumes ≈ ${fixedRest.toFixed(2)} pt`);
  console.log(`Overflow at RECEIPT_H=320 ≈ ${overflow320} pt (this is what pushes to page 2)`);

  // Sanity-check a couple of candidate final values.
  for (const h of [best, best - 15, 260, 255, 250]) {
    if (h <= 0) continue;
    const r = await measure(page, h);
    console.log(`  RECEIPT_H=${h} → ${r.pages} page(s), ${r.size.toLocaleString('en-US')} bytes`);
  }

  await browser.close();
  server.close();
})().catch(e => { console.error(e); server.close(); process.exit(1); });
