/* domain-shell-rail-hover-check.mjs — v1.31.4 R2: the desktop rail must stay
   OPEN (hover-driven, no separate JS state) across a module navigation while
   the physical pointer stays over it, and close only once the pointer
   actually leaves.

   Bug: renderRail() (js/shell/domain-shell.js) rebuilt the entire button
   list via innerHTML on every navigation, even when the set of visible
   domains hadn't changed. That destroyed whichever button the pointer was
   physically over the instant a module was clicked, dropping :hover on the
   ancestor .domshell-rail (an instant collapse) until the next real pointer
   move re-acquired it (a 100ms-delayed reopen) — a visible close/reopen
   flicker. The rail's open state is PURE CSS :hover/:focus-within, so the
   only real test is: does the exact DOM node the pointer sits over survive
   a navigation, and does :hover stay matched the whole time with no
   synthetic mouse event in between.

   Same real-browser DI harness domain-shell-overtime-render-check.mjs uses
   (js/shell/domain-shell.js imported directly with a mock cfg — the exact
   contract app.js's initDomainShellV1() passes). Real CDP mouse input via
   page.mouse, so :hover is the browser's own genuine pointer-hit-test state,
   not a simulated class.

   Run: node scripts/domain-shell-rail-hover-check.mjs   (exit 0 = pass)
*/

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); if (detail !== undefined) console.log('     • ' + String(detail).slice(0, 300)); }
};

const HARNESS = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/platform.css">
<style> html,body{margin:0} .app-layout{display:flex} .main-area{flex:1} </style></head>
<body>
  <div class="app-layout">
    <aside id="sidebar"><nav class="sidebar-nav"></nav></aside>
    <div class="main-area"><header class="header">hdr</header><main class="main-content"></main></div>
  </div>
