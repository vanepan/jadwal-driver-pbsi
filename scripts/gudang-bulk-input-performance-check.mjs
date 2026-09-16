/* gudang-bulk-input-performance-check.mjs — v1.31.4 R6.

   The Bulk Goods Out modal's qty field (inputmode="numeric") and its
   department search field both called the FULL modal render() on every
   keystroke — rebuilding the whole modal via innerHTML, destroying and
   recreating the focused input's own DOM node each time. On iOS this is
   exactly the shape of bug that resets a numeric virtual keyboard back to
   the alphabetic layout after each digit (a NEW input element gets a NEW
   focus event, and the OS keyboard's sub-layout state does not reliably
   survive that); more generally it also steals focus/caret on every
   platform.

   Fixed (js/gudang/ui/gudang-bulk-ui.js): the qty field now patches only
   the "Lanjut" button's disabled state directly; the department search
   field now patches only its own filtered results sub-region
   ([data-bulk-dept-results]). Neither ever touches the typed-into input's
   own DOM node again.

   This is a REAL browser test — real Chromium, real page.type() keystrokes
   (not a single synthetic value+dispatchEvent), real DOM-node-identity
   checks (a JS-only marker property that a fresh innerHTML rebuild would
   always destroy), real focus/inputmode checks. No Firebase, no login —
   gudang-bulk-ui.js's render/handlers are pure over a synthetic `st`
   fixture, same fixture shape scripts/gudang-bulk-check.mjs already uses.

   Run: node scripts/gudang-bulk-input-performance-check.mjs (exit 0 = pass)
*/

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css' };

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); if (detail !== undefined) console.log('     • ' + String(detail).slice(0, 300)); }
};
async function checkAsync(name, run) {
  try { const r = await run(); check(name, r !== false, typeof r === 'string' ? r : ''); }
  catch (err) { fail++; console.log(`  ✗ ${name} — ${err.message}`); }
}

const HARNESS = `<!doctype html><html><head><meta charset="utf-8"></head>
<body>
  <div id="host"></div>
<script type="module">
  import { openBulkModal, renderBulkModal, bulkHandlers } from '/js/gudang/ui/gudang-bulk-ui.js';
  import { createSelectionState, selectAll } from '/js/gudang/selection/selection-engine.js';

  const FIXTURE_ITEMS = [
    { itemId: 'i1', name: 'Kertas A4', itemType: 'consumable', category: 'atk', defaultLocationId: 'loc1', active: true, aliases: [], metadata: {} },
    { itemId: 'i2', name: 'Stapler', itemType: 'consumable', category: 'atk', defaultLocationId: 'loc1', active: true, aliases: [], metadata: {} },
  ];
  const FIXTURE_DEPARTMENTS = [
    { departmentId: 'dep1', name: 'Bidang Umum' },
    { departmentId: 'dep2', name: 'Bidang Keuangan' },
    { departmentId: 'dep3', name: 'Bidang Sarpras' },
  ];
  function makeSt() {
    const selection = createSelectionState();
    selectAll(selection, ['i1', 'i2']);
    return { data: { items: FIXTURE_ITEMS, locations: [{ locationId: 'loc1', name: 'Gudang Utama' }], departments: FIXTURE_DEPARTMENTS }, selection };
  }

  const host = document.getElementById('host');
  const c = { actorId: 'tester' };
  let st = makeSt();
  function render() { host.innerHTML = renderBulkModal(st, c); }

  host.addEventListener('input', (e) => {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    bulkHandlers.onInput(st, t.dataset.act, t, render);
  });
  host.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    bulkHandlers.onClick(st, el.dataset.act, el, c, render, () => {}, () => {});
  });

  window.__reset = () => { st = makeSt(); openBulkModal(st, 'goodsOut'); render(); };
  window.__markNode = (sel) => { const el = document.querySelector(sel); if (el) el.__qaMarker = sel; };
  window.__nodeStillMarked = (sel) => document.querySelector(sel)?.__qaMarker === sel;
  window.__pickDept = (id) => document.querySelector('[data-act="gud-bulk-dept-pick"][data-id="' + id + '"]')?.click();
  window.__ready = true;
</script>
</body></html>`;

const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  if (u === '/' || u === '/harness') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(HARNESS); return; }
  const file = path.join(ROOT, u);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const errors = [];
const page = await browser.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
await page.setViewport({ width: 1024, height: 900 });
await page.goto(`http://localhost:${port}/harness`, { waitUntil: 'networkidle0', timeout: 45000 });
await page.waitForFunction(() => window.__ready === true, { timeout: 10000 });

