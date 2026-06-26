/* request-mode-polish-dom-check.mjs — DOM integration test for the premium
   Request Mode selector (v1.17.4 — Part B). Run: node scripts/request-mode-polish-dom-check.mjs

   Part A — loads the REAL index.html and asserts the new request-mode UI exists
   (two option cards, hidden source-of-truth inputs, confirmation sheet, context
   hint) with zero fatal boot errors.
   Part B — drives the REAL controller in a browser: card → confirmation sheet →
   confirm flips the hidden checkbox + selects the card; both modes active shows
   the context hint; Cancel / ESC / outside-click dismiss without enabling; the
   Ambulance card hides for a non-medical requester. Captures light/dark/mobile
   screenshots. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(ROOT, 'scratch');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('not found'); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const errors = [];
const page = await browser.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
await page.goto(`http://localhost:${port}/index.html`, { waitUntil: 'networkidle2', timeout: 45000 });
await sleep(3500);

/* ── Part A: markup exists ────────────────────────────────────────────── */
console.log('\n[A: request-mode UI present]');
const dom = await page.evaluate(() => {
  const has = (id) => !!document.getElementById(id);
  return {
    cardNoDriver: has('reqModeCardNoDriver'),
    cardAmbulance: has('reqModeCardAmbulance'),
    inputAmb: has('requestUseAmbulance'),
    inputNoDrv: has('requestNoDriver'),
    sheet: has('requestModeSheet'),
    hint: has('requestModeHint'),
    legacyGone: !document.getElementById('requestMedicalRow') && !document.getElementById('requestNoDriverRow'),
    noDriverIsButton: (document.getElementById('reqModeCardNoDriver') || {}).tagName === 'BUTTON',
  };
});
check('Tanpa Driver card present (#reqModeCardNoDriver)', dom.cardNoDriver);
check('Ambulance card present (#reqModeCardAmbulance)', dom.cardAmbulance);
check('hidden source-of-truth inputs present', dom.inputAmb && dom.inputNoDrv);
check('confirmation sheet present (#requestModeSheet)', dom.sheet);
check('context hint present (#requestModeHint)', dom.hint);
check('legacy checkbox rows removed', dom.legacyGone);
check('cards are real buttons (keyboard-activatable)', dom.noDriverIsButton);

const fatal = errors.filter((e) => /SyntaxError|ReferenceError|TypeError|is not a function|Failed to (load|fetch) module|Cannot use import|Unexpected token|does not provide an export/i.test(e));
check('no fatal boot errors', fatal.length === 0);
if (fatal.length) fatal.forEach((e) => console.log('     ✗', e.slice(0, 200)));

/* ── Part B: drive the real controller ────────────────────────────────── */
console.log('\n[B: card → sheet → confirm flow]');
// Initialize (idempotent), show both cards, open the modal for interaction.
await page.evaluate(async () => {
  const m = await import('/js/components/request-mode-selector.js');
  m.initRequestModeSelector();
  m.setRequestModeVisibility(true);            // medical → ambulance card visible
  m.resetRequestMode();
  const modal = document.getElementById('modalRequestForm');
  if (modal) modal.style.display = 'flex';
});
await sleep(120);

const ambVisible = await page.evaluate(() => !document.getElementById('reqModeCardAmbulance').hidden);
check('Ambulance card visible for medical requester', ambVisible === true);

// Click "Tanpa Driver" → the confirmation sheet appears with the right copy.
await page.click('#reqModeCardNoDriver');
await sleep(120);
const sheet1 = await page.evaluate(() => {
  const ov = document.getElementById('requestModeSheet');
  return {
    open: !ov.hidden && ov.classList.contains('is-open'),
    title: document.getElementById('reqSheetTitle').textContent,
    confirm: document.getElementById('reqSheetConfirm').textContent,
    checkedYet: document.getElementById('requestNoDriver').checked,
  };
});
check('clicking a card opens the confirmation sheet', sheet1.open === true);
check('sheet shows the correct title ("Tanpa Driver")', sheet1.title === 'Tanpa Driver');
check('sheet confirm button reads "Aktifkan"', sheet1.confirm === 'Aktifkan');
check('mode NOT enabled until confirmed', sheet1.checkedYet === false);

