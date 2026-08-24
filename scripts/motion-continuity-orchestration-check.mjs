/* motion-continuity-orchestration-check.mjs — Design System Program Phase 8.6
   Real-browser verification of the Home re-navigation entrance-replay fix
   (js/app.js's renderHomeWorkspace(), js/workspace/home-router.js's
   renderHome()) — the flagship finding of this phase's motion audit: every
   navigation into Home previously forced a full host.innerHTML rebuild
   (renderShell()), destroying the Hero's `heroMounted` persistence flag and
   replaying the entire MACRO_STAGGER page cascade + Hero MICRO_STAGGER +
   count-ups on every visit, not just the first.

   Unlike Phase 8.5's harness, this imports the REAL renderHome()/
   resolveWorkspaceForRole()/widget-registry modules directly (they have real
   exports, unlike js/app.js) against workspace-foundation-check.mjs's
   existing bare harness (no app.js boot, no Firebase) — unauthenticated,
   safe, same pattern already used by that script.
   Run: node scripts/motion-continuity-orchestration-check.mjs (exit 0 = pass) */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); if (detail !== undefined) console.log('     • ' + String(detail).slice(0, 300)); }
};

const server = http.createServer((req, res) => {
  if (req.url === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const URL_ = `http://localhost:${port}/scripts/workspace-foundation-harness.html`;

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });

async function freshPage() {
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push('console.error: ' + m.text()); });
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  await page.goto(URL_, { waitUntil: 'networkidle0', timeout: 45000 });
  return { page, consoleErrors };
}

const fakeCtxSrc = `
  function fakeCtx(role, seed) {
    return {
      user: { id: 'u1', name: 'Uji Coba', role }, role,
      assignments: [], myAssignments: [], requests: [], myRequests: [], logs: [],
      // Hero degrades safely to a "no data" state when models is null (established
      // No-Data=null semantics) — enough to exercise mount/unmount identity without
      // needing a real Health Score computation.
      models: null,
      vehicles: [], actions: {},
      __seed: seed,
    };
  }
`;

/* ── 1. THE BUG, reproduced as a control (both calls use default skeleton — the pre-fix call pattern) ── */
console.log('\n[1. control — pre-fix pattern: Hero identity is LOST across two renderHome() calls]');
{
  const { page, consoleErrors } = await freshPage();
  const result = await page.evaluate(async (fakeCtxSrc) => {
    eval(fakeCtxSrc);
    const { renderHome } = await import('/js/workspace/home-router.js');
    const host = document.getElementById('host');
    await renderHome(host, fakeCtx('admin', 1)); // 1st nav-in: legitimately full (first mount)
    const heroBefore = host.querySelector('[data-widget-id="exec-hero"] .wsp-card__body, [data-widget-id="exec-hero"] .wsp-block__body');
    if (heroBefore) heroBefore.dataset.__testMarker = 'first-mount';
    await renderHome(host, fakeCtx('admin', 2)); // 2nd nav-in, OLD call pattern (no {skeleton:false})
    const heroAfter = host.querySelector('[data-widget-id="exec-hero"] .wsp-card__body, [data-widget-id="exec-hero"] .wsp-block__body');
    return {
      heroFoundBefore: !!heroBefore,
      heroFoundAfter: !!heroAfter,
      sameNode: !!heroBefore && heroBefore === heroAfter,
      markerSurvived: heroAfter?.dataset.__testMarker === 'first-mount',
    };
  }, fakeCtxSrc);
  check('(control) Hero widget renders on first mount', result.heroFoundBefore);
  check('(control) confirms the bug: old call pattern LOSES Hero node identity on re-navigation', result.sameNode === false, JSON.stringify(result));
  check('no console/page errors', consoleErrors.length === 0, consoleErrors.join('; '));
  await page.close();
}

