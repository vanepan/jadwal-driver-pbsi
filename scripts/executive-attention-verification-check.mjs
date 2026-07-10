/* executive-attention-verification-check.mjs — Phase 2 (Executive Attention)
   mandatory browser verification. Serves the static app, loads the REAL
   Workspace layer (home-router.js -> exec-attention) in headless Chromium —
   no app.js boot, no mocked Attention internals — across:

     • 3 approved reference viewports (Desktop 1440x900, Tablet 1194x834,
       Mobile 402x874) x 2 themes x 4 data scenarios (empty / one finding /
       exactly-at-cap / multiple-with-disclosure) = 24 DOM-assertion combos,
       with a representative screenshot subset.
     • Reduced motion (prefers-reduced-motion + data-anim="off") on the
       Attention pulse dot.
     • Progressive disclosure — click "Lihat N lainnya", assert the hidden
       findings reveal WITHOUT removing the always-visible first two, aria-
       expanded flips, label swaps to "Sembunyikan", and clicking again
       re-collapses.
     • Regression guard — rankedItem()/rankedList() (Phase 0 ui-kit.js) are
       still the only severity-row markup in the section (no second
       vocabulary introduced).

   Run: node scripts/executive-attention-verification-check.mjs (exit 0 = pass) */

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

// ── Fake ctx builders — one per scenario, matching the REAL shapes facts()
//    reads (ctx.recommendations.board, ctx.models.engineering, ctx.engineeringEvents,
//    ctx.requests, ctx.models.wellness, ctx.models.pettyLowBalance). ──
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
  empty: () => baseCtx(),
  oneFinding: () => {
    const ctx = baseCtx();
    ctx.models.pettyLowBalance = { low: true }; // single critical item
    return ctx;
  },
  atCap: () => {
    const ctx = baseCtx();
    ctx.models.pettyLowBalance = { low: true }; // critical
    ctx.requests = [{ id: 'r1', status: 'pending', createdAt: new Date().toISOString(), purpose: 'Transport Pelatnas' }]; // warn
    return ctx; // exactly 2 items — at ATTENTION_VISIBLE_CAP, no disclosure
  },
  multiple: () => {
    const ctx = baseCtx();
    ctx.models.pettyLowBalance = { low: true }; // critical
    ctx.recommendations = { certified: true, board: { isHealthyFleet: false, critical: [{ vehicleName: 'Innova B1', categoryLabel: 'Servis', reason: 'Jadwal servis terlewat.' }], upcoming: [] }, recs: [] }; // critical
    ctx.requests = [{ id: 'r1', status: 'pending', createdAt: new Date().toISOString(), purpose: 'Transport Pelatnas' }]; // warn
    ctx.models.wellness = { summary: { burnoutRisk: 1, highFatigue: 1 } }; // warn (2)
    ctx.models.engineering = { overdueAssignments: { count: 2 } }; // critical
    return ctx; // 5 items total: 3 critical + 2 warn -> visible 2, rest 3
  },
};

async function renderScenario(name, viewportKey, theme, { fresh = true } = {}) {
  await page.setViewport(VIEWPORTS[viewportKey]);
  if (fresh) {
    await page.goto(`http://localhost:${port}/scripts/workspace-foundation-harness.html`, { waitUntil: 'networkidle0', timeout: 45000 });
  }
  await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
  const ctxJson = JSON.stringify(scenarioCtx[name]());
  return page.evaluate(async (ctxJsonInner) => {
    const router = await import('/js/workspace/home-router.js');
    const ctx = JSON.parse(ctxJsonInner);
    const host = document.getElementById('host');
    if (!host.__wspToken) { host.className = 'exec-ui v2-analytics-claude'; }
    await router.renderHome(host, ctx);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    const section = host.querySelector('[data-widget-id="exec-attention"]');
    const q = (s) => section && section.querySelector(s);
    const qa = (s) => section ? [...section.querySelectorAll(s)] : [];
    const dot = q('.wsp-attn__dot');

    return {
      hasSection: !!section,
      sectionTitle: (q('.wsp-block__title') || section?.parentElement?.querySelector('.wsp-block__title') || {}).textContent || (host.querySelector(`h2.wsp-block__title`) || {}).textContent,
      hasAttnWrap: !!q('.wsp-attn'),
      hasCompactOk: !!q('.wsp-compact-ok'),
      compactOkText: (q('.wsp-compact-ok') || {}).textContent || null,
      visibleRowCount: qa('.wsp-sevlist:not([data-attn-more] .wsp-sevlist) .wsp-sevrow').length
        || qa('.wsp-attn > .wsp-sevlist .wsp-sevrow').length,
      moreRowCount: qa('[data-attn-more] .wsp-sevrow').length,
      hasToggle: !!q('[data-attn-toggle]'),
      toggleText: (q('[data-attn-toggle]') || {}).textContent || null,
      toggleAriaExpanded: q('[data-attn-toggle]') ? q('[data-attn-toggle]').getAttribute('aria-expanded') : null,
      moreOpen: q('[data-attn-more]') ? q('[data-attn-more]').classList.contains('wsp-attn__more--open') : null,
      countText: (q('.wsp-attn__count') || {}).textContent || null,
      dotClass: dot ? dot.className : null,
      dotAnimDuration: dot ? dot.style.animationDuration : null,
      scrollWidthOverflow: document.documentElement.scrollWidth > window.innerWidth + 2,
    };
  }, ctxJson);
}

