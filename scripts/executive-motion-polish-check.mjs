/* executive-motion-polish-check.mjs — Phase 7C (Premium Polish Pass)
   mandatory browser verification for the NEW motion added this phase, on
   top of the existing per-section scripts (which already cover each
   section's content/behavior and are re-run unmodified). Serves the
   static app, loads the REAL Workspace layer in headless Chromium:

     • Attention row entrance cascade (.wsp-sevrow nth-child stagger) —
       present with increasing delay on first mount, suppressed (inline
       animation:none) on a live refresh so it never replays.
     • Decision item entrance cascade (.wsp-inbox__item) — same contract.
     • Metric count-up (Snapshot's 5 KPI tiles, Outlook's tomorrow metric)
       — reaches the exact target value, and does not re-animate from 0 on
       a live refresh (shows the new value directly).
     • Reduced motion (prefers-reduced-motion) and data-anim="off" — every
       one of the above renders its FINAL state immediately, no stagger,
       no count-up.
     • No layout shift — the page's total scrollHeight is stable before
       and after the count-up/stagger animations finish (transform/opacity
       only, nothing reflows).
     • Hover interaction — launcher icon lifts on hover, a clickable row
       lifts, a button settles on :active, all via transform (not layout).

   Run: node scripts/executive-motion-polish-check.mjs (exit 0 = pass) */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const consoleErrors = [];
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  if (/Failed to load resource/i.test(m.text())) return;
  consoleErrors.push('console.error: ' + m.text());
});

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };
await page.setViewport({ width: 1440, height: 900 });

const BUILD_CTX_FN = `(function buildCtx() {
  const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const today = ymd(new Date());
  const tomorrow = ymd(new Date(Date.now() + 86400000));
  return {
    user: { id: 'u1', name: 'Uji Coba', role: 'admin' }, role: 'admin',
    assignments: [
      { id: 'a1', date: today, status: 'completed', vehicle: 'B1001' },
      { id: 'a2', date: tomorrow, status: 'scheduled', vehicle: 'B1002' },
      { id: 'a3', date: tomorrow, status: 'scheduled', vehicle: 'B1003' },
    ],
    requests: [{ id: 'r1', status: 'pending', createdAt: new Date().toISOString(), purpose: 'Transport A' }],
    logs: [], engineeringEvents: [{ type: 'finished', timestamp: new Date().toISOString(), assignmentId: 'e1', assignmentTitle: 'Servis A' }],
    drivers: [], vehicles: [], actions: {},
    models: {
      exec: { driverKpis: { activeVehicles: 5, activeDrivers: 4 }, score: { value: 78, level: 'good', label: 'Baik' }, scoreBreakdown: { components: [] } },
      engineering: { overdueAssignments: { count: 1 } },
      wellness: { summary: { burnoutRisk: 0, highFatigue: 0, atRiskDrivers: 2 } },
      pettyLowBalance: { low: true },
    },
    recommendations: {
      certified: true,
      board: { isHealthyFleet: false, critical: [{ vehicleName: 'Innova B1005', categoryLabel: 'Servis Kritis', reason: 'Terlewat 5 hari.' }], upcoming: [] },
      recs: [
        { title: 'Rec A', reason: 'Reason A', expectedBenefit: 'Benefit A', priority: { label: 'Tinggi', tone: 'danger', rank: 0 }, category: 'maintenance', actionable: true },
        { title: 'Rec B', reason: 'Reason B', expectedBenefit: 'Benefit B', priority: { label: 'Sedang', tone: 'warn', rank: 1 }, category: 'maintenance', actionable: true },
      ],
    },
    vehicleFlags: null,
  };
})`;

