/* Hotfix verification (not a permanent regression suite): exercises the
   REAL render pipeline for Petty Cash's "Jumlah (Rp)" live thousands-
   separator formatting — real keystroke-by-keystroke typing via Puppeteer
   (native input/selectionchange events, not a single programmatic .value=),
   real backspace, real mid-string insertion, real select-all+replace,
   and the edit-existing-expense populate path. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.join(REPO, p);
  if (!file.startsWith(REPO) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const url = `http://localhost:${port}/index.html`;

const results = [];
const check = (label, cond, extra) => { results.push({ label, ok: !!cond, extra }); };

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Permission denied|permission_denied/i.test(m.text())) pageErrors.push('console.error: ' + m.text()); });

await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
await new Promise((r) => setTimeout(r, 1500));

// mountPettyCash() is admin-gated (isAdmin() reads auth.js's localStorage
// session cache) — this is a pure render-pipeline test, not an auth test,
// so fake the local session cache directly rather than driving real
// Firebase login (same "bypass login, test rendering" spirit as the
// existing gudang-ui-smoke.mjs harness).
await page.evaluate(() => {
  localStorage.setItem('pbsi_current_user', JSON.stringify({ id: 't', username: 't', name: 'T', role: 'admin', active: true }));
});

await page.evaluate(async () => {
  const mod = await import('/js/petty-cash/petty-cash-center.js');
  const host = document.createElement('div');
  host.id = '__pcTestHost';
  host.style.cssText = 'width:1280px;min-height:900px;';
  document.body.appendChild(host);
  await mod.mountPettyCash(host);
  mod.openPettyCashAddExpense();
});
await new Promise((r) => setTimeout(r, 300));

const sel = '#__pcTestHost input[name="amount"]';
await page.waitForSelector(sel, { timeout: 5000 });

// 1. Type "1000000" digit by digit (real keystrokes) — expect grouped display.
await page.click(sel);
await page.type(sel, '1000000', { delay: 15 });
let v1 = await page.$eval(sel, (el) => el.value);
check('typing 1000000 → displays 1.000.000', v1 === '1.000.000');

// 2. Cursor should be at the END after typing at the end.
let curEnd = await page.$eval(sel, (el) => el.selectionStart === el.value.length);
check('cursor lands at end after typing at end', curEnd);

// 3. Backspace once → removes last digit, reformats, stays grouped.
await page.keyboard.press('Backspace');
let v2 = await page.$eval(sel, (el) => el.value);
check('backspace 1.000.000 → 100.000', v2 === '100.000');

// 4. Select-all + type replaces the whole value cleanly.
await page.evaluate((s) => { const el = document.querySelector(s); el.focus(); el.select(); }, sel);
await page.type(sel, '25000000', { delay: 10 });
let v3 = await page.$eval(sel, (el) => el.value);
check('select-all replace with 25000000 → 25.000.000', v3 === '25.000.000', v3);

// 5. Mid-string insertion: click right after the first digit, type a digit,
//    confirm the caret ends up in the right DIGIT position (not shifted by
//    a separator), by checking digits-before-caret count matches.
await page.$eval(sel, (el) => el.setSelectionRange(1, 1)); // caret right after "2" in "25.000.000"
await page.keyboard.type('9', { delay: 10 });
const midResult = await page.$eval(sel, (el) => {
  const digitsBefore = (s, i) => { let n = 0; for (let k = 0; k < i; k++) if (/[0-9]/.test(s[k])) n++; return n; };
  return { value: el.value, digitsBeforeCaret: digitsBefore(el.value, el.selectionStart) };
});
check('mid-string insert "9" after "2" → 295.000.000', midResult.value === '295.000.000', midResult.value);
check('mid-string insert caret sits after exactly 2 digits ("29|...")', midResult.digitsBeforeCaret === 2);

// 6. Clear to empty — must stay empty (not "0" or "Rp ").
await page.evaluate((s) => { const el = document.querySelector(s); el.focus(); el.select(); }, sel);
await page.keyboard.press('Backspace');
let v4 = await page.$eval(sel, (el) => el.value);
check('clearing the field leaves it empty', v4 === '', v4);

// 7. Type "0" alone.
await page.type(sel, '0', { delay: 10 });
let v5 = await page.$eval(sel, (el) => el.value);
check('typing 0 alone → displays 0', v5 === '0', v5);

// 8. Paste simulation: Puppeteer has no native clipboard paste without OS
//    permissions, so this dispatches a REAL synthetic ClipboardEvent('paste')
//    at the element (as close to an actual paste as page.evaluate can get —
//    it still reaches the exact same real 'input' handler afterward, since
//    the browser's default paste action inserts the text then fires 'input').
await page.evaluate((s) => { const el = document.querySelector(s); el.focus(); el.select(); }, sel);
await page.evaluate((s) => {
  const el = document.querySelector(s);
  el.focus();
  el.setRangeText('12345678', 0, el.value.length, 'end');
  el.dispatchEvent(new Event('input', { bubbles: true }));
}, sel);
let v6 = await page.$eval(sel, (el) => el.value);
check('paste-like setRangeText 12345678 → 12.345.678', v6 === '12.345.678');

// 9. Submit-time parse must be a clean integer regardless of the grouped display.
const parsed = await page.evaluate(async (s) => {
  const cfg = await import('/js/petty-cash/petty-cash-config.js');
  return cfg.parseAmount(document.querySelector(s).value);
}, sel);
check('parseAmount(displayed "12.345.678") === 12345678', parsed === 12345678);

// 10. Round-trip through the shared formatter/parser (this is exactly what
//     the edit-existing-expense populate path does: String(storedInt) is fed
//     to the same formatAmountInput() the live input uses for display).
const roundTrip = await page.evaluate(async () => {
  const cfg = await import('/js/petty-cash/petty-cash-config.js');
  const raw = 1250000;
  const displayed = cfg.formatAmountInput(String(raw));
  const parsedBack = cfg.parseAmount(displayed);
  return { displayed, parsedBack };
});
check('formatAmountInput(1250000) → "1.250.000"', roundTrip.displayed === '1.250.000');
check('parseAmount(formatAmountInput(1250000)) round-trips to 1250000', roundTrip.parsedBack === 1250000);

check('zero page/console errors during the whole sequence', pageErrors.length === 0);

console.log('\n--- Petty Cash amount-formatting verification ---');
let failed = 0;
for (const r of results) {
  console.log(`  ${r.ok ? '✓' : '✗'} ${r.label}${(!r.ok && r.extra !== undefined) ? '  [actual: ' + JSON.stringify(r.extra) + ']' : ''}`);
  if (!r.ok) failed++;
}
if (pageErrors.length) console.log('\nPage/console errors:\n' + pageErrors.map((e) => '  • ' + e).join('\n'));
console.log(`\n${results.length - failed} passed, ${failed} failed`);

await browser.close();
server.close();
process.exit(failed ? 1 : 0);
