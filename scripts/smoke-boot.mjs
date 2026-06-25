/* Boot smoke test (v1.12.2): serve the static app, load it in headless
   Chromium, and assert the bootstrap completes without uncaught errors or
   ES-module load failures, and that the login modal renders (proving
   initAuthUI + the new auth-signal wiring ran). Unauthenticated load only —
   does NOT log into production. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import { APP_VERSION } from '../js/config.js';

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

const errors = [];
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });

await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
await new Promise(r => setTimeout(r, 4000)); // let bootstrap + auth gate settle

// Assertions
const loginVisible = await page.evaluate(() => {
  const m = document.getElementById('modalLogin');
  return !!m && getComputedStyle(m).display !== 'none';
});
const pushSectionExists = await page.evaluate(() => !!document.getElementById('profilePushSection'));
const enablePushBtnExists = await page.evaluate(() => !!document.getElementById('btnEnablePushDevice'));
const ver = await page.evaluate(async () => (await (await fetch('/version.json')).json()).version);

// Module/boot errors are fatal. Firebase network noise (unauthenticated reads,
// permission_denied) is EXPECTED on an unauthenticated load and is not a boot failure.
const fatal = errors.filter(e =>
  /SyntaxError|ReferenceError|TypeError|is not a function|Failed to (load|fetch) module|Cannot use import|Unexpected token|does not provide an export/i.test(e)
);

console.log('version.json        :', ver);
console.log('login modal visible :', loginVisible);
console.log('push section in DOM  :', pushSectionExists);
console.log('enable-push btn      :', enablePushBtnExists);
console.log('fatal boot errors    :', fatal.length);
if (fatal.length) fatal.forEach(e => console.log('   ✗', e));
console.log('--- all console errors (informational) ---');
errors.forEach(e => console.log('   •', e.slice(0, 200)));

await browser.close();
server.close();

// version.json must match the source APP_VERSION (proves sync-version stamped it);
// self-updating so it never goes stale on a release bump.
const pass = ver === APP_VERSION && loginVisible && pushSectionExists && enablePushBtnExists && fatal.length === 0;
console.log('\nSMOKE RESULT:', pass ? 'PASS' : 'FAIL');
process.exit(pass ? 0 : 1);
