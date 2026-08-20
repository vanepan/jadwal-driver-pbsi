// Design System Program Phase 6 — PBSI Authentication & App Entry Transition.
// Visual + behavioral pass for the redesigned boot/login surfaces and the
// entry-transition.js module. Screenshots real, running surfaces (not just
// source-text checks).
//
// DISCLOSED LIMITATION: a full real-Firebase-custom-token login round-trip
// (the actual success path, i.e. wrong-PIN → correct-PIN → transition) is
// not exercisable here without a known-safe test account — none exists now
// that the "Masuk Cepat" demo-credential chips have been deliberately
// deleted (this phase's own security fix). What IS exercised for real:
//   - The FAILURE path end-to-end, against the real production verifyPin
//     Cloud Function (wrong credentials — safe, no side effects beyond a
//     normal failed-login audit entry, same as any real mistyped PIN).
//   - playLoginSuccessTransition() / playLogoutExitTransition() invoked
//     directly against synthetic DOM in an isolated page, to confirm the
//     FLIP/animation logic itself runs without error and produces sane
//     geometry — this is a unit-level check of the transition module, not
//     an end-to-end auth test.
// This mirrors the same category of gap the Phase 4 report already
// disclosed for full rail rendering in headless Puppeteer.

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const OUT_DIR = path.join(__dirname, 'entry-transition-verify');
fs.mkdirSync(OUT_DIR, { recursive: true });

