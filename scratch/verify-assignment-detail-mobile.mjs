/* V1 HOTFIX — Assignment Detail mobile vertical scroll / clipping.
   Drives the REAL js/modal.js openDetailModal() via scratch/modal-drawer-harness.html
   (real drawer, real style.css + platform.css), with a deliberately TALL
   assignment fixture. Measures, at several mobile widths and every accordion
   state:
     - is .drawer__body a real single vertical scroll container?
     - does any OPEN .accord-body clip its inner content? (scrollHeight > clientHeight)
     - can you scroll to the bottom and see the Hapus/Edit/Tutup buttons fully?
     - does the drawer bottom stay within the viewport?
     - zero nested scrollbars inside sections?
     - zero horizontal overflow?
   Also checks desktop (1280/1440/1920) for regressions.
   Run: node scratch/verify-assignment-detail-mobile.mjs   (exit 0 = all pass) */
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
const HARNESS = `http://localhost:${port}/scratch/modal-drawer-harness.html`;

// A deliberately tall assignment — long free-text fields + full lifecycle
// audit + cancellation + odometer, so every section is genuinely large.
const LONG = 'Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ut enim ad minim veniam quis nostrud exercitation ullamco laboris';
const FAT = {
  id: 'fat', driver: 'Bambang Setiawan Nugroho', phone: '0812-3456-7890',
  vehicle: 'Toyota Avanza B 1234 XYZ', date: '2026-08-20', startTime: '07:30', endTime: '19:45',
  destination: 'Gedung Serba Guna Kompleks Olahraga Nasional Jalan Pintu Satu Senayan Jakarta Pusat lalu lanjut ke ' + LONG,
  purpose: 'Antar jemput delegasi teknis dan peralatan pertandingan, ' + LONG,
  pic: 'Grace Kartika Wijaya', pax: 6,
  notes: 'Catatan tambahan: ' + LONG + ' — ' + LONG,
  status: 'completed',
  createdBy: 'requester.user', requestId: 'req-1', createdAt: '2026-08-18T09:00:00Z',
  assignedBy: 'admin.dispatcher', assignedAt: '2026-08-18T12:30:00Z',
  startedBy: 'Bambang Setiawan Nugroho', startedAt: '2026-08-20T07:32:00Z',
  completedBy: 'Bambang Setiawan Nugroho', completedAt: '2026-08-20T19:48:00Z',
  cancelledAt: '2026-08-20T20:00:00Z',
  cancellationReason: 'Dibatalkan setelah selesai untuk keperluan audit administratif: ' + LONG,
  startOdometer: 45120, endOdometer: 45410, distanceTravelled: 290,
};

const MOBILE = [320, 360, 375, 390, 393, 410, 430, 475];
const DESKTOP = [1280, 1440, 1920];
const STATES = {
  A: [],                                   // all collapsed (Summary always open)
  B: ['accordWA'],
  C: ['accordReimbursement'],
  D: ['accordWA', 'accordReimbursement'],
  E: ['accordExtra', 'accordOps', 'accordOdo', 'accordWA', 'accordReimbursement'], // all open
};

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(String(e.message).slice(0, 200)));
page.on('console', m => { if (m.type() === 'error') pageErrors.push(m.text().slice(0, 200)); });
page.on('dialog', d => d.accept());

await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
await page.goto(HARNESS, { waitUntil: 'load', timeout: 45000 });
await page.evaluate(() => localStorage.setItem('pbsi_current_user', JSON.stringify({ username: 'admin1', name: 'Admin Test', role: 'admin' })));
await page.reload({ waitUntil: 'load', timeout: 45000 });
await page.waitForFunction('window.__modalHarnessReady === true', { timeout: 15000 });
await page.evaluate((list) => window.__modal.setAssignments(list), [FAT]);

let pass = 0, fail = 0;
const results = [];
const ok = (label, cond, detail = '') => { cond ? pass++ : fail++; if (!cond) results.push(`FAIL  ${label}${detail ? '  — ' + detail : ''}`); };

