/* executive-story-verification-check.mjs — Phase 5 (Executive Operational
   Story) mandatory browser verification. Serves the static app, loads the
   REAL Workspace layer (home-router.js -> exec-activity, "Hari Ini"
   rebuilt as a narrative, per the approved Design Review) in headless
   Chromium — no app.js boot, no mocked internals — across:

     • 3 approved reference viewports (Desktop 1440x900, Tablet 1194x834,
       Mobile 402x874) x 2 themes = 6 structural combos.
     • Grouping — a run of 3 identical actions collapses to ONE unheaded
       row (unchanged look); a run of 2+ DISTINCT actions in the same
       operational context becomes a narrative block (domain header +
       sub-list); a domain switch always breaks the run.
     • Disclosure — caps on total ACTIVITY count (5), not block count; a
       contiguous chronological prefix; exact copy "Lihat N aktivitas
       lainnya" per the Design Review.
     • Continuity across a realtime refresh — an already-open disclosure
       stays open (no silent re-collapse); already-seen rows are NOT
       replayed; only the genuinely NEW row eases in (Motion Language
       §07's REALTIME_TWEEN timing).
     • Reduced motion (prefers-reduced-motion + data-anim="off") — no
       animation is applied to the new row at all (no flash-to-invisible).
     • Keyboard — the disclosure toggle is a native <button>, Enter
       activates it.
     • Empty Story state, single/multiple narrative blocks.
     • Regression guard — sibling Executive sections untouched.

   Run: node scripts/executive-story-verification-check.mjs (exit 0 = pass) */

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

// ── Fixture builder — runs INSIDE the page so "today" uses the same
//    Date/timezone as the widget under test. 6 domain runs, in chronological
//    order, deliberately mixing pure repeats, mixed-action runs, and single
//    isolated events:
//      08:00-08:10  3x assignment_created (same action)      -> 1 line, no header
//      08:20        1x request_created (isolated)            -> 1 line, no header
//      08:30-08:35  assignment_started + assignment_completed -> 2-line block "Operasional Driver"
//      09:00-09:10  eng started + finished                    -> 2-line block "Teknik"
//      09:20        vehicle_deactivated (isolated)            -> 1 line, no header
//      09:30        request_approved (isolated)               -> 1 line, no header
//    Total activity count = 3+1+2+2+1+1 = 10. Cap(5): visible = [runA(3), l4(1)]
//    = 4 activities/2 blocks; rest = [runB(2), runC(2), l7(1), l8(1)] = 6 hidden.
const BUILD_CTX_FN = `(function buildCtx(extra) {
  const at = (h, m) => { const d = new Date(); d.setHours(h, m, 0, 0); return d.toISOString(); };
  const logs = [
    { id: 'l1', action: 'assignment_created', createdAt: at(8, 0), displayName: 'Admin A', metadata: { destination: 'Stadion' } },
    { id: 'l2', action: 'assignment_created', createdAt: at(8, 5), displayName: 'Admin A', metadata: { destination: 'Stadion' } },
    { id: 'l3', action: 'assignment_created', createdAt: at(8, 10), displayName: 'Admin A', metadata: { destination: 'Stadion' } },
    { id: 'l4', action: 'request_created', createdAt: at(8, 20), targetId: 'req1' },
    { id: 'l5', action: 'assignment_started', createdAt: at(8, 30), displayName: 'Driver B', metadata: { destination: 'Wisma' } },
    { id: 'l6', action: 'assignment_completed', createdAt: at(8, 35), metadata: { driver: 'Driver B', destination: 'Wisma' } },
    { id: 'l7', action: 'vehicle_deactivated', createdAt: at(9, 20), displayName: 'Admin A' },
    { id: 'l8', action: 'request_approved', createdAt: at(9, 30), targetId: 'req2' },
  ];
  const engineeringEvents = [
    { id: 'e1', type: 'started', timestamp: at(9, 0), assignmentId: 'eng1', assignmentTitle: 'Servis AC', actor: { name: 'Teknisi C' } },
    { id: 'e2', type: 'finished', timestamp: at(9, 10), assignmentId: 'eng1', assignmentTitle: 'Servis AC', actor: { name: 'Teknisi C' } },
  ];
  if (extra) { logs.push(extra.log); }
  return {
    user: { id: 'u1', name: 'Uji Coba', role: 'admin' }, role: 'admin',
    assignments: [], requests: [
      { id: 'req1', requesterName: 'Bidang Sarpras', status: 'pending' },
      { id: 'req2', requesterName: 'Bidang Umum', status: 'approved' },
    ],
    logs, engineeringEvents,
    actions: {},
    models: {
      exec: { driverKpis: { activeVehicles: 5, activeDrivers: 4 }, score: { value: 91, level: 'excellent', label: 'Sangat Baik' }, scoreBreakdown: { components: [] } },
      engineering: { overdueAssignments: { count: 0 } },
      wellness: { summary: { burnoutRisk: 0, highFatigue: 0 } },
      pettyLowBalance: { low: false },
    },
    recommendations: { certified: true, board: { isHealthyFleet: true, critical: [], upcoming: [] }, recs: [] },
  };
})`;

