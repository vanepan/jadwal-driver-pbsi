// Design System Program Phase 3 — Petty Cash Expense verification.
//
// Drives the REAL js/petty-cash/petty-cash-center.js and js/petty-cash/
// petty-cash-service.js (real ref-number generation, real bidang
// resolution, real validation, real submitAdd()/save-feedback wiring) —
// only js/petty-cash/petty-cash-store.js (the lowest-level module, the one
// that actually touches Firebase) is replaced via Puppeteer request
// interception with an in-memory stub for this test session. This is a
// test-infrastructure technique (network/module-resolution interception in
// the TEST browser), not a change to any production file. The stub re-uses
// the REAL petty-cash-config.js for DEFAULT_SETTINGS/CYCLE_STATUS/todayISO,
// so only genuine Firebase I/O is faked, nothing else.

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const OUT_DIR = path.join(__dirname, 'save-feedback-verify');
fs.mkdirSync(OUT_DIR, { recursive: true });

const STORE_STUB = `
import { DEFAULT_SETTINGS, CYCLE_STATUS, todayISO } from '/js/petty-cash/petty-cash-config.js';

const cache = {
  expenses: {}, nors: {}, cycles: {}, audit: {},
  settings: { ...DEFAULT_SETTINGS },
};
let seq = 0;
export function genId(prefix) { return \`\${prefix}_\${Date.now()}_\${++seq}\`; }
export async function initPettyCashStore() {
  const cycleId = 'cyc_test_1';
  cache.cycles[cycleId] = { id: cycleId, startDate: todayISO(), openingBalance: DEFAULT_SETTINGS.openingBalance, realizedAmount: 0, closingBalance: DEFAULT_SETTINGS.openingBalance, status: CYCLE_STATUS.ACTIVE, createdAt: Date.now() };
  window.__pcCache = cache;
}
export function registerChangeListener() {}
export function isReady() { return true; }
function mapToArray(map) { return Object.values(map); }
export function getExpenses() { return mapToArray(cache.expenses); }
export function getNors() { return mapToArray(cache.nors); }
export function getCycles() { return mapToArray(cache.cycles); }
export function getAudit() { return mapToArray(cache.audit); }
export function getSettings() { return { ...DEFAULT_SETTINGS, ...(cache.settings || {}) }; }
export function getExpenseById(id) { return cache.expenses[id] ? { ...cache.expenses[id] } : null; }
export function getNorById(id) { return cache.nors[id] ? { ...cache.nors[id] } : null; }
export function getNorByNumber(num) { return getNors().find(n => n.norNumber === num) || null; }
export function getActiveCycle() { return getCycles().find(c => c.status === CYCLE_STATUS.ACTIVE) || null; }
export async function putExpense(expense) {
  const mode = window.__pcMockMode || 'success';
  if (mode === 'error') throw new Error('Firebase gagal menyimpan pengeluaran.');
  if (mode === 'reject') throw new Error('Network failure (simulated)');
  await new Promise((r) => setTimeout(r, 250)); // real-write-shaped delay
  window.__pcWriteCount = (window.__pcWriteCount || 0) + 1;
  cache.expenses[expense.id] = expense;
  return expense;
}
export async function deleteExpense(id) { delete cache.expenses[id]; }
export async function putNor(nor) { cache.nors[nor.id] = nor; }
export async function putCycle(cycle) { cache.cycles[cycle.id] = cycle; }
export async function putAudit(entry) { cache.audit[entry.id || Math.random()] = entry; }
export async function saveSettings(settings) { cache.settings = { ...DEFAULT_SETTINGS, ...settings }; }
export async function applyUpdates() {}
export const PETTY_CASH_PATHS = {};
`;

