/* V1 POST-QA HOTFIX — consolidated verification (run after the fixes).
   Real headless Chromium. Unauthenticated for the main app; the Petty Cash
   module is exercised via scratch/petty-cash-harness.html (mounts the real
   module with a localStorage admin user). Nothing logs into production. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.webmanifest':'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, r));
const port = server.address().port;
const APP = `http://localhost:${port}/index.html`;
const PC = `http://localhost:${port}/scratch/petty-cash-harness.html`;
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
let pass = 0, fail = 0;
const ok = (n, c, extra='') => { (c ? pass++ : fail++); console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}${extra ? '  — ' + extra : ''}`); };

/* ═══ ISSUE B — header, no overlap, no overflow, desktop intact ═══ */
{
  const page = await browser.newPage();
  await page.goto(APP, { waitUntil: 'networkidle2', timeout: 45000 });
  await new Promise(r => setTimeout(r, 4500));
  console.log('\n[ISSUE B] mobile header — control collisions + horizontal overflow');
  for (const w of [320, 360, 375, 390, 414, 430, 768, 1024, 1440]) {
    await page.setViewport({ width: w, height: 850, deviceScaleFactor: 2 });
    await new Promise(r => setTimeout(r, 250));
    const r = await page.evaluate(() => {
      const R = el => { if (!el) return null; const b = el.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width }; };
      const els = {
        ham: R(document.querySelector('.v2-topbar #sidebarToggle')),
        today: R(document.getElementById('btnToday')),
        prev: R(document.getElementById('btnPrevDate')),
        next: R(document.getElementById('btnNextDate')),
        dtrig: R(document.querySelector('.v2-topbar .pbsi-datepicker-trigger') || document.querySelector('.v2-topbar .pbsi-datepicker')),
        avatar: R(document.querySelector('.v2-topbar .header-user-area')),
        palette: R(document.querySelector('.v2-topbar .domshell-palette-trigger')),
        crumb: R(document.getElementById('v2TopbarCrumb')),
      };
      const names = Object.keys(els).filter(k => els[k] && els[k].w > 0);
      const collisions = [];
      for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
        const A = els[names[i]], B = els[names[j]];
        const ox = Math.min(A.r, B.r) - Math.max(A.l, B.l);
        const oy = Math.min(A.b, B.b) - Math.max(A.t, B.t);
        if (ox > 1 && oy > 1) collisions.push(`${names[i]}∩${names[j]} (${ox.toFixed(0)}×${oy.toFixed(0)}px)`);
      }
      const de = document.documentElement;
      return { collisions, overflowX: de.scrollWidth - de.clientWidth,
               todayReadable: els.today ? els.today.w >= 40 : null,
               arrowsHit: (els.prev && els.prev.w >= 40 && els.next && els.next.w >= 40) };
    });
    const clean = r.collisions.length === 0 && r.overflowX <= 0;
    ok(`${w}px  overflowX=${r.overflowX}  collisions=[${r.collisions.join(', ') || 'none'}]  today≥40w=${r.todayReadable}  arrows≥40w=${r.arrowsHit}`, clean && r.todayReadable !== false && r.arrowsHit !== false);
  }
  await page.close();
}

/* ═══ ISSUE C — mobile side menu closes after rail/tab nav ═══ */
{
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.goto(APP, { waitUntil: 'networkidle2', timeout: 45000 });
  await new Promise(r => setTimeout(r, 4500));
  console.log('\n[ISSUE C] mobile side menu close-on-nav');
  const r = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const sidebar = document.getElementById('sidebar');
    document.getElementById('sidebarToggle').click();
    await sleep(140);
    const opened = sidebar.classList.contains('sidebar-open') && document.body.classList.contains('sidebar-is-open');
    const item = document.querySelector('#sidebar .domshell-rail-item');
    const hadItem = !!item;
    item && item.click();
    await sleep(180);
    const closed = !sidebar.classList.contains('sidebar-open');
    const lockReleased = !document.body.classList.contains('sidebar-is-open');
    const overlayGone = !document.getElementById('sidebarOverlay')?.classList.contains('overlay-visible');
    // re-open and try a domshell-tab if one exists
    document.getElementById('sidebarToggle').click(); await sleep(120);
    const tab = document.querySelector('#sidebar .domshell-tab');
    let tabClosed = null;
    if (tab) { tab.click(); await sleep(160); tabClosed = !sidebar.classList.contains('sidebar-open'); }
    else { document.getElementById('sidebarToggle').click(); await sleep(80); }
    return { opened, hadItem, closed, lockReleased, overlayGone, tabClosed };
  });
  ok(`sidebar opened=${r.opened}`, r.opened);
  ok(`rail-item present in drawer=${r.hadItem}`, r.hadItem);
  ok(`sidebar closed after rail-item nav=${r.closed}`, r.closed === true);
  ok(`body scroll-lock released=${r.lockReleased}`, r.lockReleased === true);
  ok(`backdrop overlay hidden=${r.overlayGone}`, r.overlayGone === true);
  ok(`domshell-tab nav also closes (or n/a: ${r.tabClosed})`, r.tabClosed === true || r.tabClosed === null);
  // desktop: nav must NOT auto-close anything (no sidebar drawer at ≥768)
  await page.setViewport({ width: 1280, height: 900 });
  await new Promise(r => setTimeout(r, 300));
  const deskFine = await page.evaluate(() => {
    const s = document.getElementById('sidebar');
    return getComputedStyle(s).display === 'none' || !s.classList.contains('sidebar-open');
  });
  ok('desktop (1280px) unaffected — no drawer state to leak', deskFine);
  await page.close();
}