/* ── 2. THE FIX — real renderHomeWorkspace() call pattern (2nd call passes {skeleton:false}) ── */
console.log('\n[2. fix verified — Hero node identity + entrance-suppression persist across re-navigation]');
{
  const { page, consoleErrors } = await freshPage();
  const result = await page.evaluate(async (fakeCtxSrc) => {
    eval(fakeCtxSrc);
    const { renderHome } = await import('/js/workspace/home-router.js');
    const host = document.getElementById('host');
    await renderHome(host, fakeCtx('admin', 1)); // 1st nav-in (legitimately full — no bug here)
    const heroBefore = host.querySelector('[data-widget-id="exec-hero"] .wsp-card__body, [data-widget-id="exec-hero"] .wsp-block__body');
    const heroMountedBefore = heroBefore?.dataset.heroMounted;
    if (heroBefore) heroBefore.dataset.__testMarker = 'first-mount';

    await renderHome(host, fakeCtx('admin', 2), { skeleton: false }); // 2nd nav-in — the ACTUAL fixed call pattern (app.js renderHomeWorkspace())
    const heroAfter = host.querySelector('[data-widget-id="exec-hero"] .wsp-card__body, [data-widget-id="exec-hero"] .wsp-block__body');
    return {
      heroFoundBefore: !!heroBefore,
      heroMountedBefore,
      sameNode: !!heroBefore && heroBefore === heroAfter,
      markerSurvived: heroAfter?.dataset.__testMarker === 'first-mount',
      heroMountedAfter: heroAfter?.dataset.heroMounted,
      // .wsp-hero-anim entrance elements should carry style.animation:'none' on
      // this 2nd call — mountHeroMotion() suppresses them synchronously when
      // alreadyMounted is true, BEFORE the browser gets a chance to paint the
      // fresh animation, so this element-level check plus the node-identity
      // check together are the real proof (not just an inference).
      // .style.animation (the shorthand) serializes back out to the full
      // canonical form ("auto ease 0s 1 normal none running none"), not the
      // literal string assigned — check the animation-name longhand instead.
      animEls: Array.from(host.querySelectorAll('.wsp-hero-anim')).map(el => el.style.animationName),
    };
  }, fakeCtxSrc);
  check('Hero widget renders on first mount', result.heroFoundBefore);
  check('first mount sets heroMounted=1', result.heroMountedBefore === '1', result.heroMountedBefore);
  check('FIX: Hero node identity SURVIVES re-navigation (no full rebuild)', result.sameNode === true, JSON.stringify(result));
  check('FIX: custom marker on the node survived (same DOM node, not a lookalike)', result.markerSurvived === true);
  check('FIX: heroMounted flag still 1 after re-navigation (never reset)', result.heroMountedAfter === '1', result.heroMountedAfter);
  check('FIX: entrance-animated elements have animation suppressed on re-navigation', result.animEls.length > 0 && result.animEls.every(a => a === 'none'), JSON.stringify(result.animEls));
  check('no console/page errors', consoleErrors.length === 0, consoleErrors.join('; '));
  await page.close();
}

/* ── 3. Content freshness is NOT sacrificed — widget body still updates on re-navigation ── */
console.log('\n[3. widget content still refreshes on re-navigation despite the shell being reused]');
{
  const { page, consoleErrors } = await freshPage();
  const result = await page.evaluate(async (fakeCtxSrc) => {
    eval(fakeCtxSrc);
    const { renderHome } = await import('/js/workspace/home-router.js');
    const host = document.getElementById('host');
    const ctxA = fakeCtx('admin', 1);
    ctxA.assignments = [{ id: 'a1', driverName: 'Driver Satu' }];
    await renderHome(host, ctxA);
    const bodyBefore = host.querySelector('[data-widget-id="exec-hero"]')?.outerHTML || '';

    const ctxB = fakeCtx('admin', 2);
    ctxB.assignments = [{ id: 'a1', driverName: 'Driver Satu' }, { id: 'a2', driverName: 'Driver Dua' }];
    await renderHome(host, ctxB, { skeleton: false });
    const cardAfter = host.querySelector('[data-widget-id="exec-hero"]');
    return {
      cardExists: !!cardAfter,
      // A real content check: mountWidgets() must still have run and written
      // fresh HTML into the body even though renderShell() was skipped.
      bodyChanged: (cardAfter?.outerHTML || '') !== bodyBefore,
    };
  }, fakeCtxSrc);
  check('widget card still exists after re-navigation', result.cardExists);
  check('widget content actually refreshed (mountWidgets still ran)', result.bodyChanged === true, JSON.stringify(result));
  check('no console/page errors', consoleErrors.length === 0, consoleErrors.join('; '));
  await page.close();
}

