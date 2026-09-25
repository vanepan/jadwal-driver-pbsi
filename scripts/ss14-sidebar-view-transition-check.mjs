/* ss14-sidebar-view-transition-check.mjs — SS14.5: the persistent sidebar
   visibly collapsed and re-expanded during every module navigation, even
   with pointer genuinely hovering it the whole time and even after SS14.4
   gave the rail its own view-transition-name.

   Root cause (confirmed by direct instrumentation, real CDP mouse hover,
   mouse never moving): the ::view-transition pseudo-element tree renders
   as a position:fixed, viewport-covering top-layer overlay for the
   duration of every js/app.js setWorkspace() navigation transition
   (~300-590ms). That overlay captures ALL pointer hit-testing across the
   whole viewport, sidebar included — document.elementFromPoint() at the
   cursor's own screen position read back <html> instead of the live rail
   button, for the entire transition window. Real :hover on .domshell-rail
   genuinely went false as a result (not a visual artifact — an actual
   pseudo-class change), which the rail's own base
   .domshell-rail{transition:width 200ms ease} rule then genuinely
   collapsed to 72px in response to, before re-expanding once the overlay
   tore down and hit-testing reached the live DOM again.

   Tried and disproven first: giving the transition pseudo-elements
   pointer-events:none (the standard web-platform recommendation for
   letting input reach the live page under a decorative overlay) — verified
   via getComputedStyle that the rule applied, but elementFromPoint() still
   returned <html> throughout. This Chromium's top-layer hit-testing for
   View Transitions does not fall through to the live document regardless
   of pointer-events.

   Actual fix (platform.css): the SAME "a brief interruption shouldn't
   visibly move the rail" technique this file already uses for the
   opposite direction (the :hover/:focus-within rule's own 100ms expand
   dwell) is applied to the COLLAPSE direction, scoped to
   html.domshell-nav-transition (SS14.4's class, set only for the lifetime
   of a setWorkspace() transition) and to :not(:hover):not(:focus-within)
   so it never touches the expand transition's own timing. A delay
   comfortably longer than any observed transition duration means a CSS
   transition that would collapse the rail never actually starts (real
   hover reliably returns first) — the browser cancels a still-pending
   transition outright when the target value reverts before the delay
   elapses, so the width never visibly moves. A genuine pointer-leave
   DURING a navigation is delayed by the same margin before it visibly
   collapses (see case D below) — an accepted, narrow trade-off.

   Uses a faithful harness (real domain-shell.js, real platform.css,
   real document.startViewTransition() wired into the mock `land`
   callbacks exactly like js/app.js's setWorkspace() — including the
   _workspaceEverSet gate that keeps the INITIAL landing unanimated, whose
   absence in earlier SS14.x scratch investigations produced misleading
   "duplicate view-transition-name" errors that turned out to be a test
   harness artifact, not a real defect).

   Run: node scripts/ss14-sidebar-view-transition-check.mjs   (exit 0 = pass) */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

const HARNESS = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/platform.css">
<style> html,body{margin:0} .app-layout{display:flex} .main-area{flex:1} #content{padding:20px} </style></head>
<body>
  <div class="app-layout">
    <aside id="sidebar"><nav class="sidebar-nav"></nav></aside>
    <div class="main-area"><header class="header">hdr</header><main class="main-content"><div id="content">A</div></main></div>
  </div>