/* ═══ ISSUE D — canonical drawer mobile geometry (no regression + dvh applied) ═══ */
{
  const page = await browser.newPage();
  await page.goto(APP, { waitUntil: 'networkidle2', timeout: 45000 });
  await new Promise(r => setTimeout(r, 4500));
  console.log('\n[ISSUE D] canonical drawer — mobile bottom-sheet');
  for (const [w, h] of [[320, 690], [375, 667], [390, 844], [430, 932]]) {
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
    await new Promise(r => setTimeout(r, 200));
    const g = await page.evaluate(async () => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      window.appDebug.openDeleteConfirmModal({ type: 'user', id: 'p', name: 'Probe', refCount: 0 });
      await sleep(360);
      const body = document.querySelector('[data-drawer-body]');
      const tall = document.createElement('div');
      for (let i = 0; i < 50; i++) { const p = document.createElement('p'); p.textContent = 'row ' + i; p.style.margin = '18px 0'; tall.appendChild(p); }
      const lastBtn = document.createElement('button'); lastBtn.id = 'dLast'; lastBtn.textContent = 'LAST'; tall.appendChild(lastBtn);
      body.appendChild(tall);
      await sleep(60);
      const drawer = document.querySelector('.drawer');
      const overlay = document.querySelector('.drawer-overlay');
      const bodyEl = document.querySelector('.drawer__body');
      const dR = drawer.getBoundingClientRect();
      const oCss = getComputedStyle(overlay), dCss = getComputedStyle(drawer);
      bodyEl.scrollTop = bodyEl.scrollHeight;
      await sleep(50);
      const lb = document.getElementById('dLast').getBoundingClientRect();
      const res = {
        innerH: window.innerHeight,
        drawerBottom: +dR.bottom.toFixed(1),
        drawerBottomWithinVp: dR.bottom <= window.innerHeight + 1,
        overlayHeightCss: oCss.height, drawerHeightCss: dCss.height,
        bodyScrollable: bodyEl.scrollHeight > bodyEl.clientHeight + 1,
        lastActionFullyVisible: lb.bottom <= window.innerHeight + 1 && lb.top >= -1,
        headerVisible: (() => { const hd = document.querySelector('.drawer__head').getBoundingClientRect(); return hd.top >= -1 && hd.bottom <= window.innerHeight; })(),
      };
      window.appDebug.closeDeleteConfirmModal();
      await sleep(320);
      return res;
    });
    console.log(`   ${w}x${h}: overlayH=${g.overlayHeightCss} drawerH=${g.drawerHeightCss} drawerBottom=${g.drawerBottom}/${g.innerH}`);
    ok(`${w}x${h}  drawer bottom within viewport`, g.drawerBottomWithinVp);
    ok(`${w}x${h}  body scrollable & last action reachable`, g.bodyScrollable && g.lastActionFullyVisible);
    ok(`${w}x${h}  header stays visible`, g.headerVisible);
  }
  // desktop drawer unchanged (right-docked, full height)
  await page.setViewport({ width: 1280, height: 900 });
  await new Promise(r => setTimeout(r, 200));
  const desk = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    window.appDebug.openDeleteConfirmModal({ type: 'user', id: 'p', name: 'Probe', refCount: 0 });
    await sleep(360);
    const d = document.querySelector('.drawer').getBoundingClientRect();
    const res = { rightDocked: Math.abs(d.right - window.innerWidth) < 2, fullHeight: d.height >= window.innerHeight - 2, width: Math.round(d.width) };
    window.appDebug.closeDeleteConfirmModal(); await sleep(300);
    return res;
  });
  ok(`desktop drawer right-docked & full-height (w=${desk.width})`, desk.rightDocked && desk.fullHeight);
  // CSS assertion: dvh present in the mobile sheet block
  const cssHasDvh = fs.readFileSync(path.join(ROOT, 'platform.css'), 'utf8').includes('height: min(86dvh, 100%)') && fs.readFileSync(path.join(ROOT, 'platform.css'), 'utf8').includes('.drawer-overlay { justify-content: stretch; align-items: flex-end; height: 100vh; height: 100dvh; }');
  ok('platform.css mobile sheet uses dvh with vh fallback', cssHasDvh);
  await page.close();
}

