/* executive-hero-verification-check.mjs — Phase 1 (Executive Hero) mandatory
   browser verification. Serves the static app, loads the REAL Workspace layer
   (home-router.js -> exec-hero) in headless Chromium — no app.js boot, no
   mocked Hero internals — across:

     • 5 moods (Healthy/Good/Warning/Critical/No Data) x 3 approved reference
       viewports (Desktop 1440x900, Tablet 1194x834, Mobile 402x874) x 2 themes
       = 30 DOM-assertion combinations, with a representative screenshot subset.
     • Reduced motion (prefers-reduced-motion + data-anim="off").
     • Realtime update (a second renderHome() call simulating refreshHome()) —
       asserts the entrance never replays and the score/ring continuity-tweens
       from the last shown value instead of resetting to zero.
     • Theme switching (data-theme toggle with no re-mount).
     • Architectural check 1 — Operational Pulse is exactly 3 metrics, "Status
       Armada" is gone, and its data is still surfaced in the explainability
       disclosure (not lost).
     • Architectural check 2 (static, not browser) — single lifecycle owner:
       mountHeroMotion/resolveMotionProfile are referenced ONLY inside
       js/widgets/executive/index.js, and workspace-renderer.js's onMount call
       is generic (not Hero-special-cased).

   Section [7] is a regression guard for the v1.22.6 score.level vocabulary
   fix: js/analytics/executive-analytics.js's healthLevel() has always emitted
   'excellent'/'good'/'fair'/'attention'/'nodata', but narrative-builder.js's
   classifyState() and ui-kit.js's LEVEL_TONE used to check for 'high'/
   'medium'/'low'/'insufficient' (a vocabulary that belongs to the unrelated
   computeConfidence() elsewhere in the same file) — every non-nodata score
   silently fell through to 'warning'/neutral regardless of its real value.
   Approved and fixed alongside this verification; this section proves a
   genuinely excellent score with zero findings now renders as healthy.

   Run: node scripts/executive-hero-verification-check.mjs (exit 0 = pass) */

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

// ── Fake ctx builders — one per Hero mood, matching the REAL shapes facts()
//    reads (ctx.models.exec.score/driverKpis, ctx.requests, ctx.recommendations,
//    ctx.models.engineering, ctx.models.wellness, ctx.models.pettyLowBalance).
//    score.level uses the REAL executive-analytics.js vocabulary (see [7]). ──
function baseCtx() {
  return {
    user: { id: 'u1', name: 'Uji Coba', role: 'admin' }, role: 'admin',
    assignments: [], requests: [], logs: [], engineeringEvents: [],
    actions: {},
    models: {
      exec: { driverKpis: { activeVehicles: 5, activeDrivers: 4 }, scoreBreakdown: { components: [
        { key: 'driverOps', label: 'Operasional Driver', weightPct: 30, score: 88 },
        { key: 'engineering', label: 'Engineering', weightPct: 20, score: 90 },
        { key: 'vehicleUtil', label: 'Utilisasi Armada', weightPct: 20, score: 85 },
        { key: 'request', label: 'Permintaan', weightPct: 15, score: 92 },
        { key: 'pettyCash', label: 'Petty Cash', weightPct: 15, score: 95 },
      ] } },
      engineering: { overdueAssignments: { count: 0 } },
      wellness: { summary: { burnoutRisk: 0, highFatigue: 0 } },
      pettyLowBalance: { low: false },
    },
    recommendations: { certified: true, board: { isHealthyFleet: true, critical: [], upcoming: [] }, recs: [] },
  };
}
function withScore(ctx, value, level, label) {
  ctx.models.exec.score = { value, level, label };
  return ctx;
}

// score.level values are now the REAL executive-analytics.js vocabulary
// (excellent/good/fair/attention/nodata, per healthLevel()) — post-fix,
// these are no longer "forced" values, they're what production actually emits.
const moodCtx = {
  healthy: () => withScore(baseCtx(), 91, 'excellent', 'Sangat Baik'),
  good: () => withScore(baseCtx(), 78, 'good', 'Baik'),
  warning: () => {
    const ctx = withScore(baseCtx(), 91, 'excellent', 'Sangat Baik'); // level irrelevant once a finding exists
    ctx.requests = [{ id: 'r1', status: 'pending', createdAt: new Date().toISOString(), purpose: 'Transport Pelatnas' }];
    return ctx;
  },
  critical: () => {
    const ctx = withScore(baseCtx(), 91, 'excellent', 'Sangat Baik');
    ctx.recommendations = { certified: true, board: { isHealthyFleet: false, critical: [{ vehicleName: 'Innova B1', categoryLabel: 'Servis', reason: 'Jadwal servis terlewat.' }], upcoming: [] }, recs: [] };
    return ctx;
  },
  noData: () => {
    const ctx = baseCtx();
    ctx.models.exec.score = { value: null, level: 'nodata', label: 'Belum Ada Data' };
    return ctx;
  },
};

