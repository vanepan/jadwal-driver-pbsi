// Redesign Phase 1a — real-app integration smoke test.
//
// The pure-logic test (verify-domain-shell-phase1a.js) exercises
// js/shell/domain-shell.js against a mocked cfg — it can't catch wiring
// mistakes in app.js's real initDomainShellV1() (typos in real function
// names, wrong DOM selectors, etc). This script loads the REAL app with
// domainShellV1 forced on via the documented localStorage override, so the
// real DOMContentLoaded bootstrap runs initDomainShellV1() for real.
//
// No real authenticated user exists in this environment (this app always
// hits real production Firebase — see project memory "Firebase Prod in
// Local Testing"), so canAccessModule() only allows 'home' — this verifies
// boot-time wiring + the always-visible Today domain, not role-gated
// content. That is a disclosed, standing limitation of this environment,
// consistent with how prior phases' Puppeteer harnesses are scoped.

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, 'domain-shell-smoke');
fs.mkdirSync(OUT_DIR, { recursive: true });

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  page.on('console', (msg) => { if (msg.type() === 'error') pageErrors.push(msg.text()); });

  // First navigation: establish origin so localStorage can be set.
  await page.goto('http://localhost:8000/index.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.setItem('pbsi_flag_visualShellV2', 'true');
    localStorage.setItem('pbsi_flag_domainShellV1', 'true');
  });

  // Reload so loadFeatureFlags()'s Priority-1 localStorage-override path
  // picks up both flags on a fresh DOMContentLoaded.
  await page.reload({ waitUntil: 'domcontentloaded' });
  // Beats app.js's own async auth-state listener, which shows #modalLogin
  // once it resolves with no authenticated user — a race a one-time hide
  // loses (same technique as the Phase 1 App Shell harness).
  await page.addStyleTag({ content: '#modalLogin, #app-splash { display: none !important; }' });

  // Give the real async bootstrap (loadFeatureFlags -> initDomainShellV1 ->
  // ... -> updatePermissionUI) a moment to settle.
  await new Promise((r) => setTimeout(r, 1500));

  const state = await page.evaluate(() => {
    const rail = document.querySelector('.domshell-rail');
    const tabbar = document.querySelector('.domshell-tabbar');
    const oldRail = document.getElementById('v2Rail');
    const oldPanel = document.getElementById('v2Panel');
    return {
      railExists: !!rail,
      railItemCount: rail ? rail.querySelectorAll('.domshell-rail-item').length : 0,
      railLabels: rail ? Array.from(rail.querySelectorAll('.domshell-rail-label')).map((el) => el.textContent) : [],
      activeLabel: document.querySelector('.domshell-rail-item--active .domshell-rail-label')?.textContent || null,
      tabbarExists: !!tabbar,
      oldRailExists: !!oldRail,   // MUST be false — mutually exclusive with the new shell
      oldPanelExists: !!oldPanel, // MUST be false
      bodyClasses: document.body.className,
      mainAreaMarginLeft: getComputedStyle(document.querySelector('.main-area')).marginLeft,
      appFlags: window.appFlags || null,
    };
  });

  // ── Command Palette: trigger exists, click opens it, typing doesn't crash ──
  const paletteState = await page.evaluate(() => {
    const trigger = document.querySelector('.domshell-palette-trigger');
    trigger?.click();
    const overlay = document.querySelector('.domshell-palette-overlay');
    const openDisplay = overlay ? getComputedStyle(overlay).display : null;
    const input = document.querySelector('.domshell-palette-input');
    if (input) {
      input.value = 'test query';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const resultsHtmlAfterType = document.querySelector('.domshell-palette-results')?.innerHTML || null;
    const escEvent = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    document.dispatchEvent(escEvent);
    const closedDisplay = overlay ? getComputedStyle(overlay).display : null;
    return { triggerExists: !!trigger, openDisplay, resultsHtmlAfterType, closedDisplay };
  });

  await page.setViewport({ width: 1440, height: 900 });
  await new Promise((r) => setTimeout(r, 200));
  await page.screenshot({ path: path.join(OUT_DIR, 'desktop-1440.png') });
  await page.setViewport({ width: 768, height: 900 });
  await new Promise((r) => setTimeout(r, 200));
  await page.screenshot({ path: path.join(OUT_DIR, 'tablet-768.png') });

  // ── Mobile: rail/tabbar relocated into the hamburger drawer ──
  await page.setViewport({ width: 390, height: 800 });
  await new Promise((r) => setTimeout(r, 250)); // resize listener settles
  const mobileState = await page.evaluate(() => {
    const railInDrawer = document.querySelector('#domshellMobileNavHost .domshell-rail');
    const railFixed = document.querySelector('.domshell-rail:not(.domshell-rail--mobile-drawer)');
    return {
      railInDrawerExists: !!railInDrawer,
      railFixedVisible: railFixed ? getComputedStyle(railFixed).display !== 'none' : false,
    };
  });
  await page.screenshot({ path: path.join(OUT_DIR, 'mobile-390-drawer-closed.png') });
  await page.evaluate(() => document.getElementById('sidebarToggle')?.click());
  await new Promise((r) => setTimeout(r, 350));
  await page.screenshot({ path: path.join(OUT_DIR, 'mobile-390-drawer-open.png') });
  const drawerOpenState = await page.evaluate(() => {
    const rail = document.querySelector('.domshell-rail--mobile-drawer');
    return { railVisible: rail ? getComputedStyle(rail).display !== 'none' : false, itemCount: rail ? rail.querySelectorAll('.domshell-rail-item').length : 0 };
  });

  await browser.close();

  console.log(JSON.stringify({ ...state, paletteState, mobileState, drawerOpenState }, null, 2));
  console.log('\n--- PAGE ERRORS ---');
  console.log(pageErrors.length ? pageErrors : 'none');

  const fail = [];
  if (!state.railExists) fail.push('new .domshell-rail did not mount');
  if (state.oldRailExists) fail.push('old #v2Rail exists — should be mutually exclusive with domainShellV1');
  if (state.oldPanelExists) fail.push('old #v2Panel exists — should be mutually exclusive with domainShellV1');
  if (!state.railLabels.includes('Today')) fail.push('Today domain missing from rail (the only one visible with no real auth)');
  if (state.activeLabel !== 'Today') fail.push(`expected active domain Today (only canAccessModule()-true domain pre-auth), got ${state.activeLabel}`);
  if (!state.bodyClasses.includes('domain-shell-active')) fail.push('body missing domain-shell-active class');
  if (!paletteState.triggerExists) fail.push('command palette trigger did not mount');
  if (paletteState.openDisplay !== 'flex') fail.push(`clicking trigger did not open palette overlay, display=${paletteState.openDisplay}`);
  if (paletteState.resultsHtmlAfterType == null) fail.push('palette results container missing after typing');
  if (paletteState.closedDisplay !== 'none') fail.push(`Escape did not close palette overlay, display=${paletteState.closedDisplay}`);
  // Reparenting into the drawer host happens on resize (independent of the
  // drawer's own open/closed slide state) — so this should be true even
  // before the hamburger is tapped.
  if (!mobileState.railInDrawerExists) fail.push('rail was not reparented into the mobile drawer host on resize to mobile width');
  if (!drawerOpenState.railVisible) fail.push('rail not visible after opening the mobile hamburger drawer');
  if (drawerOpenState.itemCount < 1) fail.push('rail has zero items inside the mobile drawer');
  if (pageErrors.length) fail.push(`console/page errors: ${pageErrors.join(' | ')}`);

  if (fail.length) {
    console.error('\nFAILURES:\n' + fail.map((f) => ' - ' + f).join('\n'));
    process.exitCode = 1;
  } else {
    console.log('\nReal-app smoke test passed.');
  }
})();