/* ═══ ISSUE E — petty cash Add Expense focus ═══ */
{
  const page = await browser.newPage();
  const cons = [];
  const FIREBASE_NOISE = /permission[_ ]denied|Permission denied|Firebase listener gagal|readNode .* \(denied\)|Fetch Firebase data gagal/i;
  page.on('console', m => { if (m.type() === 'error' && !FIREBASE_NOISE.test(m.text())) cons.push(m.text().slice(0, 160)); });
  page.on('pageerror', e => cons.push('PAGEERROR ' + String(e.message).slice(0, 160)));
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(PC, { waitUntil: 'networkidle2', timeout: 45000 });
  try { await page.waitForFunction('window.__pcHarnessReady === true', { timeout: 15000 }); }
  catch { ok('petty cash harness ready', false, cons.join(' | ')); }
  await new Promise(r => setTimeout(r, 500));
  console.log('\n[ISSUE E] Petty Cash Add Expense — focus on open / trap / Escape / restore');

  const closeIfOpen = () => page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const c = document.querySelector('.pc-add-box [data-act="closeAdd"]');
    if (c) { c.click(); await sleep(120); }
  });

  // 1) open → initial focus on Tanggal
  await closeIfOpen();
  const openRes = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    let btn = document.getElementById('fakeOpener');
    if (!btn) { btn = document.createElement('button'); btn.id = 'fakeOpener'; btn.textContent = 'opener'; document.body.appendChild(btn); }
    btn.focus();
    window.__pc.openPettyCashAddExpense();
    await sleep(140);
    const box = document.querySelector('.pc-add-box');
    const date = box && box.querySelector('input[name="expenseDate"]');
    return { boxOpen: !!box, focusIsDate: document.activeElement === date, active: document.activeElement && document.activeElement.tagName + '/' + (document.activeElement.name || document.activeElement.className) };
  });
  ok('Add Expense modal opens', openRes.boxOpen);
  ok(`initial focus = Tanggal input  (active: ${openRes.active})`, openRes.focusIsDate);

  // 2) Tab never leaves the modal
  let outsideCount = 0;
  for (let i = 0; i < 22; i++) {
    await page.keyboard.press('Tab');
    const s = await page.evaluate(() => { const b = document.querySelector('.pc-add-box'); const a = document.activeElement; return !!(b && a && b.contains(a)); });
    if (!s) outsideCount++;
  }
  ok(`22× Tab — focus never leaves modal (outside hits: ${outsideCount})`, outsideCount === 0);
  for (let i = 0; i < 25; i++) { await page.keyboard.down('Shift'); await page.keyboard.press('Tab'); await page.keyboard.up('Shift'); }
  const afterShift = await page.evaluate(() => { const b = document.querySelector('.pc-add-box'); const a = document.activeElement; return !!(b && a && b.contains(a)); });
  ok('25× Shift+Tab — focus still trapped in modal', afterShift);

  // 3) Escape closes + restores focus to opener
  await page.keyboard.press('Escape');
  await new Promise(r => setTimeout(r, 200));
  const escRes = await page.evaluate(() => ({ closed: !document.querySelector('.pc-add-box'), restored: document.activeElement && document.activeElement.id === 'fakeOpener' }));
  ok('Escape closes the Add Expense modal', escRes.closed);
  ok('focus restored to the opener after Escape', escRes.restored);

  // 4) repeated open/close — Tanggal focused every time
  const rep = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < 4; i++) {
      window.__pc.openPettyCashAddExpense(); await sleep(90);
      const d = document.querySelector('.pc-add-box input[name="expenseDate"]');
      if (document.activeElement !== d) return { okAll: false, at: i };
      document.querySelector('.pc-add-box [data-act="closeAdd"]').click(); await sleep(90);
      if (document.querySelector('.pc-add-box')) return { okAll: false, at: i, note: 'did not close' };
    }
    return { okAll: true };
  });
  ok(`repeated open/close (×4) — Tanggal focused every time`, rep.okAll, JSON.stringify(rep));

  // 5) backdrop click closes + restores
  const bd = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    document.getElementById('fakeOpener').focus();
    window.__pc.openPettyCashAddExpense(); await sleep(120);
    document.querySelector('.pc-add-box').parentElement.click(); // overlay (data-act=closeAdd)
    await sleep(160);
    return { closed: !document.querySelector('.pc-add-box'), restored: document.activeElement && document.activeElement.id === 'fakeOpener' };
  });
  ok('backdrop click closes the modal', bd.closed);
  ok('focus restored to opener after backdrop close', bd.restored);

  ok(`no NON-Firebase console errors from petty cash harness (${cons.length})`, cons.length === 0, cons.join(' | '));
  await page.close();
}

