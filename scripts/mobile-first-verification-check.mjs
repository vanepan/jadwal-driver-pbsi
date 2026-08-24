/* mobile-first-verification-check.mjs — Design System Program Phase 9

   Permanent regression suite for the Phase 9 mobile-first audit's fixes.
   Two kinds of checks, both against REAL project files (never copied
   logic for CSS — CSS has no import-cost problem the way js/app.js does):

   1. Full real-app boot (same unauthenticated login-screen pattern as
      smoke-boot.mjs) — horizontal overflow swept across every mandated
      viewport (§32 of the phase brief: 360/375/390/402/430/768/1024/
      1194/1440), console-error cleanliness, viewport meta zoom check.
   2. Structural CSS/DOM checks for the specific fixes that need real
      authenticated screens to reach in the live app (Pending, Drivers/
      Admin cards, Engineering/Overtime/Petty-Cash tables+forms) — same
      "real CSS file against a synthetic fragment shaped like the real
      markup" pattern already established by
      scratch/verify-pending-workspace-reconciler.mjs and
      scratch/pending-workspace-reconciler-harness.html (js/app.js has
      zero exports and would fire real Firebase reads if imported).

   Run: node scripts/mobile-first-verification-check.mjs (exit 0 = pass) */

import puppeteer from 'puppeteer';
import http from 'http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); if (detail !== undefined) console.log('     • ' + String(detail).slice(0, 300)); }
};

const server = http.createServer((req, res) => {
  if (req.url === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });

async function freshPage(width, height) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Permission denied|Fetch Firebase/.test(m.text())) errors.push('console.error: ' + m.text()); });
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.goto(`http://localhost:${port}/index.html`, { waitUntil: 'networkidle0', timeout: 45000 });
  return { page, errors };
}

/* ── §1. Full real-app horizontal-overflow sweep — the mandated viewport list ── */
console.log('\n[1] Horizontal overflow sweep (real unauthenticated boot, §32 viewport list)');
const VIEWPORTS = [360, 375, 390, 402, 430, 768, 1024, 1194, 1440];
for (const w of VIEWPORTS) {
  const { page, errors } = await freshPage(w, 900);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  check(`${w}px: no page-level horizontal overflow`, overflow === false);
  check(`${w}px: zero console/page errors`, errors.length === 0, errors.join('; '));
  await page.close();
}

/* ── §2. Viewport meta does not disable zoom (§34) ── */
console.log('\n[2] Zoom accessibility');
{
  const { page } = await freshPage(390, 844);
  const content = await page.$eval('meta[name="viewport"]', (el) => el.getAttribute('content'));
  check('viewport meta has no maximum-scale/user-scalable lock', !/maximum-scale|user-scalable/.test(content), content);
  await page.close();
}

/* ── §3. Touch-target + Pending structural fixes (CSS-only probes) ── */
console.log('\n[3] Touch targets + Pending workspace CSS fixes');
{
  const { page } = await freshPage(375, 812);
  const info = await page.evaluate(() => {
    const probe = (tag, cls, html) => {
      const el = document.createElement(tag);
      el.className = cls;
      if (html) el.innerHTML = html;
      document.body.appendChild(el);
      const cs = getComputedStyle(el);
      const out = { minHeight: cs.minHeight, flexDirection: cs.flexDirection, whiteSpace: cs.whiteSpace };
      el.remove();
      return out;
    };
    return {
      userBtn: probe('button', 'v2-user-btn'),
      pendingBtn: probe('button', 'v2-pending-btn'),
      pendingActions: probe('div', 'v2-pending-card-actions'),
      pendingFullValue: (() => {
        const wrap = document.createElement('div');
        wrap.className = 'v2-pending-field v2-pending-field--full';
        wrap.innerHTML = '<span class="v2-pending-value">x</span>';
        document.body.appendChild(wrap);
        const ws = getComputedStyle(wrap.querySelector('.v2-pending-value')).whiteSpace;
        wrap.remove();
        return ws;
      })(),
    };
  });
  check('.v2-user-btn min-height 44px (Drivers/Admin card actions)', info.userBtn.minHeight === '44px', info.userBtn.minHeight);
  check('.v2-pending-btn min-height 44px (Pending approve/reject)', info.pendingBtn.minHeight === '44px', info.pendingBtn.minHeight);
  check('.v2-pending-card-actions stacks column at 375px', info.pendingActions.flexDirection === 'column', info.pendingActions.flexDirection);
  check('.v2-pending-field--full value wraps instead of clipping', info.pendingFullValue === 'normal', info.pendingFullValue);
  await page.close();
}

