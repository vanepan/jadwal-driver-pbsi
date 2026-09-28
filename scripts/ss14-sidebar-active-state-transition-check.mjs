/* ss14-sidebar-active-state-transition-check.mjs — SS14.10: stale sidebar
   active-indicator during navigation view transitions.

   ROOT CAUSE (confirmed via getComputedStyle + a controlled A/B stylesheet
   injection, not assumed): the existing suppression rule for the rail's
   own named view-transition group,
     html.domshell-nav-transition ::view-transition-group(domshell-rail),
     html.domshell-nav-transition ::view-transition-old(domshell-rail),
     html.domshell-nav-transition ::view-transition-new(domshell-rail)
     { animation: none; }
   used a DESCENDANT COMBINATOR (a space before each `::view-transition-*`)
   which never matches at all — view-transition pseudo-elements are only
   selectable via a compound selector attached directly to their
   originating root element. Because the rule was a silent no-op since
   SS14.4, the browser's own UA default cross-fade
   (-ua-view-transition-fade-out / -ua-view-transition-fade-in) ran on the
   rail's old/new snapshots for the full ~250ms of every navigation. Since
   the PREVIOUS domain's active-highlight pixels are baked into the "old"
   snapshot, that snapshot staying >0 opacity on top of the live (already-
   updated) DOM is what a real screen recording caught as the active
   indicator staying on the previous domain for ~1.1s before snapping.
   Fixed by removing the descendant-combinator space (compound-attaching
   the pseudo-elements to `html.domshell-nav-transition` directly) and
   keeping `!important` as defense-in-depth, matching the identical
   existing precedent for prefers-reduced-motion/data-anim="off" just
   below it in platform.css.

   This suite asserts two independent things that together cover the bug:
   1. The underlying DOM active-state (class + aria-current) was ALREADY
      correct and synchronous before this fix (confirmed in SS14.9 via
      MutationObserver, t~4ms) — re-verified here across 8 pairs plus
      rapid navigation, to prove this fix didn't disturb it.
   2. The view-transition pseudo-elements for domshell-rail now actually
      suppress their own animation for the ENTIRE transition lifetime
      (animationName "none", opacity pinned at 1 at every sampled point)
      — this is the actual fix, and is what stops the stale-snapshot
      overlay from ever existing in the first place.

   Explicit limitation (unchanged from every other ss14-sidebar-*.mjs
   suite in this project): this is computed-style/DOM-state sampling, not
   pixel-level screenshot diffing — true rendered-pixel visual regression
   testing is not reliably available in this Puppeteer/headless-Chrome
   environment (see ss14-persistent-shell-geometry-check.mjs for the
   specific compositing artifact that rules screenshots out here). Real
   visual confirmation for this fix came from a real screen recording
   during SS14.9's investigation, not from this automated suite.

   Uses the same faithful harness as the other ss14-sidebar-*.mjs suites
   (real domain-shell.js, real platform.css, real
   document.startViewTransition() wired exactly like js/app.js's
   setWorkspace()).

   Run: node scripts/ss14-sidebar-active-state-transition-check.mjs   (exit 0 = pass) */

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
  window.__activeState = () => {
    const out = {};
    document.querySelectorAll('.domshell-rail-item').forEach(btn => {
      out[btn.dataset.domain] = {
        active: btn.classList.contains('domshell-rail-item--active'),
        ariaCurrent: btn.getAttribute('aria-current'),
      };
    });
    return out;
  };
  window.__pseudoState = () => {
    const html = document.documentElement;
    const pseudos = ['::view-transition-group(domshell-rail)', '::view-transition-old(domshell-rail)', '::view-transition-new(domshell-rail)'];
    const out = {};
    for (const p of pseudos) {
      const cs = getComputedStyle(html, p);
      out[p] = { animationName: cs.animationName, opacity: cs.opacity };
    }
    return out;
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

const click = async (dom) => {
  const box = await page.evaluate((d) => window.__railBox(d), dom);
  await page.mouse.move(box.x, box.y, { steps: 5 });
  await page.mouse.down(); await page.mouse.up();
};

// 8 requested pairs (domain ids: 'warehouse' = Gudang rail item)
const pairs = [
  ['operations', 'today'], ['today', 'operations'],
  ['warehouse', 'today'], ['today', 'warehouse'],
  ['engineering', 'today'], ['today', 'engineering'],
  ['operations', 'warehouse'], ['warehouse', 'operations'],
];

for (const [from, to] of pairs) {
  console.log(`\n[${from} -> ${to}]`);
  await click(from);
  await new Promise(r => setTimeout(r, 350));

  const preState = await page.evaluate(() => window.__activeState());
  check(`  [${from}->${to}] "${from}" is active before navigating`, preState[from].active && preState[from].ariaCurrent === 'page', preState);

  await click(to);

  // Sample the live DOM active-state AND the pseudo-element suppression
  // state at closely-spaced points across the whole transition lifetime.
  const marks = [0, 10, 30, 60, 100, 150, 200, 260, 350];
  const timeline = [];
  let elapsed = 0;
  for (const t of marks) {
    const wait = t - elapsed; if (wait > 0) { await new Promise(r => setTimeout(r, wait)); elapsed += wait; }
    const [active, pseudo] = await page.evaluate(() => [window.__activeState(), window.__pseudoState()]);
    timeline.push({ t, active, pseudo });
  }

  // 1. DOM active-state sync: once "to" becomes active, "from" must
  //    already be inactive at that same sample (no window where both, or
  //    neither, read active) -- this was already true pre-fix (SS14.9);
  //    re-verified here to prove the fix didn't disturb it.
  const desyncs = timeline.filter(e => e.active[to].active === e.active[from].active);
  check(`  [${from}->${to}] "${to}" and "${from}" active-state never agree (always exactly one active) at any sampled point`, desyncs.length === 0, desyncs);

  const finalState = timeline[timeline.length - 1].active;
  check(`  [${from}->${to}] final state: "${to}" active`, finalState[to].active && finalState[to].ariaCurrent === 'page', finalState);
  check(`  [${from}->${to}] final state: "${from}" inactive`, !finalState[from].active && finalState[from].ariaCurrent === 'false', finalState);

  // 2. The actual SS14.10 fix: the rail's own view-transition pseudo-
  //    elements must never show a running cross-fade -- animationName
  //    "none" and opacity pinned at 1 at every single sampled point,
  //    including mid-transition (t=100/150/200), not just before/after.
  const leaks = timeline.filter(e =>
    Object.values(e.pseudo).some(p => p.animationName !== 'none' || Number(p.opacity) !== 1)
  );
  check(`  [${from}->${to}] domshell-rail view-transition pseudo-elements never animate (animation:none, opacity:1 held throughout)`, leaks.length === 0, leaks);
}

// Dark mode: the fix is a plain selector/animation rule with no theme
// dependency, but Phase 12 explicitly calls for light+dark coverage --
// re-run the core suppression check once under [data-theme="dark"].
console.log('\n[dark mode: operations -> today]');
await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
await click('operations'); await new Promise(r => setTimeout(r, 350));
await click('today');
{
  const marks = [0, 30, 100, 200, 300];
  const timeline = [];
  let elapsed = 0;
  for (const t of marks) {
    const wait = t - elapsed; if (wait > 0) { await new Promise(r => setTimeout(r, wait)); elapsed += wait; }
    timeline.push(await page.evaluate(() => window.__pseudoState()));
  }
  const leaks = timeline.filter(snap => Object.values(snap).some(p => p.animationName !== 'none' || Number(p.opacity) !== 1));
  check('  [dark mode] domshell-rail view-transition pseudo-elements never animate', leaks.length === 0, leaks);
  const finalActive = await page.evaluate(() => window.__activeState());
  check('  [dark mode] final state: "today" active', finalActive.today.active, finalActive);
}
await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));

