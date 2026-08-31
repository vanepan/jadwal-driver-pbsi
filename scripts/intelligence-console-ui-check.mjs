/* ============================================================
   intelligence-console-ui-check.mjs — Sarpras Intelligence (V2, Phase 3B)

   REAL-browser (puppeteer) check of the minimal Intelligence console VIEW
   (js/intelligence-console.js) against the scripted, OFFLINE harness
   (scripts/intelligence-console-harness.html — no Firebase, no OpenAI, a
   fake createIntelligenceService()).

   Proves:
     • responsive at 320 / 375 / 390 / 430 / 768 / 1024 / 1440 — no horizontal
       overflow, the input + submit + review panel stay inside the viewport
       and are not clipped, at every width, including in the review state
     • flow: idle → type → submit → needs_input → answer → needs_input →
       answer → requires_review (read-only summary)
     • DISPLAY ONLY — the review panel has NO edit / publish / "Terbitkan" /
       save / numbering control anywhere
     • double-submit protection — two fast clicks = ONE service.handle call
     • a11y — the input has an accessible name, submit is a real <button>,
       Enter submits
     • safety — mount makes 0 service calls; the page makes 0 requests to
       OpenAI / Firebase / Cloud Functions / googleapis

   Run:  node scripts/intelligence-console-ui-check.mjs   (exit 0 = pass)
   ============================================================ */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass += 1; console.log(`  ✓ ${name}`); }
  else { fail += 1; console.log(`  ✗ ${name}`); if (detail !== undefined) console.log('     ' + JSON.stringify(detail)); }
};
const section = (t) => console.log(`\n── ${t} ──`);

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/scripts/intelligence-console-harness.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