<script type="module">
  import { initDomainShell, refreshDomainShell } from '/js/shell/domain-shell.js';
  const land = new Proxy({}, { get: () => () => {} });
  window.__mkCfg = (canOvertime) => ({
    canAccessModule: (m) => (m === 'overtime' ? !!canOvertime : ['home','driverops','gudang','pettycash','analytics','konfigurasi','engineering'].includes(m)),
    can: () => true,
    isAdmin: () => true, isBidang: () => false, isDriver: () => false,
    setRailModule: () => {}, getActiveRailModule: () => 'home', defaultModuleForRole: () => 'home',
    land,
    pcMenuTitles: { dashboard: 'Dashboard' },
    otMenuTitles: { dashboard: 'Dashboard' },
    engMenuTitles: { dashboard: 'Dashboard' },
    gudMenuTitles: { dashboard: 'Dashboard' },
    sicMenuTitles: { dashboard: 'Dashboard' },
    mountBefore: document.getElementById('sidebar'),
    getCurrentUser: () => ({ name: 'QA Admin', role: 'admin', username: 'qa' }),
    formatRole: () => 'Administrator',
    logoSrc: '/assets/Logo-PBSI.png', brandLabel: 'Sarpras Ops', versionLabel: 'test',
  });
  window.__initShell = (canOvertime) => {
    document.querySelectorAll('.domshell-rail,.domshell-tabbar,#domshellMobileNavHost').forEach(e => e.remove());
    initDomainShell(window.__mkCfg(canOvertime));
    refreshDomainShell(true);
  };
  window.__railDomains = () => [...document.querySelectorAll('.domshell-rail-item')].map(b => b.dataset.domain);
  window.__mark = (dom) => { document.querySelector('.domshell-rail-item[data-domain="' + dom + '"]').__qaMarker = dom; };
  window.__markStillThere = (dom) => document.querySelector('.domshell-rail-item[data-domain="' + dom + '"]')?.__qaMarker === dom;
  window.__railBox = (dom) => {
    const b = document.querySelector('.domshell-rail-item[data-domain="' + dom + '"]');
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  };
  window.__railHovered = () => document.querySelector('.domshell-rail')?.matches(':hover') || false;
  window.__isActive = (dom) => {
    const b = document.querySelector('.domshell-rail-item[data-domain="' + dom + '"]');
    return !!b && b.classList.contains('domshell-rail-item--active') && b.getAttribute('aria-current') === 'page';
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

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const errors = [];
const page = await browser.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
await page.setViewport({ width: 1280, height: 900 });
await page.goto(`http://localhost:${port}/harness`, { waitUntil: 'networkidle0', timeout: 45000 });
await page.waitForFunction(() => window.__ready === true, { timeout: 10000 });
await page.evaluate(() => window.__initShell(true));

/* ── 1. hover opens the rail ── */
console.log('\n[1. pointer enters the rail]');
const opsBox = await page.evaluate(() => window.__railBox('operations'));
await page.mouse.move(opsBox.x, opsBox.y);
const hoveredAfterEnter = await page.evaluate(() => window.__railHovered());
check('rail matches :hover once the pointer is over it', hoveredAfterEnter);

/* ── 2. clicking a module while the pointer stays put must not close the rail ── */
console.log('\n[2. click a module — pointer never moves off the rail]');
await page.evaluate(() => window.__mark('operations'));
await page.mouse.down();
await page.mouse.up();
// No mouse.move after the click — this is the exact repro condition: the
// physical pointer position is unchanged, only the DOM under it may have
// been replaced.
const afterClick = await page.evaluate(() => ({
  hovered: window.__railHovered(),
  nodePreserved: window.__markStillThere('operations'),
  active: window.__isActive('operations'),
}));
check('the clicked button DOM node itself was NOT destroyed/recreated', afterClick.nodePreserved, afterClick);
check('.domshell-rail is STILL :hover immediately after the click (no flicker)', afterClick.hovered, afterClick);
check('the clicked domain is now marked active (aria-current + active class)', afterClick.active, afterClick);

/* ── 3. repeated navigation while hovering different rail items ── */
console.log('\n[3. repeated navigation, pointer moving between rail items but never leaving]');
const todayBox = await page.evaluate(() => window.__railBox('today'));
await page.mouse.move(todayBox.x, todayBox.y);
await page.evaluate(() => window.__mark('today'));
await page.mouse.down();
await page.mouse.up();
const afterSecondClick = await page.evaluate(() => ({
  hovered: window.__railHovered(),
  nodePreserved: window.__markStillThere('today'),
  activeToday: window.__isActive('today'),
  activeOpsCleared: !window.__isActive('operations'),
}));
check('rail stays :hover across a second navigation', afterSecondClick.hovered, afterSecondClick);
check('second clicked node also preserved', afterSecondClick.nodePreserved, afterSecondClick);
check('active indicator moved to the new domain', afterSecondClick.activeToday, afterSecondClick);
check('the previously-active domain lost its active indicator', afterSecondClick.activeOpsCleared, afterSecondClick);

/* ── 4. pointer actually leaving still closes the rail ── */
console.log('\n[4. pointer leaves the rail]');
await page.mouse.move(900, 850);
const hoveredAfterLeave = await page.evaluate(() => window.__railHovered());
check('rail is no longer :hover once the pointer actually leaves', !hoveredAfterLeave);

/* ── 5. a genuine visibility change (permission refresh) still fully rebuilds ── */
console.log('\n[5. permission change — domain SET changes — rail correctly rebuilds]');
const beforeIds = await page.evaluate(() => window.__railDomains());
await page.evaluate(() => window.__mark('today'));
await page.evaluate(() => window.__initShell(false)); // overtime.view revoked -> different domain set, fresh instance
const afterIds = await page.evaluate(() => window.__railDomains());
check('overtime disappears when canAccessModule(overtime) becomes false', !afterIds.includes('overtime') && beforeIds.length >= afterIds.length, JSON.stringify({ beforeIds, afterIds }));
check('the rail genuinely re-rendered (old marker gone, new nodes)', await page.evaluate(() => !window.__markStillThere('today')));

console.log('\n[6. console cleanliness]');
check('zero console/page errors across the whole hover/navigation sequence', errors.length === 0, errors.join(' | '));

await browser.close();
server.close();
console.log(`\ndomain-shell-rail-hover-check: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