async function withStoreStub(page) {
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (req.url().endsWith('/js/petty-cash/petty-cash-store.js')) {
      req.respond({ contentType: 'application/javascript; charset=utf-8', body: STORE_STUB });
    } else {
      req.continue();
    }
  });
}

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  page.on('console', (msg) => { if (msg.type() === 'error') pageErrors.push(msg.text()); });
  page.on('dialog', (d) => { pageErrors.push(`UNEXPECTED window.${d.type()}: ${d.message()}`); d.accept(); });

  await withStoreStub(page);
  await page.setViewport({ width: 1400, height: 1100 });
  await page.goto('http://localhost:8000/scratch/petty-cash-harness.html', { waitUntil: 'load' });
  await page.waitForFunction('window.__pcHarnessReady === true');

  const fail = [];

  // ── Open "Tambah Pengeluaran", fill the required fields ──
  await page.evaluate(() => window.__pc.openPettyCashAddExpense());
  await new Promise((r) => setTimeout(r, 150));
  await page.type('input[name="description"]', 'Pembelian test');
  await page.evaluate(() => {
    // amount field: readonly/auto-computed in reimburse mode, but the default
    // form (Unit != Driver) uses a plain typed amount input named "amount".
    const el = document.querySelector('input[name="amount"]');
    if (el) { el.value = '150000'; el.dispatchEvent(new Event('input', { bubbles: true })); }
  });
  await page.screenshot({ path: path.join(OUT_DIR, 'pettycash-form.png') });

  // ── 1) IDLE -> SAVING -> SUCCESS (real ref-number generation, real bidang resolution) ──
  await page.evaluate(() => { window.__pcMockMode = 'success'; window.__pcWriteCount = 0; });
  const clickPromise = page.click('[data-act="submitAdd"]');
  await new Promise((r) => setTimeout(r, 150));
  const savingState = await page.evaluate(() => {
    const btn = document.querySelector('[data-act="submitAdd"]');
    return {
      state: btn?.dataset.sfState,
      ariaBusy: btn?.getAttribute('aria-busy'),
      disabled: btn?.disabled,
      hasSpinner: !!btn?.querySelector('.sf-icon--spin'),
    };
  });
  await clickPromise;
  await new Promise((r) => setTimeout(r, 1000));
  const afterSuccess = await page.evaluate(() => ({
    modalClosed: !document.querySelector('[data-act="submitAdd"]'),
    writeCount: window.__pcWriteCount,
    expenseCount: Object.keys(window.__pcCache.expenses).length,
    savedExpense: Object.values(window.__pcCache.expenses)[0],
  }));

  if (savingState.state !== 'saving') fail.push(`1: expected saving state, got ${savingState.state}`);
  if (savingState.ariaBusy !== 'true') fail.push('1: aria-busy not set during saving');
  if (!savingState.hasSpinner) fail.push('1: no spinner shown during saving');
  if (!afterSuccess.modalClosed) fail.push('1: add-expense modal did not close after success');
  if (afterSuccess.writeCount !== 1) fail.push(`1: expected exactly 1 real store write, got ${afterSuccess.writeCount}`);
  if (afterSuccess.expenseCount !== 1) fail.push(`1: expected 1 persisted expense, got ${afterSuccess.expenseCount}`);
  if (!afterSuccess.savedExpense || afterSuccess.savedExpense.amount !== 150000) fail.push(`1: saved expense amount wrong: ${JSON.stringify(afterSuccess.savedExpense)}`);
  if (!afterSuccess.savedExpense || !/^PC\//.test(afterSuccess.savedExpense.refNumber || '')) fail.push(`1: real ref-number generation did not run, got refNumber=${afterSuccess.savedExpense?.refNumber}`);

  // ── 2) THE confirmed bug this phase fixes: rapid double-click must produce exactly ONE write ──
  await page.evaluate(() => window.__pc.openPettyCashAddExpense());
  await new Promise((r) => setTimeout(r, 150));
  await page.type('input[name="description"]', 'Dup click test');
  await page.evaluate(() => {
    const el = document.querySelector('input[name="amount"]');
    if (el) { el.value = '75000'; el.dispatchEvent(new Event('input', { bubbles: true })); }
  });
  await page.evaluate(() => { window.__pcWriteCount = 0; });
  await page.evaluate(() => {
    const btn = document.querySelector('[data-act="submitAdd"]');
    btn.click(); btn.click(); btn.click();
  });
  await new Promise((r) => setTimeout(r, 900));
  const dupState = await page.evaluate(() => ({
    writeCount: window.__pcWriteCount,
    expenseCount: Object.keys(window.__pcCache.expenses).length,
  }));
  if (dupState.writeCount !== 1) fail.push(`2: expected exactly 1 write from a rapid triple-click, got ${dupState.writeCount} (this is the exact duplicate-record bug this phase fixes)`);
  if (dupState.expenseCount !== 2) fail.push(`2: expected 2 total persisted expenses (1 from step 1 + 1 from this step), got ${dupState.expenseCount} — a duplicate would show 3`);

  // ── 3) SAVING -> ERROR (real Firebase-shaped rejection) — inline #pcAddErr, retry, data preserved ──
  await page.evaluate(() => window.__pc.openPettyCashAddExpense());
  await new Promise((r) => setTimeout(r, 150));
  await page.type('input[name="description"]', 'Error path test');
  await page.evaluate(() => {
    const el = document.querySelector('input[name="amount"]');
    if (el) { el.value = '50000'; el.dispatchEvent(new Event('input', { bubbles: true })); }
  });
  await page.evaluate(() => { window.__pcMockMode = 'error'; });
  await page.click('[data-act="submitAdd"]');
  await new Promise((r) => setTimeout(r, 500));
  const errorState = await page.evaluate(() => {
    const btn = document.querySelector('[data-act="submitAdd"]');
    const err = document.getElementById('pcAddErr');
    return {
      modalStillOpen: !!btn,
      btnEnabled: btn ? !btn.disabled : false,
      errorPresent: !!err,
      errorText: err?.textContent,
      errorHasAlertRole: err?.getAttribute('role') === 'alert',
      descriptionPreserved: document.querySelector('input[name="description"]')?.value,
    };
  });
  await page.screenshot({ path: path.join(OUT_DIR, 'pettycash-error.png') });

  if (!errorState.modalStillOpen) fail.push('3: modal should stay open after a failed save');
  if (!errorState.btnEnabled) fail.push('3: Save button should be re-enabled immediately for retry');
  if (!errorState.errorPresent) fail.push('3: #pcAddErr inline error region did not render');
  if (!errorState.errorHasAlertRole) fail.push('3: #pcAddErr missing role="alert"');
  if (!/Firebase gagal/.test(errorState.errorText || '')) fail.push(`3: error text not meaningful: "${errorState.errorText}"`);
  if (errorState.descriptionPreserved !== 'Error path test') fail.push('3: entered data was not preserved after error');

  // ── 4) Retry succeeds ──
  await page.evaluate(() => { window.__pcMockMode = 'success'; });
  await page.click('[data-act="submitAdd"]');
  await new Promise((r) => setTimeout(r, 1000));
  const retryOk = await page.evaluate(() => !document.querySelector('[data-act="submitAdd"]'));
  if (!retryOk) fail.push('4: retry after error did not succeed');

  await browser.close();

  console.log(JSON.stringify({ savingState, afterSuccess, dupState, errorState, retryOk }, null, 2));
  console.log('\n--- PAGE ERRORS ---');
  console.log(pageErrors.length ? pageErrors : 'none');
  if (pageErrors.length) fail.push(`page errors / unexpected dialogs: ${pageErrors.join(' | ')}`);

  if (fail.length) {
    console.error('\nFAILURES:\n' + fail.map((f) => ' - ' + f).join('\n'));
    process.exitCode = 1;
  } else {
    console.log('\nPetty Cash Expense save-feedback migration verified.');
  }
})();