const EMPTY_CTX_FN = `(function buildEmptyCtx() {
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
})`;

async function readStory() {
  return page.evaluate(() => {
    const section = document.querySelector('[data-widget-id="exec-activity"]');
    const q = (s) => section && section.querySelector(s);
    const qa = (s) => section ? [...section.querySelectorAll(s)] : [];
    const topLevel = qa('.wsp-feed__list > [data-story-key], .wsp-feed__more > [data-story-key]');
    return {
      hasSection: !!section,
      hasFeed: !!q('.wsp-feed'),
      hasEmpty: !!q('.wsp-empty'),
      emptyText: (q('.wsp-empty') || {}).textContent || null,
      visibleRows: qa('.wsp-feed__list > .wsp-feed__row').length,
      visibleBlocks: qa('.wsp-feed__list > .wsp-feed__block').length,
      hiddenRows: qa('.wsp-feed__more > .wsp-feed__row').length,
      hiddenBlocks: qa('.wsp-feed__more > .wsp-feed__block').length,
      blockLabels: qa('.wsp-feed__block-label').map((el) => el.textContent.trim()),
      firstVisibleSentence: (q('.wsp-feed__list .wsp-feed__row .wsp-feed__sentence') || {}).textContent || null,
      subrowSentences: qa('.wsp-feed__subrow-sentence').map((el) => el.textContent.trim()),
      toggleText: (q('[data-feed-toggle]') || {}).textContent || null,
      toggleAriaExpanded: (q('[data-feed-toggle]') || {}).getAttribute ? q('[data-feed-toggle]').getAttribute('aria-expanded') : null,
      moreOpen: q('[data-feed-more]') ? q('[data-feed-more]').classList.contains('wsp-feed__more--open') : null,
      hasToggle: !!q('[data-feed-toggle]'),
      listRole: q('.wsp-feed__list') ? q('.wsp-feed__list').getAttribute('role') : null,
      moreRole: q('[data-feed-more]') ? q('[data-feed-more]').getAttribute('role') : null,
      toggleIsButton: q('[data-feed-toggle]') ? q('[data-feed-toggle]').tagName === 'BUTTON' : null,
      scrollWidthOverflow: document.documentElement.scrollWidth > window.innerWidth + 2,
      totalKeys: topLevel.length,
    };
  });
}

async function render(viewportKey, theme, buildFn = BUILD_CTX_FN, extra = null) {
  await page.setViewport(VIEWPORTS[viewportKey]);
  await page.goto(`http://localhost:${port}/scripts/workspace-foundation-harness.html`, { waitUntil: 'networkidle0', timeout: 45000 });
  await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
  await page.evaluate(async (buildCtxSrc, extraArg) => {
    const router = await import('/js/workspace/home-router.js');
    const buildCtx = eval(buildCtxSrc);
    const host = document.getElementById('host');
    host.className = 'exec-ui v2-analytics-claude';
    window.__ctx = buildCtx(extraArg);
    await router.renderHome(host, window.__ctx);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }, buildFn, extra);
  return readStory();
}

console.log('\n[1] Structural matrix — 3 viewports x 2 themes');
const THEMES = ['light', 'dark'];
const matrixResults = {};
for (const vp of Object.keys(VIEWPORTS)) {
  for (const theme of THEMES) {
    const key = `${vp}/${theme}`;
    const r = await render(vp, theme);
    matrixResults[key] = r;
    check(`${key}: Story section renders`, r.hasSection);
    check(`${key}: no horizontal overflow`, !r.scrollWidthOverflow);
  }
}

