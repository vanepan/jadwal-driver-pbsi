const puppeteer = require('puppeteer');
const path = require('path');
const OUT_DIR = path.join(__dirname, 'save-feedback-verify');

const SYN_ASSIGNMENT = {
  id: 'sf-vis-1', driver: 'Dedi', phone: '0812', vehicle: 'Avanza A',
  date: new Date().toISOString().slice(0, 10), startTime: '08:00', endTime: '10:00',
  destination: 'Kemenpora', purpose: 'Antar Delegasi', pic: 'Grace', pax: 2, notes: '',
  fullDay: false, createdAt: new Date().toISOString(), createdBy: 'Admin Test', updatedAt: new Date().toISOString(),
  requestId: null, status: 'assigned', approvedAt: null, approvedBy: null,
  assignedAt: new Date().toISOString(), assignedBy: 'Admin Test',
  startedAt: null, startedBy: null, completedAt: null, completedBy: null,
  startOdometer: null, endOdometer: null, distanceTravelled: null,
};

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });

  // ── Desktop, light: SAVING state (spinner) ──
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900 });
    await page.goto('http://localhost:8000/scratch/assignment-form-harness.html', { waitUntil: 'load' });
    await page.waitForFunction('window.__assignHarnessReady === true');
    await page.evaluate((a) => {
      const mod = window.__assignMod;
      mod.setAssignments([a]);
      mod.registerPersistCallback(async () => { await new Promise((r) => setTimeout(r, 3000)); return { ok: true }; });
      mod.openFormModal(a.id);
    }, SYN_ASSIGNMENT);
    await new Promise((r) => setTimeout(r, 150));
    page.click('#btnSaveForm');
    await new Promise((r) => setTimeout(r, 300));
    await page.screenshot({ path: path.join(OUT_DIR, 'saving-state-light.png') });

    // Dark mode, same saving frame
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await new Promise((r) => setTimeout(r, 200));
    await page.screenshot({ path: path.join(OUT_DIR, 'saving-state-dark.png') });
    await page.close();
  }

  // ── Mobile viewport: Petty Cash form ──
  {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (req.url().endsWith('/js/petty-cash/petty-cash-store.js')) {
        req.respond({
          contentType: 'application/javascript; charset=utf-8',
          body: `
            import { DEFAULT_SETTINGS, CYCLE_STATUS, todayISO } from '/js/petty-cash/petty-cash-config.js';
            const cache = { expenses: {}, nors: {}, cycles: {}, audit: {}, settings: { ...DEFAULT_SETTINGS } };
            export function genId(p) { return p + '_' + Date.now(); }
            export async function initPettyCashStore() { cache.cycles.c1 = { id:'c1', startDate: todayISO(), openingBalance: DEFAULT_SETTINGS.openingBalance, realizedAmount:0, closingBalance: DEFAULT_SETTINGS.openingBalance, status: CYCLE_STATUS.ACTIVE, createdAt: Date.now() }; }
            export function registerChangeListener() {}
            export function isReady() { return true; }
            function mapToArray(m) { return Object.values(m); }
            export function getExpenses() { return mapToArray(cache.expenses); }
            export function getNors() { return mapToArray(cache.nors); }
            export function getCycles() { return mapToArray(cache.cycles); }
            export function getAudit() { return mapToArray(cache.audit); }
            export function getSettings() { return { ...DEFAULT_SETTINGS, ...(cache.settings||{}) }; }
            export function getExpenseById(id) { return cache.expenses[id] || null; }
            export function getNorById(id) { return cache.nors[id] || null; }
            export function getNorByNumber() { return null; }
            export function getActiveCycle() { return getCycles()[0] || null; }
            export async function putExpense(e) { await new Promise(r=>setTimeout(r,3000)); cache.expenses[e.id]=e; return e; }
            export async function deleteExpense(id) { delete cache.expenses[id]; }
            export async function putNor(n) { cache.nors[n.id]=n; }
            export async function putCycle(c) { cache.cycles[c.id]=c; }
            export async function putAudit(a) { cache.audit[a.id||Math.random()]=a; }
            export async function saveSettings(s) { cache.settings={...DEFAULT_SETTINGS,...s}; }
            export async function applyUpdates() {}
            export const PETTY_CASH_PATHS = {};
          `,
        });
      } else req.continue();
    });
    await page.setViewport({ width: 390, height: 844 });
    await page.goto('http://localhost:8000/scratch/petty-cash-harness.html', { waitUntil: 'load' });
    await page.waitForFunction('window.__pcHarnessReady === true');
    await page.evaluate(() => window.__pc.openPettyCashAddExpense());
    await new Promise((r) => setTimeout(r, 150));
    await page.type('input[name="description"]', 'Mobile test');
    await page.evaluate(() => {
      const el = document.querySelector('input[name="amount"]');
      if (el) { el.value = '50000'; el.dispatchEvent(new Event('input', { bubbles: true })); }
    });
    await page.screenshot({ path: path.join(OUT_DIR, 'pettycash-mobile-idle.png') });
    await page.click('[data-act="submitAdd"]');
    await new Promise((r) => setTimeout(r, 300));
    await page.screenshot({ path: path.join(OUT_DIR, 'pettycash-mobile-saving.png') });
    await page.close();
  }

  await browser.close();
  console.log('Visual pass screenshots captured.');
})();