// Rapid navigation: no duplicate-view-transition-name errors, no stuck/
// desynced active state, no console errors under back-to-back clicks.
// NOTE: which domain the LAST click in a rapid back-to-back sequence
// lands on is a PRE-EXISTING View-Transition-orchestration behavior of
// this app, independently verified (via a before/after git-stash
// comparison of this exact test) to be byte-for-byte identical whether
// or not the SS14.10 CSS fix is applied -- a rapid second
// startViewTransition() call while the first is still in flight does not
// always let the second click's target "win" the final active state.
// That is out of scope for SS14.10 (a separate JS/orchestration question,
// not the CSS animation-suppression bug this suite targets) and is NOT
// asserted here. What SS14.10 actually needs from rapid navigation --
// that it never leaves the rail in a broken state (no domain active, two
// domains active, or a console error) -- is what these checks assert.
console.log('\n[rapid navigation: operations -> today -> operations, back to back]');
await click('operations'); await new Promise(r => setTimeout(r, 350));
await click('today');
await click('operations');
await new Promise(r => setTimeout(r, 500));
{
  const state = await page.evaluate(() => window.__activeState());
  const activeCount = Object.values(state).filter(s => s.active).length;
  check('  exactly one domain reads active after rapid double-click (no stuck/duplicate active state)', activeCount === 1, state);
}

console.log('\n[rapid navigation: operations -> warehouse -> today, back to back]');
await click('operations'); await new Promise(r => setTimeout(r, 350));
await click('warehouse');
await click('today');
await new Promise(r => setTimeout(r, 500));
{
  const state = await page.evaluate(() => window.__activeState());
  const activeCount = Object.values(state).filter(s => s.active).length;
  check('  exactly one domain reads active after rapid triple-click sequence (no stuck/duplicate active state)', activeCount === 1, state);
}

console.log('\n[console cleanliness]');
check('zero console/page errors across the whole sequence (no duplicate view-transition-name, no stuck transition)', errors.length === 0, errors);

await browser.close();
server.close();
console.log(`\nss14-sidebar-active-state-transition-check: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
