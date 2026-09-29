/* ss14-11-workspace-nav-race-check.mjs — SS14.11.

   Real 2026-09-29 screen recording evidence (Engineering -> Today): ~500-
   800ms after Today's content first renders cleanly, a SECOND, self-
   referential cross-fade of Today-over-Today briefly appears (two offset,
   differently-opaque copies of the same header/content), coincident with
   the persistent sidebar rail visibly re-narrowing — i.e. a genuine SECOND
   document.startViewTransition()-driven navigation into 'home' actually ran
   a few hundred ms after the first, not a single transition's own cross-
   fade (frame-by-frame extraction confirmed Today's content was already
   fully, cleanly rendered several frames BEFORE the ghost appeared).

   Root cause (confirmed by direct instrumentation against a faithful
   harness running the REAL js/workspace/home-router.js + widget pipeline):
   js/app.js#setWorkspace()'s `isWorkspaceChange = name !== currentWorkspace`
   check races document.startViewTransition()'s own update callback (which
   is what actually writes `currentWorkspace`, inside applyWorkspaceState())
   — per the View Transitions spec that callback runs in a QUEUED TASK, not
   synchronously. Two setWorkspace(name) calls landing within that window
   (confirmed: well under 1ms apart is enough) both read the SAME stale
   `currentWorkspace`, both think they're a genuine new navigation, and both
   call document.startViewTransition() into the SAME destination. Per spec
   the second call skips the first rather than queuing it — benign on its
   own — but the two transitions' pseudo-element trees briefly coexist,
   which is what produces the visible double-image.

   This is a more severe manifestation of the "rapid nav click" race
   js/app.js's own _navTransitionDepth comment already anticipated (and the
   ss14-sidebar-active-state-transition-check.mjs / ss14-sidebar-view-
   transition-check.mjs suites already probe for "no stuck/duplicate active
   state" after one) — but neither of those suites checks how many
   document.startViewTransition() calls actually fire, only the FINAL
   settled state, so neither could have caught this.

   Fix (js/app.js, mirrors applyTheme()'s existing _themeRequested pattern
   from SS13's identical-shaped bug): a new `_workspaceRequested` is written
   synchronously the instant setWorkspace() is called, and isWorkspaceChange
   is computed against IT instead of the still-possibly-stale
   `currentWorkspace` — so a second call racing the first's still-pending
   transition correctly sees the destination as already-requested and takes
   the instant/no-transition path instead of starting a second, competing
   transition.

   [1] static  — js/app.js declares _workspaceRequested and setWorkspace()
       reads/writes it before computing isWorkspaceChange (not currentWorkspace).
   [2] dynamic — a faithful harness (real domain-shell.js, real platform.css,
       real js/workspace/home-router.js + js/widgets/executive/index.js
       widget pipeline, mock ctx/data — same technique as
       scripts/ss14-sidebar-view-transition-check.mjs, upgraded to the real
       Home pipeline since the bug is timing-dependent on Home's actual
       async widget load) with setWorkspace() reproduced BYTE-FAITHFUL to
       js/app.js's current (fixed) logic: two .click() calls on the SAME
       rail item in the same synchronous tick must result in exactly ONE
       document.startViewTransition() call, not two — the exact race the
       video caught.

   Run: node scripts/ss14-11-workspace-nav-race-check.mjs   (exit 0 = pass) */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); if (detail !== undefined) console.log('     ' + JSON.stringify(detail)); }
};

console.log('[1 — static: js/app.js#setWorkspace() reads/writes _workspaceRequested, not currentWorkspace, for the race-prone check]');
const appSrc = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf-8');
check('_workspaceRequested is declared (module-level, mirrors _themeRequested)',
  /let _workspaceRequested = null;/.test(appSrc));
const setWorkspaceBody = appSrc.slice(appSrc.indexOf('function setWorkspace(name) {'), appSrc.indexOf('function applyWorkspaceState('));
check('setWorkspace() computes isWorkspaceChange against _workspaceRequested',
  /const isWorkspaceChange = name !== _workspaceRequested;/.test(setWorkspaceBody));
check('setWorkspace() writes _workspaceRequested synchronously, before canViewTransition is computed',
  /_workspaceRequested = name;\s*\n\s*const canViewTransition/.test(setWorkspaceBody));

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css' };
const HARNESS = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/platform.css">
</head><body>
  <div class="app-layout">
    <aside id="sidebar"><nav class="sidebar-nav"></nav></aside>
    <div class="main-area"><header class="header">hdr</header><main class="main-content"></main></div>
  </div>