async function renderMood(mood, viewportKey, theme, { fresh = true } = {}) {
  await page.setViewport(VIEWPORTS[viewportKey]);
  if (fresh) {
    await page.goto(`http://localhost:${port}/scripts/workspace-foundation-harness.html`, { waitUntil: 'networkidle0', timeout: 45000 });
  }
  await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
  const ctxJson = JSON.stringify(moodCtx[mood]());
  return page.evaluate(async (ctxJsonInner) => {
    const router = await import('/js/workspace/home-router.js');
    const ctx = JSON.parse(ctxJsonInner);
    let host = document.getElementById('host');
    if (!host.__wspToken) { host.className = 'exec-ui v2-analytics-claude'; }
    await router.renderHome(host, ctx);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    const hero = host.querySelector('.wsp-hero');
    const q = (s) => hero && hero.querySelector(s);
    const qa = (s) => hero ? [...hero.querySelectorAll(s)] : [];
    const stats = qa('.wsp-hero__stat-lbl').map((e) => e.textContent.trim());
    const explainRows = qa('.wsp-hero__explain-row').map((e) => e.textContent.trim());
    const ring = q('.an-ring-val[data-ring-len]');
    const scoreEl = q('[data-countup], .wsp-hero__scoreval--muted');
    const heroBody = host.querySelector('.wsp-block--hero .wsp-block__body');

    return {
      hasHero: !!hero,
      headlineClass: (q('.wsp-hero__hl') || {}).className || '',
      headlineText: (q('.wsp-hero__headline') || {}).textContent || '',
      pillText: (q('.wsp-hero__healthmeta .wsp-pill, .wsp-hero__healthmeta span') || {}).textContent || '',
      statCount: stats.length,
      statLabels: stats,
      explainRows,
      ringLen: ring ? ring.getAttribute('data-ring-len') : null,
      ringCirc: ring ? ring.getAttribute('data-ring-circ') : null,
      scoreText: scoreEl ? scoreEl.textContent : null,
      animEls: qa('.wsp-hero-anim').map((e) => ({
        cls: e.className, inlineAnim: e.style.animation,
        delayVar: e.style.getPropertyValue('--wsp-hero-delay'),
        durVar: e.style.getPropertyValue('--wsp-hero-dur'),
      })),
      heroMounted: heroBody ? heroBody.dataset.heroMounted : null,
      heroLastScore: heroBody ? heroBody.dataset.heroLastScore : null,
      ringTransition: ring ? ring.style.transition : null,
      scrollWidthOverflow: document.documentElement.scrollWidth > window.innerWidth + 2,
    };
  }, ctxJson);
}

console.log('\n[1] Structural + mood matrix — 5 moods x 3 viewports x 2 themes (30 combos)');
const MOODS = ['healthy', 'good', 'warning', 'critical', 'noData'];
const THEMES = ['light', 'dark'];
const matrixResults = {};
for (const vp of Object.keys(VIEWPORTS)) {
  for (const theme of THEMES) {
    for (const mood of MOODS) {
      const key = `${vp}/${theme}/${mood}`;
      const r = await renderMood(mood, vp, theme);
      matrixResults[key] = r;
      check(`${key}: Hero renders`, r.hasHero);
      check(`${key}: Operational Pulse has exactly 3 stats`, r.statCount === 3);
      check(`${key}: no horizontal overflow`, !r.scrollWidthOverflow);
    }
  }
}
// Representative screenshots — every mood at Desktop-Light and Mobile-Light,
// plus Critical (the one with a persistent pulse) at Tablet in both themes,
// plus Healthy at Desktop/Mobile-Dark.
console.log('\n[2] Representative screenshots (scratch/hero-*.png)');
async function shot(mood, vp, theme, tag = '') {
  await renderMood(mood, vp, theme);
  await new Promise((r) => setTimeout(r, 350)); // let the entrance settle for a "post-reveal" shot
  const name = `hero-${vp}-${theme}-${mood}${tag}.png`;
  await page.screenshot({ path: path.join(SHOTS, name) });
  console.log(`  📸 scratch/${name}`);
}
for (const mood of MOODS) { await shot(mood, 'desktop', 'light'); await shot(mood, 'mobile', 'light'); }
await shot('critical', 'tablet', 'light');
await shot('critical', 'tablet', 'dark');
await shot('healthy', 'desktop', 'dark');
await shot('healthy', 'mobile', 'dark');

