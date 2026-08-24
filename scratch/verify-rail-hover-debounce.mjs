// Phase 8.1 — rail hover-expand debounce (spec §12), real browser check.
// Pure-CSS behavior (no JS drives the expand), so a minimal DOM matching
// the real .domshell-rail / .main-area sibling structure under
// body.domain-shell-active is sufficient — no need to boot domain-shell.js.
import puppeteer from 'puppeteer';
import http from 'http';
import { readFileSync } from 'fs';
import path from 'path';

const ROOT = process.cwd();
const server = http.createServer((req, res) => {
  if (req.url === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  const p = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(ROOT, p === '/' ? '/index.html' : p);
  try {
    const body = readFileSync(file);
    const ext = path.extname(file);
    const type = { '.css': 'text/css', '.html': 'text/html', '.js': 'application/javascript' }[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    res.end(body);
  } catch (e) {
    res.writeHead(404); res.end('not found');
  }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const html = `<!doctype html><html data-theme="light"><head>
<link rel="stylesheet" href="/style.css" />
<link rel="stylesheet" href="/platform.css" />
</head><body class="domain-shell-active" style="margin:0;">
<div class="app-layout" style="display:flex;">
  <nav class="domshell-rail" style="position:relative;"></nav>
  <main class="main-area"><div style="height:2000px;">content</div></main>
</div>
</body></html>`;

const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (msg) => { if (msg.type() === 'error' && !msg.text().includes('favicon.ico')) errors.push(msg.text()); });
await page.setRequestInterception(true);
page.on('request', (req) => {
  if (req.url().endsWith('/__inline__')) {
    req.respond({ status: 200, contentType: 'text/html', body: html });
  } else {
    req.continue();
  }
});
await page.setViewport({ width: 1440, height: 900 });
await page.goto(`http://localhost:${port}/__inline__`, { waitUntil: 'load' });

// page.hover() dispatches genuine pointer events that trigger real :hover
// pseudo-class matching (unlike a synthetic mouseenter Event).
async function widthAfter(ms) {
  await page.hover('.domshell-rail');
  await new Promise((r) => setTimeout(r, ms));
  return page.evaluate(() => Math.round(document.querySelector('.domshell-rail').getBoundingClientRect().width));
}

async function resetHover() {
  await page.mouse.move(700, 700);
  await new Promise((r) => setTimeout(r, 350)); // let any in-flight transition settle back
}

let pass = 0, fail = 0;
function check(label, cond, extra = '') {
  if (cond) { pass++; console.log(`OK   ${label}${extra ? ' ' + extra : ''}`); }
  else { fail++; console.log(`FAIL ${label}${extra ? ' ' + extra : ''}`); }
}

await resetHover();
const w0 = await page.evaluate(() => Math.round(document.querySelector('.domshell-rail').getBoundingClientRect().width));
check('rail base width is 72px (collapsed, no hover)', w0 === 72, `(got ${w0})`);

await resetHover();
const wAt50 = await widthAfter(50);
check('rail width still 72px ~50ms into hover (debounce holding)', wAt50 === 72, `(got ${wAt50})`);

await resetHover();
const wAt250 = await widthAfter(250);
check('rail width is 220px ~250ms into hover (debounce elapsed + transition done)', wAt250 === 220, `(got ${wAt250})`);

check('zero console/page errors', errors.length === 0, errors.length ? `(${errors.join(' | ')})` : '');

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
server.close();
if (fail > 0) process.exit(1);
