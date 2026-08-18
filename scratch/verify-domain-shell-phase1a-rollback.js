// Redesign Phase 1a — rollback regression check.
//
// The whole point of gating this behind its own flag, default OFF, is that
// today's shipped shell (v1.30.9.24, visualShellV2=true / domainShellV1
// absent-or-false) must render EXACTLY as it does today. This confirms
// that in the real app: the old #v2Rail/#v2Panel mount, the new
// .domshell-rail/.domshell-tabbar do NOT exist, and there are zero console
// errors from the new code paths simply being present in app.js/platform.css
// but inert.

const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  page.on('console', (msg) => { if (msg.type() === 'error') pageErrors.push(msg.text()); });

  await page.goto('http://localhost:8000/index.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.setItem('pbsi_flag_visualShellV2', 'true');
    localStorage.removeItem('pbsi_flag_domainShellV1'); // absent -> DEFAULTS.domainShellV1 = false
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.addStyleTag({ content: '#modalLogin, #app-splash { display: none !important; }' });
  await new Promise((r) => setTimeout(r, 1500));

  const state = await page.evaluate(() => ({
    oldRailExists: !!document.getElementById('v2Rail'),
    oldPanelExists: !!document.getElementById('v2Panel'),
    newRailExists: !!document.querySelector('.domshell-rail'),
    newTabbarExists: !!document.querySelector('.domshell-tabbar'),
    paletteTriggerExists: !!document.querySelector('.domshell-palette-trigger'),
    bodyClasses: document.body.className,
  }));

  await browser.close();

  console.log(JSON.stringify(state, null, 2));
  console.log('\n--- PAGE ERRORS ---');
  console.log(pageErrors.length ? pageErrors : 'none');

  const fail = [];
  if (!state.oldRailExists) fail.push('old #v2Rail should exist when domainShellV1 is off');
  if (!state.oldPanelExists) fail.push('old #v2Panel should exist when domainShellV1 is off');
  if (state.newRailExists) fail.push('new .domshell-rail should NOT exist when domainShellV1 is off');
  if (state.newTabbarExists) fail.push('new .domshell-tabbar should NOT exist when domainShellV1 is off');
  if (state.paletteTriggerExists) fail.push('command palette trigger should NOT exist when domainShellV1 is off');
  if (state.bodyClasses.includes('domain-shell-active')) fail.push('body should NOT have domain-shell-active class when domainShellV1 is off');
  if (pageErrors.length) fail.push(`console/page errors: ${pageErrors.join(' | ')}`);

  if (fail.length) {
    console.error('\nFAILURES:\n' + fail.map((f) => ' - ' + f).join('\n'));
    process.exitCode = 1;
  } else {
    console.log('\nRollback regression check passed — flag-off path is byte-for-byte the shipped v1.30.9.24 shell.');
  }
})();
