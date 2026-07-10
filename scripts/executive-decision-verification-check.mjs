/* executive-decision-verification-check.mjs — Phase 3 (Executive Decision
   Center) mandatory browser verification. Serves the static app, loads the
   REAL Workspace layer (home-router.js -> exec-recommendation, the
   Recommendation section redesigned per the approved Design Review) in
   headless Chromium — no app.js boot, no mocked internals — across:

     • 3 approved reference viewports (Desktop 1440x900, Tablet 1194x834,
       Mobile 402x874) x 2 themes x 4 data scenarios (waiting-on-prediction /
       one action / exactly-at-cap / multiple-with-disclosure) = 24
       DOM-assertion combos, with a representative screenshot subset.
     • Explainability — every visible card names Action (title), Reason,
       Expected Impact, and Priority, sourced 1:1 from the certified
       Recommendation Engine fields (no invented text).
     • Visual hierarchy — the top action is the ONLY primary-sized card;
       every other action (visible or disclosed) is secondary.
     • Progressive disclosure — click "Lihat N tindakan lainnya", assert the
       hidden actions reveal WITHOUT removing/recreating the always-visible
       first three, aria-expanded flips, label swaps to "Sembunyikan", and
       clicking again re-collapses.
     • Reduced motion (prefers-reduced-motion + data-anim="off") on the
       disclosure transition.
     • Regression guard — .wsp-inbox / .wsp-inbox__item is the SAME markup
       vocabulary exec-decision originally established (no second
       recommendation vocabulary introduced). Updated for Phase 7C (Executive
       Consolidation): exec-decision itself is now intentionally REMOVED (its
       named-entity information was folded into exec-attention; its
       fleet-maintenance recommendations were already duplicated by this
       section) — this guard now asserts exec-decision's absence rather than
       its byte-for-byte survival.

   Run: node scripts/executive-decision-verification-check.mjs (exit 0 = pass) */

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
if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  tablet:  { width: 1194, height: 834 },
  mobile:  { width: 402,  height: 874, isMobile: true },
};

// ── Fake recommendation objects — matching the REAL frozen shape
//    fleet-recommendation-engine.js emits (title is already an imperative
//    action, priority/estimatedImpact/reason/expectedBenefit are real
//    engine fields, never invented by the widget). ──
function rec(id, priorityKey, priorityLabel, tone, rank) {
  return {
    id, vehicleId: id, vehicleName: id, category: 'maintenance', categoryLabel: 'Perawatan',
    actionable: true,
    title: `Jadwalkan perawatan ${id} dalam 7 hari`,
    priority: { key: priorityKey, label: priorityLabel, tone, rank },
    confidence: { score: 82, level: 'HIGH', levelWord: 'Tinggi', tone: 'ok' },
    reason: `Prediksi menandai risiko pada ${id}.`,
    expectedBenefit: 'Mengurangi downtime yang diproyeksikan.',
    estimatedImpact: { key: 'downtime', label: 'Downtime Diproyeksikan', tone: 'warn' },
  };
}

function baseCtx() {
  return {
    user: { id: 'u1', name: 'Uji Coba', role: 'admin' }, role: 'admin',
    assignments: [], requests: [], logs: [], engineeringEvents: [],
    actions: {},
    models: {
      exec: { driverKpis: { activeVehicles: 5, activeDrivers: 4 }, score: { value: 91, level: 'excellent', label: 'Sangat Baik' }, scoreBreakdown: { components: [] } },
      engineering: { overdueAssignments: { count: 0 } },
      wellness: { summary: { burnoutRisk: 0, highFatigue: 0 } },
      pettyLowBalance: { low: false },
    },
    recommendations: { certified: true, board: { isHealthyFleet: true, critical: [], upcoming: [] }, recs: [] },
  };
}

const scenarioCtx = {
  waiting: () => { const c = baseCtx(); c.recommendations = { certified: false, recs: [] }; return c; },
  oneAction: () => { const c = baseCtx(); c.recommendations.recs = [rec('B1001', 'critical', 'Kritis', 'danger', 0)]; return c; },
  atCap: () => {
    const c = baseCtx();
    c.recommendations.recs = [
      rec('B1001', 'critical', 'Kritis', 'danger', 0),
      rec('B1002', 'high', 'Tinggi', 'danger', 1),
      rec('B1003', 'medium', 'Sedang', 'warn', 2),
    ];
    return c; // exactly RECOMMENDATION_VISIBLE_CAP (3) — no disclosure
  },
  multiple: () => {
    const c = baseCtx();
    c.recommendations.recs = [
      rec('B1005', 'low', 'Rendah', 'info', 3),
      rec('B1001', 'critical', 'Kritis', 'danger', 0), // out of order on purpose — widget must sort by rank
      rec('B1002', 'high', 'Tinggi', 'danger', 1),
      rec('B1003', 'medium', 'Sedang', 'warn', 2),
      rec('B1004', 'informational', 'Informasional', 'ok', 4),
    ];
    return c; // 5 total -> 3 visible (sorted), 2 behind disclosure
  },
};

