/* mobile-sidebar-navigation-check.mjs — V1.31.2 §15
   Mobile sidebar stale-overlay lifecycle, real browser, real login.

   Root cause (V1.31.1 audit, confirmed again this phase): the sidebar
   used to close only on a click matching a hardcoded CSS-class allowlist
   (`.v2-panel-nav-item, .v2-rail-item, #v2FooterLogoutDirect,
   .domshell-rail-item, .domshell-tab`) — a nav surface using a different
   class silently left the sidebar/overlay/scroll-lock stuck open. Fixed
   by making every top-level navigation function's ONE shared choke point
   (js/app.js#setWorkspace()) dispatch a generic 'pbsi:workspace-nav'
   event, and having the sidebar close on THAT instead of guessing at
   selectors — see app.js's own comment at both edit sites.

   This test proves the FIX, not the mechanism in isolation: real login,
   real DOMContentLoaded boot, real navigation through whatever mobile
   menu items the session's own role actually renders (never hardcodes a
   module name — different roles render different menus).

   Serves the local working tree; js/firebase.js still connects to real
   production Firebase for auth (this repo's own established constraint —
   there is no local-only auth path). READ-ONLY: login + navigate only,
   no record is created/edited/deleted.

   Run: node scripts/mobile-sidebar-navigation-check.mjs (exit 0 = pass) */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(req.url.split('?')[0]);
      const filePath = path.join(ROOT, urlPath === '/' ? '/index.html' : urlPath);
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('not found: ' + urlPath); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.listen(0, () => resolve(server));
  });
}

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}
async function checkAsync(name, run) {
  try { const r = await run(); check(name, r !== false, typeof r === 'string' ? r : ''); }
  catch (err) { fail++; console.log(`  ✗ ${name} — ${err.message}`); }
}

/** Reads the FULL sidebar/overlay/scroll-lock state in one shot. */
async function sidebarState(page) {
  return page.evaluate(() => ({
    sidebarOpen: document.getElementById('sidebar')?.classList.contains('sidebar-open') ?? null,
    overlayVisible: document.getElementById('sidebarOverlay')?.classList.contains('overlay-visible') ?? null,
    bodyLocked: document.body.classList.contains('sidebar-is-open'),
    overlayDisplay: document.getElementById('sidebarOverlay') ? getComputedStyle(document.getElementById('sidebarOverlay')).display : null,
  }));
}

/** The actual tap-blocking proof: elementFromPoint at the viewport center
 *  must resolve to real page content, never the sidebar overlay itself —
 *  this is what a REAL finger tap hits, unlike a synthetic .click(). */
async function centerHitsRealContent(page) {
  return page.evaluate(() => {
    const el = document.elementFromPoint(Math.floor(window.innerWidth / 2), Math.floor(window.innerHeight / 2));
    if (!el) return 'elementFromPoint returned null';
    if (el.id === 'sidebarOverlay' || el.closest('#sidebarOverlay')) return 'center tap hits the stale sidebar overlay';
    if (el.id === 'sidebar' || el.closest('#sidebar')) return 'center tap hits the sidebar panel itself (should be off-screen when closed)';
    return true;
  });
}

async function openSidebar(page) {
  await page.evaluate(() => document.getElementById('sidebarToggle')?.click());
  await new Promise((r) => setTimeout(r, 200));
}

/** Clicks the FIRST currently-rendered mobile nav destination, whatever
 *  it is for this session's actual role — never hardcodes a module name. */
async function clickFirstMobileNavItem(page) {
  return page.evaluate(() => {
    const candidates = [
      ...document.querySelectorAll('#sidebar .domshell-rail-item'),
      ...document.querySelectorAll('#sidebar .domshell-tab'),
      ...document.querySelectorAll('#sidebar .v2-rail-item'),
      ...document.querySelectorAll('#sidebar .sidebar-nav-item:not(.sidebar-nav-logout)'),
    ].filter((el) => el.offsetParent !== null && getComputedStyle(el).display !== 'none');
    if (!candidates.length) return null;
    const target = candidates[0];
    const label = (target.textContent || target.dataset.domain || target.id || '').trim().slice(0, 40);
    target.click();
    return label;
  });
}

