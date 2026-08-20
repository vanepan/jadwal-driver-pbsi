// Design System Program Phase 6 — focused verification of the ONE thing the
// Phase 6 report disclosed as unverified: a genuine successful Firebase
// authentication -> auth-state notification -> login-success transition ->
// shell reveal -> Today lifecycle.
//
// ==========================================================================
// WHAT THIS IS — AND IS NOT
// ==========================================================================
// This repo has NO Firebase Auth/Functions emulator configured (confirmed:
// firebase.json's `emulators` block only lists functions/hosting/database/ui
// — no `auth` entry; both existing emulator harnesses in scripts/ run
// `firebase emulators:exec --only database`). Per explicit instruction, this
// script does NOT invent one, does NOT restore the deleted "Masuk Cepat" demo
// credentials, does NOT create/commit any real credential, and never touches
// production Firebase Auth or RTDB data.
//
// Instead it mocks ONLY the authentication network boundary — the two real
// HTTP calls Firebase Auth's own SDK makes (the `verifyPin` callable, and
// Identity Toolkit's `accounts:signInWithCustomToken` + the `accounts:lookup`
// follow-up it triggers) — via Puppeteer request interception. The text
// typed into the username/PIN fields is arbitrary and never reaches any real
// server (verifyPin is intercepted before the request leaves the browser);
// no account named it needs to exist anywhere. Every other line of code that
// runs is 100% real and unmodified: js/auth.js's actual login()/
// loginViaFirebase()/notifyAuthChange()/_deferLoginClose/handleLoginSubmit,
// the real js/components/save-feedback.js, the real
// js/components/entry-transition.js, the real onAuthStateChanged listener in
// js/firebase.js, and the real shell/Today init in js/app.js. The real
// Firebase Auth JS SDK genuinely believes a sign-in succeeded (it decodes a
// well-formed-but-unsigned JWT client-side, which is how the SDK actually
// works — signature verification happens server-side, not in the client
// library), so onAuthStateChanged fires for real with a real (fake-uid) User
// object. Any call this session makes to REAL Firebase after that (push
// cleanup, RTDB reads) still gets correctly rejected server-side, because the
// forged token's signature is not valid — confirming this technique does not
// bypass any real security, it only fakes what the CLIENT receives.
//
// This is an integration test of the DOM/transition lifecycle, not proof
// that real Firebase Auth authorizes correctly (that's proven by every real
// user's daily use of the app, and separately by the RTDB Authorization
// Validation Suite). Distinguish accordingly when reading the results.

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const OUT_DIR = path.join(__dirname, 'phase6-login-success-verify');
fs.mkdirSync(OUT_DIR, { recursive: true });

const BASE = 'http://localhost:8000';

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fakeIdToken(role) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', kid: 'fake-kid-e2e-boundary-test', typ: 'JWT' };
  const payload = {
    iss: 'https://securetoken.google.com/schedule-driver-pbsi',
    aud: 'schedule-driver-pbsi',
    auth_time: now,
    user_id: 'e2e-verify-uid',
    sub: 'e2e-verify-uid',
    iat: now,
    exp: now + 3600,
    role,
    firebase: { identities: {}, sign_in_provider: 'custom' },
  };
  return `${b64url(header)}.${b64url(payload)}.fake-signature-never-verified-client-side`;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': BASE,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Credentials': 'true',
};

/** Installs the auth-boundary mock. Everything NOT matched here hits the
 * real network, including the token-refresh endpoint (deliberately left
 * real — see note below). */
async function installAuthBoundaryMock(page, { role = 'admin' } = {}) {
  await page.setRequestInterception(true);
  const netLog = [];
  page.on('request', (req) => {
    const url = req.url();
    netLog.push(`${req.method()} ${url}`);
    const respond = (bodyObj) => {
      if (req.method() === 'OPTIONS') { req.respond({ status: 204, headers: CORS_HEADERS }); return; }
      req.respond({ status: 200, contentType: 'application/json', headers: CORS_HEADERS, body: JSON.stringify(bodyObj) });
    };
    if (/\/verifyPin(\?|$)/.test(url)) {
      respond({ result: { token: 'fake-custom-token-for-e2e-boundary-test', profile: { username: 'e2e_verify_probe', name: 'E2E Verify Probe', role, active: true } } });
      return;
    }
    if (/identitytoolkit\.googleapis\.com\/v1\/accounts:signInWithCustomToken/.test(url)) {
      respond({ kind: 'identitytoolkit#VerifyCustomTokenResponse', idToken: fakeIdToken(role), refreshToken: 'fake-refresh-token-e2e', expiresIn: '3600', localId: 'e2e-verify-uid', isNewUser: false });
      return;
    }
    if (/identitytoolkit\.googleapis\.com\/v1\/accounts:lookup/.test(url)) {
      respond({ kind: 'identitytoolkit#GetAccountInfoResponse', users: [{ localId: 'e2e-verify-uid', emailVerified: false, providerUserInfo: [], validSince: '0', lastLoginAt: String(Date.now()), createdAt: String(Date.now()) }] });
      return;
    }
    // NOT intercepted (deliberately): securetoken.googleapis.com token
    // refresh, RTDB reads, push registration, etc. — all real network,
    // all correctly rejected server-side against the forged token. This is
    // the "preserve the real auth.js flow after the boundary" requirement:
    // only the sign-in exchange itself is faked.
    req.continue();
  });
  return netLog;
}