const base = matrixResults['desktop/light'];

console.log('\n[2] Grouping — pure repeat run collapses to ONE unheaded row');
check('visible area has 2 flat rows (run of 3 identical actions -> 1 row, isolated request -> 1 row)', base.visibleRows === 2);
check('visible area has 0 headed blocks (neither visible run mixes distinct actions)', base.visibleBlocks === 0);
check('first visible sentence is the 3x aggregate, not 3 repeated lines', base.firstVisibleSentence === '3 penugasan baru dibuat.');

console.log('\n[3] Grouping — a run of 2+ distinct actions in the same context becomes a narrative block');
check('hidden area has 2 headed blocks (Operasional Driver run + Teknik run)', base.hiddenBlocks === 2);
check('hidden area has 2 flat rows (vehicle + request, each isolated)', base.hiddenRows === 2);
check('block domain labels are exactly "Operasional Driver" and "Teknik" (natural language, not raw action names)', JSON.stringify(base.blockLabels) === JSON.stringify(['Operasional Driver', 'Teknik']));
check('no raw CRUD/action-name wording leaks into any block label', base.blockLabels.every((l) => !/_/.test(l)));
check('sub-rows read as natural sentences (4 total: 2 driver + 2 engineering)', base.subrowSentences.length === 4 && base.subrowSentences.every((s) => /[a-z]/i.test(s) && !/_/.test(s)));

console.log('\n[4] Disclosure — caps on total ACTIVITY count (5), not block count; exact copy');
check('toggle present (10 total activities > cap of 5)', base.hasToggle);
check('toggle copy is exactly "Lihat 6 aktivitas lainnya" (6 hidden activities: 2+2+1+1)', base.toggleText === 'Lihat 6 aktivitas lainnya');
check('toggle collapsed by default (aria-expanded=false)', base.toggleAriaExpanded === 'false');
check('hidden group starts closed (no wsp-feed__more--open)', base.moreOpen === false);
check('total DOM nodes = 6 blocks (2 flat rows visible + 2 flat rows hidden + 2 headed blocks hidden)', base.totalKeys === 6);

console.log('\n[5] Click-to-expand disclosure');
await page.click('[data-widget-id="exec-activity"] [data-feed-toggle]');
await new Promise((r) => setTimeout(r, 200));
let expanded = await page.evaluate(() => {
  const t = document.querySelector('[data-widget-id="exec-activity"] [data-feed-toggle]');
  const m = document.querySelector('[data-widget-id="exec-activity"] [data-feed-more]');
  return { text: t.textContent, aria: t.getAttribute('aria-expanded'), open: m.classList.contains('wsp-feed__more--open') };
});
check('clicking the toggle opens the disclosure', expanded.open);
check('aria-expanded flips to true', expanded.aria === 'true');
check('collapse label reads "Sembunyikan"', expanded.text === 'Sembunyikan');

console.log('\n[6] Keyboard — toggle is a native <button>, Enter activates it');
check('toggle element is a native <button>', base.toggleIsButton);
await render('desktop', 'light');
await page.focus('[data-widget-id="exec-activity"] [data-feed-toggle]');
await page.keyboard.press('Enter');
await new Promise((r) => setTimeout(r, 200));
const kbOpen = await page.evaluate(() => document.querySelector('[data-widget-id="exec-activity"] [data-feed-more]').classList.contains('wsp-feed__more--open'));
check('Enter on the focused toggle opens the disclosure', kbOpen);