async function measure(width, stateKey) {
  const openIds = STATES[stateKey];
  const m = await page.evaluate(async ({ openIds }) => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    // fresh open
    if (document.getElementById('appDrawerOverlay')) window.__modal.closeDetailModal();
    await sleep(60);
    window.__modal.openDetailModal('fat');
    await sleep(80);
    const overlay = document.getElementById('appDrawerOverlay');
    // expand requested accordions (Summary already open)
    for (const id of openIds) {
      const sec = overlay.querySelector('#' + id);
      if (sec && !sec.classList.contains('accord-section--open')) {
        sec.querySelector('.accord-header').click();
      }
    }
    await sleep(350); // let max-height / grid transitions settle
    const body = overlay.querySelector('.drawer__body');
    const drawer = overlay.querySelector('.drawer');
    const head = overlay.querySelector('.drawer__head');

    // nested-scroll audit: any descendant of .drawer__body (other than the body
    // itself) that is a scroll container AND actually overflows
    const nested = [];
    overlay.querySelectorAll('.drawer__body *').forEach(el => {
      const cs = getComputedStyle(el);
      const scrolls = (cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 1;
      if (scrolls) nested.push(el.className || el.id || el.tagName);
    });

    // clip check — measured at BOTH levels:
    //  (a) the .accord-body grid row vs its inner content (catches a max-height cap)
    //  (b) the whole .accord-section rendered box vs its scrollHeight
    //      (catches the flex-shrink-in-the-drawer-body failure, where the
    //       SECTION is squeezed and its own overflow:hidden does the clipping)
    const sections = [];
    overlay.querySelectorAll('.accord-section--open').forEach(sec => {
      const ab = sec.querySelector('.accord-body');
      const inner = sec.querySelector('.accord-body-inner');
      if (!ab || !inner) return;
      const bodyClip = inner.scrollHeight - ab.clientHeight;
      const secRectH = Math.round(sec.getBoundingClientRect().height);
      const secClip = sec.scrollHeight - secRectH;
      const clipPx = Math.max(bodyClip, secClip);
      sections.push({ id: sec.id, clipPx, bodyClip, secClip, secRectH, secScrollH: sec.scrollHeight,
        cs_maxH: getComputedStyle(ab).maxHeight, cs_flexShrink: getComputedStyle(sec).flexShrink });
    });
    // also: is EVERY direct body child at (≥) its natural height?
    const shrunkChildren = [];
    overlay.querySelectorAll('.drawer__body > *').forEach(el => {
      const rH = Math.round(el.getBoundingClientRect().height);
      if (el.scrollHeight - rH > 1) shrunkChildren.push(`${(el.className || el.tagName).split(' ')[0]}:-${el.scrollHeight - rH}px`);
    });

    // scroll body to bottom, then check the last actions row
    body.scrollTop = body.scrollHeight;
    await sleep(60);
    const actions = overlay.querySelector('.detail-actions');
    const btns = actions ? [...actions.querySelectorAll('button')] : [];
    const vpH = window.innerHeight;
    const btnState = btns.map(b => { const r = b.getBoundingClientRect(); return { t: r.top, b: r.bottom, fullyVisible: r.top >= (head.getBoundingClientRect().bottom - 1) && r.bottom <= vpH + 1, h: Math.round(r.height) }; });
    const drawerR = drawer.getBoundingClientRect();
    const de = document.documentElement;

    // total natural height of body content vs the body box — if content is
    // genuinely taller, the body MUST be scrolling (scrollHeight > clientHeight)
    let naturalSum = 0;
    overlay.querySelectorAll('.drawer__body > *').forEach(el => { naturalSum += el.scrollHeight; });
    naturalSum += 20 * Math.max(0, overlay.querySelectorAll('.drawer__body > *').length - 1); // gaps
    naturalSum += 36; // body padding

    return {
      vpH,
      bodyScrollable: body.scrollHeight > body.clientHeight + 1,
      bodyScrollHeight: body.scrollHeight, bodyClientHeight: body.clientHeight,
      contentGenuinelyTall: naturalSum > body.clientHeight + 4,
      drawerBottom: +drawerR.bottom.toFixed(1), drawerTop: +drawerR.top.toFixed(1),
      drawerBottomWithinVp: drawerR.bottom <= vpH + 1,
      headerVisible: head.getBoundingClientRect().top >= -1 && head.getBoundingClientRect().bottom <= vpH,
      nested,
      sections,
      shrunkChildren,
      allButtonsFullyVisible: btnState.length > 0 && btnState.every(b => b.fullyVisible),
      btnState,
      horizontalOverflow: de.scrollWidth - de.clientWidth,
      drawerOverflowX: drawer.scrollWidth - drawer.clientWidth,
    };
  }, { openIds });
  return m;
}