/** Benign/expected noise given the mock: real server rejections of the
 * forged token on downstream calls, and the deliberately-unmocked refresh
 * endpoint. None of these indicate a bug in Phase 6 code. */
// 401 covers unregisterPushSubscription (logout's push cleanup) correctly
// rejecting the forged token server-side — expected given the mock, and
// itself evidence the technique doesn't bypass real backend authorization.
const EXPECTED_NOISE = /Fetch Firebase data gagal|status of 400|status of 401|securetoken\.googleapis\.com|net::ERR_FAILED.*securetoken/;

async function instrumentTransition(page) {
  await page.evaluate(() => {
    window.__p6 = { clones: [], railCountSamples: [] };
    const obs = new MutationObserver((muts) => {
      for (const m of muts) {
        for (const n of m.addedNodes) {
          if (n.nodeType === 1 && n.classList && n.classList.contains('brand-mark--login') && n.classList.contains('brand-mark')) {
            // Read synchronously — by the time this microtask runs, the
            // transition's synchronous target-style assignment has already
            // completed (it never awaits between append and setting target
            // left/top/width/height), so these ARE the final FLIP target
            // values, not the starting ones.
            window.__p6.clones.push({
              left: n.style.left, top: n.style.top, width: n.style.width, height: n.style.height,
              isFixed: n.style.position === 'fixed',
            });
          }
        }
      }
    });
    obs.observe(document.body, { childList: true });
    window.__p6._obs = obs;
  });
}

async function readRailRect(page) {
  return page.evaluate(() => {
    const el = document.querySelector('.domshell-rail-logo');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    // onScreen is the CORRECT "is this a reachable FLIP target" check — a
    // non-zero-size rect is NOT sufficient by itself. Discovered during
    // this verification: the mobile rail is a `.domshell-rail--mobile-drawer`
    // variant that keeps real (non-zero) dimensions even when closed
    // off-canvas (negative left, e.g. left:-327px width:326px) — the exact
    // shape a naive "width>0 && height>0" check misses.
    const onScreen = r.right > 0 && r.left < window.innerWidth && r.bottom > 0 && r.top < window.innerHeight;
    return { left: r.left, top: r.top, width: r.width, height: r.height, right: r.right, onScreen, display: getComputedStyle(document.querySelector('.domshell-rail')).display };
  });
}

async function readLoginCrestRect(page) {
  return page.evaluate(() => {
    const el = document.querySelector('.login-brand-crest');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });
}

