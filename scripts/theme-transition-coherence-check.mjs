/* theme-transition-coherence-check.mjs — v1.31.4 R5.

   Two independent root causes made the light/dark transition look choppy:

   1) PRIMARY path (modern browsers — js/app.js#applyTheme() calls
      document.startViewTransition(() => applyThemeState(theme)), touching
      only the data-theme attribute; no .theme-anim class involved at all
      on this path). agenda-styles.js's named element carried an
      UNCONDITIONAL view-transition-name, meant only for its own
      Month<->Week toggle (agenda-workspace.js#doRenderWithViewTransition()).
      A named view-transition group is captured by ANY startViewTransition()
      call anywhere in the document, so the calendar card was pulled out of
      the theme toggle's whole-viewport crossfade into its own independent
      140-180ms scale animation — visibly out of step with everything else,
      which just crossfades as one image. Fixed: the name is now active
      ONLY while <html> carries .cal-viewtransition-active, which only the
      calendar's own transition ever sets. (SS9.1 R4 additionally
      retargeted the named element itself from .cal-calview-region — which
      also wrapped the Bulan/Minggu chips, nav, and Day Detail, all of
      which animated along with it — to .cal-grid alone, so only the
      actual date grid ever gets pulled out of the theme crossfade.)

   2) FALLBACK path (browsers without View Transitions support, or
      prefers-reduced-motion/data-anim="off" — .theme-anim class +
      platform.css duration rules). A curated container list (topbar, rail,
      surface cards, ...) had drifted to its own duration (280ms/200ms)
      independent of the universal html.theme-anim * rule (.32s/.26s), so a
      curated element and an uncurated one settled ~40-60ms apart. Fixed:
      both rules now reference shared --theme-fade-duration/
      --theme-border-duration custom properties — one source of truth.

   This is a focused CSS-contract test: real platform.css + the real
   agenda-styles.js style injector, a bare-bones DOM (no login/Firebase
   needed — the rules key purely on class/attribute presence), real
   Chromium View Transitions API.

   Run: node scripts/theme-transition-coherence-check.mjs   (exit 0 = pass)
*/

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

/* ── Static contract: no more independently-hardcoded duplicate durations ── */
console.log('\n[0 — static: shared token contract in platform.css]');
const platformCss = fs.readFileSync(path.join(ROOT, 'platform.css'), 'utf-8');
check('defines --theme-fade-duration and --theme-border-duration on :root',
  /--theme-fade-duration:\s*280ms/.test(platformCss) && /--theme-border-duration:\s*200ms/.test(platformCss));
check('the universal html.theme-anim * rule references var(--theme-fade-duration) / var(--theme-border-duration)',
  /html\.theme-anim \*[\s\S]{0,400}var\(--theme-fade-duration\)[\s\S]{0,200}var\(--theme-border-duration\)/.test(platformCss));