/* ═══ ISSUE F — rail label reveal timing + reduced motion ═══ */
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(APP, { waitUntil: 'networkidle2', timeout: 45000 });
  await new Promise(r => setTimeout(r, 4000));
  console.log('\n[ISSUE F] domshell rail label reveal');
  const normal = await page.evaluate(() => {
    const hov = document.createElement('style');
    hov.textContent = '.domshell-rail{}'; // noop
    const label = document.querySelector('.domshell-rail-label');
    // force hover state by adding a class-equivalent: use :hover via matchMedia not possible; read the :hover rule from stylesheets
    let hoverRule = null;
    for (const ss of document.styleSheets) { try { for (const r of ss.cssRules) { if (r.selectorText && r.selectorText.includes('.domshell-rail:hover .domshell-rail-label')) hoverRule = r.style.transition; } } catch (_) {} }
    return { baseTransition: getComputedStyle(label).transition, hoverRuleTransition: hoverRule };
  });
  console.log('   base (collapse) transition :', normal.baseTransition);
  console.log('   hover (reveal)  transition :', normal.hoverRuleTransition);
  ok('reveal transition = opacity 200ms w/ 100ms delay (coordinated w/ width expand)', /opacity/.test(normal.hoverRuleTransition || '') && /(0\.2s|200ms)/.test(normal.hoverRuleTransition || '') && /(0\.1s|100ms)/.test(normal.hoverRuleTransition || ''));
  ok('collapse transition stays quick (--motion-fast / 120ms, no delay)', /0\.12s|120ms/.test(normal.baseTransition) && !/\b0\.1s\b/.test(normal.baseTransition));

  // live hover ramp via real CDP mouse events — label opacity should TRAIL
  // the width expansion (both start ~100ms in), not precede it.
  const client = await page.target().createCDPSession();
  await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 600, y: 800 });
  await new Promise(r => setTimeout(r, 400));
  await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 18, y: 400 });
  const ramp = [];
  for (let i = 0; i < 13; i++) {
    const s = await page.evaluate(() => { const l = document.querySelector('.domshell-rail-label'); const r = document.querySelector('.domshell-rail'); return { op: +getComputedStyle(l).opacity, w: Math.round(r.getBoundingClientRect().width) }; });
    ramp.push(`t${i * 35}:op${s.op.toFixed(2)}/w${s.w}`);
    await new Promise(r => setTimeout(r, 35));
  }
  const railEngaged = ramp.some(s => parseInt(s.split('/w')[1], 10) > 100);
  console.log('   hover ramp:', ramp.join(' '), railEngaged ? '' : '  (NOTE: headless :hover did not engage — timing verified via CSS rule + reduced-motion assertions above)');
  if (railEngaged) {
    const final = await page.evaluate(() => { const l = document.querySelector('.domshell-rail-label'); const r = document.querySelector('.domshell-rail'); return { op: +getComputedStyle(l).opacity, w: Math.round(r.getBoundingClientRect().width) }; });
    ok(`after hover settles: label opaque (op=${final.op}) and rail expanded (w=${final.w})`, final.op > 0.9 && final.w > 200);
    const early = ramp.slice(1, 3).map(s => parseFloat(s.split('op')[1].split('/')[0]));
    ok(`early reveal gradual not a flash (op@35-70ms ≈ ${early.join(',')})`, early.every(v => v < 0.7));
  }
  await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 600, y: 800 });

  // reduced motion — label usable ~instantly
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  const rm = await page.evaluate(() => {
    const l = document.querySelector('.domshell-rail-label');
    return { dur: getComputedStyle(l).transitionDuration };
  });
  ok(`reduced-motion zeroes the fade duration (${rm.dur})`, /^0s|0\.00001s|1e-05s/.test(rm.dur));
  await page.close();
}

await browser.close();
server.close();
console.log(`\n────────────\nVERIFY: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