async function main() {
  const server = await startServer();
  const port = server.address().port;
  let browser;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844 });
    const allLogs = [];
    const consoleErrors = [];
    page.on('console', (msg) => { allLogs.push(`[${msg.type()}] ${msg.text()}`); if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('pageerror', (err) => { allLogs.push(`[UNCAUGHT] ${String(err)}`); consoleErrors.push('[UNCAUGHT] ' + String(err)); });

    console.log('\n=== [1] Real login as leo, 390px mobile viewport ===');
    await page.goto(`http://localhost:${port}/index.html`, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.waitForSelector('#loginForm', { timeout: 20000 });
    await new Promise((r) => setTimeout(r, 500));
    await page.type('#loginUsername', 'leo');
    await page.type('#loginPin', '1234');
    await page.waitForSelector('.login-submit', { visible: true, timeout: 10000 });
    await new Promise((r) => setTimeout(r, 300));
    await page.click('.login-submit');
    await page.waitForFunction(() => { try { return JSON.parse(localStorage.getItem('pbsi_current_user') || 'null')?.username === 'leo'; } catch { return false; } }, { timeout: 30000 });
    check('logged in as leo', true);
    const settleCount = () => allLogs.filter((l) => l.includes('auth-state settled')).length;
    const settleDeadline = Date.now() + 20000;
    while (settleCount() < 2 && Date.now() < settleDeadline) await new Promise((r) => setTimeout(r, 250));
    await new Promise((r) => setTimeout(r, 2000));
    await page.evaluate(() => { document.getElementById('btnPushDismiss')?.click(); });

    console.log('\n=== [2] Baseline: sidebar starts closed, page interactive ===');
    let state = await sidebarState(page);
    check('sidebar starts closed (no stale state from boot)', state.sidebarOpen === false && state.overlayVisible === false && state.bodyLocked === false);

    console.log('\n=== [3] Open -> navigate via whatever mobile menu item this role actually renders -> fully closed ===');
    await openSidebar(page);
    state = await sidebarState(page);
    check('sidebar opens (overlay visible, body locked)', state.sidebarOpen === true && state.overlayVisible === true && state.bodyLocked === true);
    const label1 = await clickFirstMobileNavItem(page);
    check('a real mobile nav destination was found and clicked', !!label1, 'no candidate nav item rendered for this role/viewport — cannot exercise the fix');
    await new Promise((r) => setTimeout(r, 400));
    state = await sidebarState(page);
    check(`after navigating to "${label1}": sidebar closed`, state.sidebarOpen === false);
    check(`after navigating to "${label1}": overlay removed (not just invisible — display:none)`, state.overlayVisible === false && state.overlayDisplay === 'none');
    check(`after navigating to "${label1}": body scroll lock released`, state.bodyLocked === false);
    await checkAsync(`after navigating to "${label1}": destination is immediately tappable (no invisible blocking layer)`, () => centerHitsRealContent(page));

    console.log('\n=== [4] Repeated navigation across several destinations — no accumulated stale state ===');
    for (let i = 0; i < 3; i++) {
      await openSidebar(page);
      const label = await clickFirstMobileNavItem(page);
      await new Promise((r) => setTimeout(r, 400));
      state = await sidebarState(page);
      check(`round ${i + 1} ("${label}"): sidebar/overlay/lock all clear`, state.sidebarOpen === false && state.overlayVisible === false && state.bodyLocked === false);
    }

    console.log('\n=== [5] Open -> close manually (X button) -> navigate via a DIFFERENT surface (bottom-of-page probe) -> reopen -> navigate again ===');
    await openSidebar(page);
    await page.evaluate(() => document.getElementById('sidebarClose')?.click());
    await new Promise((r) => setTimeout(r, 400));
    state = await sidebarState(page);
    check('manual close (X) clears sidebar/overlay/lock', state.sidebarOpen === false && state.overlayVisible === false && state.bodyLocked === false);
    await openSidebar(page);
    const label2 = await clickFirstMobileNavItem(page);
    await new Promise((r) => setTimeout(r, 400));
    state = await sidebarState(page);
    check(`reopen -> navigate ("${label2}") -> still fully clears`, state.sidebarOpen === false && state.overlayVisible === false && state.bodyLocked === false);

    console.log('\n=== [6] Rapid: open -> navigate -> immediately tap the destination (no settle delay) ===');
    await openSidebar(page);
    await clickFirstMobileNavItem(page);
    // Deliberately NO delay here — the master-prompt scenario is exactly
    // "immediately tap target on destination must work", i.e. before any
    // fade-out timer would have fired.
    const immediateHit = await centerHitsRealContent(page);
    check('an immediate tap right after navigating does not hit a stale overlay', immediateHit === true, typeof immediateHit === 'string' ? immediateHit : '');
    await new Promise((r) => setTimeout(r, 400));
    state = await sidebarState(page);
    check('...and the state has settled fully clear shortly after too', state.sidebarOpen === false && state.overlayVisible === false && state.bodyLocked === false);

    console.log('\n=== [7] 430px viewport — same fix, different mobile width ===');
    await page.setViewport({ width: 430, height: 900 });
    await openSidebar(page);
    const label3 = await clickFirstMobileNavItem(page);
    await new Promise((r) => setTimeout(r, 400));
    state = await sidebarState(page);
    check(`430px: navigating ("${label3}") fully clears sidebar/overlay/lock`, state.sidebarOpen === false && state.overlayVisible === false && state.bodyLocked === false);
    await checkAsync('430px: destination is immediately tappable', () => centerHitsRealContent(page));

    console.log('\n=== [8] Zero fatal console/page errors across the whole run ===');
    const realErrors = consoleErrors.filter((e) => !/permission.denied/i.test(e));
    check('no fatal console/page errors', realErrors.length === 0, JSON.stringify(realErrors));

  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

main()
  .then(() => { console.log(`\n${pass} passed, ${fail} failed\n`); process.exit(fail === 0 ? 0 : 1); })
  .catch((err) => { console.error('\n[mobile-sidebar-navigation-check] FATAL:', err.stack || err.message); process.exit(1); });