console.log('\n[1] Structural + scenario matrix — 4 scenarios x 3 viewports x 2 themes (24 combos)');
const SCENARIOS = ['empty', 'oneFinding', 'atCap', 'multiple'];
const THEMES = ['light', 'dark'];
const matrixResults = {};
for (const vp of Object.keys(VIEWPORTS)) {
  for (const theme of THEMES) {
    for (const scenario of SCENARIOS) {
      const key = `${vp}/${theme}/${scenario}`;
      const r = await renderScenario(scenario, vp, theme);
      matrixResults[key] = r;
      check(`${key}: Attention section renders`, r.hasSection);
      check(`${key}: no horizontal overflow`, !r.scrollWidthOverflow);
    }
  }
}

console.log('\n[2] Empty state — section never hidden, approved success line shown');
const emptyResult = matrixResults['desktop/light/empty'];
check('empty: no .wsp-attn wrapper (compact success path, not the inbox)', !emptyResult.hasAttnWrap);
check('empty: compact success line present', emptyResult.hasCompactOk);
check('empty: success message text', /aman/i.test(emptyResult.compactOkText || ''));

console.log('\n[3] One finding — always-visible, no disclosure button');
const oneResult = matrixResults['desktop/light/oneFinding'];
check('oneFinding: .wsp-attn wrapper present', oneResult.hasAttnWrap);
check('oneFinding: 1 visible row', oneResult.visibleRowCount === 1);
check('oneFinding: no disclosure button (nothing to hide)', !oneResult.hasToggle);
check('oneFinding: summary count reads "1 area"', /^1 area/.test(oneResult.countText || ''));
check('oneFinding: dot uses critical tone (petty cash is a critical finding)', (oneResult.dotClass || '').includes('wsp-attn__dot--critical'));

console.log('\n[4] Exactly at cap (2 findings) — both visible, no disclosure button');
const atCapResult = matrixResults['desktop/light/atCap'];
check('atCap: 2 visible rows', atCapResult.visibleRowCount === 2);
check('atCap: no disclosure button', !atCapResult.hasToggle);

console.log('\n[5] Multiple findings (5) — first 2 always visible, 3 behind disclosure');
const multiResult = matrixResults['desktop/light/multiple'];
check('multiple: exactly 2 rows visible before expansion', multiResult.visibleRowCount === 2);
check('multiple: 3 rows waiting behind disclosure', multiResult.moreRowCount === 3);
check('multiple: disclosure collapsed by default', multiResult.moreOpen === false);
check('multiple: toggle aria-expanded="false" initially', multiResult.toggleAriaExpanded === 'false');
check('multiple: toggle label names the exact hidden count', multiResult.toggleText === 'Lihat 3 lainnya');
check('multiple: summary names total + critical breakdown', multiResult.countText === '5 area memerlukan tindakan · 3 kritis');
check('multiple: pulse dot uses the critical (scale) amplitude — top severity is critical', (multiResult.dotClass || '').includes('wsp-attn-pulse--scale'));
check('multiple: pulse dot duration matches MOTION_PROFILES.critical.pulse.periodMs (1600ms)', multiResult.dotAnimDuration === '1600ms');

