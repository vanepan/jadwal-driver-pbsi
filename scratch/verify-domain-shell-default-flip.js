// Phase 1 (v1.30.10.7) — confirms the actual DEFAULT flip takes effect, not
// just that the override mechanism works. The 3 existing domain-shell
// scripts all force flags via localStorage; none loads a completely clean
// page (no override) to prove a fresh browser now gets domainShellV1=true
// from loadFeatureFlags()'s hardcoded DEFAULTS, falling through Firebase
// /feature_flags (read-only, real prod — this repo always hits real
// Firebase, see project memory "Firebase Prod in Local Testing") since that
// flag has never been configured there.

const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  page.on('console', (msg) => { if (msg.type() === 'error') pageErrors.push(msg.text()); });

  // Explicitly clear any leftover dev overrides from prior scripts sharing
  // this origin's localStorage, then load with zero overrides.
  await page.goto('http://localhost:8000/index.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.addStyleTag({ content: '#modalLogin, #app-splash { display: none !important; }' });
  await new Promise((r) => setTimeout(r, 1800));

  const state = await page.evaluate(() => ({
    railExists: !!document.querySelector('.domshell-rail'),
    oldRailExists: !!document.getElementById('v2Rail'),
  }));

  await browser.close();

  console.log(JSON.stringify(state, null, 2));
  console.log('\n--- PAGE ERRORS ---');
  console.log(pageErrors.length ? pageErrors : 'none');

  // appFlags is module-scoped in app.js, not exposed on window (true in
  // every script that's tried this, not new to this one) — the DOM outcome
  // itself (which rail rendered) is the real, direct proof of which value
  // domainShellV1 resolved to, so assert on that instead.
  const fail = [];
  if (!state.railExists) fail.push('new .domshell-rail did not mount on a clean load with no overrides');
  if (state.oldRailExists) fail.push('old #v2Rail rendered instead of the new shell on a clean load');
  // A Firebase /feature_flags permission-denied read is EXPECTED here (this
  // headless session is unauthenticated) — loadFeatureFlags() already
  // catches it and falls through to the hardcoded DEFAULTS, which is exactly
  // the path this script exists to verify. Any OTHER console/page error is
  // still a real failure.
  const realErrors = pageErrors.filter((e) => !/Fetch Firebase data gagal.*feature_flags|Permission denied/.test(e));
  if (realErrors.length) fail.push(`unexpected page errors: ${realErrors.join(' | ')}`);

  if (fail.length) {
    console.error('\nFAILURES:\n' + fail.map((f) => ' - ' + f).join('\n'));
    process.exitCode = 1;
  } else {
    console.log('\nDefault flip confirmed: a clean browser with zero overrides now gets the domain shell.');
  }
})();