<script type="module">
  import { initDomainShell, refreshDomainShell } from '/js/shell/domain-shell.js';
  import { renderHome } from '/js/workspace/home-router.js';

  window.__vtCalls = [];
  const realStart = document.startViewTransition?.bind(document);
  document.startViewTransition = function (cb) {
    window.__vtCalls.push(performance.now());
    return realStart(cb);
  };

  function buildHomeContext() {
    return {
      user: { name: 'QA', role: 'admin' }, role: 'admin',
      assignments: [], myAssignments: [], requests: [], myRequests: [],
      logs: [], drivers: [], vehicles: [], models: null, recommendations: null,
      vehicleFlags: null, engineeringEvents: [],
      actions: new Proxy({}, { get: () => () => {} }),
    };
  }

  // Byte-faithful to js/app.js's CURRENT (post-SS14.11-fix) setWorkspace()/
  // applyWorkspaceState()/renderHomeWorkspace() shape for the Home path.
  let currentWorkspace = null;
  let _workspaceEverSet = false;
  let _workspaceRequested = null;
  let _navTransitionDepth = 0;
  const host = document.querySelector('.main-content');
  const homeWs = document.createElement('div');
  homeWs.id = 'v2HomeWorkspace';
  homeWs.className = 'v2-workspace exec-ui v2-analytics-claude';
  homeWs.style.display = 'none';
  host.appendChild(homeWs);
  const engWs = document.createElement('div');
  engWs.id = 'engWorkspace';
  engWs.style.display = 'none';
  host.appendChild(engWs);

  function renderHomeWorkspace() {
    renderHome(homeWs, buildHomeContext(), { skeleton: false }); // not awaited, matches app.js
  }
  function applyWorkspaceState(name, isWorkspaceChange) {
    currentWorkspace = name;
    const isHome = name === 'home';
    const isEng = name === 'engineering';
    homeWs.style.display = isHome ? 'block' : 'none';
    engWs.style.display = isEng ? 'block' : 'none';
    if (isEng) engWs.innerHTML = '<div style="padding:20px"><h1>Dashboard</h1></div>';
    if (isHome) renderHomeWorkspace();
  }
  window.__setWorkspace = (name) => {
    const isWorkspaceChange = name !== _workspaceRequested;
    _workspaceRequested = name;
    const canViewTransition = _workspaceEverSet && isWorkspaceChange && typeof document.startViewTransition === 'function';
    _workspaceEverSet = true;
    if (canViewTransition) {
      _navTransitionDepth++;
      document.documentElement.classList.add('domshell-nav-transition');
      const transition = document.startViewTransition(() => applyWorkspaceState(name, isWorkspaceChange));
      transition.finished.finally(() => {
        _navTransitionDepth = Math.max(0, _navTransitionDepth - 1);
        if (_navTransitionDepth === 0) document.documentElement.classList.remove('domshell-nav-transition');
      });
      transition.updateCallbackDone.catch(() => {});
      transition.ready.catch(() => {});
      transition.finished.catch(() => {});
      return;
    }
    applyWorkspaceState(name, isWorkspaceChange);
  };

  const landOverrides = {
    navHome: () => window.__setWorkspace('home'),
    navEngineering: () => window.__setWorkspace('engineering'),
    navJadwalDriver: () => window.__setWorkspace('dashboard'),
    navGudang: () => window.__setWorkspace('gudang'),
  };
  window.__mkCfg = () => ({
    canAccessModule: () => true,
    can: () => true, isAdmin: () => true, isBidang: () => false, isDriver: () => false,
    setRailModule: () => {}, getActiveRailModule: () => 'home', defaultModuleForRole: () => 'home',
    land: new Proxy({}, { get: (_, prop) => landOverrides[prop] || (() => {}) }),
    pcMenuTitles: { dashboard: 'Dashboard' }, otMenuTitles: { dashboard: 'Dashboard' },
    engMenuTitles: { dashboard: 'Dashboard' }, gudMenuTitles: { dashboard: 'Dashboard' },
    sicMenuTitles: { dashboard: 'Dashboard' },
    mountBefore: document.getElementById('sidebar'),
    getCurrentUser: () => ({ name: 'QA', role: 'admin', username: 'qa' }),
    formatRole: () => 'Administrator',
    logoSrc: '/assets/Logo-PBSI.png', brandLabel: 'Sarpras Ops', versionLabel: 'test',
  });
  window.__initShell = () => { initDomainShell(window.__mkCfg()); refreshDomainShell(true); window.__setWorkspace('home'); };
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