async function runLoginSuccessCase({ browser, theme, viewport, reducedMotion, shotName }) {
  // Isolated browser context PER CASE — Firebase Auth persists its session
  // to IndexedDB, which (like localStorage) is shared across tabs of the
  // same default browser context in Puppeteer. Without isolation, case 1's
  // successful (faked) sign-in leaks into case 2's fresh page, which then
  // boots ALREADY authenticated and never shows the login screen at all —
  // exactly the ".login-submit never becomes visible" hang this caused
  // during development of this script.
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !EXPECTED_NOISE.test(m.text())) pageErrors.push(m.text()); });

  if (reducedMotion) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.setViewport(viewport);
  const netLog = await installAuthBoundaryMock(page, { role: 'admin' });

  // Set the theme via evaluateOnNewDocument (runs before any page script,
  // including index.html's own pre-paint theme-detection <script>) instead
  // of goto-then-reload — a reload while request interception is active
  // was observed to leave the page hung (in-flight intercepted requests
  // from the pre-reload document apparently orphaned at the CDP layer).
  if (theme === 'dark') {
    await page.evaluateOnNewDocument(() => localStorage.setItem('pbsi_theme', 'dark'));
  }
  await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 900));

  const railRectBefore = await readRailRect(page);
  const loginCrestRectBefore = await readLoginCrestRect(page);
  const railCountBefore = await page.evaluate(() => document.querySelectorAll('.domshell-rail').length);

  await instrumentTransition(page);

  await page.type('#loginUsername', 'e2e_verify_probe');
  await page.type('#loginPin', '000000');
  await page.waitForSelector('.login-submit', { visible: true }); await page.$eval('.login-submit', (el) => el.click());

  // Assertion A: modal must NOT be closed prematurely — sample while the
  // save-feedback saving/success beat is still in flight, well before the
  // transition's own SCENE_MS card-fade + FLIP would have finished.
  await new Promise((r) => setTimeout(r, 150));
  const midFlightModalDisplay = await page.evaluate(() => {
    const modal = document.getElementById('modalLogin');
    return modal ? getComputedStyle(modal).display : null;
  });

  // Wait for the transition to fully resolve (modal hidden). Bounded.
  await page.waitForFunction(() => {
    const modal = document.getElementById('modalLogin');
    return modal && getComputedStyle(modal).display === 'none';
  }, { timeout: 10000 }).catch(() => {});

  await new Promise((r) => setTimeout(r, 300)); // let revealShell's stagger settle for the screenshot

  const result = await page.evaluate(() => {
    const modal = document.getElementById('modalLogin');
    const rail = document.querySelector('.domshell-rail');
    const main = document.querySelector('.main-area');
    const homeHost = document.getElementById('v2HomeWorkspace');
    return {
      finalModalDisplay: modal ? getComputedStyle(modal).display : null,
      hasCurrentUser: !!localStorage.getItem('pbsi_current_user'),
      currentUser: JSON.parse(localStorage.getItem('pbsi_current_user') || 'null'),
      railCountAfter: document.querySelectorAll('.domshell-rail').length,
      railVisible: rail ? getComputedStyle(rail).display !== 'none' : false,
      mainAreaVisible: main ? getComputedStyle(main).opacity !== '0' : false,
      homeHostExists: !!homeHost,
      homeHostVisible: homeHost ? getComputedStyle(homeHost).display !== 'none' : false,
      submitBtnState: (() => {
        const btn = document.querySelector('.login-submit');
        return btn ? { disabled: btn.disabled, sfState: btn.dataset.sfState || null } : null;
      })(),
      clones: window.__p6 ? window.__p6.clones : [],
    };
  });

  const fail = [];
  if (midFlightModalDisplay !== 'flex') {
    fail.push(`[${shotName}] Assertion A FAILED: modal was not still visible mid-flight (saw display="${midFlightModalDisplay}") — may have closed prematurely`);
  }
  if (result.finalModalDisplay !== 'none') {
    fail.push(`[${shotName}] login modal never reached display:none after the transition (got "${result.finalModalDisplay}")`);
  }
  if (!result.hasCurrentUser || !result.currentUser || result.currentUser.role !== 'admin') {
    fail.push(`[${shotName}] session was not hydrated correctly from the (faked) auth-state callback: ${JSON.stringify(result.currentUser)}`);
  }
  if (result.railCountAfter !== railCountBefore) {
    fail.push(`[${shotName}] Assertion H FAILED: .domshell-rail count changed (${railCountBefore} -> ${result.railCountAfter}) — suggests a duplicate shell init`);
  }
  if (result.submitBtnState && (result.submitBtnState.disabled !== false || (result.submitBtnState.sfState && result.submitBtnState.sfState !== 'success'))) {
    // sfState is deleted entirely on _resetIdle, so null is the expected
    // steady-state; only flag if it's stuck on 'saving'.
    if (result.submitBtnState.sfState === 'saving') fail.push(`[${shotName}] submit button appears stuck in the 'saving' state`);
  }

  // Assertion B: transition ran exactly once.
  if (reducedMotion) {
    if (result.clones.length !== 0) fail.push(`[${shotName}] Assertion F FAILED: reduced motion should skip the FLIP clone entirely, but ${result.clones.length} were created`);
  } else {
    if (result.clones.length !== 1) fail.push(`[${shotName}] Assertion B FAILED: expected exactly 1 FLIP clone, got ${result.clones.length}`);
  }

  // Assertion C/D: the clone's target must match the REAL measured rail
  // rect (desktop/tablet) — proving it's rect-derived, not a hardcoded
  // coordinate — or Assertion E: the mobile fallback math, when the rail
  // has no ON-SCREEN target (checked via onScreen, not just non-zero size
  // — see readRailRect()'s comment for why size alone is insufficient).
  if (!reducedMotion && result.clones.length === 1) {
    const clone = result.clones[0];
    const cloneRect = { left: parseFloat(clone.left), top: parseFloat(clone.top), width: parseFloat(clone.width), height: parseFloat(clone.height) };
    const railHasRealTarget = railRectBefore && railRectBefore.onScreen;
    if (railHasRealTarget) {
      const closeEnough = (a, b) => Math.abs(a - b) < 1.5;
      const matches = closeEnough(cloneRect.left, railRectBefore.left) && closeEnough(cloneRect.top, railRectBefore.top)
        && closeEnough(cloneRect.width, railRectBefore.width) && closeEnough(cloneRect.height, railRectBefore.height);
      if (!matches) {
        fail.push(`[${shotName}] Assertion C/D FAILED: clone target ${JSON.stringify(cloneRect)} does not match the real measured .domshell-rail-logo rect ${JSON.stringify(railRectBefore)}`);
      }
    } else {
      // Mobile branch expected: width should be ~0.7x the starting login
      // crest width — proves the mobile-fallback math ran, not a silent
      // no-op or a desktop-coordinate guess applied blindly.
      const expectedW = loginCrestRectBefore.width * 0.7;
      if (Math.abs(cloneRect.width - expectedW) > 2) {
        fail.push(`[${shotName}] Assertion E FAILED: expected the mobile fallback width (~${expectedW.toFixed(1)}px, 0.7x start), got ${cloneRect.width}px`);
      }
    }
  }

  // Assertion G: Today/shell content visible after transition.
  if (!result.railVisible) fail.push(`[${shotName}] shell rail is not visible after the transition`);
  if (!result.homeHostExists) fail.push(`[${shotName}] #v2HomeWorkspace (Today host) does not exist in the DOM`);

  if (pageErrors.length) fail.push(`[${shotName}] page errors: ${pageErrors.join(' | ')}`);

  await page.screenshot({ path: path.join(OUT_DIR, `${shotName}.png`) });
  console.log(`[${shotName}]`, JSON.stringify({ midFlightModalDisplay, ...result, railRectBefore, loginCrestRectBefore }, null, 0));
  await context.close();
  return fail;
}

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  let fail = [];

  fail = fail.concat(await runLoginSuccessCase({ browser, theme: 'light', viewport: { width: 1400, height: 900 }, reducedMotion: false, shotName: 'success-desktop-light' }));
  fail = fail.concat(await runLoginSuccessCase({ browser, theme: 'dark', viewport: { width: 1400, height: 900 }, reducedMotion: false, shotName: 'success-desktop-dark' }));
  fail = fail.concat(await runLoginSuccessCase({ browser, theme: 'light', viewport: { width: 390, height: 844 }, reducedMotion: false, shotName: 'success-mobile-light' }));
  fail = fail.concat(await runLoginSuccessCase({ browser, theme: 'dark', viewport: { width: 390, height: 844 }, reducedMotion: false, shotName: 'success-mobile-dark' }));
  fail = fail.concat(await runLoginSuccessCase({ browser, theme: 'light', viewport: { width: 1400, height: 900 }, reducedMotion: true, shotName: 'success-reduced-motion' }));

  // ── Logout: real end-to-end via the SAME faked session, timing the exit
  // animation against the reload. Concurrency (Assertion I) is structurally
  // guaranteed by auth.js's Promise.all([...]) — this run confirms it also
  // doesn't hang/throw against a real (if forged) session and that the exit
  // animation visibly plays before navigation. ──
  {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !EXPECTED_NOISE.test(m.text())) pageErrors.push(m.text()); });
    await page.setViewport({ width: 1400, height: 900 });
    await installAuthBoundaryMock(page, { role: 'admin' });
    await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
    await new Promise((r) => setTimeout(r, 900));
    await page.type('#loginUsername', 'e2e_verify_probe');
    await page.type('#loginPin', '000000');
    await page.waitForSelector('.login-submit', { visible: true }); await page.$eval('.login-submit', (el) => el.click());
    await page.waitForFunction(() => {
      const modal = document.getElementById('modalLogin');
      return modal && getComputedStyle(modal).display === 'none';
    }, { timeout: 10000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 300));

    // A marker on `window` — the most unambiguous "did the JS context get
    // torn down by a reload" signal available. page.waitForNavigation() was
    // tried first and produced an inconsistent read (resolved via its
    // null-catch well before its own 8s timeout, while a separate
    // instrumented run showed the reload's console logs completing in well
    // under a second) — likely a Puppeteer navigation-detection quirk
    // interacting with active request interception, not a real hang. This
    // sidesteps that entirely.
    await page.evaluate(() => { window.__p6LogoutMarker = true; });
    const t0 = Date.now();
    const midAnimSample = page.evaluate(() => new Promise((resolve) => {
      setTimeout(() => {
        const shell = document.querySelector('.app-layout');
        resolve(shell ? getComputedStyle(shell).opacity : null);
      }, 120);
    })).catch(() => null); // rejects if the reload tears the context down before the timer fires
    // #btnLogout itself lives in the legacy .sidebar chrome, which is
    // display:none under the active Domain Shell config (confirmed via
    // direct inspection) — real users trigger logout through one of the
    // visible proxy buttons (#v2FooterLogoutDirect etc.) that .click() this
    // element programmatically. Do the same here rather than requiring
    // Puppeteer's mouse-visibility check, which this element will never
    // satisfy in the current UI regardless of Phase 6.
    await page.evaluate(() => document.getElementById('btnLogout').click());
    const midOpacity = await midAnimSample;

    let reloaded = false;
    for (let i = 0; i < 40; i++) { // up to ~8s, polled
      await new Promise((r) => setTimeout(r, 200));
      const stillMarked = await page.evaluate(() => window.__p6LogoutMarker === true).catch(() => 'context-gone');
      if (stillMarked !== true) { reloaded = true; break; } // marker cleared (fresh doc) or context torn down mid-poll
    }
    const elapsed = Date.now() - t0;

    if (midOpacity === null) fail.push('[logout] could not sample .app-layout opacity mid-animation (element missing, or reload happened before the 120ms sample)');
    else if (parseFloat(midOpacity) >= 0.99) fail.push(`[logout] .app-layout opacity was still ~1 at 120ms into logout — exit animation may not be playing (got ${midOpacity})`);
    if (!reloaded) fail.push(`[logout] page never reloaded within ~8s (elapsed ${elapsed}ms) — logout may be hanging`);
    else console.log(`[logout] reloaded after ~${elapsed}ms, mid-animation opacity=${midOpacity}`);
    if (pageErrors.length) fail.push(`[logout] page errors: ${pageErrors.join(' | ')}`);
    await context.close().catch(() => {});
  }

  // ── Auth failure regression (real production, wrong credentials — safe,
  // no side effects beyond a normal failed-login audit entry). Confirms
  // Assertion J alongside the boundary-mocked success path above. ──
  {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/Fetch Firebase data gagal|status of 400/.test(m.text())) pageErrors.push(m.text()); });
    await page.setViewport({ width: 1400, height: 900 });
    await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
    await new Promise((r) => setTimeout(r, 900));
    await page.type('#loginUsername', 'nonexistent_verify_probe_2');
    await page.type('#loginPin', '999999');
    await page.waitForSelector('.login-submit', { visible: true }); await page.$eval('.login-submit', (el) => el.click());
    await page.waitForFunction(() => {
      const el = document.getElementById('loginError');
      return el && el.hidden === false;
    }, { timeout: 15000 }).catch(() => {});
    const result = await page.evaluate(() => {
      const errorEl = document.getElementById('loginError');
      const modal = document.getElementById('modalLogin');
      return {
        errorHidden: errorEl ? errorEl.hidden : null,
        modalStillOpen: modal ? getComputedStyle(modal).display !== 'none' : null,
      };
    });
    if (result.errorHidden !== false || result.modalStillOpen !== true) {
      fail.push(`[auth-failure-regression] unexpected state: ${JSON.stringify(result)}`);
    } else {
      console.log('[auth-failure-regression]', JSON.stringify(result));
    }
    if (pageErrors.length) fail.push(`[auth-failure-regression] page errors: ${pageErrors.join(' | ')}`);
    await page.close();
  }

  await browser.close();

  if (fail.length) {
    console.error('\nFAILURES:\n' + fail.map((f) => ' - ' + f).join('\n'));
    process.exitCode = 1;
  } else {
    console.log('\nPhase 6 login-success E2E (auth-boundary-mocked) verification: ALL ASSERTIONS PASSED.');
    console.log('Reminder: this exercises the real auth.js/entry-transition.js/shell lifecycle against a REAL Firebase Auth SDK sign-in, with only the network exchange faked — it is not proof of genuine production authorization, which is covered by real daily use + the separate RTDB Authorization Validation Suite.');
  }
})();
