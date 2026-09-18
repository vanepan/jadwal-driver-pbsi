/* ss14-sidebar-navigation-close-check.mjs — SS14: the desktop rail must
   collapse on its own once the pointer leaves it after a module click,
   without requiring the user to click empty page space first.

   User-reported bug: hover the rail open -> click a module -> navigation
   happens -> pointer is no longer over the rail -> rail stays visually
   OPEN until something else on the page is clicked.

   Root cause: .domshell-rail's expand/collapse is pure CSS, driven by
   `:hover` OR `:focus-within` (platform.css, ~L14539). There is no JS
   mirror of "open/closed" anywhere. A mouse click on a <button> also
   focuses it (standard browser behavior on Chromium/Firefox/Windows), and
   that focus alone satisfies :focus-within on the ancestor rail — so once
   the pointer moves away and :hover drops, :focus-within is still true,
   holding the rail open. Only clicking somewhere else moves focus off the
   button (blurring it), which is exactly the "must click empty space"
   symptom reported.

   Fix (js/shell/domain-shell.js): a rail item's click handler now blurs
   itself immediately after navigating, but ONLY when the click was
   pointer-originated (tracked via a `pointerdown` flag on the rail
   container, self-clearing so an abandoned pointerdown never sticks).
   Keyboard activation (Tab focus + Enter/Space) never fires `pointerdown`,
   so the flag stays false and the button keeps focus exactly as before —
   keyboard users still get the expand-on-focus affordance after
   navigating with the keyboard.

   Same real-browser DI harness contract as domain-shell-rail-hover-check.mjs
   (js/shell/domain-shell.js imported directly with a mock cfg). Real CDP
   mouse input for the pointer cases so :hover/:focus-within are the
   browser's own genuine state, not a simulated class; a real DOM
   `.click()` with no preceding pointer event for the keyboard case (the
   same signal — no `pointerdown` was seen — a real Enter/Space keypress
   produces).

   Run: node scripts/ss14-sidebar-navigation-close-check.mjs   (exit 0 = pass)
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
  else { fail++; console.log(`  ✗ ${name}`); if (detail !== undefined) console.log('     • ' + String(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 400)); }
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
  window.__mkCfg = () => ({
    canAccessModule: (m) => ['home','driverops','gudang','pettycash','analytics','konfigurasi','engineering'].includes(m),
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
  window.__initShell = () => {
    document.querySelectorAll('.domshell-rail,.domshell-tabbar,#domshellMobileNavHost').forEach(e => e.remove());
    initDomainShell(window.__mkCfg());
    refreshDomainShell(true);
  };
  window.__railBox = (dom) => {
    const b = document.querySelector('.domshell-rail-item[data-domain="' + dom + '"]');
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  };
  window.__railExpanded = () => {
    const rail = document.querySelector('.domshell-rail');
    return !!rail && (rail.matches(':hover') || rail.matches(':focus-within'));
  };
  window.__railHovered = () => document.querySelector('.domshell-rail')?.matches(':hover') || false;
  window.__railFocusWithin = () => document.querySelector('.domshell-rail')?.matches(':focus-within') || false;
  window.__isActive = (dom) => {
    const b = document.querySelector('.domshell-rail-item[data-domain="' + dom + '"]');
    return !!b && b.classList.contains('domshell-rail-item--active') && b.getAttribute('aria-current') === 'page';
  };
  window.__keyboardActivate = (dom) => {
    // Simulates Tab+Enter: focus the button, then invoke its click handler
    // with NO preceding pointer event of any kind, exactly like a real
    // Enter/Space key activation (which the browser turns into a plain
    // 'click' without ever dispatching pointerdown/mousedown).
    const b = document.querySelector('.domshell-rail-item[data-domain="' + dom + '"]');
    b.focus();
    b.click();
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

/* ── A. Hover -> click module -> pointer moves outside: must close WITHOUT
        clicking empty page space (the reported bug, unfixed pre-SS14). ── */
console.log('\n[A. hover -> click a module -> pointer leaves -> rail must collapse on its own]');
await page.evaluate(() => window.__initShell());
const opsBox = await page.evaluate(() => window.__railBox('operations'));
await page.mouse.move(opsBox.x, opsBox.y);
check('rail expanded once pointer is over it', await page.evaluate(() => window.__railExpanded()));
await page.mouse.down();
await page.mouse.up();
check('module navigated (active indicator moved)', await page.evaluate(() => window.__isActive('operations')));
// The pointer now moves off the rail entirely -- no click anywhere else.
await page.mouse.move(900, 850);
const stateA = await page.evaluate(() => ({ hovered: window.__railHovered(), focusWithin: window.__railFocusWithin(), expanded: window.__railExpanded() }));
check(':hover is false once the pointer has actually left', !stateA.hovered, stateA);
check(':focus-within is ALSO false -- the click no longer leaves a stale focus behind', !stateA.focusWithin, stateA);
check('rail is fully collapsed with no click on empty page space required', !stateA.expanded, stateA);

/* ── B. Hover -> click module -> pointer STILL over the rail: unchanged
        established behavior (stays expanded). ── */
console.log('\n[B. hover -> click module -> pointer stays over the rail -> still expanded]');
await page.mouse.move(opsBox.x, opsBox.y);
check('rail re-expands on hover', await page.evaluate(() => window.__railExpanded()));
const todayBox = await page.evaluate(() => window.__railBox('today'));
await page.mouse.move(todayBox.x, todayBox.y);
await page.mouse.down();
await page.mouse.up();
const stateB = await page.evaluate(() => ({ expanded: window.__railExpanded(), active: window.__isActive('today') }));
check('navigated to the new module', stateB.active, stateB);
check('rail is still expanded -- pointer never left it', stateB.expanded, stateB);