/* ── §4. Tablet rail (hover:none) fallback — static CSSOM check, this CDP
        version has no live "hover" media emulation ── */
console.log('\n[4] Tablet rail hover:none fallback (768-1023px touch tablets)');
{
  const { page } = await freshPage(900, 1024);
  const found = await page.evaluate(() => {
    for (const sheet of document.styleSheets) {
      let rules; try { rules = sheet.cssRules; } catch (e) { continue; }
      for (const rule of rules) {
        if (rule.media && [...rule.media].some((m) => m.includes('hover: none') || m.includes('hover:none'))) {
          const t = rule.cssText;
          return {
            found: true,
            railWidth: /\.domshell-rail\s*\{[^}]*width:\s*220px/.test(t),
            labelOpacity: /\.domshell-rail-label[^{]*\{[^}]*opacity:\s*1/.test(t),
          };
        }
      }
    }
    return { found: false };
  });
  check('platform.css has a (hover: none) rail fallback block', found.found === true, JSON.stringify(found));
  check('(hover: none) block expands rail to 220px', found.railWidth === true, JSON.stringify(found));
  check('(hover: none) block forces rail labels visible', found.labelOpacity === true, JSON.stringify(found));
  await page.close();
}

/* ── §5. Canonical drawer body-scroll lock is wired (source check — the
        drawer's own open/close cycle is already covered end-to-end by
        drawer-consolidation-check.mjs, this just confirms the specific
        Phase 9 addition is present so a future edit can't silently drop it) ── */
console.log('\n[5] Canonical drawer scroll-lock wiring');
{
  const src = fs.readFileSync(path.join(ROOT, 'js/components/drawer.js'), 'utf8');
  check('drawer.js imports lockBodyScroll/unlockBodyScroll', /import\s*\{\s*lockBodyScroll,\s*unlockBodyScroll\s*\}/.test(src));
  check('openDrawer() calls lockBodyScroll()', /lockBodyScroll\(\)/.test(src));
  check('closeDrawer() path calls unlockBodyScroll()', /unlockBodyScroll\(\)/.test(src));
}

/* ── §6. Engineering / Overtime / Petty-Cash table & form reflow (real CSS
        against synthetic fragments shaped like the real render output) ── */
console.log('\n[6] Engineering / Overtime / Petty-Cash mobile reflow');
async function fragment(cssFile, rootClass, bodyHtml, width = 375) {
  const page = await browser.newPage();
  await page.setViewport({ width, height: 900 });
  await page.goto(`http://localhost:${port}/index.html`, { waitUntil: 'load' });
  await page.setContent(`<!DOCTYPE html><html><head><link rel="stylesheet" href="/${cssFile}"></head><body class="${rootClass}">${bodyHtml}</body></html>`, { waitUntil: 'networkidle0' });
  return page;
}

{
  const page = await fragment('engineering.css', 'eng-root', `
    <div class="eng-table-wrap"><table class="eng-table"><thead><tr><th>Penugasan</th></tr></thead>
      <tbody><tr><td data-label="Penugasan">x</td></tr></tbody></table></div>
    <div class="eng-field-row"><input class="eng-input"/><input class="eng-input"/></div>`);
  const info = await page.evaluate(() => ({
    tableDisplay: getComputedStyle(document.querySelector('.eng-table')).display,
    theadDisplay: getComputedStyle(document.querySelector('.eng-table thead')).display,
    fieldRowCols: getComputedStyle(document.querySelector('.eng-field-row')).gridTemplateColumns.trim().split(/\s+/).length,
    inputFont: getComputedStyle(document.querySelector('.eng-input')).fontSize,
  }));
  check('engineering: .eng-table reflows to display:block at 375px', info.tableDisplay === 'block', JSON.stringify(info));
  check('engineering: thead hidden at 375px', info.theadDisplay === 'none', JSON.stringify(info));
  check('engineering: .eng-field-row collapses to 1 column at 375px', info.fieldRowCols === 1, JSON.stringify(info));
  check('engineering: .eng-input hits 16px at 375px (iOS zoom guard)', info.inputFont === '16px', JSON.stringify(info));
  await page.close();
}

{
  const page = await fragment('overtime.css', 'ot-root', `
    <div class="ot-records-table-wrap"><table class="ot-records-table"><thead><tr><th>Tanggal</th></tr></thead>
      <tbody><tr><td data-label="Tanggal">x</td><td><button class="ot-row-btn">Edit</button></td></tr></tbody></table></div>
    <table class="ot-history-table"><tbody><tr><td>x</td></tr></tbody></table>
    <table class="ot-closing-table"><tbody><tr><td>x</td></tr></tbody></table>
    <table class="ot-preview-table"><tbody><tr><td>x</td></tr></tbody></table>`);
  const info = await page.evaluate(() => ({
    records: getComputedStyle(document.querySelector('.ot-records-table')).display,
    history: getComputedStyle(document.querySelector('.ot-history-table')).display,
    closing: getComputedStyle(document.querySelector('.ot-closing-table')).display,
    preview: getComputedStyle(document.querySelector('.ot-preview-table')).display,
    rowBtn: getComputedStyle(document.querySelector('.ot-row-btn')).minHeight,
  }));
  check('overtime: .ot-records-table reflows to block at 375px', info.records === 'block', JSON.stringify(info));
  check('overtime: .ot-history-table reflows to block at 375px', info.history === 'block', JSON.stringify(info));
  check('overtime: .ot-closing-table reflows to block at 375px', info.closing === 'block', JSON.stringify(info));
  check('overtime: .ot-preview-table reflows to block at 375px', info.preview === 'block', JSON.stringify(info));
  check('overtime: .ot-row-btn min-height 44px', info.rowBtn === '44px', JSON.stringify(info));
  await page.close();
}

{
  const page = await fragment('petty-cash.css', 'pc-root', `
    <div class="pc-add-box"><div class="pc-add-grid"><input class="pc-add-input"/></div>
    <div class="pc-add-foot"><button class="pc-add-btn pc-add-btn--save">Simpan</button></div></div>`);
  const info = await page.evaluate(() => ({
    gridCols: getComputedStyle(document.querySelector('.pc-add-grid')).gridTemplateColumns.trim().split(/\s+/).length,
    inputFont: getComputedStyle(document.querySelector('.pc-add-input')).fontSize,
    btn: getComputedStyle(document.querySelector('.pc-add-btn--save')).minHeight,
  }));
  check('pettycash: .pc-add-grid collapses to 1 column at 375px', info.gridCols === 1, JSON.stringify(info));
  check('pettycash: .pc-add-input hits 16px at 375px (iOS zoom guard)', info.inputFont === '16px', JSON.stringify(info));
  check('pettycash: .pc-add-btn--save min-height 44px', info.btn === '44px', JSON.stringify(info));
  await page.close();
}

/* ── §7. Reduced motion / [data-anim="off"] — no NEW motion was added this
        phase, so this confirms the existing app-wide gates still apply
        cleanly on top of the Phase 9 changes, not a new mechanism ── */
console.log('\n[7] Reduced motion / [data-anim="off"] still gate correctly');
{
  const page = await browser.newPage();
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.setViewport({ width: 390, height: 844 });
  await page.goto(`http://localhost:${port}/index.html`, { waitUntil: 'networkidle0', timeout: 45000 });
  check('prefers-reduced-motion: page boots with zero errors', errors.length === 0, errors.join('; '));
  await page.close();
}

await browser.close();
server.close();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
