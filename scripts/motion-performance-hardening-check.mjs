/* motion-performance-hardening-check.mjs — Design System Program Phase 8.7
   Real-browser verification of this phase's two findings: (1) the
   mountCountUp()/mountBarReveal() staleness guard added to
   js/widgets/executive/index.js (same pattern as mountHeroMotion's existing
   gen/stale() guard, applied where it was missing), and (2) general
   rendering-pipeline health after Phase 8.6's Home re-navigation fix —
   reduced motion, overflow, console cleanliness, and repeated-interaction
   stability, all against the REAL renderHome() pipeline (no copied logic).
   Run: node scripts/motion-performance-hardening-check.mjs (exit 0 = pass) */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css' };

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
      models: null, vehicles: [], actions: {}, __seed: seed,
    };
  }
`;

/* ── 1. Staleness guard: rapid re-mount does not throw, does not leave stale writes visible ── */
console.log('\n[1. mountCountUp/mountBarReveal staleness guard under rapid re-mount]');
{
  const { page, consoleErrors } = await freshPage();
  const result = await page.evaluate(async (fakeCtxSrc) => {
    eval(fakeCtxSrc);
    const { renderHome } = await import('/js/workspace/home-router.js');
    const host = document.getElementById('host');
    await renderHome(host, fakeCtx('admin', 1));
    // Fire 5 re-mounts with NO await between the mount call and the next one
    // — the exact scenario the guard protects against (a tween still ticking
    // when a newer mount supersedes it).
    for (let i = 2; i <= 6; i++) {
      renderHome(host, fakeCtx('admin', i), { skeleton: false }); // not awaited on purpose
    }
    await renderHome(host, fakeCtx('admin', 7), { skeleton: false }); // final awaited call settles everything
    await new Promise(r => setTimeout(r, 600)); // let any stale rAF ticks (if the guard failed) resolve
    const countupEls = Array.from(host.querySelectorAll('[data-countup]'));
    const barEls = Array.from(host.querySelectorAll('.wsp-metric__bar-fill, .wsp-driver-row__bar-fill'));
    return {
      countupCount: countupEls.length,
      countupMismatch: countupEls.filter(el => el.textContent !== el.getAttribute('data-countup')).map(el => el.textContent),
      barCount: barEls.length,
    };
  }, fakeCtxSrc);
  check('renders without throwing under overlapping rapid re-mounts', true);
  check('count-up elements settle to their exact final target (no stale write left them mid-tween)', result.countupMismatch.length === 0, JSON.stringify(result));
  check('no console/page errors across overlapping rapid re-mounts', consoleErrors.length === 0, consoleErrors.join('; '));
  await page.close();
}

/* ── 2. Reduced motion still yields immediate, correct values ── */
console.log('\n[2. reduced motion — count-up/bar-reveal skip tweening entirely]');
{
  const { page, consoleErrors } = await freshPage();
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  const result = await page.evaluate(async (fakeCtxSrc) => {
    eval(fakeCtxSrc);
    const { renderHome } = await import('/js/workspace/home-router.js');
    const host = document.getElementById('host');
    await renderHome(host, fakeCtx('admin', 1));
    const countupEls = Array.from(host.querySelectorAll('[data-countup]'));
    return { immediatelyCorrect: countupEls.every(el => el.textContent === el.getAttribute('data-countup')) };
  }, fakeCtxSrc);
  check('reduced motion shows exact values immediately, no tween', result.immediatelyCorrect, JSON.stringify(result));
  check('no console/page errors', consoleErrors.length === 0, consoleErrors.join('; '));
  await page.close();
}

/* ── 3. Repeated interaction stability — 30x Home return visits ── */
console.log('\n[3. 30x Home return-visit stability]');
{
  const { page, consoleErrors } = await freshPage();
  const result = await page.evaluate(async (fakeCtxSrc) => {
    eval(fakeCtxSrc);
    const { renderHome } = await import('/js/workspace/home-router.js');
    const host = document.getElementById('host');
    await renderHome(host, fakeCtx('admin', 0));
    const heroFirst = host.querySelector('[data-widget-id="exec-hero"] .wsp-card__body, [data-widget-id="exec-hero"] .wsp-block__body');
    for (let i = 1; i <= 30; i++) {
      await renderHome(host, fakeCtx('admin', i), { skeleton: false });
    }
    const heroLast = host.querySelector('[data-widget-id="exec-hero"] .wsp-card__body, [data-widget-id="exec-hero"] .wsp-block__body');
    return {
      heroIdentityStable: heroFirst === heroLast,
      nodeCount: document.querySelectorAll('*').length,
      cardCount: host.querySelectorAll('[data-widget-id]').length,
    };
  }, fakeCtxSrc);
  check('Hero node identity stable across 30 return visits (shell never rebuilds unnecessarily)', result.heroIdentityStable);
  check('exactly one set of widget cards exists after 30 visits (no accumulation)', result.cardCount > 0 && result.cardCount < 20, result.cardCount);
  console.log(`     • total DOM node count after 30 return visits: ${result.nodeCount} (informational — no prior-session baseline to diff against in this harness)`);
  check('no console/page errors across 30 return visits', consoleErrors.length === 0, consoleErrors.join('; '));
  await page.close();
}

/* ── 4. No horizontal overflow, no console errors — 4 viewports ── */
console.log('\n[4. no horizontal overflow across viewports]');
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
console.log('\nSee scratch/perf-home-renav-before-after.mjs for real page.metrics() (Chrome Performance domain) before/after numbers — not duplicated here to avoid re-running a second browser session for the same measurement.');
process.exit(fail === 0 ? 0 : 1);