/* ── C. Hover -> move outside without navigating: pre-existing close
        behavior must be untouched. ── */
console.log('\n[C. hover -> move outside, no click -- existing close behavior]');
await page.mouse.move(900, 850);
check('rail collapses on plain pointer-leave with no click involved', !(await page.evaluate(() => window.__railExpanded())));

/* ── D. Rapid double click, pointer ends outside: no stuck expanded state. ── */
console.log('\n[D. rapid double module click, then pointer leaves]');
const gudBox = await page.evaluate(() => window.__railBox('warehouse'));
await page.mouse.move(gudBox.x, gudBox.y);
await page.mouse.down(); await page.mouse.up();
const homeBox = await page.evaluate(() => window.__railBox('today'));
await page.mouse.move(homeBox.x, homeBox.y);
await page.mouse.down(); await page.mouse.up();
await page.mouse.move(900, 850);
const stateD = await page.evaluate(() => ({ expanded: window.__railExpanded(), active: window.__isActive('today') }));
check('second rapid click won navigation', stateD.active, stateD);
check('no stuck expanded state after rapid double click + pointer leave', !stateD.expanded, stateD);

/* ── E. Hover -> navigate -> pointer moves off IMMEDIATELY (no dwell). ── */
console.log('\n[E. navigate then move the pointer off in the very next step]');
await page.mouse.move(opsBox.x, opsBox.y);
await page.mouse.down(); await page.mouse.up();
await page.mouse.move(900, 5); // clear of the rail (fixed, pinned to the left edge), immediately
const stateE = await page.evaluate(() => window.__railExpanded());
check('no stale expanded state on immediate post-navigation pointer movement', !stateE);

/* ── H. Keyboard navigation: focus + activate with no pointer event at all
        must PRESERVE the existing focus-driven expand behavior. ── */
console.log('\n[H. keyboard activation (focus + click, no pointerdown) keeps the rail expanded]');
await page.evaluate(() => window.__keyboardActivate('operations'));
const stateH = await page.evaluate(() => ({ focusWithin: window.__railFocusWithin(), expanded: window.__railExpanded(), active: window.__isActive('operations') }));
check('keyboard-activated navigation succeeded', stateH.active, stateH);
check('rail remains expanded via :focus-within for keyboard users (unchanged behavior)', stateH.expanded && stateH.focusWithin, stateH);
// Now prove a REAL mouse click elsewhere still closes it for the keyboard case too.
await page.mouse.move(900, 850);
await page.mouse.down(); await page.mouse.up();
check('clicking elsewhere still closes it as before (blur via click-away untouched)', !(await page.evaluate(() => window.__railExpanded())));

/* ── J. Dark mode: same fix, same state behavior. ── */
console.log('\n[J. dark mode -- identical hover/click/leave behavior]');
await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
await page.mouse.move(opsBox.x, opsBox.y);
check('[dark] rail expands on hover', await page.evaluate(() => window.__railExpanded()));
const engBox = await page.evaluate(() => window.__railBox('engineering'));
await page.mouse.move(engBox.x, engBox.y);
await page.mouse.down(); await page.mouse.up();
await page.mouse.move(900, 850);
const stateJ = await page.evaluate(() => ({ expanded: window.__railExpanded(), active: window.__isActive('engineering') }));
check('[dark] navigated to the new module', stateJ.active, stateJ);
check('[dark] rail collapses on its own after the pointer leaves, same as light mode', !stateJ.expanded, stateJ);
await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));

/* ── K/L. Resize desktop -> mobile -> desktop must not orphan rail state. ── */
console.log('\n[K/L. resize desktop -> mobile -> desktop leaves no orphaned expanded/collapsed state]');
await page.mouse.move(opsBox.x, opsBox.y); // leave it hovered going into the resize
await page.setViewport({ width: 390, height: 844 });
await new Promise((r) => setTimeout(r, 50));
const mobileState = await page.evaluate(() => ({
  isMobileDrawer: !!document.querySelector('.domshell-rail--mobile-drawer'),
  railStillInLayout: !!document.querySelector('.app-layout > .domshell-rail'),
}));
check('rail reparents into the mobile drawer on narrow viewport', mobileState.isMobileDrawer, mobileState);
check('rail is no longer a direct .app-layout child (desktop position) once mobile', !mobileState.railStillInLayout, mobileState);
await page.setViewport({ width: 1280, height: 900 });
await new Promise((r) => setTimeout(r, 50));
// The physical cursor never moved during the resize, so it may now be
// sitting right back on top of the rail's screen position (position:fixed,
// pinned to the left edge) purely because the layout reverted underneath
// it -- that's correct real :hover, not an orphaned state. Move it away
// explicitly to isolate the thing actually worth proving: no leftover
// open/focus state independent of where the pointer really is.
await page.mouse.move(900, 850);
const backToDesktop = await page.evaluate(() => ({
  isMobileDrawer: !!document.querySelector('.domshell-rail--mobile-drawer'),
  expanded: window.__railExpanded(),
}));
check('rail leaves the mobile drawer class on returning to desktop width', !backToDesktop.isMobileDrawer, backToDesktop);
check('rail is NOT stuck expanded after the round-trip resize once the pointer is moved off it', !backToDesktop.expanded, backToDesktop);

console.log('\n[console cleanliness]');
check('zero console/page errors across the whole sequence', errors.length === 0, errors.join(' | '));

await browser.close();
server.close();
console.log(`\nss14-sidebar-navigation-close-check: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