// Confirm → checkbox flips on, card becomes selected, sheet closes.
await page.click('#reqSheetConfirm');
await sleep(320);
const afterConfirm = await page.evaluate(() => ({
  checked: document.getElementById('requestNoDriver').checked,
  selected: document.getElementById('reqModeCardNoDriver').classList.contains('is-selected'),
  aria: document.getElementById('reqModeCardNoDriver').getAttribute('aria-checked'),
  sheetHidden: document.getElementById('requestModeSheet').hidden,
}));
check('confirm enables the mode (checkbox checked)', afterConfirm.checked === true);
check('confirm selects the card (is-selected + aria-checked)', afterConfirm.selected && afterConfirm.aria === 'true');
check('sheet hidden after confirm', afterConfirm.sheetHidden === true);

// Enable Ambulance too → BOTH active → context hint appears (Feature 10).
await page.click('#reqModeCardAmbulance');
await sleep(120);
await page.click('#reqSheetConfirm');
await sleep(320);
const bothOn = await page.evaluate(() => ({
  ambChecked: document.getElementById('requestUseAmbulance').checked,
  hintShown: !document.getElementById('requestModeHint').hidden,
  hintText: document.getElementById('requestModeHintText').textContent,
}));
check('both modes can be active together', bothOn.ambChecked === true);
check('context hint shown when BOTH active', bothOn.hintShown === true);
check('context hint text correct', bothOn.hintText === 'Ambulance akan digunakan tanpa penugasan driver.');

console.log('\n[B: dismissal paths]');
// Turn no-driver OFF (no sheet on disable), then re-open + ESC dismiss.
await page.click('#reqModeCardNoDriver');   // currently selected → toggles OFF
await sleep(120);
const offAgain = await page.evaluate(() => document.getElementById('requestNoDriver').checked);
check('clicking a selected card turns it OFF without a sheet', offAgain === false);

await page.click('#reqModeCardNoDriver');   // OFF → opens sheet
await sleep(120);
await page.keyboard.press('Escape');
await sleep(320);
const afterEsc = await page.evaluate(() => ({
  sheetHidden: document.getElementById('requestModeSheet').hidden,
  checked: document.getElementById('requestNoDriver').checked,
  modalStillOpen: getComputedStyle(document.getElementById('modalRequestForm')).display !== 'none',
}));
check('ESC dismisses the sheet', afterEsc.sheetHidden === true);
check('ESC does NOT enable the mode', afterEsc.checked === false);
check('ESC does NOT close the underlying request modal', afterEsc.modalStillOpen === true);

// Cancel button path.
await page.click('#reqModeCardNoDriver');
await sleep(120);
await page.click('#reqSheetCancel');
await sleep(320);
const afterCancel = await page.evaluate(() => ({
  sheetHidden: document.getElementById('requestModeSheet').hidden,
  checked: document.getElementById('requestNoDriver').checked,
}));
check('Cancel dismisses the sheet without enabling', afterCancel.sheetHidden === true && afterCancel.checked === false);

// Non-medical requester → ambulance card hidden + forced off.
const nonMedical = await page.evaluate(async () => {
  const m = await import('/js/components/request-mode-selector.js');
  m.setRequestModeVisibility(false);
  return {
    hidden: document.getElementById('reqModeCardAmbulance').hidden,
    ambForcedOff: document.getElementById('requestUseAmbulance').checked === false,
  };
});
check('Ambulance card hidden for non-medical requester', nonMedical.hidden === true);
check('hiding ambulance forces it OFF', nonMedical.ambForcedOff === true);

check('no console errors during interaction', errors.filter((e) => /console\.error|pageerror/.test(e) && /TypeError|ReferenceError|is not a function/.test(e)).length === 0);

/* ── Screenshots ──────────────────────────────────────────────────────── */
console.log('\n[screenshots]');
async function shot(name) {
  await page.screenshot({ path: path.join(SHOTS, name), fullPage: false });
  console.log(`  📸 scratch/${name}`);
}
// Reset to a clean medical view with one mode selected for the shot.
await page.evaluate(async () => {
  const m = await import('/js/components/request-mode-selector.js');
  m.setRequestModeVisibility(true);
  m.resetRequestMode();
  document.getElementById('requestNoDriver').checked = true;
  m.syncRequestModeFromInputs();
  document.getElementById('modalRequestForm').style.display = 'flex';
});
await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
await sleep(150);
await shot('request-mode-polish-desktop-light.png');

await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
await sleep(150);
await shot('request-mode-polish-desktop-dark.png');

await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
await page.setViewport({ width: 390, height: 800, deviceScaleFactor: 2 });
await sleep(150);
await shot('request-mode-polish-mobile-light.png');

await browser.close();
server.close();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
