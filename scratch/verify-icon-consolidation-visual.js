// Design System Program Phase 4 — visual pass for the 5 migrated surfaces.
// Screenshots real, running surfaces (not just source-text checks) in light
// + dark, desktop + mobile, and asserts each surface actually contains real
// <svg> icon markup (not leftover emoji/plain-text glyphs).

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const OUT_DIR = path.join(__dirname, 'icon-consolidation-verify');
fs.mkdirSync(OUT_DIR, { recursive: true });

const ASSIGNMENTS = [
  { id: 'a1', driver: 'Dedi', phone: '0812', vehicle: 'Avanza A', date: '2026-08-20', startTime: '08:00', endTime: '10:00', destination: 'Kemenpora', purpose: 'Antar Delegasi', pic: 'Grace', pax: 2, status: 'assigned' },
];

function setSession(page, user) {
  return page.evaluate((u) => localStorage.setItem('pbsi_current_user', JSON.stringify(u)), user);
}

const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}▶]/u;

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const fail = [];

  // ── 1) Assignment Detail drawer — modal-drawer-harness, real js/modal.js ──
  for (const theme of ['light', 'dark']) {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(m.text()); });
    await page.setViewport({ width: 1200, height: 1000 });
    await page.goto('http://localhost:8000/scratch/modal-drawer-harness.html', { waitUntil: 'load' });
    await setSession(page, { username: 'admin1', name: 'Admin Test', role: 'admin' });
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction('window.__modalHarnessReady === true');
    await page.evaluate((list) => window.__modal.setAssignments(list), ASSIGNMENTS);
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
    const info = await page.evaluate(() => {
      window.__modal.openDetailModal('a1');
      const overlay = document.getElementById('appDrawerOverlay');
      const svgCount = overlay ? overlay.querySelectorAll('svg').length : 0;
      // #waPreviewText is generated WhatsApp MESSAGE CONTENT (Bucket C, out of
      // scope per the plan — real message text sent externally must never be
      // touched by the icon system) — excluded from the leftover-emoji check.
      const clone = overlay ? overlay.cloneNode(true) : null;
      clone?.querySelector('#waPreviewText')?.remove();
      const text = clone ? clone.textContent : '';
      return { overlayExists: !!overlay, svgCount, hasEmoji: /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}▶]/u.test(text) };
    });
    if (!info.overlayExists) fail.push(`[${theme}] drawer overlay did not open`);
    if (info.svgCount < 8) fail.push(`[${theme}] expected >=8 icons in Assignment Detail drawer, got ${info.svgCount}`);
    if (info.hasEmoji) fail.push(`[${theme}] leftover emoji/chevron glyph found in Assignment Detail drawer`);
    if (pageErrors.length) fail.push(`[${theme}] page errors in drawer harness: ${pageErrors.join(' | ')}`);
    await page.screenshot({ path: path.join(OUT_DIR, `assignment-drawer-${theme}.png`) });
    console.log(`[assignment-drawer/${theme}]`, JSON.stringify(info));
    await page.close();
  }

  // ── 2) Domain-shell rail + header notification bell + command palette —
  //      the real app, unauthenticated fallback state (rail/header/palette
  //      chrome renders before any login-gated content). ──
  for (const theme of ['light', 'dark']) {
    for (const vp of [{ name: 'desktop', width: 1400, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
      const page = await browser.newPage();
      const pageErrors = [];
      page.on('pageerror', (e) => pageErrors.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error' && !/Fetch Firebase data gagal/.test(m.text())) pageErrors.push(m.text()); });
      await page.setViewport({ width: vp.width, height: vp.height });
      await page.goto('http://localhost:8000/index.html', { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => {
        localStorage.setItem('pbsi_flag_visualShellV2', 'true');
        localStorage.setItem('pbsi_flag_domainShellV1', 'true');
        localStorage.setItem('pbsi_current_user', JSON.stringify({ username: 'admin1', name: 'Admin Test', role: 'admin' }));
      });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.addStyleTag({ content: '#modalLogin, #app-splash { display: none !important; }' });
      await new Promise((r) => setTimeout(r, 1800));
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
      await new Promise((r) => setTimeout(r, 150));

      const info = await page.evaluate(() => {
        const rail = document.querySelector('.domshell-rail');
        // Standing environmental limitation (documented since Phase 1): a
        // bare localStorage session claim doesn't grant real permissions in
        // this headless test env (no live Firebase Auth session), so
        // permission-gated domains (Operations/Warehouse/Finance/...) don't
        // render — only "Today" does. That's a pre-existing test-environment
        // ceiling, not something this phase can fix; asserted below is that
        // EVERY rail item that DOES render has a real SVG icon, not a fixed
        // count. Full 8-domain buildDomains() logic is covered by
        // verify-domain-shell-phase1a.js's mocked-permission harness instead.
        const railItems = rail ? Array.from(rail.querySelectorAll('.domshell-rail-item')) : [];
        const railIconCount = rail ? rail.querySelectorAll('.domshell-rail-icon svg').length : 0;
        const allItemsHaveSvg = railItems.length > 0 && railItems.every((el) => !!el.querySelector('.domshell-rail-icon svg path'));
        const railText = rail ? rail.textContent : '';
        const bellBtn = document.getElementById('btnHeaderNotif');
        const bellHasSvg = !!bellBtn && !!bellBtn.querySelector('svg path');
        const paletteTrigger = document.querySelector('.domshell-palette-trigger');
        const paletteHasSvg = !!paletteTrigger && !!paletteTrigger.querySelector('svg path');
        return {
          railItemCount: railItems.length,
          railIconCount,
          allItemsHaveSvg,
          railHasEmoji: /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}▶]/u.test(railText),
          bellHasSvg,
          bellAriaLabel: bellBtn ? bellBtn.getAttribute('aria-label') : null,
          paletteHasSvg,
        };
      });
      if (!info.allItemsHaveSvg) fail.push(`[${theme}/${vp.name}] one or more rendered rail items is missing a real SVG icon (${info.railItemCount} items, ${info.railIconCount} icons)`);
      if (info.railHasEmoji) fail.push(`[${theme}/${vp.name}] leftover emoji found in domain-shell rail`);
      if (vp.name === 'desktop' && !info.bellHasSvg) fail.push(`[${theme}/${vp.name}] header notification bell missing SVG`);
      if (vp.name === 'desktop' && info.bellAriaLabel !== 'Notifikasi') fail.push(`[${theme}/${vp.name}] header bell aria-label missing/changed: ${info.bellAriaLabel}`);
      if (vp.name === 'desktop' && !info.paletteHasSvg) fail.push(`[${theme}/${vp.name}] command palette trigger missing SVG`);
      if (pageErrors.length) fail.push(`[${theme}/${vp.name}] page errors: ${pageErrors.join(' | ')}`);
      await page.screenshot({ path: path.join(OUT_DIR, `shell-${theme}-${vp.name}.png`) });
      console.log(`[shell/${theme}/${vp.name}]`, JSON.stringify(info));
      await page.close();
    }
  }

  await browser.close();

  if (fail.length) {
    console.error('\nFAILURES:\n' + fail.map((f) => ' - ' + f).join('\n'));
    process.exitCode = 1;
  } else {
    console.log('\nIcon consolidation visual pass: all surfaces render real SVG icons, no leftover emoji, no page errors.');
  }
})();