check('the curated Part D rule (…domshell-rail-logo { … }) references the SAME tokens, not its own hardcoded 280ms/200ms',
  /\.theme-anim \.domshell-rail-logo \{[\s\S]{0,200}var\(--theme-fade-duration\)[\s\S]{0,200}var\(--theme-border-duration\)/.test(platformCss)
  && !/background-color 280ms ease/.test(platformCss));

const HARNESS = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="/platform.css">
</head>
<body>
  <div class="domshell-rail" id="rail">rail</div>
  <div class="v2-surface-card" id="curatedCard">curated card</div>
  <div id="plain">plain, not in the curated list at all</div>
  <div class="cal-calview-region" id="calRegion">calendar region
    <div class="cal-grid" id="calGrid">calendar grid</div>
  </div>
<script type="module">
  import { injectAgendaStyles } from '/js/agenda/agenda-styles.js';
  injectAgendaStyles();
  window.__durationFor = (el, prop) => {
    const cs = getComputedStyle(el);
    const props = cs.transitionProperty.split(',').map(s => s.trim());
    const durs = cs.transitionDuration.split(',').map(s => s.trim());
    const i = props.indexOf(prop);
    return i === -1 ? null : durs[i];
  };
  window.__ready = true;
</script>
</body></html>`;

const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  if (u === '/' || u === '/harness') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(HARNESS); return; }
  const file = path.join(ROOT, u);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const errors = [];
const page = await browser.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
await page.setViewport({ width: 1280, height: 900 });
await page.goto(`http://localhost:${port}/harness`, { waitUntil: 'networkidle0', timeout: 45000 });
await page.waitForFunction(() => window.__ready === true, { timeout: 10000 });

const supportsViewTransitions = await page.evaluate(() => typeof document.startViewTransition === 'function');

if (supportsViewTransitions) {
  /* ── PRIMARY path: an unrelated view-transition (simulating the real
     theme toggle, which only ever sets data-theme) must NOT capture the
     calendar GRID as an independent named group. SS9.1 R4 retargeted the
     named element from .cal-calview-region to .cal-grid (the region also
     wrapped chips/nav/Day Detail, which should stay static — narrowed to
     just the grid). ── */
  console.log('\n[1 — PRIMARY: an unrelated startViewTransition() (theme toggle shape) does not hijack the calendar grid]');
  const leaked = await page.evaluate(async () => {
    const t = document.startViewTransition(() => { document.documentElement.setAttribute('data-theme', 'dark'); });
    await t.ready;
    const anims = document.getAnimations();
    const hit = anims.some((a) => String(a.effect?.pseudoElement || '').includes('cal-grid'));
    await t.finished;
    return hit;
  });
  check('no animation targets a ::view-transition-*(cal-grid) pseudo-element during an unrelated (theme-shaped) transition', !leaked, leaked);

  console.log('\n[2 — the calendar GRID STILL gets its own named transition for its OWN Month<->Week toggle]');
  const scoped = await page.evaluate(async () => {
    document.documentElement.classList.add('cal-viewtransition-active');
    const t = document.startViewTransition(() => {});
    await t.ready;
    const anims = document.getAnimations();
    const hit = anims.some((a) => String(a.effect?.pseudoElement || '').includes('cal-grid'));
    await t.finished;
    document.documentElement.classList.remove('cal-viewtransition-active');
    return hit;
  });
  check('an animation DOES target ::view-transition-*(cal-grid) while .cal-viewtransition-active is set (the real mechanism still works)', scoped, scoped);

  // SS9.1 R4 — the narrowed boundary's whole point: .cal-calview-region
  // (chips/nav/Day Detail's wrapper) must NEVER be independently named,
  // even during the calendar's own active transition — proving those
  // regions really do stay in the transition's default root crossfade
  // instead of animating along with the grid.
  console.log('\n[2b — .cal-calview-region (chips/nav/Day Detail wrapper) is never independently named, even during the active transition]');
  const regionLeaked = await page.evaluate(async () => {
    document.documentElement.classList.add('cal-viewtransition-active');
    const t = document.startViewTransition(() => {});
    await t.ready;
    const anims = document.getAnimations();
    const hit = anims.some((a) => String(a.effect?.pseudoElement || '').includes('cal-calview-region'));
    await t.finished;
    document.documentElement.classList.remove('cal-viewtransition-active');
    return hit;
  });
  check('no animation targets a ::view-transition-*(cal-calview-region) pseudo-element, even while .cal-viewtransition-active is set', !regionLeaked, regionLeaked);
} else {
  console.log('\n[1-2 — SKIPPED: this Chromium build has no View Transitions API]');
}

/* ── FALLBACK path: curated vs. uncurated elements settle in sync ── */
console.log('\n[3 — FALLBACK: curated (.domshell-rail) and uncurated (#plain) elements share the same background-color duration under .theme-anim]');
await page.evaluate(() => document.documentElement.classList.add('theme-anim'));
const durations = await page.evaluate(() => ({
  rail: window.__durationFor(document.getElementById('rail'), 'background-color'),
  card: window.__durationFor(document.getElementById('curatedCard'), 'background-color'),
  plain: window.__durationFor(document.getElementById('plain'), 'background-color'),
  railBorder: window.__durationFor(document.getElementById('rail'), 'border-color'),
  plainBorder: window.__durationFor(document.getElementById('plain'), 'border-color'),
}));
check('curated .domshell-rail background-color duration is 0.28s', durations.rail === '0.28s', durations);
check('curated .v2-surface-card background-color duration matches the rail (no more per-element drift)', durations.card === durations.rail, durations);
check('UNCURATED #plain element background-color duration ALSO matches (280ms everywhere now, not just the curated list)', durations.plain === durations.rail, durations);
check('border-color duration (200ms) also matches between curated and uncurated elements', durations.railBorder === durations.plainBorder && durations.railBorder === '0.2s', durations);
await page.evaluate(() => document.documentElement.classList.remove('theme-anim'));

console.log('\n[4 — reduced motion still zeroes the fallback transition for everyone]');
await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
await page.evaluate(() => document.documentElement.classList.add('theme-anim'));
const reducedDurations = await page.evaluate(() => ({
  rail: window.__durationFor(document.getElementById('rail'), 'background-color'),
  plain: window.__durationFor(document.getElementById('plain'), 'background-color'),
}));
check('reduced motion: curated element transition is none/0s', reducedDurations.rail === '0s' || reducedDurations.rail === null, reducedDurations);
check('reduced motion: uncurated element transition is also none/0s', reducedDurations.plain === '0s' || reducedDurations.plain === null, reducedDurations);
await page.evaluate(() => document.documentElement.classList.remove('theme-anim'));

console.log('\n[5 — console cleanliness]');
check('zero console/page errors across the whole run', errors.length === 0, errors.join(' | '));

await browser.close();
server.close();
console.log(`\ntheme-transition-coherence-check: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