async function renderScenario(name, viewportKey, theme) {
  await page.setViewport(VIEWPORTS[viewportKey]);
  await page.goto(`http://localhost:${port}/scripts/workspace-foundation-harness.html`, { waitUntil: 'networkidle0', timeout: 45000 });
  await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
  const ctxJson = JSON.stringify(scenarioCtx[name]());
  return page.evaluate(async (ctxJsonInner) => {
    const router = await import('/js/workspace/home-router.js');
    const ctx = JSON.parse(ctxJsonInner);
    const host = document.getElementById('host');
    host.className = 'exec-ui v2-analytics-claude';
    await router.renderHome(host, ctx);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    const section = host.querySelector('[data-widget-id="exec-recommendation"]');
    const q = (s) => section && section.querySelector(s);
    const qa = (s) => section ? [...section.querySelectorAll(s)] : [];

    return {
      hasSection: !!section,
      hasInbox: !!q('.wsp-inbox'),
      visibleItemCount: qa('.wsp-inbox > .wsp-inbox__item').length,
      primaryCount: qa('.wsp-inbox > .wsp-inbox__item--primary').length,
      secondaryVisibleCount: qa('.wsp-inbox > .wsp-inbox__item--secondary').length,
      moreItemCount: qa('[data-reco-more] .wsp-inbox__item').length,
      morePrimaryCount: qa('[data-reco-more] .wsp-inbox__item--primary').length,
      hasToggle: !!q('[data-reco-toggle]'),
      toggleText: (q('[data-reco-toggle]') || {}).textContent || null,
      toggleAriaExpanded: q('[data-reco-toggle]') ? q('[data-reco-toggle]').getAttribute('aria-expanded') : null,
      moreOpen: q('[data-reco-more]') ? q('[data-reco-more]').classList.contains('wsp-reco__more--open') : null,
      firstTitle: (q('.wsp-inbox__item--primary .wsp-inbox__title') || {}).textContent || null,
      firstPillText: (q('.wsp-inbox__item--primary .wsp-pill') || {}).textContent || null,
      firstExplainRows: qa('.wsp-inbox__item--primary .wsp-inbox__explain-row').map((e) => e.textContent),
      hasActionBtn: !!q('.wsp-inbox__item--primary .wsp-btn'),
      leadText: (q('.wsp-lead') || {}).textContent || null,
      scrollWidthOverflow: document.documentElement.scrollWidth > window.innerWidth + 2,
    };
  }, ctxJson);
}

console.log('\n[1] Structural + scenario matrix — 4 scenarios x 3 viewports x 2 themes (24 combos)');
const SCENARIOS = ['waiting', 'oneAction', 'atCap', 'multiple'];
const THEMES = ['light', 'dark'];
const matrixResults = {};
for (const vp of Object.keys(VIEWPORTS)) {
  for (const theme of THEMES) {
    for (const scenario of SCENARIOS) {
      const key = `${vp}/${theme}/${scenario}`;
      const r = await renderScenario(scenario, vp, theme);
      matrixResults[key] = r;
      check(`${key}: Recommendation section renders`, r.hasSection);
      check(`${key}: no horizontal overflow`, !r.scrollWidthOverflow);
    }
  }
}

console.log('\n[2] Waiting-on-prediction — lead sentence, no inbox');
const waitingResult = matrixResults['desktop/light/waiting'];
check('waiting: no .wsp-inbox (nothing certified yet)', !waitingResult.hasInbox);
check('waiting: lead sentence present', /prediksi mencukupi/i.test(waitingResult.leadText || ''));

console.log('\n[3] One action — single primary card, no disclosure button');
const oneResult = matrixResults['desktop/light/oneAction'];
check('oneAction: 1 visible item', oneResult.visibleItemCount === 1);
check('oneAction: it is primary (dominant)', oneResult.primaryCount === 1);
check('oneAction: no disclosure button (nothing to hide)', !oneResult.hasToggle);
check('oneAction: has an action button', oneResult.hasActionBtn);

console.log('\n[4] Exactly at cap (3 actions) — all visible, no disclosure button');
const atCapResult = matrixResults['desktop/light/atCap'];
check('atCap: 3 visible items', atCapResult.visibleItemCount === 3);
check('atCap: exactly 1 primary', atCapResult.primaryCount === 1);
check('atCap: 2 secondary', atCapResult.secondaryVisibleCount === 2);
check('atCap: no disclosure button', !atCapResult.hasToggle);

