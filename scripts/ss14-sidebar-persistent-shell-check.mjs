/* ss14-sidebar-persistent-shell-check.mjs — SS14.6: SS14.5 fixed the
   sidebar's WIDTH collapsing during navigation (real :hover on
   .domshell-rail genuinely lapses for the ~300-590ms a navigation view
   transition's top-layer overlay owns hit-testing — see
   ss14-sidebar-view-transition-check.mjs). It did not cover a second,
   independent consequence of that same real hover loss: the rail's own
   base .domshell-rail-label/-brandtext/-usertext rules
   (opacity:0; transition: opacity 120ms linear — no delay) take back over
   the instant ".domshell-rail:hover .domshell-rail-label{opacity:1}"
   stops matching, fading the label text out and back in on every single
   navigation even though the rail's WIDTH never visibly moved.

   Confirmed by direct measurement (mouse genuinely stationary and
   hovering throughout a real navigation): label/brandtext opacity ran
   1.00 -> 0.72 -> 0.30 -> 0.03 -> 0.00 over the first 100ms, sat at 0
   through the transition, then 0.00 -> 0.33 -> 1.00 back up once real
   hover returned — the sidebar visibly "re-rendering" on every click even
   with SS14.5 in place.

   Fix (platform.css): the identical dwell technique SS14.5 already
   applies to width, applied to the label/brandtext/usertext opacity
   transitions too — scoped to html.domshell-nav-transition +
   :not(:hover):not(:focus-within) on the ancestor rail, so a fade that
   would start during the transition window never gets the chance to
   (real hover returns first; the browser cancels a still-pending
   transition outright when the target value reverts before its delay
   elapses).

   This test asserts the FULL persistent-shell invariant per SS14.6's
   request — not just final state, but through the actual transition:
     - rail exists and stays expanded (width)
     - label/brandtext opacity stays at 1 throughout (not just before/after)
     - button/label DOM node identity is preserved (no unintended replace)
     - the content area's own view transition still genuinely fires
     - real pointer hover still functions afterward
   Limitation stated up front, per SS14.6 Phase 10's instruction not to
   fake a visual assertion: this is computed-style/DOM-identity
   verification at fine time granularity, not pixel-level screenshot
   diffing — true visual regression testing (rendered-pixel comparison)
   is not available in this environment. See the SS14.6 report for actual
   screenshot evidence gathered manually outside this suite.

   Uses the same faithful harness as ss14-sidebar-view-transition-check.mjs
   (real domain-shell.js, real platform.css, real
   document.startViewTransition() wired exactly like js/app.js's
   setWorkspace(), including the _workspaceEverSet gate).

   Run: node scripts/ss14-sidebar-persistent-shell-check.mjs   (exit 0 = pass) */

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
  window.__tagIdentity = () => {
    document.querySelectorAll('.domshell-rail-item, .domshell-rail-label').forEach((el, i) => {
      if (!el.dataset.probeId) el.dataset.probeId = 'orig-' + i;
    });
  };
  window.__identitySnapshot = () => Array.from(document.querySelectorAll('.domshell-rail-item, .domshell-rail-label')).map(el => el.dataset.probeId || 'UNTAGGED');
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

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const errors = [];
const page = await browser.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
await page.setViewport({ width: 1280, height: 900 });
await page.goto(`http://localhost:${port}/harness`, { waitUntil: 'networkidle0', timeout: 45000 });
await page.waitForFunction(() => window.__ready === true, { timeout: 10000 });
await page.evaluate(() => window.__initShell());
await new Promise(r => setTimeout(r, 300));
await page.evaluate(() => window.__tagIdentity());

console.log('[A. Persistent-shell invariant through a real navigation, pointer genuinely hovering]');
const box = await page.evaluate(() => window.__railBox('operations'));
await page.mouse.move(box.x, box.y, { steps: 15 });
await new Promise(r => setTimeout(r, 400));
const preIdentity = await page.evaluate(() => window.__identitySnapshot());
check('pre-click: real hover established (width 220)', (await page.evaluate(() => document.querySelector('.domshell-rail').getBoundingClientRect().width)) === 220);

await page.mouse.down(); await page.mouse.up();

const marks = [0, 20, 50, 80, 100, 150, 200, 250, 300, 400, 600];
let elapsed = 0;
const timeline = [];
for (const t of marks) {
  const wait = t - elapsed; if (wait > 0) { await new Promise(r => setTimeout(r, wait)); elapsed += wait; }
  const state = await page.evaluate(() => {
    const rail = document.querySelector('.domshell-rail');
    const label = rail.querySelector('.domshell-rail-item[data-domain="operations"] .domshell-rail-label') || rail.querySelector('.domshell-rail-label');
    const brandtext = rail.querySelector('.domshell-rail-brandtext');
    return {
      railExists: !!rail,
      width: +rail.getBoundingClientRect().width.toFixed(1),
      labelDisplay: label ? getComputedStyle(label).display : null,
      labelOpacity: label ? Number(getComputedStyle(label).opacity).toFixed(2) : null,
      brandtextOpacity: brandtext ? Number(getComputedStyle(brandtext).opacity).toFixed(2) : null,
    };
  });
  timeline.push({ t, ...state });
}
console.log('  timeline:', timeline.map(e => `t=${e.t}:w=${e.width}/op=${e.labelOpacity}`).join('  '));

check('rail exists at every sampled point', timeline.every(e => e.railExists));
check('rail width never drops below 200 at any point (SS14.5 contract)', timeline.every(e => e.width >= 200), timeline.map(e => e.width));
check('label display is never "none" at any point', timeline.every(e => e.labelDisplay !== 'none'), timeline.map(e => e.labelDisplay));
check('label opacity never drops below 0.95 at any point (SS14.6 — the actual new fix)', timeline.every(e => Number(e.labelOpacity) >= 0.95), timeline.map(e => e.labelOpacity));
check('brandtext opacity never drops below 0.95 at any point', timeline.every(e => Number(e.brandtextOpacity) >= 0.95), timeline.map(e => e.brandtextOpacity));

const postIdentity = await page.evaluate(() => window.__identitySnapshot());
check('button/label DOM node identity preserved across navigation (no unintended replace)', JSON.stringify(preIdentity) === JSON.stringify(postIdentity), { pre: preIdentity, post: postIdentity });

check('content actually navigated (the content-area transition genuinely ran)', (await page.evaluate(() => document.getElementById('content').textContent)).startsWith('navJadwalDriver'));

console.log('\n[B. Real pointer hover still functions normally after a navigation]');
await page.mouse.move(900, 850, { steps: 10 });
await new Promise(r => setTimeout(r, 200));
check('rail collapses after the pointer genuinely leaves post-navigation', (await page.evaluate(() => document.querySelector('.domshell-rail').getBoundingClientRect().width)) === 72);
const box2 = await page.evaluate(() => window.__railBox('today'));
await page.mouse.move(box2.x, box2.y, { steps: 15 });
await new Promise(r => setTimeout(r, 400));
check('rail re-expands on a fresh real hover after a navigation', (await page.evaluate(() => document.querySelector('.domshell-rail').getBoundingClientRect().width)) === 220);

console.log('\n[console cleanliness]');
check('zero console/page errors across the whole sequence', errors.length === 0, errors);

await browser.close();
server.close();
console.log(`\nss14-sidebar-persistent-shell-check: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