console.log('\n[7] Continuity across a realtime refresh — open state persists, no silent re-collapse');
await render('desktop', 'light');
await page.click('[data-widget-id="exec-activity"] [data-feed-toggle]');
await new Promise((r) => setTimeout(r, 200));
const continuity = await page.evaluate(async (buildCtxSrc) => {
  const router = await import('/js/workspace/home-router.js');
  const buildCtx = eval(buildCtxSrc);
  const host = document.getElementById('host');
  const at = (h, m) => { const d = new Date(); d.setHours(h, m, 0, 0); return d.toISOString(); };
  const nextCtx = buildCtx({ log: { id: 'l9', action: 'assignment_started', createdAt: at(9, 40), displayName: 'Driver D', metadata: { destination: 'Bandara' } } });
  await router.refreshHome(host, nextCtx);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const section = host.querySelector('[data-widget-id="exec-activity"]');
  const more = section.querySelector('[data-feed-more]');
  const toggle = section.querySelector('[data-feed-toggle]');
  return {
    stillOpen: more.classList.contains('wsp-feed__more--open'),
    toggleText: toggle.textContent,
    newHiddenCount: toggle.dataset.feedHiddenCount,
  };
}, BUILD_CTX_FN);
check('after a realtime refresh, a previously-opened disclosure stays open', continuity.stillOpen);
check('the hidden count updates to reflect the new activity (7, was 6)', continuity.newHiddenCount === '7');

console.log('\n[8] Realtime append — only the NEW row animates, existing rows are untouched (never replay the whole Story)');
const appendMotion = await page.evaluate(async (buildCtxSrc) => {
  const router = await import('/js/workspace/home-router.js');
  const buildCtx = eval(buildCtxSrc);
  const host = document.getElementById('host');
  host.className = 'exec-ui v2-analytics-claude';
  await router.renderHome(host, buildCtx());
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const before = [...host.querySelectorAll('[data-story-key]')].map((el) => el.dataset.storyKey);

  const at = (h, m) => { const d = new Date(); d.setHours(h, m, 0, 0); return d.toISOString(); };
  const nextCtx = buildCtx({ log: { id: 'l9', action: 'assignment_started', createdAt: at(9, 40), displayName: 'Driver D', metadata: { destination: 'Bandara' } } });
  await router.refreshHome(host, nextCtx);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  await new Promise((r) => setTimeout(r, 50));

  const nodes = [...host.querySelectorAll('[data-story-key]')];
  const newNode = nodes.find((el) => !before.includes(el.dataset.storyKey));
  const oldNode = nodes.find((el) => before.includes(el.dataset.storyKey));
  const midTransitionOpacity = newNode ? getComputedStyle(newNode).opacity : null;
  // Let the 560ms REALTIME_TWEEN transition actually finish before reading
  // the settled value — the assertion is "ends at 1", not "is 1 at 50ms".
  await new Promise((r) => setTimeout(r, 700));
  return {
    newNodeFound: !!newNode,
    newNodeAnimated: newNode ? (newNode.style.transition || '').includes('ms') : false,
    newNodeFinalOpacity: newNode ? getComputedStyle(newNode).opacity : null,
    oldNodeUntouched: oldNode ? oldNode.style.transition === '' : false,
  };
}, BUILD_CTX_FN);
check('a new activity produces exactly one new story key', appendMotion.newNodeFound);
check('the new row/sub-row receives its own transition (append motion), matching Motion Language §07 timing', appendMotion.newNodeAnimated);
check('the new row ends fully visible (opacity settles to 1)', appendMotion.newNodeFinalOpacity === '1');
check('a pre-existing row is left with no inline transition (never replayed)', appendMotion.oldNodeUntouched);

console.log('\n[9] Reduced motion — prefers-reduced-motion: no animation applied to the new row');
await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
const reducedMotion = await page.evaluate(async (buildCtxSrc) => {
  const router = await import('/js/workspace/home-router.js');
  const buildCtx = eval(buildCtxSrc);
  const host = document.getElementById('host');
  host.className = 'exec-ui v2-analytics-claude';
  await router.renderHome(host, buildCtx());
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const before = [...host.querySelectorAll('[data-story-key]')].map((el) => el.dataset.storyKey);
  const at = (h, m) => { const d = new Date(); d.setHours(h, m, 0, 0); return d.toISOString(); };
  const nextCtx = buildCtx({ log: { id: 'l9', action: 'assignment_started', createdAt: at(9, 40) } });
  await router.refreshHome(host, nextCtx);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const nodes = [...host.querySelectorAll('[data-story-key]')];
  const newNode = nodes.find((el) => !before.includes(el.dataset.storyKey));
  return { newNodeTransition: newNode ? newNode.style.transition : null, newNodeOpacity: newNode ? getComputedStyle(newNode).opacity : null };
}, BUILD_CTX_FN);
check('reduced motion: the new row gets no inline transition at all', !reducedMotion.newNodeTransition);
check('reduced motion: the new row is immediately fully visible (no fade-from-zero)', reducedMotion.newNodeOpacity === '1');
await page.emulateMediaFeatures([]);