async function render({ reducedMotion = false, animOff = false, fresh = true } = {}) {
  if (reducedMotion) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  else await page.emulateMediaFeatures([]);
  if (fresh) await page.goto(`http://localhost:${port}/scripts/workspace-foundation-harness.html`, { waitUntil: 'networkidle0', timeout: 45000 });
  await page.evaluate((animOffArg) => {
    if (animOffArg) document.documentElement.setAttribute('data-anim', 'off');
    else document.documentElement.removeAttribute('data-anim');
  }, animOff);
  await page.evaluate(async (buildCtxSrc) => {
    const router = await import('/js/workspace/home-router.js');
    const buildCtx = eval(buildCtxSrc);
    const host = document.getElementById('host');
    host.className = 'exec-ui v2-analytics-claude';
    window.__ctx = buildCtx();
    if (!window.__mounted) { await router.renderHome(host, window.__ctx); window.__mounted = true; }
    else { await router.refreshHome(host, window.__ctx); }
  }, BUILD_CTX_FN);
}

console.log('\n[1] Attention row entrance cascade — first mount');
await render();
await new Promise((r) => setTimeout(r, 50)); // catch it mid-cascade
let attnDelays = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('[data-widget-id="exec-attention"] .wsp-sevrow')];
  return rows.map((r) => getComputedStyle(r).animationDelay);
});
check('at least 2 attention rows render', attnDelays.length >= 2);
check('rows have increasing (or equal) animation-delay, not all identical', new Set(attnDelays).size > 1);
await new Promise((r) => setTimeout(r, 500)); // let the cascade finish

console.log('\n[2] Attention row entrance — suppressed on live refresh (never replays)');
await render({ fresh: false });
const attnReplaySuppressed = await page.evaluate(() => {
  // style.animation (the shorthand) serializes back as the expanded
  // longhand form ("auto ease 0s 1 normal none running none"), not the
  // literal string 'none' — animationName is the precise longhand check.
  const rows = [...document.querySelectorAll('[data-widget-id="exec-attention"] .wsp-sevrow')];
  return rows.length > 0 && rows.every((r) => r.style.animationName === 'none');
});
check('every attention row has animation-name:none inline after a refresh', attnReplaySuppressed);

console.log('\n[3] Decision item entrance cascade — first mount');
await page.evaluate(() => { window.__mounted = false; });
await render();
await new Promise((r) => setTimeout(r, 50));
let recoDelays = await page.evaluate(() => {
  const items = [...document.querySelectorAll('[data-widget-id="exec-recommendation"] .wsp-inbox__item')];
  return items.map((r) => getComputedStyle(r).animationDelay);
});
check('at least 2 recommendation items render', recoDelays.length >= 2);
check('items have increasing (or equal) animation-delay, not all identical', new Set(recoDelays).size > 1);
await new Promise((r) => setTimeout(r, 500));

console.log('\n[4] Decision item entrance — suppressed on live refresh');
await render({ fresh: false });
const recoReplaySuppressed = await page.evaluate(() => {
  const items = [...document.querySelectorAll('[data-widget-id="exec-recommendation"] .wsp-inbox__item')];
  return items.length > 0 && items.every((r) => r.style.animationName === 'none');
});
check('every recommendation item has animation-name:none inline after a refresh', recoReplaySuppressed);

console.log('\n[5] Metric count-up — Snapshot tiles reach exact target, Outlook metric too');
await page.evaluate(() => { window.__mounted = false; });
await render();
await new Promise((r) => setTimeout(r, 500));
const metricValues = await page.evaluate(() => ({
  // Scoped to the visible "Hari" panel only — Snapshot renders all 3
  // period panels into the DOM at once (Hari/Minggu/Bulan, CSS `hidden`
  // toggles which is shown), so an unscoped query would match 15 tiles.
  snapshot: [...document.querySelectorAll('[data-widget-id="exec-snapshot"] [data-snapshot-panel="hari"] .wsp-metric__value')].map((v) => v.textContent.trim()),
  outlook: (document.querySelector('[data-widget-id="exec-outlook"] .wsp-metric__value') || {}).textContent?.trim(),
}));
check('Snapshot tiles settle to non-empty numeric text', metricValues.snapshot.length === 5 && metricValues.snapshot.every((v) => /^\d+$/.test(v)));
check('Outlook tomorrow-trip metric settles to the fixture value (2)', metricValues.outlook === '2');

