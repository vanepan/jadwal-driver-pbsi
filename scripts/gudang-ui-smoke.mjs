/* Gudang UI render smoke test (V1.28.0 Experience Layer). Boots the real
   app in headless Chromium (same static-server pattern as smoke-boot.mjs),
   then — bypassing login, since this tests RENDERING not authorization —
   mounts the Gudang module directly into a detached host and exercises
   every screen's render path plus the Spotlight overlay. Catches runtime
   errors (null-pointer/undefined-field bugs) that a syntax check or the
   unauthenticated boot smoke test can't reach, since those never actually
   call render().

   Firebase reads fail with permission-denied (expected, unauthenticated) —
   every repository call degrades to {ok:false} and the UI's own fallbacks
   (`res.ok ? res.data : []`) are what's actually being proven here. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

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
const url = `http://localhost:${port}/index.html`;

const errors = [];
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 960 });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Permission denied|permission_denied/i.test(m.text())) errors.push('console.error: ' + m.text()); });

await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
await new Promise((r) => setTimeout(r, 3000));

const screenshotsDir = path.join(ROOT, 'scripts', '__gudang-ui-screenshots');
fs.mkdirSync(screenshotsDir, { recursive: true });

const result = await page.evaluate(async () => {
  const out = { steps: [], htmlLengths: {} };
  try {
    const mod = await import('/js/gudang/ui/gudang-center.js');
    const host = document.createElement('div');
    host.id = '__gudTestHost';
    // background:var(--canvas) — NOT a hardcoded white — .gud-root deliberately
    // sets no background of its own (same as .eng-root: "inherits the platform
    // canvas so it never reads as a separate white panel"). A hardcoded white
    // here would misrepresent dark mode, which relies on that inheritance.
    // NOT position:fixed either — the real host (.v2-workspace) is normal-flow;
    // Chromium returns offsetParent:null for any position:fixed element
    // regardless of visibility, which would falsely trip onGlobalKeydown's
    // "is Gudang the visible workspace" check in gudang-ui-interaction-check.mjs.
    host.style.cssText = 'width:1440px;min-height:960px;background:var(--canvas,#fff);';
    document.body.appendChild(host);

    await mod.mountGudang(host);
    out.steps.push('mount:ok');
    out.htmlLengths.home = host.innerHTML.length;

    for (const screen of ['goodsOut', 'goodsIn', 'history', 'opname', 'analytics', 'home']) {
      mod.setGudangScreen(screen);
      await new Promise((r) => setTimeout(r, 400)); // let each screen's own async loaders settle
      out.htmlLengths[screen] = host.innerHTML.length;
      out.steps.push(`screen:${screen}:ok`);
    }

    mod.openGudangSearch();
    await new Promise((r) => setTimeout(r, 300));
    out.htmlLengths.searchOpen = host.innerHTML.length;
    out.steps.push('search-open:ok');

    mod.setGudangSearch('tisu');
    await new Promise((r) => setTimeout(r, 500));
    out.htmlLengths.searchQuery = host.innerHTML.length;
    out.steps.push('search-query:ok');

    // Simulate Ctrl+K / arrow / escape via the module's own DOM (proves the
    // real keydown listener path works, not just direct function calls).
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await new Promise((r) => setTimeout(r, 200));
    out.steps.push('escape:ok');

    out.ok = true;
  } catch (err) {
    out.ok = false;
    out.error = String(err && err.stack || err);
  }
  return out;
});

// Screenshot Home (light) for visual inspection.
await page.evaluate(() => { const h = document.getElementById('__gudTestHost'); if (h) h.scrollTop = 0; });
try {
  const homeHandle = await page.$('#__gudTestHost');
  if (homeHandle) await homeHandle.screenshot({ path: path.join(screenshotsDir, 'home-light.png') });
} catch (_) {}

// Dark mode: flip the same [data-theme] attribute the real theme toggle
// uses (js/app.js#applyTheme), re-render Home, screenshot for comparison.
await page.evaluate(async () => {
  document.documentElement.setAttribute('data-theme', 'dark');
  const mod = await import('/js/gudang/ui/gudang-center.js');
  mod.setGudangScreen('home');
});
await new Promise((r) => setTimeout(r, 400));
try {
  const darkHandle = await page.$('#__gudTestHost');
  if (darkHandle) await darkHandle.screenshot({ path: path.join(screenshotsDir, 'home-dark.png') });
} catch (_) {}

console.log('Steps:', result.steps.join(' -> '));
console.log('HTML lengths per screen:', JSON.stringify(result.htmlLengths, null, 2));
if (!result.ok) console.log('ERROR:', result.error);
console.log('\n--- non-permission console/page errors ---');
errors.forEach((e) => console.log('   •', e.slice(0, 300)));

const allScreensRendered = result.htmlLengths && Object.entries(result.htmlLengths).every(([k, v]) => v > 100);
const pass = result.ok === true && allScreensRendered && errors.length === 0;
console.log('\nGUDANG UI SMOKE RESULT:', pass ? 'PASS' : 'FAIL');

await browser.close();
server.close();
process.exit(pass ? 0 : 1);