/* ── 4. Genuine identity change (role switch) still gets a full, correct rebuild ── */
console.log('\n[4. role switch still triggers a full shell rebuild (skeleton-first UX intact for the case that needs it)]');
{
  const { page, consoleErrors } = await freshPage();
  const result = await page.evaluate(async (fakeCtxSrc) => {
    eval(fakeCtxSrc);
    const { renderHome } = await import('/js/workspace/home-router.js');
    const host = document.getElementById('host');
    await renderHome(host, fakeCtx('admin', 1));
    const adminHeroExists = !!host.querySelector('[data-widget-id="exec-hero"]');
    // Role switch: admin -> bidang (a genuinely different workspace.id: executive -> request)
    await renderHome(host, fakeCtx('bidang', 2), { skeleton: false });
    return {
      adminHeroExists,
      heroGoneAfterSwitch: !host.querySelector('[data-widget-id="exec-hero"]'),
      requestWidgetsPresent: host.querySelectorAll('[data-widget-id^="req-"]').length > 0,
    };
  }, fakeCtxSrc);
  check('admin workspace (Executive/Hero) renders first', result.adminHeroExists);
  check('role switch correctly tears down the old workspace (Hero gone)', result.heroGoneAfterSwitch);
  check('role switch correctly builds the new workspace (Request widgets present)', result.requestWidgetsPresent, JSON.stringify(result));
  check('no console/page errors', consoleErrors.length === 0, consoleErrors.join('; '));
  await page.close();
}

/* ── 5. Reduced motion / [data-anim="off"] — entrance suppressed correctly regardless of the fix ── */
console.log('\n[5. reduced motion still yields immediate, correct state]');
{
  const { page, consoleErrors } = await freshPage();
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  const result = await page.evaluate(async (fakeCtxSrc) => {
    eval(fakeCtxSrc);
    const { renderHome } = await import('/js/workspace/home-router.js');
    const host = document.getElementById('host');
    await renderHome(host, fakeCtx('admin', 1));
    const animEls = Array.from(host.querySelectorAll('.wsp-hero-anim')).map(el => el.style.animationName);
    return { heroExists: !!host.querySelector('[data-widget-id="exec-hero"]'), animEls };
  }, fakeCtxSrc);
  check('Hero renders under reduced motion', result.heroExists);
  check('reduced motion suppresses entrance animation even on first mount', result.animEls.length > 0 && result.animEls.every(a => a === 'none'), JSON.stringify(result.animEls));
  check('no console/page errors', consoleErrors.length === 0, consoleErrors.join('; '));
  await page.close();
}

/* ── 6. No horizontal overflow / no console errors across viewports (harness-level sanity) ── */
console.log('\n[6. no horizontal overflow across viewports after the fix]');
{
  const viewports = [['mobile 375', 375, 812], ['mobile 430', 430, 932], ['tablet 1194', 1194, 834], ['desktop 1440', 1440, 900]];
  for (const [label, width, height] of viewports) {
    const { page, consoleErrors } = await freshPage();
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.evaluate(async (fakeCtxSrc) => {
      eval(fakeCtxSrc);
      const { renderHome } = await import('/js/workspace/home-router.js');
      const host = document.getElementById('host');
      await renderHome(host, fakeCtx('admin', 1));
      await renderHome(host, fakeCtx('admin', 2), { skeleton: false });
    }, fakeCtxSrc);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(`${label}: no horizontal overflow`, overflow <= 1, overflow);
    check(`${label}: no console/page errors`, consoleErrors.length === 0, consoleErrors.join('; '));
    await page.close();
  }
}

await browser.close();
server.close();

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