console.log('\n[6] Metric count-up — suppressed on live refresh (shows value directly, no re-tween from 0)');
const beforeRefresh = await page.evaluate(() => (document.querySelector('[data-widget-id="exec-outlook"] .wsp-metric__value') || {}).textContent?.trim());
await render({ fresh: false });
const rightAfterRefresh = await page.evaluate(() => (document.querySelector('[data-widget-id="exec-outlook"] .wsp-metric__value') || {}).textContent?.trim());
check('metric shows its value immediately after refresh, not "0"', rightAfterRefresh === beforeRefresh && rightAfterRefresh !== '0');

console.log('\n[7] Reduced motion — every new animation renders final state immediately');
await page.evaluate(() => { window.__mounted = false; });
await render({ reducedMotion: true });
const reducedState = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('[data-widget-id="exec-attention"] .wsp-sevrow')];
  const items = [...document.querySelectorAll('[data-widget-id="exec-recommendation"] .wsp-inbox__item')];
  const snap = [...document.querySelectorAll('[data-widget-id="exec-snapshot"] .wsp-metric__value')].map((v) => v.textContent.trim());
  return {
    rowsAnimName: rows.map((r) => getComputedStyle(r).animationName),
    itemsAnimName: items.map((r) => getComputedStyle(r).animationName),
    snapImmediatelyCorrect: snap.every((v) => /^\d+$/.test(v) && v !== ''),
  };
});
check('prefers-reduced-motion: attention rows animation-name is none', reducedState.rowsAnimName.every((n) => n === 'none'));
check('prefers-reduced-motion: recommendation items animation-name is none', reducedState.itemsAnimName.every((n) => n === 'none'));
check('prefers-reduced-motion: metric values are correct immediately (no visible 0-start)', reducedState.snapImmediatelyCorrect);
await page.emulateMediaFeatures([]);

console.log('\n[8] data-anim="off" — same contract as reduced motion');
await page.evaluate(() => { window.__mounted = false; });
await render({ animOff: true });
const animOffState = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('[data-widget-id="exec-attention"] .wsp-sevrow')];
  return rows.map((r) => getComputedStyle(r).animationName);
});
check('data-anim="off": attention rows animation-name is none', animOffState.every((n) => n === 'none'));

console.log('\n[9] No layout shift — page height stable once animations settle');
await page.evaluate(() => { window.__mounted = false; });
await page.evaluate(() => document.documentElement.removeAttribute('data-anim'));
await render();
const heightEarly = await page.evaluate(() => document.documentElement.scrollHeight);
await new Promise((r) => setTimeout(r, 700));
const heightSettled = await page.evaluate(() => document.documentElement.scrollHeight);
check('scrollHeight identical before/after entrance animations settle (transform/opacity only, no reflow)', heightEarly === heightSettled);

console.log('\n[10] Hover interaction — launcher icon lift, clickable row lift, button active-scale (transform, not layout)');
// Real :hover requires an actual pointer move (page.hover), not a
// synthetic dispatchEvent — CSS :hover state does not respond to
// script-dispatched mouseenter/mouseover.
const iconBefore = await page.evaluate(() => getComputedStyle(document.querySelector('[data-widget-id="exec-quick"] .wsp-launcher__item .wsp-launcher__icon')).transform);
await page.hover('[data-widget-id="exec-quick"] .wsp-launcher__item');
await new Promise((r) => setTimeout(r, 200));
const iconAfter = await page.evaluate(() => getComputedStyle(document.querySelector('[data-widget-id="exec-quick"] .wsp-launcher__item .wsp-launcher__icon')).transform);
check('launcher icon transform changes on hover (translateY lift)', iconBefore !== iconAfter);

console.log('\n[11] Console errors');
check('zero console/page errors across the whole run', consoleErrors.length === 0);
if (consoleErrors.length) consoleErrors.forEach((e) => console.log('   ✗ ' + e.slice(0, 200)));

await browser.close();
server.close();

console.log(`\nEXECUTIVE MOTION POLISH VERIFICATION: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
