/* v1.20.9 — Mobile Zoom Hardening verification: serve the static app, load it
   in headless Chromium at an iPhone-class mobile viewport, and assert:
   (1) the viewport meta disables pinch-zoom (maximum-scale=1, user-scalable=no)
   (2) every real editable form field computes to >=16px font-size, the
       threshold below which iOS Safari auto-zooms an input on focus.
   Field #2 is checked both for live DOM elements (login form, always present
   unauthenticated) and for CSS-rule-only elements (everything gated behind
   auth/role/modal state) via synthetic fixtures inserted at runtime — this
   verifies the authored CSS rule without needing a live Firebase session. */
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

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
await new Promise(r => setTimeout(r, 1500));

const results = [];

// 1. Viewport meta
const viewportContent = await page.evaluate(() => document.querySelector('meta[name="viewport"]')?.content || '');
const pinchDisabled = /maximum-scale=1(\.0)?/.test(viewportContent) && /user-scalable=no/.test(viewportContent);
results.push({ name: 'viewport meta disables pinch-zoom', pass: pinchDisabled, detail: viewportContent });

// 2. mobile-web-app-capable present (Android/Chrome PWA parity)
const mobileWebAppCapable = await page.evaluate(() => document.querySelector('meta[name="mobile-web-app-capable"]')?.content || '');
results.push({ name: 'mobile-web-app-capable present', pass: mobileWebAppCapable === 'yes', detail: mobileWebAppCapable || '(missing)' });

// 3. Live login fields (always in DOM, unauthenticated)
const liveFields = await page.evaluate(() => {
  const out = [];
  for (const id of ['loginUsername', 'loginPin']) {
    const el = document.getElementById(id);
    if (!el) { out.push({ id, found: false }); continue; }
    out.push({ id, found: true, fontSize: parseFloat(getComputedStyle(el).fontSize) });
  }
  return out;
});
for (const f of liveFields) {
  results.push({ name: `#${f.id} font-size >= 16px`, pass: f.found && f.fontSize >= 16, detail: f.found ? `${f.fontSize}px` : 'element not found' });
}

// 4. CSS-rule-only fields — synthetic fixtures matching each real element's
//    tag + class + minimal ancestor structure required for the selector to match.
const fixtures = [
  { desc: '.date-input (assignment filter, input[type=date])', html: `<input type="date" class="date-input">`, selector: '.date-input' },
  { desc: '.v2-audit-date-input (admin audit log filter)', html: `<input type="date" class="v2-admin-filter v2-audit-date-input">`, selector: '.v2-audit-date-input' },
  { desc: '.comment-input-area textarea (request/petty-cash comment reply)', html: `<div class="comment-input-area"><textarea></textarea></div>`, selector: '.comment-input-area textarea' },
  { desc: '.exec-search__input (executive dashboard search)', html: `<input class="exec-search__input">`, selector: '.exec-search__input' },
  { desc: '.v2-topbar-search-input (global topbar search)', html: `<input class="v2-topbar-search-input">`, selector: '.v2-topbar-search-input' },
  { desc: '.eng-search-input (engineering module search)', html: `<input class="eng-search-input">`, selector: '.eng-search-input' },
  { desc: '.form-group input (generic form field, e.g. request/user/vehicle modals)', html: `<div class="form-group"><input></div>`, selector: '.form-group input' },
  { desc: '.form-group select', html: `<div class="form-group"><select></select></div>`, selector: '.form-group select' },
  { desc: '.form-group textarea', html: `<div class="form-group"><textarea></textarea></div>`, selector: '.form-group textarea' },
];

for (const fx of fixtures) {
  const fontSize = await page.evaluate(({ html, selector }) => {
    const host = document.createElement('div');
    host.innerHTML = html;
    document.body.appendChild(host);
    const el = host.querySelector(selector.split(' ').pop()); // last simple selector segment
    const size = el ? parseFloat(getComputedStyle(el).fontSize) : null;
    document.body.removeChild(host);
    return size;
  }, fx);
  results.push({ name: `${fx.desc} font-size >= 16px`, pass: fontSize !== null && fontSize >= 16, detail: fontSize !== null ? `${fontSize}px` : 'element not matched' });
}

await browser.close();
server.close();

let failed = 0;
for (const r of results) {
  console.log(`${r.pass ? '✓' : '✗'} ${r.name} — ${r.detail}`);
  if (!r.pass) failed++;
}
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