<script type="module">
  import { initDomainShell, refreshDomainShell } from '/js/shell/domain-shell.js';
  // Faithfully mirrors js/app.js's setWorkspace(): _workspaceEverSet gates
  // out the initial landing, _navTransitionDepth (SS14.4) counts in-flight
  // transitions so the html.domshell-nav-transition class only clears once
  // ALL of them have settled.
  let workspaceEverSet = false;
  let navTransitionDepth = 0;
  const realLand = (label) => () => {
    const go = () => { document.getElementById('content').textContent = label + '-' + Math.random().toString(36).slice(2,6); };
    const canVT = workspaceEverSet && typeof document.startViewTransition === 'function';
    workspaceEverSet = true;
    if (canVT) {
      navTransitionDepth++;
      document.documentElement.classList.add('domshell-nav-transition');
      const t = document.startViewTransition(go);
      t.updateCallbackDone.catch(() => {});
      t.ready.catch(() => {});
      t.finished.finally(() => {
        navTransitionDepth = Math.max(0, navTransitionDepth - 1);
        if (navTransitionDepth === 0) document.documentElement.classList.remove('domshell-nav-transition');
      });
    } else { go(); }
  };
  window.__mkCfg = () => ({
    canAccessModule: (m) => ['home','driverops','gudang','pettycash','analytics','konfigurasi','engineering'].includes(m),
    can: () => true, isAdmin: () => true, isBidang: () => false, isDriver: () => false,
    setRailModule: () => {}, getActiveRailModule: () => 'home', defaultModuleForRole: () => 'home',
    land: new Proxy({}, { get: (_, prop) => realLand(String(prop)) }),
    pcMenuTitles: { dashboard: 'Dashboard' }, otMenuTitles: { dashboard: 'Dashboard' },
    engMenuTitles: { dashboard: 'Dashboard' }, gudMenuTitles: { dashboard: 'Dashboard' },
    sicMenuTitles: { dashboard: 'Dashboard' },
    mountBefore: document.getElementById('sidebar'),
    getCurrentUser: () => ({ name: 'QA Admin', role: 'admin', username: 'qa' }),
    formatRole: () => 'Administrator',
    logoSrc: '/assets/Logo-PBSI.png', brandLabel: 'Sarpras Ops', versionLabel: 'test',
  });
  window.__initShell = () => { initDomainShell(window.__mkCfg()); refreshDomainShell(true); };
  window.__railBox = (dom) => {
    const b = document.querySelector('.domshell-rail-item[data-domain="' + dom + '"]');
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  };
  window.__ready = true;
</script>
</body></html>`;

const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  if (u === '/' || u === '/harness') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(HARNESS); return; }
  const file = path.join(ROOT, u);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); if (detail !== undefined) console.log('     ' + JSON.stringify(detail)); }
};

async function freshPage(browser) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(`http://localhost:${port}/harness`, { waitUntil: 'networkidle0', timeout: 45000 });
  await page.waitForFunction(() => window.__ready === true, { timeout: 10000 });
  await page.evaluate(() => window.__initShell());
  await new Promise(r => setTimeout(r, 300));
  return { page, errors };
}

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });

console.log('[A. Home -> Operations, pointer stays hovering: width never visibly collapses]');
{
  const { page, errors } = await freshPage(browser);
  const box = await page.evaluate(() => window.__railBox('operations'));
  await page.mouse.move(box.x, box.y, { steps: 15 });
  await new Promise(r => setTimeout(r, 400));
  check('pre-click width is 220 (real hover established)', (await page.evaluate(() => document.querySelector('.domshell-rail').getBoundingClientRect().width)) === 220);
  await page.mouse.down(); await page.mouse.up();
  const widths = [];
  for (const t of [20, 60, 100, 150, 250, 350, 500]) {
    await new Promise(r => setTimeout(r, t === 20 ? 20 : 40));
    widths.push(await page.evaluate(() => document.querySelector('.domshell-rail').getBoundingClientRect().width));
  }
  check('width never drops below 200 at any sampled point during Home->Operations', widths.every(w => w >= 200), widths);
  check('content actually navigated', (await page.evaluate(() => document.getElementById('content').textContent)).startsWith('navJadwalDriver'));
  check('zero console/page errors', errors.length === 0, errors);
  await page.close();
}

console.log('\n[B. Operations -> Home (reverse direction), pointer stays hovering]');
{
  const { page, errors } = await freshPage(browser);
  const opsBox = await page.evaluate(() => window.__railBox('operations'));
  await page.mouse.move(opsBox.x, opsBox.y, { steps: 15 });
  await new Promise(r => setTimeout(r, 400));
  await page.mouse.down(); await page.mouse.up(); // Home -> Operations
  await new Promise(r => setTimeout(r, 500));
  const homeBox = await page.evaluate(() => window.__railBox('today'));
  await page.mouse.move(homeBox.x, homeBox.y, { steps: 10 });
  await new Promise(r => setTimeout(r, 300));
  await page.mouse.down(); await page.mouse.up(); // Operations -> Home
  const widths = [];
  for (const t of [20, 60, 100, 150, 250, 350, 500]) {
    await new Promise(r => setTimeout(r, t === 20 ? 20 : 40));
    widths.push(await page.evaluate(() => document.querySelector('.domshell-rail').getBoundingClientRect().width));
  }
  check('width never drops below 200 during Operations->Home', widths.every(w => w >= 200), widths);
  check('zero console/page errors', errors.length === 0, errors);
  await page.close();
}

