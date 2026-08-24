// Phase 8.1 — command palette: replay-restart fix, first-open-only stagger,
// [data-anim="off"] awareness. Real browser check against the real
// command-palette.js via a minimal harness (mock accessor functions only,
// no Firebase/auth — matches the module's own documented contract).
import puppeteer from 'puppeteer';
import http from 'http';
import { readFileSync } from 'fs';
import path from 'path';

const ROOT = process.cwd();
const server = http.createServer((req, res) => {
  if (req.url === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  const p = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(ROOT, p);
  try {
    const body = readFileSync(file);
    const ext = path.extname(file);
    const type = { '.css': 'text/css', '.html': 'text/html', '.js': 'application/javascript' }[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    res.end(body);
  } catch (e) {
    res.writeHead(404); res.end('not found');
  }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

let pass = 0, fail = 0;
function check(label, cond, extra = '') {
  if (cond) { pass++; console.log(`OK   ${label}${extra ? ' ' + extra : ''}`); }
  else { fail++; console.log(`FAIL ${label}${extra ? ' ' + extra : ''}`); }
}

const browser = await puppeteer.launch({ headless: 'new' });

async function freshPage() {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`http://localhost:${port}/scratch/command-palette-harness.html`, { waitUntil: 'load' });
  await page.waitForFunction('window.__paletteReady === true');
  return { page, errors };
}

// page.type() fires one native 'input' event per keystroke, so render()
// (and its staggerNext consumption) runs once per character — not what we
// want when testing "the render right after open()". Set the full value
// and dispatch exactly one 'input' event instead, matching how a paste (or
// this test's intent of "one query, one render") behaves.
async function setQuery(page, value) {
  await page.evaluate((v) => {
    const el = document.querySelector('.domshell-palette-input');
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}

// getComputedStyle().animationDuration reports seconds, sometimes in
// exponential notation (e.g. "1e-05s" for 0.01ms) — parse numerically
// instead of string-matching a specific format.
function durationSeconds(cssDurationStr) {
  return parseFloat(cssDurationStr);
}

// ── 1. Default state: open, type, check stagger classes on first render ──
{
  const { page, errors } = await freshPage();
  await page.click('.domshell-palette-trigger');
  await setQuery(page, 'Budi');
  const info = await page.evaluate(() => {
    const items = [...document.querySelectorAll('.domshell-palette-item')];
    return {
      count: items.length,
      enterCount: items.filter((el) => el.classList.contains('domshell-palette-item--enter')).length,
      delays: items.map((el) => getComputedStyle(el).animationDelay),
    };
  });
  check('palette returns 4 matching results for "Budi"', info.count === 4, `(got ${info.count})`);
  check('all 4 result items get the --enter class on first open', info.enterCount === 4, `(got ${info.enterCount})`);
  const distinctDelays = new Set(info.delays);
  check('stagger delays are distinct across items (real cascade, not identical)', distinctDelays.size >= 2, `(delays: ${info.delays.join(', ')})`);

  // A second render() in the SAME open session (e.g. the next keystroke)
  // must NOT replay the stagger.
  await setQuery(page, 'Budi S');
  const info2 = await page.evaluate(() => {
    const items = [...document.querySelectorAll('.domshell-palette-item')];
    return { enterCount: items.filter((el) => el.classList.contains('domshell-palette-item--enter')).length };
  });
  check('a second render() in the same open session does NOT replay the stagger class', info2.enterCount === 0, `(got ${info2.enterCount} items with --enter)`);

  // Close, reopen — stagger should be back for the fresh open.
  await page.keyboard.press('Escape');
  await page.click('.domshell-palette-trigger');
  await setQuery(page, 'Budi');
  const info3 = await page.evaluate(() => {
    const items = [...document.querySelectorAll('.domshell-palette-item')];
    return { enterCount: items.filter((el) => el.classList.contains('domshell-palette-item--enter')).length };
  });
  check('reopening after close() gets a fresh stagger', info3.enterCount === 4, `(got ${info3.enterCount})`);

  check('zero console/page errors (default-state session)', errors.length === 0, errors.length ? `(${errors.join(' | ')})` : '');
  await page.close();
}

// ── 2. Reflow-restart: animation actually replays visually on reopen ──
{
  const { page, errors } = await freshPage();
  await page.click('.domshell-palette-trigger');
  await new Promise((r) => setTimeout(r, 250)); // let entrance animation fully finish (duration is --motion-fast, 120ms)
  const settledStyle = await page.evaluate(() => {
    const box = document.querySelector('.domshell-palette-box');
    const cs = getComputedStyle(box);
    return { opacity: cs.opacity, transform: cs.transform };
  });
  check('box has visually settled at the animation\'s end state after it finishes',
    settledStyle.opacity === '1' && (settledStyle.transform === 'none' || settledStyle.transform === 'matrix(1, 0, 0, 1, 0, 0)'),
    `(got ${JSON.stringify(settledStyle)})`);

  await page.keyboard.press('Escape');
  await page.click('.domshell-palette-trigger');
  const reopenedState = await page.evaluate(() => {
    const box = document.querySelector('.domshell-palette-box');
    const anim = box.getAnimations().find((a) => a.animationName === 'v2FadeInScale');
    return anim ? { playState: anim.playState, currentTime: anim.currentTime } : null;
  });
  check('reflow-restart shim gives reopen a fresh, running/early animation (not stuck finished)',
    !!reopenedState && reopenedState.playState !== 'finished' && reopenedState.currentTime < 50,
    `(got ${JSON.stringify(reopenedState)})`);
  check('zero console/page errors (reflow-restart session)', errors.length === 0, errors.length ? `(${errors.join(' | ')})` : '');
  await page.close();
}

// ── 3. [data-anim="off"] — new global blanket rule must reach the palette ──
{
  const { page, errors } = await freshPage();
  await page.evaluate(() => document.documentElement.setAttribute('data-anim', 'off'));
  await page.click('.domshell-palette-trigger');
  await setQuery(page, 'Budi');
  const durations = await page.evaluate(() => {
    const box = document.querySelector('.domshell-palette-box');
    const item = document.querySelector('.domshell-palette-item');
    return {
      boxAnimDur: getComputedStyle(box).animationDuration,
      itemAnimDur: item ? getComputedStyle(item).animationDuration : null,
      itemHasEnterClass: item ? item.classList.contains('domshell-palette-item--enter') : null,
    };
  });
  check('[data-anim="off"]: palette box animation-duration collapses to ~0.01ms', durationSeconds(durations.boxAnimDur) <= 0.001, `(got ${durations.boxAnimDur})`);
  check('[data-anim="off"]: stagger class is never added (prefersReducedMotion gate)', durations.itemHasEnterClass === false, `(got ${durations.itemHasEnterClass})`);
  check('zero console/page errors (data-anim=off session)', errors.length === 0, errors.length ? `(${errors.join(' | ')})` : '');
  await page.close();
}

// ── 4. prefers-reduced-motion: reduce — OS-level path still works (regression guard) ──
{
  const { page, errors } = await freshPage();
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.click('.domshell-palette-trigger');
  await setQuery(page, 'Budi');
  const durations = await page.evaluate(() => {
    const box = document.querySelector('.domshell-palette-box');
    const item = document.querySelector('.domshell-palette-item');
    return {
      boxAnimDur: getComputedStyle(box).animationDuration,
      itemHasEnterClass: item ? item.classList.contains('domshell-palette-item--enter') : null,
    };
  });
  check('prefers-reduced-motion: palette box animation-duration collapses to ~0.01ms', durationSeconds(durations.boxAnimDur) <= 0.001, `(got ${durations.boxAnimDur})`);
  check('prefers-reduced-motion: stagger class is never added', durations.itemHasEnterClass === false, `(got ${durations.itemHasEnterClass})`);
  check('zero console/page errors (reduced-motion session)', errors.length === 0, errors.length ? `(${errors.join(' | ')})` : '');
  await page.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
server.close();
if (fail > 0) process.exit(1);