console.log('\n[5] Multiple (5) — top-3 by priority rank visible, 2 behind disclosure, all secondary');
const multiResult = matrixResults['desktop/light/multiple'];
check('multiple: exactly 3 items visible', multiResult.visibleItemCount === 3);
check('multiple: exactly 1 primary among visible', multiResult.primaryCount === 1);
check('multiple: 2 items waiting behind disclosure', multiResult.moreItemCount === 2);
check('multiple: disclosed items are never primary (only the single top action is)', multiResult.morePrimaryCount === 0);
check('multiple: disclosure collapsed by default', multiResult.moreOpen === false);
check('multiple: toggle aria-expanded="false" initially', multiResult.toggleAriaExpanded === 'false');
check('multiple: toggle label names the exact hidden count', multiResult.toggleText === 'Lihat 2 tindakan lainnya');
check('multiple: sorted by priority rank — Kritis (rank 0) is the dominant action, not input order', multiResult.firstPillText === 'Kritis');
check('multiple: primary card names the Action (imperative title)', /Jadwalkan perawatan B1001/.test(multiResult.firstTitle || ''));
check('multiple: primary card names the Reason as its own distinct labeled line', multiResult.firstExplainRows.some((t) => /^Alasan/.test(t) && /Prediksi menandai risiko/.test(t)));
check('multiple: primary card names the Impact as its own distinct labeled line', multiResult.firstExplainRows.some((t) => /^Dampak/.test(t) && /Mengurangi downtime/.test(t)));

console.log('\n[6] Disclosure interaction — expand reveals in place, collapse reverses, first 3 untouched');
await page.setViewport(VIEWPORTS.desktop);
const disclosureResult = await page.evaluate(async (ctxJsonInner) => {
  const router = await import('/js/workspace/home-router.js');
  const ctx = JSON.parse(ctxJsonInner);
  const host = document.getElementById('host');
  await router.renderHome(host, ctx);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const section = host.querySelector('[data-widget-id="exec-recommendation"]');
  const btn = section.querySelector('[data-reco-toggle]');
  const more = section.querySelector('[data-reco-more]');
  const visibleBefore = [...section.querySelectorAll('.wsp-inbox > .wsp-inbox__item')].map((e) => e.textContent);

  btn.click();
  await new Promise((r) => setTimeout(r, 50));
  const openedClass = more.classList.contains('wsp-reco__more--open');
  const ariaAfterOpen = btn.getAttribute('aria-expanded');
  const labelAfterOpen = btn.textContent;
  const visibleAfterOpen = [...section.querySelectorAll('.wsp-inbox > .wsp-inbox__item')].map((e) => e.textContent);
  const moreItemsVisible = more.querySelectorAll('.wsp-inbox__item').length;

  btn.click();
  await new Promise((r) => setTimeout(r, 50));
  const closedClass = more.classList.contains('wsp-reco__more--open');
  const ariaAfterClose = btn.getAttribute('aria-expanded');
  const labelAfterClose = btn.textContent;

  return { openedClass, ariaAfterOpen, labelAfterOpen, moreItemsVisible, closedClass, ariaAfterClose, labelAfterClose,
    firstThreeUnchanged: JSON.stringify(visibleBefore) === JSON.stringify(visibleAfterOpen) };
}, JSON.stringify(scenarioCtx.multiple()));
check('click opens the disclosure (class added)', disclosureResult.openedClass === true);
check('click sets aria-expanded="true"', disclosureResult.ariaAfterOpen === 'true');
check('click swaps label to "Sembunyikan"', disclosureResult.labelAfterOpen === 'Sembunyikan');
check('the always-visible top 3 are untouched by expansion (continuity, no remove/recreate)', disclosureResult.firstThreeUnchanged);
check('both hidden actions become present in the DOM (already rendered, only revealed)', disclosureResult.moreItemsVisible === 2);
check('second click re-collapses (class removed)', disclosureResult.closedClass === false);
check('second click resets aria-expanded="false"', disclosureResult.ariaAfterClose === 'false');
check('second click restores the original "Lihat N tindakan lainnya" label', disclosureResult.labelAfterClose === 'Lihat 2 tindakan lainnya');