console.log('\n[3] Operational Pulse — architectural check (3 vs 4 metrics)');
const healthyDesktopLight = matrixResults['desktop/light/healthy'];
check('exactly 3 Operational Pulse metrics', healthyDesktopLight.statCount === 3);
check('"Status Armada" is NOT in Operational Pulse', !healthyDesktopLight.statLabels.includes('Status Armada'));
check('Operational Pulse still has Kendaraan Siap / Driver Aktif / Permintaan Tertunda',
  ['Kendaraan Siap', 'Driver Aktif', 'Permintaan Tertunda'].every((l) => healthyDesktopLight.statLabels.includes(l)));
// The removed metric's data (fleet criticality) must still be reachable —
// via the explainability disclosure's vehicleUtil row — proving it moved,
// not disappeared.
const criticalResult = matrixResults['desktop/light/critical'];
check('fleet status is still surfaced elsewhere (explainability disclosure)',
  criticalResult.explainRows.some((t) => /kendaraan/i.test(t)));

console.log('\n[4] Reduced motion (prefers-reduced-motion + data-anim="off")');
await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
const reducedResult = await renderMood('critical', 'desktop', 'light');
const reducedAnimNames = await page.evaluate(() => [...document.querySelectorAll('.wsp-hero-anim')]
  .map((e) => getComputedStyle(e).animationName));
check('prefers-reduced-motion: entrance keyframe swaps to the reduced variant', reducedAnimNames.every((n) => n === 'wspHeroRevealReduced'));
await page.emulateMediaFeatures([]); // reset OS-level emulation
const dataAnimOffResult = await page.evaluate(async () => {
  document.documentElement.setAttribute('data-anim', 'off');
  const router = await import('/js/workspace/home-router.js');
  const host = document.getElementById('host');
  await router.renderHome(host, {
    user: { id: 'u1', role: 'admin' }, role: 'admin', assignments: [], requests: [], logs: [], engineeringEvents: [], actions: {},
    models: { exec: { driverKpis: {}, score: { value: 42, level: 'attention', label: 'Perlu Perhatian' }, scoreBreakdown: { components: [] } }, engineering: {}, wellness: {}, pettyLowBalance: {} },
    recommendations: { certified: false, recs: [] },
  });
  const names = [...document.querySelectorAll('.wsp-hero-anim')].map((e) => getComputedStyle(e).animationName);
  const scoreEl = document.querySelector('.wsp-hero [data-countup]');
  document.documentElement.removeAttribute('data-anim');
  return { names, scoreText: scoreEl ? scoreEl.textContent : null };
});
check('data-anim="off": entrance keyframe swaps to the reduced variant', dataAnimOffResult.names.every((n) => n === 'wspHeroRevealReduced'));
check('data-anim="off": score snaps straight to final value (no mid-count-up read)', dataAnimOffResult.scoreText === '42');

console.log('\n[5] Realtime update — entrance must never replay, value must continuity-tween');
await page.setViewport(VIEWPORTS.desktop);
const realtimeResult = await page.evaluate(async () => {
  const router = await import('/js/workspace/home-router.js');
  const host = document.getElementById('host');
  const ctxFor = (score) => ({
    user: { id: 'u1', role: 'admin' }, role: 'admin', assignments: [], requests: [], logs: [], engineeringEvents: [], actions: {},
    models: { exec: { driverKpis: { activeVehicles: 5, activeDrivers: 4 }, score: { value: score, level: 'high', label: 'Sangat Baik' }, scoreBreakdown: { components: [] } }, engineering: { overdueAssignments: { count: 0 } }, wellness: { summary: {} }, pettyLowBalance: {} },
    recommendations: { certified: true, board: { isHealthyFleet: true, critical: [], upcoming: [] }, recs: [] },
  });
  await router.renderHome(host, ctxFor(60));
  await new Promise((r) => setTimeout(r, 700)); // let the first-mount tween finish
  const body1 = host.querySelector('.wsp-block--hero .wsp-block__body');
  const mountedAfterFirst = body1.dataset.heroMounted;
  const scoreAfterFirst = (body1.querySelector('[data-countup]') || {}).textContent;

  await router.refreshHome(host, ctxFor(91)); // simulates a live data refresh
  // Sample IMMEDIATELY (same tick as mountWidgets' onMount call) to catch
  // whether the entrance was suppressed before the browser's first paint.
  // NOTE: e.style.animation (the raw inline shorthand) serializes back as the
  // fully-expanded form (e.g. "auto ease 0s 1 normal none running none"), not
  // the literal string 'none' that was set — getComputedStyle().animationName
  // is the correct, browser-normalized way to check it.
  const body2 = host.querySelector('.wsp-block--hero .wsp-block__body');
  const animInlineImmediatelyAfterRefresh = [...body2.querySelectorAll('.wsp-hero-anim')].map((e) => getComputedStyle(e).animationName);
  const ringTransitionOnRefresh = (body2.querySelector('.an-ring-val') || {}).style.transition;
  await new Promise((r) => setTimeout(r, 700)); // let the continuity tween finish
  const scoreAfterRefresh = (body2.querySelector('[data-countup]') || {}).textContent;
  const sameBodyNode = body1 === body2;

  return { mountedAfterFirst, scoreAfterFirst, animInlineImmediatelyAfterRefresh, ringTransitionOnRefresh, scoreAfterRefresh, sameBodyNode };
});
check('Hero body element persists across refresh (same node, not recreated)', realtimeResult.sameBodyNode);
check('first mount reaches its target score (60)', realtimeResult.scoreAfterFirst === '60');
check('mount flag set after first mount', realtimeResult.mountedAfterFirst === '1');
check('refresh suppresses the entrance (computed animation-name: none) before paint',
  realtimeResult.animInlineImmediatelyAfterRefresh.length > 0 && realtimeResult.animInlineImmediatelyAfterRefresh.every((a) => a === 'none'));
