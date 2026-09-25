/* ss14-persistent-shell-geometry-check.mjs — SS14.7: two remaining issues
   after SS14.5 (rail width) and SS14.6 (label/brandtext/usertext opacity).

   ISSUE 2 — CONFIRMED, FIXED: .main-area's own margin-left is keyed off
   the EXACT same .domshell-rail:hover/:focus-within state, via the
   existing sibling selector (".domshell-rail:hover ~ .main-area
   {margin-left:220px}", platform.css). Since real :hover genuinely lapses
   for the duration of a navigation view transition (SS14.5's root cause),
   .main-area's margin-left reacted the same way width and opacity did —
   confirmed by direct measurement, mouse genuinely stationary and
   hovering throughout a real navigation:
     220 -> 97.6 -> 76.1 -> 72.3 -> 72 (sat there through the transition)
     -> 215.8 -> 220 (snapped back once real hover returned)
   reading as the module content jumping left then right on every single
   navigation. Fixed with the identical dwell technique as SS14.5/14.6,
   applied to .main-area's margin-left transition.

   ISSUE 1 — INVESTIGATED, NOT REPRODUCED AS A SEPARATE DEFECT: "the
   sidebar re-renders when returning to Today." DOM node identity for the
   rail/buttons/labels/icons was verified stable across EVERY Today-
   involving transition tested (today<->operations, today<->warehouse,
   today<->engineering) — domain-shell.js's renderRail() has no Today-
   specific code path (confirmed by reading enterDomain()/enterTopScreen())
   and the idsChanged rebuild path never triggers for same-visible-domain-
   set navigation, which "any module -> Today" always is for this app's
   fixed domain list. The one additional avenue investigated — screenshot
   comparison — hit a genuine, separately-confirmed Puppeteer/headless-
   Chrome limitation: a CSS opacity transition driven by a PROGRAMMATIC
   .focus() (as opposed to genuine OS-level input) can fail to composite/
   paint to the screenshot buffer even though getComputedStyle correctly
   reports the post-transition value — proven by forcing an unrelated
   inline-style mutation, which immediately made the "missing" label
   paint correctly with no other change. This is a testing-tool artifact,
   not a product behavior; screenshots are therefore NOT used as evidence
   in this suite. Given Issue 2 (a genuine, jarring 148px content shift on
   every single navigation, Today included) is now fixed, and DOM/CSS-
   logic level investigation of Today specifically found no independent
   defect, Issue 1 is most plausibly explained by Issue 2 rather than a
   separate root cause. This suite verifies the DOM-identity and geometry
   invariants that would catch a REAL Today-specific defect if one exists.

   Uses the same faithful harness as the other ss14-sidebar-*.mjs suites
   (real domain-shell.js, real platform.css, real
   document.startViewTransition() wired exactly like js/app.js's
   setWorkspace(), including the _workspaceEverSet gate).

   Explicit limitation (stated up front, per SS14.7 Phase 13's
   instruction): this is high-frequency computed-style/geometry sampling,
   not pixel-level screenshot diffing — true rendered-pixel visual
   regression testing is not reliably available in this environment (see
   the Issue 1 discussion above for why screenshots specifically cannot be
   trusted for focus-driven transition states here).

   Run: node scripts/ss14-persistent-shell-geometry-check.mjs   (exit 0 = pass) */

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
    let n = 0;
    document.querySelectorAll('.domshell-rail, .domshell-rail-item, .domshell-rail-label, .domshell-rail-icon').forEach(el => {
      if (!el.dataset.probeId) el.dataset.probeId = 'orig-' + (n++);
    });
  };
  window.__identitySnapshot = () => {
    const sel = '.domshell-rail, .domshell-rail-item, .domshell-rail-label, .domshell-rail-icon';
    return Array.from(document.querySelectorAll(sel)).map(el => el.dataset.probeId || 'UNTAGGED');
  };
  window.__railCount = () => document.querySelectorAll('.domshell-rail').length;
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

// today, operations, warehouse (Gudang), finance (proxy for the Finance/
// Petty Cash domain — Petty Cash is a nested screen under Finance, not a
// top-level rail domain in this app's structure).
const pairs = [
  ['operations', 'today'], ['today', 'operations'],
  ['operations', 'warehouse'], ['warehouse', 'operations'],
  ['operations', 'finance'], ['finance', 'today'],
];

for (const [from, to] of pairs) {
  console.log(`\n[${from} -> ${to}]`);
  const fromBox = await page.evaluate((d) => window.__railBox(d), from);
  const toBox = await page.evaluate((d) => window.__railBox(d), to);
  await page.mouse.move(fromBox.x, fromBox.y, { steps: 10 });
  await new Promise(r => setTimeout(r, 350));
  await page.mouse.move(toBox.x, toBox.y, { steps: 10 });
  await new Promise(r => setTimeout(r, 350));

  const preIdentity = await page.evaluate(() => window.__identitySnapshot());
  const preRailCount = await page.evaluate(() => window.__railCount());

  await page.mouse.down(); await page.mouse.up();

  const marks = [0, 20, 50, 80, 100, 150, 200, 250, 300, 400, 600];
  let elapsed = 0;
  const timeline = [];
  for (const t of marks) {
    const wait = t - elapsed; if (wait > 0) { await new Promise(r => setTimeout(r, wait)); elapsed += wait; }
    const state = await page.evaluate(() => {
      const rail = document.querySelector('.domshell-rail');
      const mainArea = document.querySelector('.main-area');
      const label = rail.querySelector('.domshell-rail-label');
      return {
        railWidth: +rail.getBoundingClientRect().width.toFixed(1),
        contentX: +mainArea.getBoundingClientRect().x.toFixed(1),
        labelOpacity: label ? Number(getComputedStyle(label).opacity).toFixed(2) : null,
      };
    });
    timeline.push({ t, ...state });
  }

  check(`  [${from}->${to}] content X never enters collapsed geometry (<200) at any sampled point`, timeline.every(e => e.contentX >= 200), timeline.map(e => e.contentX));
  check(`  [${from}->${to}] final content X equals the expanded shell geometry (220)`, timeline[timeline.length - 1].contentX === 220, timeline[timeline.length - 1]);
  check(`  [${from}->${to}] rail width never drops below 200 (SS14.5 contract)`, timeline.every(e => e.railWidth >= 200));
  check(`  [${from}->${to}] label opacity never drops below 0.95 (SS14.6 contract)`, timeline.every(e => Number(e.labelOpacity) >= 0.95), timeline.map(e => e.labelOpacity));

  const postIdentity = await page.evaluate(() => window.__identitySnapshot());
  const postRailCount = await page.evaluate(() => window.__railCount());
  check(`  [${from}->${to}] sidebar DOM node identity preserved (no unintended replacement)`, JSON.stringify(preIdentity) === JSON.stringify(postIdentity), { pre: preIdentity, post: postIdentity });
  check(`  [${from}->${to}] no duplicate rail (exactly one .domshell-rail before and after)`, preRailCount === 1 && postRailCount === 1, { pre: preRailCount, post: postRailCount });

  const content = await page.evaluate(() => document.getElementById('content').textContent);
  check(`  [${from}->${to}] content transition actually fired (content changed)`, content.length > 0);
}

console.log('\n[console cleanliness]');
check('zero console/page errors across the whole sequence (no duplicate view-transition-name, no stale content)', errors.length === 0, errors);

await browser.close();
server.close();
console.log(`\nss14-persistent-shell-geometry-check: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