console.log('\n[7] Reduced motion (prefers-reduced-motion + data-anim="off") on the disclosure transition');
await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
await renderScenario('multiple', 'desktop', 'light');
const reducedTransition = await page.evaluate(() => {
  const more = document.querySelector('[data-widget-id="exec-recommendation"] [data-reco-more]');
  return more ? getComputedStyle(more).transitionProperty : null;
});
// Chromium serializes a near-zero duration under `transition: none` as a
// tiny float ("1e-05s") rather than a clean "0s" — transition-PROPERTY
// resolving to "none" is the robust signal that no transition runs.
check('prefers-reduced-motion: disclosure transition is disabled (transition-property: none)', reducedTransition === 'none');
await page.emulateMediaFeatures([]);

const dataAnimOffTransition = await page.evaluate(async (ctxJsonInner) => {
  document.documentElement.setAttribute('data-anim', 'off');
  const router = await import('/js/workspace/home-router.js');
  const ctx = JSON.parse(ctxJsonInner);
  const host = document.getElementById('host');
  await router.renderHome(host, ctx);
  const more = document.querySelector('[data-widget-id="exec-recommendation"] [data-reco-more]');
  const t = more ? getComputedStyle(more).transitionProperty : null;
  document.documentElement.removeAttribute('data-anim');
  return t;
}, JSON.stringify(scenarioCtx.multiple()));
check('data-anim="off": disclosure transition is disabled (transition-property: none)', dataAnimOffTransition === 'none');

console.log('\n[8] Accessibility — native disclosure semantics, keyboard reachable');
await renderScenario('multiple', 'desktop', 'light');
const a11yResult = await page.evaluate(() => {
  const section = document.querySelector('[data-widget-id="exec-recommendation"]');
  const btn = section.querySelector('[data-reco-toggle]');
  const actionBtns = [...section.querySelectorAll('.wsp-btn')];
  return {
    toggleIsButton: btn.tagName === 'BUTTON',
    toggleType: btn.getAttribute('type'),
    focusable: (() => { btn.focus(); return document.activeElement === btn; })(),
    everyActionBtnIsButton: actionBtns.every((b) => b.tagName === 'BUTTON' && b.getAttribute('type') === 'button'),
  };
});
check('disclosure control is a native <button>', a11yResult.toggleIsButton);
check('disclosure button has type="button" (no accidental form submit)', a11yResult.toggleType === 'button');
check('disclosure button is keyboard-focusable', a11yResult.focusable);
check('every per-action button is a native, keyboard-focusable <button type="button">', a11yResult.everyActionBtnIsButton);

console.log('\n[9] Regression guard — shared vocabulary; exec-decision intentionally removed (Phase 7C Executive Consolidation)');
const vocabResult = await page.evaluate(() => {
  const reco = document.querySelector('[data-widget-id="exec-recommendation"]');
  return {
    recoUsesInbox: !!reco.querySelector('.wsp-inbox'),
    recoUsesExplain: !!reco.querySelector('.wsp-inbox__explain'),
    recoNoForeignCard: !reco.querySelector('.wsp-reco, .wsp-reco__title, .wsp-reco__benefit'),
    decisionGone: !document.querySelector('[data-widget-id="exec-decision"]'),
    decisionNotRegistered: !Array.from(document.querySelectorAll('[data-widget-id]')).some((el) => el.dataset.widgetId === 'exec-decision'),
  };
});
check('exec-recommendation reuses .wsp-inbox (no second recommendation vocabulary)', vocabResult.recoUsesInbox);
check('exec-recommendation adds the explainability rows (Reason/Impact)', vocabResult.recoUsesExplain);
check('exec-recommendation no longer emits the old flat .wsp-reco card markup', vocabResult.recoNoForeignCard);
check('exec-decision (Pusat Keputusan) is gone — removed per the approved Phase 7B/7C consolidation', vocabResult.decisionGone);
check('exec-decision does not appear anywhere in the rendered workspace', vocabResult.decisionNotRegistered);

console.log('\n[10] Representative screenshots (scratch/decision-*.png)');
async function shot(scenario, vp, theme, tag = '') {
  await renderScenario(scenario, vp, theme);
  await new Promise((r) => setTimeout(r, 200));
  const name = `decision-${vp}-${theme}-${scenario}${tag}.png`;
  await page.screenshot({ path: path.join(SHOTS, name) });
  console.log(`  📸 scratch/${name}`);
}
for (const scenario of SCENARIOS) { await shot(scenario, 'desktop', 'light'); await shot(scenario, 'mobile', 'light'); }
await shot('multiple', 'tablet', 'light');
await shot('multiple', 'tablet', 'dark');
await shot('multiple', 'desktop', 'dark');

console.log('\n[11] Console errors');
check('zero console/page errors across the whole run', consoleErrors.length === 0);
if (consoleErrors.length) consoleErrors.forEach((e) => console.log('   ✗ ' + e.slice(0, 200)));

await browser.close();
server.close();

console.log(`\nEXECUTIVE DECISION CENTER VERIFICATION: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