console.log('\n[10] data-anim="off" — same contract as reduced motion');
const dataAnimOff = await page.evaluate(async (buildCtxSrc) => {
  document.documentElement.setAttribute('data-anim', 'off');
  const router = await import('/js/workspace/home-router.js');
  const buildCtx = eval(buildCtxSrc);
  const host = document.getElementById('host');
  host.className = 'exec-ui v2-analytics-claude';
  await router.renderHome(host, buildCtx());
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const before = [...host.querySelectorAll('[data-story-key]')].map((el) => el.dataset.storyKey);
  const at = (h, m) => { const d = new Date(); d.setHours(h, m, 0, 0); return d.toISOString(); };
  const nextCtx = buildCtx({ log: { id: 'l9', action: 'assignment_started', createdAt: at(9, 40) } });
  await router.refreshHome(host, nextCtx);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const nodes = [...host.querySelectorAll('[data-story-key]')];
  const newNode = nodes.find((el) => !before.includes(el.dataset.storyKey));
  document.documentElement.removeAttribute('data-anim');
  return { newNodeTransition: newNode ? newNode.style.transition : null };
}, BUILD_CTX_FN);
check('data-anim="off": the new row gets no inline transition either', !dataAnimOff.newNodeTransition);

console.log('\n[11] Empty Story state');
const emptyResult = await render('desktop', 'light', EMPTY_CTX_FN);
check('empty state renders the quiet placeholder, not a blank card', emptyResult.hasEmpty);
check('empty state copy is the existing, unfabricated sentence', (emptyResult.emptyText || '').includes('Belum ada aktivitas'));
check('empty state does not render a .wsp-feed at all', !emptyResult.hasFeed);

console.log('\n[12] Accessibility — native list semantics + tablist-free toggle');
check('visible list has role="list"', base.listRole === 'list');
check('hidden group has role="list"', base.moreRole === 'list');

console.log('\n[13] Regression guard — sibling Executive sections untouched');
const siblingResult = await page.evaluate(async (buildCtxSrc) => {
  const router = await import('/js/workspace/home-router.js');
  const buildCtx = eval(buildCtxSrc);
  const host = document.getElementById('host');
  await router.renderHome(host, buildCtx());
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  return {
    heroPresent: !!host.querySelector('[data-widget-id="exec-hero"] .wsp-hero'),
    attentionPresent: !!host.querySelector('[data-widget-id="exec-attention"]'),
    decisionGone: !host.querySelector('[data-widget-id="exec-decision"]'),
    recommendationPresent: !!host.querySelector('[data-widget-id="exec-recommendation"]'),
    snapshotPresent: !!host.querySelector('[data-widget-id="exec-snapshot"] [data-wsp-segmented]'),
  };
}, BUILD_CTX_FN);
check('exec-hero still renders (untouched)', siblingResult.heroPresent);
check('exec-attention still renders (untouched)', siblingResult.attentionPresent);
// Phase 7C (Executive Consolidation) — exec-decision was intentionally removed.
check('exec-decision is gone (removed per Phase 7C consolidation)', siblingResult.decisionGone);
check('exec-recommendation still renders (untouched)', siblingResult.recommendationPresent);
check('exec-snapshot still renders its segmented control (untouched)', siblingResult.snapshotPresent);

console.log('\n[14] Representative screenshots (scratch/story-*.png)');
async function shot(vp, theme, tag = '') {
  await render(vp, theme);
  await new Promise((r) => setTimeout(r, 200));
  const name = `story-${vp}-${theme}${tag}.png`;
  await page.screenshot({ path: path.join(SHOTS, name) });
  console.log(`  📸 scratch/${name}`);
}
await shot('desktop', 'light');
await shot('desktop', 'dark');
await shot('tablet', 'light');
await shot('mobile', 'light');
await shot('mobile', 'dark');

console.log('\n[15] Console errors');
check('zero console/page errors across the whole run', consoleErrors.length === 0);
if (consoleErrors.length) consoleErrors.forEach((e) => console.log('   ✗ ' + e.slice(0, 200)));

await browser.close();
server.close();

console.log(`\nEXECUTIVE OPERATIONAL STORY VERIFICATION: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
