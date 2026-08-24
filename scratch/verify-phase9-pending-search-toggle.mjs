// Phase 9 mobile-first audit — verifies the Pending mobile search toggle
// (wirePendingMobileSearchToggle in js/app.js) behaves correctly: opens the
// overlay + focuses input, closes on toggle-again, closes on outside click,
// closes on Escape. Copies the function verbatim (app.js has no exports,
// same documented reason as scratch/pending-workspace-reconciler-harness.html).
import puppeteer from 'puppeteer';
import http from 'http';
import { readFileSync } from 'fs';
import path from 'path';

const ROOT = process.cwd();
const server = http.createServer((req, res) => {
  if (req.url === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  const p = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(ROOT, p);
  try {
    const body = readFileSync(file);
    const ext = path.extname(file);
    const type = { '.css': 'text/css', '.html': 'text/html' }[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    res.end(body);
  } catch (e) { res.writeHead(404); res.end('not found'); }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

let pass = 0, fail = 0;
function check(label, cond, extra = '') {
  if (cond) { pass++; console.log(`OK   ${label}${extra ? ' ' + extra : ''}`); }
  else { fail++; console.log(`FAIL ${label}${extra ? ' ' + extra : ''}`); }
}

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`http://localhost:${port}/index.html`, { waitUntil: 'load' });
await page.setContent(`<!DOCTYPE html><html><head><link rel="stylesheet" href="/platform.css"></head><body>
  <div class="v2-topbar-search"><input id="v2SearchInput"/></div>
  <div class="v2-workspace-header">
    <h2 class="v2-workspace-title">Request Menunggu Approval</h2>
    <p class="v2-workspace-subtitle"></p>
    <button type="button" class="v2-pending-search-toggle" id="v2PendingSearchToggle" aria-label="Cari request" aria-expanded="false">search</button>
  </div>
  <div id="outside" style="height:2000px">outside area</div>
  <script>
    function wirePendingMobileSearchToggle() {
      const toggle = document.getElementById('v2PendingSearchToggle');
      if (!toggle || toggle.dataset.wired) return;
      toggle.dataset.wired = '1';
      const close = () => {
        document.body.classList.remove('pending-mobile-search-open');
        toggle.setAttribute('aria-expanded', 'false');
        document.removeEventListener('click', onOutsideClick, true);
        document.removeEventListener('keydown', onEscape, true);
      };
      const onOutsideClick = (e) => {
        const bar = document.querySelector('.v2-topbar-search');
        if (bar && !bar.contains(e.target) && e.target !== toggle) close();
      };
      const onEscape = (e) => { if (e.key === 'Escape') close(); };
      toggle.addEventListener('click', () => {
        const opening = !document.body.classList.contains('pending-mobile-search-open');
        if (opening) {
          document.body.classList.add('pending-mobile-search-open');
          toggle.setAttribute('aria-expanded', 'true');
          document.getElementById('v2SearchInput')?.focus();
          setTimeout(() => {
            document.addEventListener('click', onOutsideClick, true);
            document.addEventListener('keydown', onEscape, true);
          }, 0);
        } else { close(); }
      });
    }
    wirePendingMobileSearchToggle();
  </script>
</body></html>`, { waitUntil: 'networkidle0' });
await page.setViewport({ width: 375, height: 812 });

await page.click('#v2PendingSearchToggle');
await new Promise((r) => setTimeout(r, 30));
let state = await page.evaluate(() => ({
  open: document.body.classList.contains('pending-mobile-search-open'),
  expanded: document.getElementById('v2PendingSearchToggle').getAttribute('aria-expanded'),
  focused: document.activeElement.id,
  searchVisible: getComputedStyle(document.querySelector('.v2-topbar-search')).display !== 'none',
}));
check('toggle open: body gets pending-mobile-search-open class', state.open === true, JSON.stringify(state));
check('toggle open: aria-expanded becomes true', state.expanded === 'true', JSON.stringify(state));
check('toggle open: focus moves to #v2SearchInput', state.focused === 'v2SearchInput', JSON.stringify(state));
check('toggle open: .v2-topbar-search becomes visible (display != none)', state.searchVisible === true, JSON.stringify(state));

// Tap the toggle again — should close.
await page.click('#v2PendingSearchToggle');
await new Promise((r) => setTimeout(r, 30));
state = await page.evaluate(() => document.body.classList.contains('pending-mobile-search-open'));
check('toggle again: closes the overlay', state === false, String(state));

// Reopen, then click outside — should close.
await page.click('#v2PendingSearchToggle');
await new Promise((r) => setTimeout(r, 30));
await page.click('#outside');
await new Promise((r) => setTimeout(r, 30));
state = await page.evaluate(() => document.body.classList.contains('pending-mobile-search-open'));
check('outside click: closes the overlay', state === false, String(state));

// Reopen, then press Escape — should close.
await page.click('#v2PendingSearchToggle');
await new Promise((r) => setTimeout(r, 30));
await page.keyboard.press('Escape');
await new Promise((r) => setTimeout(r, 30));
state = await page.evaluate(() => document.body.classList.contains('pending-mobile-search-open'));
check('Escape: closes the overlay', state === false, String(state));

check('no console/page errors', errors.length === 0, errors.join(' | '));

await browser.close();
server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