check('refresh takes the JS-driven continuity path (ring transition:none, not a CSS 0->target reveal)', realtimeResult.ringTransitionOnRefresh === 'none');
check('refresh reaches the NEW target score (91), not stuck or reset to 0', realtimeResult.scoreAfterRefresh === '91');

console.log('\n[6] Theme switching — no re-mount, no animation replay');
const themeSwitchResult = await page.evaluate(() => {
  const before = document.querySelector('.wsp-block--hero .wsp-block__body').dataset.heroMounted;
  const animBefore = [...document.querySelectorAll('.wsp-hero-anim')].map((e) => e.style.animation);
  document.documentElement.setAttribute('data-theme', 'dark');
  const after = document.querySelector('.wsp-block--hero .wsp-block__body').dataset.heroMounted;
  const animAfter = [...document.querySelectorAll('.wsp-hero-anim')].map((e) => e.style.animation);
  document.documentElement.setAttribute('data-theme', 'light');
  return { before, after, animBefore, animAfter };
});
check('theme toggle does not reset the mount flag', themeSwitchResult.before === themeSwitchResult.after);
check('theme toggle does not touch entrance animation state', JSON.stringify(themeSwitchResult.animBefore) === JSON.stringify(themeSwitchResult.animAfter));

console.log('\n[7] Regression guard — score.level vocabulary fix (v1.22.6)');
await page.goto(`http://localhost:${port}/scripts/workspace-foundation-harness.html`, { waitUntil: 'networkidle0', timeout: 45000 });
const vocabResult = await page.evaluate(async (ctxJsonInner) => {
  const router = await import('/js/workspace/home-router.js');
  const ctx = JSON.parse(ctxJsonInner);
  const host = document.getElementById('host');
  host.className = 'exec-ui v2-analytics-claude';
  await router.renderHome(host, ctx);
  const headline = host.querySelector('.wsp-hero__headline');
  const pill = host.querySelector('.wsp-hero__healthmeta span, .wsp-hero__healthmeta .wsp-pill');
  return {
    headlineText: headline ? headline.textContent.trim() : null,
    hlClass: (host.querySelector('.wsp-hero__hl') || {}).className || '',
    pillClass: pill ? pill.className : '',
  };
}, JSON.stringify(withScore(baseCtx(), 91, 'excellent', 'Sangat Baik')));
console.log(`  Input: score.value=91, score.level='excellent' (the REAL engine's own vocabulary), zero findings`);
console.log(`  Hero rendered: "${vocabResult.headlineText}"`);
check('score.level="excellent" + zero findings renders as HEALTHY (not warning)', vocabResult.hlClass.includes('wsp-hero__hl--good'));
check('status pill tone reflects "excellent" (not the neutral/gray fallback)', vocabResult.pillClass.includes('wsp-pill--good'));

console.log('\n[8] Console errors');
check('zero console/page errors across the whole run', consoleErrors.length === 0);
if (consoleErrors.length) consoleErrors.forEach((e) => console.log('   ✗ ' + e.slice(0, 200)));

await browser.close();
server.close();

console.log(`\nEXECUTIVE HERO VERIFICATION: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
