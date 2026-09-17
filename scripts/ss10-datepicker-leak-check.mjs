/* ss10-datepicker-leak-check.mjs — SS10 render/lifecycle hardening.

   js/pbsi-datepicker.js#initPbsiDatepicker's re-init guard is a WeakMap
   keyed by the input element's own identity — real protection ONLY for a
   caller that reuses the same input node. Two call sites don't:
   js/engineering/ui/engineering-center.js#mountCreateWidgets (the "Buat
   Penugasan" modal's deadline/workDate field) and
   js/overtime/overtime-center.js#mountRekapDatepicker (the "Entri Harian"
   date field) both sit behind a render() that does a full
   host.innerHTML/root.innerHTML rebuild on EVERY call — a search
   keystroke, a checkbox toggle, any unrelated realtime update while the
   screen is open. Every such render silently created a brand-new
   Flatpickr instance (appendTo: document.body) while the previous one's
   own document.body-appended calendar node and internal global
   click/keydown listeners were never torn down — an unbounded leak for
   as long as the screen/modal stayed open.

   The fix (both call sites, same shape): track the input element the
   picker was last wired to; call the new destroyPbsiDatepicker(inputEl)
   at the top of render(), before its subtree is discarded.

   This test drives the REAL js/pbsi-datepicker.js against the REAL
   vendored Flatpickr (vendor/flatpickr.min.js) in an isolated page (no
   app boot, no login — the leak is a property of the datepicker module
   itself, identical regardless of which module's render() calls it):

     [1] negative control — simulating the OLD call pattern (init on a
         fresh input every "render", no destroy) really does accumulate
         orphaned .flatpickr-calendar nodes in document.body.
     [2] the FIX — calling destroyPbsiDatepicker(prevInput) before each
         re-init leaves exactly one live calendar node after N renders.
     [3] static — both real call sites actually import and call
         destroyPbsiDatepicker before discarding their tracked input.

   Run: node scripts/ss10-datepicker-leak-check.mjs   (exit 0 = pass) */

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

const HARNESS_HTML = `<!doctype html><html><head>
<link rel="stylesheet" href="/vendor/flatpickr.min.css" />
</head><body>
<div id="host"></div>
<script src="/vendor/flatpickr.min.js"></script>
</body></html>`;

console.log('[SS10] pbsi-datepicker.js — Flatpickr instance leak on repeated full-rebuild render()\n');

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/harness') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(HARNESS_HTML); return; }
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  const content = fs.readFileSync(file);
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Content-Length': content.length });
  res.end(content);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });

/* ── [1] negative control: the OLD pattern really does leak ── */
{
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(`http://localhost:${port}/harness`, { waitUntil: 'load' });
  await page.waitForFunction('typeof flatpickr === "function"', { timeout: 10000 });

  const result = await page.evaluate(async () => {
    const { initPbsiDatepicker } = await import('/js/pbsi-datepicker.js');
    const host = document.getElementById('host');
    // Simulate 5 "renders" the OLD way — no destroy, a brand-new input
    // node each time (exactly what host.innerHTML = ... produces).
    for (let i = 0; i < 5; i++) {
      host.innerHTML = '<input type="date" id="d">';
      initPbsiDatepicker(document.getElementById('d'), {});
    }
    return { calendarNodes: document.querySelectorAll('.flatpickr-calendar').length };
  });
  check('OLD pattern (init on a fresh input each render, no destroy) accumulates one orphaned .flatpickr-calendar per render — confirms this is a real leak, not a strawman',
    result.calendarNodes === 5, result);
  check('zero page errors', errors.length === 0, errors);
  await page.close();
}

/* ── [2] the fix: destroy before re-init leaves exactly one live node ── */
{
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(`http://localhost:${port}/harness`, { waitUntil: 'load' });
  await page.waitForFunction('typeof flatpickr === "function"', { timeout: 10000 });

  const result = await page.evaluate(async () => {
    const { initPbsiDatepicker, destroyPbsiDatepicker } = await import('/js/pbsi-datepicker.js');
    const host = document.getElementById('host');
    let prev = null;
    for (let i = 0; i < 5; i++) {
      if (prev) destroyPbsiDatepicker(prev);
      host.innerHTML = '<input type="date" id="d">';
      const input = document.getElementById('d');
      initPbsiDatepicker(input, {});
      prev = input;
    }
    return { calendarNodes: document.querySelectorAll('.flatpickr-calendar').length };
  });
  check('destroyPbsiDatepicker(prevInput) before each re-init leaves exactly ONE live .flatpickr-calendar after 5 renders (no accumulation)',
    result.calendarNodes === 1, result);
  check('zero page errors', errors.length === 0, errors);
  await page.close();
}

await browser.close();
server.close();

/* ── [3] static: both real call sites actually wire the fix ── */
console.log('\n[3 — static: both real call sites import and call destroyPbsiDatepicker]');
const eng = fs.readFileSync(path.join(ROOT, 'js/engineering/ui/engineering-center.js'), 'utf-8');
const ot = fs.readFileSync(path.join(ROOT, 'js/overtime/overtime-center.js'), 'utf-8');

check('engineering-center.js imports destroyPbsiDatepicker',
  /import\s*\{[^}]*destroyPbsiDatepicker[^}]*\}\s*from\s*'\.\.\/\.\.\/pbsi-datepicker\.js'/.test(eng));
{
  const renderStart = eng.indexOf('function render() {');
  const renderEnd = eng.indexOf('\n}\n', renderStart);
  const renderBody = eng.slice(renderStart, renderEnd);
  const destroyIdx = renderBody.indexOf('destroyPbsiDatepicker(_createDatepickerInputEl)');
  const firstInnerHtmlIdx = renderBody.indexOf('host.innerHTML');
  check('engineering-center.js render() destroys the tracked input before EITHER host.innerHTML assignment replaces it',
    renderStart !== -1 && destroyIdx !== -1 && firstInnerHtmlIdx !== -1 && destroyIdx < firstInnerHtmlIdx,
    { renderStart, destroyIdx, firstInnerHtmlIdx });
}
check('engineering-center.js mountCreateWidgets() tracks the new input',
  /_createDatepickerInputEl = input;[\s\S]{0,80}initPbsiDatepicker\(input/.test(eng));

check('overtime-center.js imports destroyPbsiDatepicker',
  /import\s*\{[^}]*destroyPbsiDatepicker[^}]*\}\s*from\s*'\.\.\/pbsi-datepicker\.js'/.test(ot));
check('overtime-center.js render() destroys the tracked input before root.innerHTML replaces it',
  /destroyPbsiDatepicker\(_rekapDatepickerInputEl\)[\s\S]{0,150}root\.innerHTML/.test(ot));
check('overtime-center.js mountRekapDatepicker() tracks the new input',
  /_rekapDatepickerInputEl = input;[\s\S]{0,80}initPbsiDatepicker\(input/.test(ot));

console.log(`\nss10-datepicker-leak-check: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
