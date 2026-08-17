// Phase 1 App Shell rebuild (v1.30.9.13) verification.
//
// initV2Rail()/initV2Panel() normally only mount after loadFeatureFlags()
// resolves visualShellV2===true, which requires a real Firebase round-trip
// (this environment always hits real production RTDB — see project memory
// "Firebase Prod in Local Testing"). To keep this verification deterministic
// and offline, we bypass the flag fetch and call the mount functions
// directly via page.evaluate(), then force every rail item visible (as an
// admin session would see, via updatePermissionUI()'s own display toggles)
// so every breakpoint/theme combination is screenshotted with the full
// shell, not just the always-visible Home/Driver Ops items.
//
// This verifies presentation only (computed styles, layout, screenshots).
// It does NOT verify a live-authenticated click-through — that remains the
// standing limitation this repo's convention requires disclosing plainly.

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, 'app-shell-verify');
fs.mkdirSync(OUT_DIR, { recursive: true });

const DESKTOP_WIDTHS = [1440, 1280, 1024];
const TABLET_WIDTHS = [900, 768];
const MOBILE_WIDTHS = [480, 390, 375, 320];

async function mountShell(page) {
  await page.evaluate(() => {
    if (typeof initV2Rail === 'function') initV2Rail();
    if (typeof initV2Panel === 'function') initV2Panel();
    document.body.classList.add('v2-shell-active', 'app-ready'); // app-ready hides #app-splash
    const login = document.getElementById('modalLogin');
    if (login) login.style.display = 'none'; // app.js shows this when no authenticated user exists
    // Simulate an admin session: reveal every rail item + panel-nav block
    // that updatePermissionUI() would normally reveal post-auth, so the
    // full shell (not just Home/Driver Ops) is visible for screenshotting.
    document.querySelectorAll('.v2-rail-item[style*="display"]').forEach(el => {
      if (el.id !== 'v2RailAdmin') el.style.display = 'flex';
    });
    // 'home' is the only module canAccessModule() allows with no real
    // authenticated user (every other module redirects to home via
    // setRailModule's own access guard) — use it so activeRailModule
    // actually matches what we click later for the overlay-toggle test.
    if (typeof setRailModule === 'function') setRailModule('home');
  });
}

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const results = { checks: [], errors: [] };

  for (const theme of ['light', 'dark']) {
    const page = await browser.newPage();
    page.on('pageerror', (err) => results.errors.push(`[${theme}] ${err.message}`));

    await page.goto('http://localhost:8000/index.html', { waitUntil: 'domcontentloaded' });
    // !important beats app.js's own async auth-state listener, which shows
    // #modalLogin (inline style, no !important) whenever it resolves with no
    // authenticated user — a race that a one-time evaluate() hide loses.
    await page.addStyleTag({ content: '#modalLogin, #app-splash { display: none !important; }' });
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
    await mountShell(page);

    // ── Desktop + tablet: rail + panel computed styles ──
    for (const width of [...DESKTOP_WIDTHS, ...TABLET_WIDTHS]) {
      await page.setViewport({ width, height: 900 });
      await new Promise(r => setTimeout(r, 120));

      const tier = width >= 1024 ? 'desktop' : 'tablet';
      const vals = await page.evaluate(() => {
        const rail = document.getElementById('v2Rail');
        const panel = document.getElementById('v2Panel');
        const activeItem = document.querySelector('.v2-rail-item--active');
        const activeNav = document.querySelector('.v2-panel-nav-item--active');
        const cs = (el) => el ? getComputedStyle(el) : null;
        return {
          railBg: cs(rail)?.backgroundColor,
          railWidth: rail?.getBoundingClientRect().width,
          panelBg: cs(panel)?.backgroundColor,
          panelWidth: panel?.getBoundingClientRect().width,
          panelDisplay: cs(panel)?.display,
          panelTransform: cs(panel)?.transform,
          activeRailBg: cs(activeItem)?.backgroundColor,
          activeRailColor: cs(activeItem)?.color,
          activeNavBg: cs(activeNav)?.backgroundColor,
          activeNavColor: cs(activeNav)?.color,
          activeNavWeight: cs(activeNav)?.fontWeight,
        };
      });
      results.checks.push({ theme, width, tier, ...vals });

      const shot = path.join(OUT_DIR, `${tier}-${width}-${theme}.png`);
      await page.screenshot({ path: shot });
    }

    // ── Tablet overlay: open it and screenshot the revealed state ──
    await page.setViewport({ width: 900, height: 900 });
    await page.evaluate(() => {
      // Re-clicking the active rail item at tablet width toggles the overlay.
      // 'home' is what mountShell() actually landed on (see its comment).
      document.getElementById('v2RailHome')?.click();
    });
    await new Promise(r => setTimeout(r, 350)); // clear the 260ms slide transition
    const overlayOpen = await page.evaluate(() =>
      document.getElementById('v2Panel')?.classList.contains('v2-panel--tablet-open'));
    results.checks.push({ theme, width: 900, tier: 'tablet-overlay-open', overlayOpen });
    await page.screenshot({ path: path.join(OUT_DIR, `tablet-900-${theme}-overlay-open.png`) });

    // ── Mobile: relocated drawer + bottom nav + FAB ──
    for (const width of MOBILE_WIDTHS) {
      await page.setViewport({ width, height: 800 });
      await new Promise(r => setTimeout(r, 120));
      await page.screenshot({ path: path.join(OUT_DIR, `mobile-${width}-${theme}.png`) });
    }

    // Open the mobile drawer once at 375px for a direct look at the
    // relocated rail+panel composition.
    await page.setViewport({ width: 375, height: 800 });
    await page.evaluate(() => document.getElementById('sidebarToggle')?.click());
    await new Promise(r => setTimeout(r, 350));
    await page.screenshot({ path: path.join(OUT_DIR, `mobile-375-${theme}-drawer-open.png`) });

    await page.close();
  }

  await browser.close();

  fs.writeFileSync(path.join(OUT_DIR, 'results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
  if (results.errors.length) {
    console.error('PAGE ERRORS DETECTED:', results.errors);
    process.exitCode = 1;
  }
})();