console.log('\n[6] Disclosure interaction — expand reveals in place, collapse reverses, nothing else moves');
await page.setViewport(VIEWPORTS.desktop);
const disclosureResult = await page.evaluate(async (ctxJsonInner) => {
  const router = await import('/js/workspace/home-router.js');
  const ctx = JSON.parse(ctxJsonInner);
  const host = document.getElementById('host');
  await router.renderHome(host, ctx);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const section = host.querySelector('[data-widget-id="exec-attention"]');
  const btn = section.querySelector('[data-attn-toggle]');
  const more = section.querySelector('[data-attn-more]');
  const visibleRowsBefore = [...section.querySelectorAll('.wsp-attn > .wsp-sevlist .wsp-sevrow')].map((e) => e.textContent);

  btn.click();
  await new Promise((r) => setTimeout(r, 50));
  const openedClass = more.classList.contains('wsp-attn__more--open');
  const ariaAfterOpen = btn.getAttribute('aria-expanded');
  const labelAfterOpen = btn.textContent;
  const visibleRowsAfterOpen = [...section.querySelectorAll('.wsp-attn > .wsp-sevlist .wsp-sevrow')].map((e) => e.textContent);
  const moreRowsVisible = more.querySelectorAll('.wsp-sevrow').length;

  btn.click();
  await new Promise((r) => setTimeout(r, 50));
  const closedClass = more.classList.contains('wsp-attn__more--open');
  const ariaAfterClose = btn.getAttribute('aria-expanded');
  const labelAfterClose = btn.textContent;

  return { openedClass, ariaAfterOpen, labelAfterOpen, moreRowsVisible, closedClass, ariaAfterClose, labelAfterClose,
    firstTwoUnchanged: JSON.stringify(visibleRowsBefore) === JSON.stringify(visibleRowsAfterOpen) };
}, JSON.stringify(scenarioCtx.multiple()));
check('click opens the disclosure (class added)', disclosureResult.openedClass === true);
check('click sets aria-expanded="true"', disclosureResult.ariaAfterOpen === 'true');
check('click swaps label to "Sembunyikan"', disclosureResult.labelAfterOpen === 'Sembunyikan');
check('the first two always-visible findings are untouched by expansion', disclosureResult.firstTwoUnchanged);
check('all 3 hidden findings become present in the DOM (already rendered, only revealed)', disclosureResult.moreRowsVisible === 3);
check('second click re-collapses (class removed)', disclosureResult.closedClass === false);
check('second click resets aria-expanded="false"', disclosureResult.ariaAfterClose === 'false');
check('second click restores the original "Lihat N lainnya" label', disclosureResult.labelAfterClose === 'Lihat 3 lainnya');

console.log('\n[7] Reduced motion (prefers-reduced-motion + data-anim="off") on the Attention pulse');
await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
await renderScenario('multiple', 'desktop', 'light');
const reducedDotAnim = await page.evaluate(() => {
  const dot = document.querySelector('[data-widget-id="exec-attention"] .wsp-attn__dot');
  return dot ? getComputedStyle(dot).animationName : null;
});
check('prefers-reduced-motion: pulse animation-name resolves to none', reducedDotAnim === 'none');
await page.emulateMediaFeatures([]);

const dataAnimOffDotAnim = await page.evaluate(async (ctxJsonInner) => {
  document.documentElement.setAttribute('data-anim', 'off');
  const router = await import('/js/workspace/home-router.js');
  const ctx = JSON.parse(ctxJsonInner);
  const host = document.getElementById('host');
  await router.renderHome(host, ctx);
  const dot = document.querySelector('[data-widget-id="exec-attention"] .wsp-attn__dot');
  const anim = dot ? getComputedStyle(dot).animationName : null;
  document.documentElement.removeAttribute('data-anim');
  return anim;
}, JSON.stringify(scenarioCtx.multiple()));
check('data-anim="off": pulse animation-name resolves to none', dataAnimOffDotAnim === 'none');

console.log('\n[8] Accessibility — native disclosure semantics, keyboard reachable, decorative dot hidden from AT');
await renderScenario('multiple', 'desktop', 'light');
const a11yResult = await page.evaluate(() => {
  const section = document.querySelector('[data-widget-id="exec-attention"]');
  const btn = section.querySelector('[data-attn-toggle]');
  const dot = section.querySelector('.wsp-attn__dot');
  return {
    toggleIsButton: btn.tagName === 'BUTTON',
    toggleType: btn.getAttribute('type'),
    dotAriaHidden: dot.getAttribute('aria-hidden'),
    focusable: (() => { btn.focus(); return document.activeElement === btn; })(),
  };
});
check('disclosure control is a native <button> (no custom ARIA widget needed)', a11yResult.toggleIsButton);
check('disclosure button has type="button" (no accidental form submit)', a11yResult.toggleType === 'button');
check('pulse dot is aria-hidden (decorative, text already conveys the count)', a11yResult.dotAriaHidden === 'true');
check('disclosure button is keyboard-focusable', a11yResult.focusable);

console.log('\n[9] Regression guard — still exactly ONE severity-row vocabulary (rankedItem/rankedList)');
const vocabResult = await page.evaluate(() => {
  const section = document.querySelector('[data-widget-id="exec-attention"]');
  return {
    sevrowCount: section.querySelectorAll('.wsp-sevrow').length,
    sevlistCount: section.querySelectorAll('.wsp-sevlist').length,
    noForeignRowClass: !section.querySelector('.wsp-insight-row, .wsp-attn-row, .wsp-attn__item'),
  };
});
check('all findings use .wsp-sevrow (Phase 0 rankedItem markup)', vocabResult.sevrowCount === 5);
check('exactly two .wsp-sevlist blocks (visible + collapsed), no new row component', vocabResult.sevlistCount === 2);
check('no second/foreign severity-row class introduced', vocabResult.noForeignRowClass);

console.log('\n[10] Representative screenshots (scratch/attention-*.png)');
async function shot(scenario, vp, theme, tag = '') {
  await renderScenario(scenario, vp, theme);
  await new Promise((r) => setTimeout(r, 200));
  const name = `attention-${vp}-${theme}-${scenario}${tag}.png`;
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

console.log(`\nEXECUTIVE ATTENTION VERIFICATION: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