console.log('\n[C. Rapid double-nav, pointer stays hovering: no duplicate-name errors, no stuck collapse]');
{
  const { page, errors } = await freshPage(browser);
  const opsBox = await page.evaluate(() => window.__railBox('operations'));
  const gudBox = await page.evaluate(() => window.__railBox('warehouse'));
  await page.mouse.move(opsBox.x, opsBox.y, { steps: 15 });
  await new Promise(r => setTimeout(r, 400));
  await page.mouse.down(); await page.mouse.up();
  await new Promise(r => setTimeout(r, 30));
  await page.mouse.move(gudBox.x, gudBox.y, { steps: 5 });
  await page.mouse.down(); await page.mouse.up();
  const widths = [];
  for (const t of [50, 150, 300, 500, 800, 1200, 1600]) {
    await new Promise(r => setTimeout(r, t === 50 ? 50 : 100));
    widths.push(await page.evaluate(() => document.querySelector('.domshell-rail').getBoundingClientRect().width));
  }
  check('width never drops below 200 across rapid double-nav', widths.every(w => w >= 200), widths);
  check('zero console/page errors (no duplicate view-transition-name)', errors.length === 0, errors);
  await page.close();
}

console.log('\n[D. Genuine pointer-leave mid-transition: eventually collapses (not stuck open forever)]');
{
  const { page, errors } = await freshPage(browser);
  const box = await page.evaluate(() => window.__railBox('operations'));
  await page.mouse.move(box.x, box.y, { steps: 15 });
  await new Promise(r => setTimeout(r, 400));
  await page.mouse.down(); await page.mouse.up();
  await new Promise(r => setTimeout(r, 40));
  await page.mouse.move(900, 850, { steps: 15 }); // genuinely leave
  await new Promise(r => setTimeout(r, 1500));
  const finalWidth = await page.evaluate(() => document.querySelector('.domshell-rail').getBoundingClientRect().width);
  check('rail eventually collapses after a genuine pointer-leave (not stuck open)', finalWidth === 72, finalWidth);
  check('zero console/page errors', errors.length === 0, errors);
  await page.close();
}

console.log('\n[E. Keyboard activation still expands via :focus-within, unaffected]');
{
  const { page, errors } = await freshPage(browser);
  await page.evaluate(() => {
    const b = document.querySelector('.domshell-rail-item[data-domain="warehouse"]');
    b.focus(); b.click();
  });
  await new Promise(r => setTimeout(r, 400));
  const state = await page.evaluate(() => {
    const rail = document.querySelector('.domshell-rail');
    return { width: rail.getBoundingClientRect().width, focusWithin: rail.matches(':focus-within') };
  });
  check('keyboard nav still expands the rail via :focus-within', state.width === 220 && state.focusWithin, state);
  check('zero console/page errors', errors.length === 0, errors);
  await page.close();
}

console.log('\n[F. Dark mode: same contract]');
{
  const { page, errors } = await freshPage(browser);
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  const box = await page.evaluate(() => window.__railBox('operations'));
  await page.mouse.move(box.x, box.y, { steps: 15 });
  await new Promise(r => setTimeout(r, 400));
  await page.mouse.down(); await page.mouse.up();
  const widths = [];
  for (const t of [20, 100, 250, 500]) {
    await new Promise(r => setTimeout(r, t === 20 ? 20 : 80));
    widths.push(await page.evaluate(() => document.querySelector('.domshell-rail').getBoundingClientRect().width));
  }
  check('[dark] width never drops below 200 during navigation', widths.every(w => w >= 200), widths);
  check('zero console/page errors', errors.length === 0, errors);
  await page.close();
}

await browser.close();
server.close();
console.log(`\nss14-sidebar-view-transition-check: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