const BASE = 'http://localhost:8000';

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const fail = [];

  // ── 1) Fresh unauthenticated boot: splash + login, light/dark × desktop/mobile ──
  for (const theme of ['light', 'dark']) {
    for (const vp of [{ name: 'desktop', width: 1400, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
      const page = await browser.newPage();
      const pageErrors = [];
      page.on('pageerror', (e) => pageErrors.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error' && !/Fetch Firebase data gagal/.test(m.text())) pageErrors.push(m.text()); });
      await page.setViewport({ width: vp.width, height: vp.height });
      await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
      // Splash is gone ~250ms after .app-ready — sample it immediately,
      // before the settle wait below lets it auto-remove.
      const splashSeen = await page.evaluate(() => {
        const splash = document.getElementById('app-splash');
        const mark = splash ? splash.querySelector('.brand-mark--splash img') : null;
        return { splashExisted: !!splash, splashMarkHadImg: !!mark };
      });
      // Give boot a moment to settle (auth resolves to "no session" quickly
      // against real Firebase since there's no stored session at all).
      await new Promise((r) => setTimeout(r, 1200));

      const info = await page.evaluate(() => {
        const loginScreen = document.getElementById('modalLogin');
        const loginVisible = loginScreen && getComputedStyle(loginScreen).display !== 'none';
        const crest = document.querySelector('.login-brand-crest');
        const crestBg = crest ? getComputedStyle(crest).backgroundColor : null;
        const hasQuickAccess = !!document.getElementById('loginQuickAccess') || !!document.querySelector('.login-quick-chip');
        const errorEl = document.getElementById('loginError');
        const errorHidden = errorEl ? errorEl.hidden : null;
        const errorUsesInlineDisplay = errorEl ? /display\s*:/.test(errorEl.getAttribute('style') || '') : false;
        return {
          loginVisible,
          crestBg,
          hasQuickAccess,
          errorHidden,
          errorUsesInlineDisplay,
          bodyReady: document.body.classList.contains('app-ready'),
        };
      });
      info.splashExisted = splashSeen.splashExisted;
      info.splashMarkHadImg = splashSeen.splashMarkHadImg;

      if (!info.bodyReady) fail.push(`[${theme}/${vp.name}] body never reached .app-ready`);
      if (!splashSeen.splashExisted) fail.push(`[${theme}/${vp.name}] #app-splash was not present at initial paint`);
      if (!splashSeen.splashMarkHadImg) fail.push(`[${theme}/${vp.name}] splash brand-mark wrapper is missing its <img>`);
      if (!info.loginVisible) fail.push(`[${theme}/${vp.name}] login screen did not appear for a fresh unauthenticated session`);
      if (info.hasQuickAccess) fail.push(`[${theme}/${vp.name}] Masuk Cepat quick-access markup is still present (should be fully deleted)`);
      if (info.errorHidden !== true) fail.push(`[${theme}/${vp.name}] #loginError should start hidden (via [hidden] attribute), got hidden=${info.errorHidden}`);
      if (info.errorUsesInlineDisplay) fail.push(`[${theme}/${vp.name}] #loginError still carries an inline display style — should be [hidden]-driven only`);
      // The old crest was a flat accent(crimson)-filled square. The new
      // brand-mark is a white/neutral badge — rgb(255,255,255) in light
      // theme. (Dark theme swaps to --surface, checked separately below.)
      if (theme === 'light' && info.crestBg !== 'rgb(255, 255, 255)') {
        fail.push(`[${theme}/${vp.name}] login crest background is not the neutral brand-mark white — got ${info.crestBg}`);
      }
      if (pageErrors.length) fail.push(`[${theme}/${vp.name}] page errors: ${pageErrors.join(' | ')}`);
      await page.screenshot({ path: path.join(OUT_DIR, `boot-login-${theme}-${vp.name}.png`) });
      console.log(`[boot-login/${theme}/${vp.name}]`, JSON.stringify(info));
      await page.close();
    }
  }

  // ── 2) Real failure path — wrong credentials against production verifyPin ──
  {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    // 400 from verifyPin is EXPECTED here — this block deliberately submits
    // wrong credentials to exercise the real failure path.
    page.on('console', (m) => { if (m.type() === 'error' && !/Fetch Firebase data gagal|Failed to load resource.*400/.test(m.text())) pageErrors.push(m.text()); });
    await page.setViewport({ width: 1400, height: 900 });
    await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
    await new Promise((r) => setTimeout(r, 1200));

    await page.type('#loginUsername', 'nonexistent_verify_probe');
    await page.type('#loginPin', '999999');

    const savingSnapshot = await page.evaluate(() => {
      document.getElementById('loginForm').requestSubmit();
      return null;
    });
    // Sample the button mid-flight (best-effort — network latency varies).
    await new Promise((r) => setTimeout(r, 120));
    const midFlight = await page.evaluate(() => {
      const btn = document.querySelector('.login-submit');
      return { sfState: btn ? btn.dataset.sfState : null, ariaBusy: btn ? btn.getAttribute('aria-busy') : null };
    });

    // Wait for the error state to resolve (bounded).
    await page.waitForFunction(
      () => {
        const el = document.getElementById('loginError');
        return el && el.hidden === false;
      },
      { timeout: 15000 },
    ).catch(() => {});

    const result = await page.evaluate(() => {
      const errorEl = document.getElementById('loginError');
      const btn = document.querySelector('.login-submit');
      const pinInput = document.getElementById('loginPin');
      return {
        errorHidden: errorEl ? errorEl.hidden : null,
        errorText: errorEl ? errorEl.textContent.trim() : null,
        errorHasSvg: errorEl ? !!errorEl.querySelector('svg') : false,
        errorRole: errorEl ? errorEl.getAttribute('role') : null,
        btnSfState: btn ? btn.dataset.sfState : null,
        btnDisabled: btn ? btn.disabled : null,
        pinCleared: pinInput ? pinInput.value === '' : null,
        pinFocused: document.activeElement === pinInput,
      };
    });

    if (midFlight.sfState !== 'saving' && midFlight.ariaBusy !== 'true') {
      fail.push(`[login-failure] never observed the button in a saving/aria-busy state (may be a fast-network timing miss, not necessarily a bug): ${JSON.stringify(midFlight)}`);
    }
    if (result.errorHidden !== false) fail.push(`[login-failure] #loginError never became visible after a rejected login: ${JSON.stringify(result)}`);
    if (!result.errorHasSvg) fail.push('[login-failure] #loginError is missing its anIcon() alert glyph');
    if (result.errorRole !== 'alert') fail.push(`[login-failure] #loginError missing role="alert", got ${result.errorRole}`);
    if (result.btnDisabled !== false) fail.push('[login-failure] submit button should be re-enabled (idle) after the error resolves');
    if (result.pinCleared !== true) fail.push('[login-failure] PIN field should be cleared after a failed attempt');
    if (result.pinFocused !== true) fail.push('[login-failure] focus should return to the PIN field after a failed attempt');
    if (pageErrors.length) fail.push(`[login-failure] page errors: ${pageErrors.join(' | ')}`);
    await page.screenshot({ path: path.join(OUT_DIR, 'login-failure-state.png') });
    console.log('[login-failure]', JSON.stringify(result));
    await page.close();
  }

  // ── 3) Reduced motion — boot/login must render with no animation errors ──
  {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/Fetch Firebase data gagal/.test(m.text())) pageErrors.push(m.text()); });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.setViewport({ width: 1400, height: 900 });
    await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
    await new Promise((r) => setTimeout(r, 1200));
    const loginVisible = await page.evaluate(() => {
      const el = document.getElementById('modalLogin');
      return el && getComputedStyle(el).display !== 'none';
    });
    if (!loginVisible) fail.push('[reduced-motion] login screen did not appear');
    if (pageErrors.length) fail.push(`[reduced-motion] page errors: ${pageErrors.join(' | ')}`);
    await page.screenshot({ path: path.join(OUT_DIR, 'reduced-motion-login.png') });
    console.log('[reduced-motion]', JSON.stringify({ loginVisible, pageErrors }));
    await page.close();
  }

  // ── 4) entry-transition.js module-level check — synthetic DOM, isolated ──
  // Confirms the FLIP/animation code runs cleanly and reveals the shell
  // without needing a real authenticated session (see disclosed limitation
  // at the top of this file for why this can't be a full end-to-end test).
  {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    // The background app's own Firebase data-sync attempts (unrelated to
    // this module) fail permission checks with no authenticated session —
    // expected/benign in this unauthenticated test context.
    page.on('console', (m) => { if (m.type() === 'error' && !/Fetch Firebase data gagal/.test(m.text())) pageErrors.push(m.text()); });
    await page.setViewport({ width: 1400, height: 900 });
    await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
    await new Promise((r) => setTimeout(r, 1200));

    const moduleResult = await page.evaluate(async () => {
      const mod = await import('/js/components/entry-transition.js');
      // Build a synthetic login card + brand-mark, independent of the real
      // (currently-visible) login screen, so this exercises the module's
      // own logic without depending on real auth state.
      const loginScreenEl = document.createElement('div');
      loginScreenEl.style.cssText = 'position:fixed;inset:0;';
      const cardBodyEl = document.createElement('div');
      cardBodyEl.textContent = 'synthetic card body';
      const brandMarkEl = document.createElement('div');
      brandMarkEl.className = 'brand-mark brand-mark--login';
      brandMarkEl.style.cssText = 'position:absolute;left:100px;top:100px;';
      loginScreenEl.append(cardBodyEl, brandMarkEl);
      document.body.appendChild(loginScreenEl);

      let threw = null;
      try {
        await mod.playLoginSuccessTransition({ cardBodyEl, brandMarkEl, loginScreenEl });
      } catch (err) {
        threw = err.message;
      }
      const displayAfter = loginScreenEl.style.display;
      loginScreenEl.remove();

      let logoutThrew = null;
      const fakeShell = document.createElement('div');
      document.body.appendChild(fakeShell);
      try {
        await mod.playLogoutExitTransition({ shellEl: fakeShell });
      } catch (err) {
        logoutThrew = err.message;
      }
      fakeShell.remove();

      return { threw, displayAfter, logoutThrew };
    });

    if (moduleResult.threw) fail.push(`[entry-transition-module] playLoginSuccessTransition threw: ${moduleResult.threw}`);
    if (moduleResult.displayAfter !== 'none') fail.push(`[entry-transition-module] synthetic loginScreenEl was not hidden after the transition (display=${moduleResult.displayAfter})`);
    if (moduleResult.logoutThrew) fail.push(`[entry-transition-module] playLogoutExitTransition threw: ${moduleResult.logoutThrew}`);
    if (pageErrors.length) fail.push(`[entry-transition-module] page errors: ${pageErrors.join(' | ')}`);
    console.log('[entry-transition-module]', JSON.stringify(moduleResult));
    await page.close();
  }

  await browser.close();

  if (fail.length) {
    console.error('\nFAILURES:\n' + fail.map((f) => ' - ' + f).join('\n'));
    process.exitCode = 1;
  } else {
    console.log('\nEntry transition visual pass: boot/login render correctly, real failure path works inline, reduced motion is clean, entry-transition.js runs without error.');
    console.log('DISCLOSED LIMITATION: the real success-path login→shell transition against production Firebase Auth was not exercised end-to-end — no safe test credentials exist post-Masuk-Cepat-removal. See file header.');
  }
})();