for (const width of MOBILE) {
  await page.setViewport({ width, height: 844, deviceScaleFactor: 2 });
  for (const stateKey of Object.keys(STATES)) {
    const m = await measure(width, stateKey);
    const tag = `${width}px / state ${stateKey}`;
    const clipped = m.sections.filter(s => s.clipPx > 1);
    ok(`${tag}: no body child is shrunk below its content`, m.shrunkChildren.length === 0, m.shrunkChildren.join(', '));
    ok(`${tag}: body IS the single scroll container when content is tall`, !m.contentGenuinelyTall || m.bodyScrollable, `tallContent=${m.contentGenuinelyTall} scrolls=${m.bodyScrollable} sh=${m.bodyScrollHeight} ch=${m.bodyClientHeight}`);
    ok(`${tag}: NO open section clips its content (body OR section level)`, clipped.length === 0, clipped.map(s => `${s.id}:+${Math.round(s.clipPx)}px (bodyClip=${s.bodyClip} secClip=${s.secClip} shrink=${s.cs_flexShrink} maxH=${s.cs_maxH})`).join(', '));
    ok(`${tag}: NO nested scrollbar inside a section`, m.nested.length === 0, m.nested.join(', '));
    ok(`${tag}: drawer bottom within viewport`, m.drawerBottomWithinVp, `bottom=${m.drawerBottom} vpH=${m.vpH}`);
    ok(`${tag}: header stays visible`, m.headerVisible);
    ok(`${tag}: Hapus/Edit/Tutup all fully visible after scroll-to-bottom`, m.allButtonsFullyVisible, JSON.stringify(m.btnState));
    ok(`${tag}: no horizontal overflow (doc & drawer)`, m.horizontalOverflow <= 0 && m.drawerOverflowX <= 0, `doc=${m.horizontalOverflow} drawer=${m.drawerOverflowX}`);
  }
}

// Desktop regression
for (const width of DESKTOP) {
  await page.setViewport({ width, height: 900 });
  const m = await measure(width, 'E');
  const clipped = m.sections.filter(s => s.clipPx > 1);
  ok(`desktop ${width}px: drawer right-docked & full height`, Math.abs((m.vpH) - (m.drawerBottom - m.drawerTop)) < 3 && m.drawerTop <= 1, `top=${m.drawerTop} h=${(m.drawerBottom - m.drawerTop).toFixed(0)} vpH=${m.vpH}`);
  ok(`desktop ${width}px: no body child shrunk below content`, m.shrunkChildren.length === 0, m.shrunkChildren.join(', '));
  ok(`desktop ${width}px: NO open section clips its content`, clipped.length === 0, clipped.map(s => `${s.id}:+${Math.round(s.clipPx)}px`).join(', '));
  ok(`desktop ${width}px: body scrolls, all actions reachable`, m.allButtonsFullyVisible);
  ok(`desktop ${width}px: no nested scrollbar`, m.nested.length === 0, m.nested.join(', '));
}