async function freshPage(browser) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(`http://localhost:${port}/harness`, { waitUntil: 'networkidle0', timeout: 45000 });
  await page.waitForFunction(() => window.__ready === true, { timeout: 10000 });
  await page.evaluate(() => window.__initShell());
  await new Promise((r) => setTimeout(r, 400));
  return { page, errors };
}

console.log('\n[2 — dynamic: a rapid same-tick double-click on Today must not start two competing transitions]');
console.log('    covering the video\'s own navigation matrix — Operations/Warehouse/Engineering -> Today,');
console.log('    desktop + mobile viewport, light + dark theme]');
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const MATRIX = [
  { fromDomain: 'engineering', viewport: { width: 1280, height: 900 }, theme: 'light', label: 'Engineering -> Today, desktop, light' },
  { fromDomain: 'engineering', viewport: { width: 1280, height: 900 }, theme: 'dark',  label: 'Engineering -> Today, desktop, dark' },
  { fromDomain: 'operations',  viewport: { width: 1280, height: 900 }, theme: 'light', label: 'Operations -> Today, desktop, light' },
  { fromDomain: 'warehouse',   viewport: { width: 1280, height: 900 }, theme: 'light', label: 'Warehouse -> Today, desktop, light' },
  { fromDomain: 'engineering', viewport: { width: 390, height: 844 },  theme: 'light', label: 'Engineering -> Today, mobile (390px), light' },
];
for (const { fromDomain, viewport, theme, label } of MATRIX) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  await page.setViewport(viewport);
  await page.goto(`http://localhost:${port}/harness`, { waitUntil: 'networkidle0', timeout: 45000 });
  await page.waitForFunction(() => window.__ready === true, { timeout: 10000 });
  if (theme === 'dark') await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await page.evaluate(() => window.__initShell());
  await new Promise((r) => setTimeout(r, 400));

  // Land on the FROM domain first (mirrors the video: Today -> X -> Today)
  // so the double-click below is a genuine cross-workspace nav.
  const clicked = await page.evaluate((dom) => {
    const b = document.querySelector(`.domshell-rail-item[data-domain="${dom}"]`);
    if (!b) return false;
    b.click();
    return true;
  }, fromDomain);
  if (!clicked) { check(`[${label}] rail item for "${fromDomain}" exists`, false); await page.close(); continue; }
  await new Promise((r) => setTimeout(r, 600));
  await page.evaluate(() => { window.__vtCalls = []; }); // reset counter for the click under test

  // Two native .click() calls in the SAME synchronous tick — the tightest
  // possible reproduction of two clicks landing before the first's
  // View-Transition update callback has updated currentWorkspace.
  await page.evaluate(() => {
    const b = document.querySelector('.domshell-rail-item[data-domain="today"]');
    b.click(); b.click();
  });
  await new Promise((r) => setTimeout(r, 800));

  const vtCalls = await page.evaluate(() => window.__vtCalls);
  check(`[${label}] exactly ONE document.startViewTransition() call for a same-tick double-click into Today (was 2 before the fix)`,
    vtCalls.length === 1, vtCalls);
  const finalWorkspace = await page.evaluate(() => document.querySelector('.domshell-rail-item[data-domain="today"]').classList.contains('domshell-rail-item--active'));
  check(`[${label}] Today ends up the active rail domain`, finalWorkspace === true);
  const homeVisible = await page.evaluate(() => document.getElementById('v2HomeWorkspace').style.display === 'block');
  check(`[${label}] Home workspace host ends up visible`, homeVisible === true);
  check(`[${label}] zero console/page errors`, errors.length === 0, errors);
  await page.close();
}

console.log('\n[3 — dynamic: a genuinely SEPARATE rapid nav (not a same-target double-click) still gets its own transition]');
{
  const { page, errors } = await freshPage(browser);
  await page.evaluate(() => { window.__vtCalls = []; });
  // Home -> Engineering -> Home, each a real, distinct destination, fired
  // back-to-back with no delay — must still be treated as two real
  // navigations (the fix must not collapse genuinely different targets).
  await page.evaluate(() => document.querySelector('.domshell-rail-item[data-domain="engineering"]').click());
  await page.evaluate(() => document.querySelector('.domshell-rail-item[data-domain="today"]').click());
  await new Promise((r) => setTimeout(r, 800));
  const vtCalls = await page.evaluate(() => window.__vtCalls);
  check('two distinct back-to-back navigations still produce two document.startViewTransition() calls',
    vtCalls.length === 2, vtCalls);
  check('zero console/page errors', errors.length === 0, errors);
  await page.close();
}

await browser.close();
server.close();
console.log(`\nss14-11-workspace-nav-race-check: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