/* ── A. Department search: scoped re-render, input node preserved ── */
console.log('\n[A — department search field: typing narrows results without rebuilding the input itself]');
await page.evaluate(() => window.__reset());
await page.evaluate(() => window.__markNode('[data-act="gud-bulk-dept-query"]'));
await page.click('[data-act="gud-bulk-dept-query"]');
await page.type('[data-act="gud-bulk-dept-query"]', 'keu');
const afterSearch = await page.evaluate(() => ({
  nodePreserved: window.__nodeStillMarked('[data-act="gud-bulk-dept-query"]'),
  focused: document.activeElement?.dataset?.act === 'gud-bulk-dept-query',
  results: [...document.querySelectorAll('[data-act="gud-bulk-dept-pick"]')].map((b) => b.textContent.trim()),
  value: document.querySelector('[data-act="gud-bulk-dept-query"]')?.value,
}));
check('the search input DOM node itself was never destroyed/recreated while typing', afterSearch.nodePreserved, afterSearch);
check('focus stayed on the search input throughout typing', afterSearch.focused, afterSearch);
check('results narrowed to the matching department only ("Bidang Keuangan")', afterSearch.results.length === 1 && afterSearch.results[0] === 'Bidang Keuangan', afterSearch);
check('the input\'s own value reflects every keystroke typed ("keu")', afterSearch.value === 'keu', afterSearch);

/* ── B. Qty field: numeric input, node preserved, Lanjut button stays live ── */
console.log('\n[B — qty field: typing does not rebuild the input, but "Lanjut" validity still updates live]');
await page.evaluate(() => { window.__reset(); window.__pickDept('dep1'); });
const beforeType = await page.evaluate(() => document.querySelector('[data-act="gud-bulk-next"]')?.disabled);
check('Lanjut starts disabled (no quantities entered yet)', beforeType === true, beforeType);

await page.evaluate(() => window.__markNode('[data-act="gud-bulk-qty"][data-id="i1"]'));
await page.click('[data-act="gud-bulk-qty"][data-id="i1"]');
await page.type('[data-act="gud-bulk-qty"][data-id="i1"]', '5');
const afterI1 = await page.evaluate(() => ({
  nodePreserved: window.__nodeStillMarked('[data-act="gud-bulk-qty"][data-id="i1"]'),
  inputmodeIntact: document.querySelector('[data-act="gud-bulk-qty"][data-id="i1"]')?.getAttribute('inputmode') === 'numeric',
  focused: document.activeElement?.dataset?.id === 'i1',
  nextDisabled: document.querySelector('[data-act="gud-bulk-next"]')?.disabled,
  value: document.querySelector('[data-act="gud-bulk-qty"][data-id="i1"]')?.value,
}));
check('the i1 qty input DOM node itself was never destroyed/recreated while typing', afterI1.nodePreserved, afterI1);
check('inputmode="numeric" is still present on the SAME node (never lost to a rebuild)', afterI1.inputmodeIntact, afterI1);
check('focus stayed on the qty input throughout typing (this is what keeps a numeric keyboard from resetting)', afterI1.focused, afterI1);
check('"Lanjut" is STILL disabled — i2 has no quantity yet (live validity, not stale)', afterI1.nextDisabled === true, afterI1);
check('the typed value "5" landed correctly', afterI1.value === '5', afterI1);

await page.click('[data-act="gud-bulk-qty"][data-id="i2"]');
await page.type('[data-act="gud-bulk-qty"][data-id="i2"]', '3');
const afterI2 = await page.evaluate(() => ({
  i1StillMarked: window.__nodeStillMarked('[data-act="gud-bulk-qty"][data-id="i1"]'),
  nextDisabled: document.querySelector('[data-act="gud-bulk-next"]')?.disabled,
}));
check('i1\'s DOM node is STILL preserved after typing into a DIFFERENT field (i2) — no wider rebuild triggered either', afterI2.i1StillMarked, afterI2);
check('"Lanjut" becomes ENABLED once every item has a valid quantity — the disabled state DOES stay live without a full render()', afterI2.nextDisabled === false, afterI2);

/* ── C. Multi-digit numeric entry keeps working end to end (no keyboard-mode-reset proxy: node identity across each digit) ── */
console.log('\n[C — multi-digit entry (1, 12, 123, 1234, 12345) never rebuilds the input mid-sequence]');
await page.evaluate(() => { window.__reset(); window.__pickDept('dep1'); window.__markNode('[data-act="gud-bulk-qty"][data-id="i1"]'); });
await page.click('[data-act="gud-bulk-qty"][data-id="i1"]');
for (const digit of ['1', '2', '3', '4', '5']) {
  await page.type('[data-act="gud-bulk-qty"][data-id="i1"]', digit);
}
const afterMultiDigit = await page.evaluate(() => ({
  nodePreserved: window.__nodeStillMarked('[data-act="gud-bulk-qty"][data-id="i1"]'),
  value: document.querySelector('[data-act="gud-bulk-qty"][data-id="i1"]')?.value,
}));
check('the input node survived all 5 keystrokes without ever being rebuilt', afterMultiDigit.nodePreserved, afterMultiDigit);
check('final value is the full "12345", not truncated/reordered by any intervening rebuild', afterMultiDigit.value === '12345', afterMultiDigit);

console.log('\n[Z — console cleanliness]');
check('zero console/page errors across the whole run', errors.length === 0, errors.join(' | '));

await browser.close();
server.close();
console.log(`\ngudang-bulk-input-performance-check: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