// ── Accordion behaviour: collapse height ≈ 0, toggle open/close/open works ──
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
const acc = await page.evaluate(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  if (document.getElementById('appDrawerOverlay')) window.__modal.closeDetailModal();
  await sleep(60);
  window.__modal.openDetailModal('fat');
  await sleep(80);
  const ov = document.getElementById('appDrawerOverlay');
  const sec = ov.querySelector('#accordOps');
  const body = sec.querySelector('.accord-body');
  const hdr = sec.querySelector('.accord-header');
  const collapsedH = body.getBoundingClientRect().height;               // starts collapsed
  hdr.click(); await sleep(350);
  const openH = body.getBoundingClientRect().height;
  const openAria = hdr.getAttribute('aria-expanded');
  hdr.click(); await sleep(350);
  const reCollapsedH = body.getBoundingClientRect().height;
  const reAria = hdr.getAttribute('aria-expanded');
  hdr.click(); await sleep(350);
  const reOpenH = body.getBoundingClientRect().height;
  // body still scrolls with a section freshly opened
  const drawerBody = ov.querySelector('.drawer__body');
  const drawerEl = ov.querySelector('.drawer');
  const openSecs = [...ov.querySelectorAll('.accord-section--open')].map(s => s.id);
  const scrolls = drawerBody.scrollHeight > drawerBody.clientHeight + 1;
  return { collapsedH, openH, openAria, reCollapsedH, reAria, reOpenH, scrolls,
    diag: { bodySH: drawerBody.scrollHeight, bodyCH: drawerBody.clientHeight, drawerH: Math.round(drawerEl.getBoundingClientRect().height), vpH: window.innerHeight, openSecs } };
});
// ── the open/close height animation must actually PLAY (not snap) ──
const anim = await page.evaluate(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  if (document.getElementById('appDrawerOverlay')) window.__modal.closeDetailModal();
  await sleep(60);
  window.__modal.openDetailModal('fat');
  await sleep(80);
  const ov = document.getElementById('appDrawerOverlay');
  const sec = ov.querySelector('#accordExtra');
  const body = sec.querySelector('.accord-body');
  const cs = getComputedStyle(body);
  sec.querySelector('.accord-header').click();      // open
  await sleep(110);                                 // ~mid 0.25s transition
  const midH = body.getBoundingClientRect().height;
  await sleep(300);
  const endH = body.getBoundingClientRect().height;
  return { transProp: cs.transitionProperty, transDur: cs.transitionDuration, midH, endH };
});
ok(`accordion: transition-property includes grid-template-rows (${anim.transProp})`, /grid-template-rows/.test(anim.transProp));
ok(`accordion: normal-motion duration ≈ 0.25s (${anim.transDur})`, /0\.25s/.test(anim.transDur));
ok(`accordion: height animates (mid-transition height between 0 and final)`, anim.midH > 4 && anim.midH < anim.endH - 4, `mid=${anim.midH.toFixed(0)} end=${anim.endH.toFixed(0)}`);

ok('accordion: collapsed body height ≈ 0', acc.collapsedH < 2, `got ${acc.collapsedH.toFixed(1)}px`);
ok('accordion: opens to a real natural height', acc.openH > 40, `got ${acc.openH.toFixed(1)}px`);
ok('accordion: aria-expanded="true" when open', acc.openAria === 'true');
ok('accordion: re-collapses to ≈ 0', acc.reCollapsedH < 2, `got ${acc.reCollapsedH.toFixed(1)}px`);
ok('accordion: aria-expanded="false" when re-collapsed', acc.reAria === 'false');
ok('accordion: re-opens to natural height (toggle stable)', Math.abs(acc.reOpenH - acc.openH) < 3, `open1=${acc.openH.toFixed(0)} open2=${acc.reOpenH.toFixed(0)}`);
ok('accordion: drawer body still scrolls after opening a section', acc.scrolls, JSON.stringify(acc.diag));

// ── prefers-reduced-motion: the grid transition must collapse to ~instant ──
await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
const rm = await page.evaluate(() => {
  if (document.getElementById('appDrawerOverlay')) window.__modal.closeDetailModal();
  window.__modal.openDetailModal('fat');
  const ab = document.querySelector('#appDrawerOverlay #accordOps .accord-body');
  const cs = getComputedStyle(ab);
  return { dur: cs.transitionDuration, prop: cs.transitionProperty };
});
ok(`reduced-motion: accord-body transition-duration ≈ 0 (${rm.dur})`, /^0s$|0\.00001s|1e-05s/.test(rm.dur));
await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);

ok('no page errors (excluding expected Firebase permission noise)', pageErrors.filter(e => !/permission[_ ]denied|Permission denied|Firebase listener gagal/i.test(e)).length === 0, pageErrors.join(' | '));

await browser.close();
server.close();

console.log(results.length ? results.join('\n') : '(no failures)');
console.log(`\n──────────\nASSIGNMENT DETAIL MOBILE: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