const VIEWPORTS = [320, 375, 390, 430, 768, 1024, 1440];
const BLOCKED_HOSTS = /openai\.com|firebaseio\.com|cloudfunctions\.net|googleapis\.com|gstatic\.com/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const base = `http://localhost:${port}`;

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();

  const offNetwork = [];
  page.on('request', (r) => { if (BLOCKED_HOSTS.test(r.url())) offNetwork.push(r.url()); });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  await page.goto(`${base}/scripts/intelligence-console-harness.html`, { waitUntil: 'networkidle0' });
  await page.waitForFunction('window.__harnessReady === true', { timeout: 8000 });

  section('Mount safety — 0 service calls, 0 blocked-host requests, no page error');
  check('mount made 0 service.handle calls (no auto-submit on load)',
    (await page.evaluate('window.__harness.handleCalls.length')) === 0);
  check('mount made 0 service.continueSession calls',
    (await page.evaluate('window.__harness.continueCalls.length')) === 0);
  check('no request to OpenAI / Firebase / Cloud Functions / googleapis / gstatic', offNetwork.length === 0, offNetwork);
  check('no uncaught page error', pageErrors.length === 0, pageErrors);
  check('console root is present', (await page.$('.sic-console')) !== null);

  section('Accessibility');
  const a11y = await page.evaluate(() => {
    const input = document.querySelector('.sic-console__input');
    const btn = document.querySelector('.sic-console__btn[type="submit"]');
    const label = document.querySelector('label[for="sicConsoleInput"]');
    const name = input.getAttribute('aria-label') || (label && label.textContent.trim()) || '';
    return { hasName: !!name, btnTag: btn && btn.tagName, btnText: btn && btn.textContent.trim(), inputTag: input && input.tagName };
  });
  check('the input has an accessible name (aria-label or <label for>)', a11y.hasName, a11y);
  check('submit is a real <button> with text', a11y.btnTag === 'BUTTON' && /\S/.test(a11y.btnText || ''), a11y);

  section('Enter submits');
  await page.evaluate('window.__harness.reset()');
  await page.click('.sic-console__input');
  await page.type('.sic-console__input', 'buat NOR pengadaan mesin potong rumput');
  await page.keyboard.press('Enter');
  await page.waitForFunction('window.__harness.handleCalls.length === 1', { timeout: 4000 });
  check('pressing Enter in the input triggered exactly one service.handle call', true);

  section('Double-submit protection');
  await page.evaluate('window.__harness.reset()');
  await page.evaluate(() => {
    const i = document.querySelector('.sic-console__input');
    i.value = 'permintaan cepat'; i.dispatchEvent(new Event('input', { bubbles: true }));
    const b = document.querySelector('.sic-console__btn[type="submit"]');
    b.click(); b.click(); b.click();
  });
  await sleep(200);
  check('three fast clicks → exactly ONE service.handle call',
    (await page.evaluate('window.__harness.handleCalls.length')) === 1);
  check('exactly ONE user turn in the stack',
    (await page.evaluate(() => document.querySelectorAll('.sic-console__msg--user').length)) === 1);

  for (const w of VIEWPORTS) {
    section(`Viewport ${w}px — flow idle → needs_input → review, no overflow`);
    await page.setViewport({ width: w, height: 860, deviceScaleFactor: 1 });
    await page.evaluate('window.__harness.reset()');
    await sleep(30);

    // turn 1 — submit
    await page.evaluate(() => {
      const i = document.querySelector('.sic-console__input');
      i.value = 'Buatkan NOR pembelian mesin potong rumput.'; i.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('.sic-console__btn[type="submit"]').click();
    });
    await page.waitForFunction("window.__harness.getState().phase === 'needs_input'", { timeout: 4000 });

    const t1 = await page.evaluate(() => {
      const msgs = [...document.querySelectorAll('.sic-console__msg--intelligence')].map((n) => n.textContent);
      const i = document.querySelector('.sic-console__input');
      const b = document.querySelector('.sic-console__btn[type="submit"]');
      return {
        lastMsg: msgs[msgs.length - 1] || '',
        inputRight: i.getBoundingClientRect().right,
        btnRight: b.getBoundingClientRect().right,
        inputVisible: i.offsetParent !== null,
        btnVisible: b.offsetParent !== null,
        docScroll: document.documentElement.scrollWidth,
        inner: window.innerWidth,
      };
    });
    check(`${w}: needs_input question rendered in the stack`, /jumlah|barang|unit|adakan/i.test(t1.lastMsg), t1.lastMsg.slice(0, 80));
    check(`${w}: no horizontal page overflow (needs_input)`, t1.docScroll <= t1.inner + 1, t1);
    check(`${w}: input + submit visible and inside the viewport`,
      t1.inputVisible && t1.btnVisible && t1.inputRight <= t1.inner + 1 && t1.btnRight <= t1.inner + 1, t1);

    // turn 2 — answer (recipient question next)
    await page.evaluate(() => {
      const i = document.querySelector('.sic-console__input');
      i.value = '2 unit'; i.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('.sic-console__btn[type="submit"]').click();
    });
    await page.waitForFunction("window.__harness.continueCalls.length === 1", { timeout: 4000 });

    // turn 3 — answer → review
    await page.evaluate(() => {
      const i = document.querySelector('.sic-console__input');
      i.value = 'Bendahara'; i.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('.sic-console__btn[type="submit"]').click();
    });
    await page.waitForFunction("window.__harness.getState().phase === 'review'", { timeout: 4000 });

    const rv = await page.evaluate(() => {
      const panel = document.querySelector('.sic-console__review');
      const buttons = [...document.querySelectorAll('.sic-console button')].map((b) => b.textContent.trim());
      const r = panel ? panel.getBoundingClientRect() : null;
      return {
        hasPanel: !!panel,
        panelText: panel ? panel.textContent.replace(/\s+/g, ' ').trim() : '',
        panelRight: r ? r.right : 0,
        panelScroll: panel ? panel.scrollWidth : 0,
        panelClient: panel ? panel.clientWidth : 0,
        buttons,
        docScroll: document.documentElement.scrollWidth,
        inner: window.innerWidth,
      };
    });
    check(`${w}: review panel rendered`, rv.hasPanel);
    check(`${w}: review shows the read-only summary ("Review" + "Menunggu review")`,
      /Review/.test(rv.panelText) && /Menunggu review/i.test(rv.panelText), rv.panelText.slice(0, 120));
    check(`${w}: review contains the collected facts (recipient Bendahara)`, /Bendahara/.test(rv.panelText));
    check(`${w}: NO edit / publish / terbitkan / save / numbering control anywhere`,
      !rv.buttons.some((t) => /terbitkan|publish|edit|sunting|simpan|save|nomor|number|approve|setuju/i.test(t)), rv.buttons);
    check(`${w}: only the expected controls exist (Kirim + Mulai permintaan baru)`,
      rv.buttons.every((t) => /kirim|memproses|mulai permintaan baru/i.test(t)), rv.buttons);
    check(`${w}: no horizontal page overflow (review)`, rv.docScroll <= rv.inner + 1, { docScroll: rv.docScroll, inner: rv.inner });
    check(`${w}: review panel not clipped horizontally + inside viewport`,
      rv.panelRight <= rv.inner + 1 && rv.panelScroll <= rv.panelClient + 1, rv);
  }

  section('Post-run safety re-check');
  check('still 0 requests to blocked hosts after the full run', offNetwork.length === 0, offNetwork);
  check('no uncaught page errors during the run', pageErrors.length === 0, pageErrors);

  await browser.close();
  server.close();

  console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${pass} passed, ${fail} failed.`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => { console.error(err); try { server.close(); } catch {} process.exit(1); });
