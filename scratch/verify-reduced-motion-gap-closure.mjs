// Phase 8.1 — closes the [data-anim="off"] coverage gap for 7 stylesheets
// that previously had zero manual-toggle coverage (only the OS-level
// prefers-reduced-motion query reached them). Real browser check: load
// each stylesheet's real transition/animation rules, apply [data-anim="off"]
// and prefers-reduced-motion:reduce independently, confirm both collapse
// duration to ~0. Also verifies the engineering.css toggle-knob's visual
// transform-based travel (the left->transform swap).
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

const html = `<!doctype html><html data-theme="light"><head>
<link rel="stylesheet" href="/style.css" />
<link rel="stylesheet" href="/platform.css" />
<link rel="stylesheet" href="/gudang.css" />
<link rel="stylesheet" href="/engineering.css" />
<link rel="stylesheet" href="/petty-cash.css" />
<link rel="stylesheet" href="/workspace-list-kit.css" />
</head><body style="margin:0;">
  <button class="gud-btn" id="gudEl">Gudang button</button>
  <div class="eng-toggle" data-on="false" id="engToggle" style="width:42px;height:25px;position:relative;"><div class="eng-toggle-knob" id="engKnob"></div></div>
  <div class="pc-drawer-scrim" id="pcEl"></div>
  <div class="dic-stage--active" id="dicWrap"><span class="dic-stage-dot" id="dicEl" style="display:inline-block;width:8px;height:8px;"></span></div>
</body></html>`;

const browser = await puppeteer.launch({ headless: 'new' });

async function loadPage() {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (req.url().endsWith('/__inline__')) req.respond({ status: 200, contentType: 'text/html', body: html });
    else req.continue();
  });
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`http://localhost:${port}/__inline__`, { waitUntil: 'load' });
  return { page, errors };
}

function dur(s) { return parseFloat(s); }

// ── Baseline (no reduced-motion state): real durations, non-zero ──
{
  const { page, errors } = await loadPage();
  const baseline = await page.evaluate(() => ({
    gud: getComputedStyle(document.getElementById('gudEl')).transitionDuration,
    pc: getComputedStyle(document.getElementById('pcEl')).animationDuration,
    dic: getComputedStyle(document.getElementById('dicEl')).animationDuration,
  }));
  check('baseline (no motion-off state): gudang.css .gud-btn has a real, non-zero transition', dur(baseline.gud) > 0.01, `(got ${baseline.gud})`);
  check('baseline: petty-cash.css .pc-drawer-scrim has a real, non-zero animation', dur(baseline.pc) > 0.01, `(got ${baseline.pc})`);
  check('baseline: workspace-list-kit.css .dic-stage-dot has a real, non-zero animation', dur(baseline.dic) > 0.01, `(got ${baseline.dic})`);
  check('zero console/page errors (baseline)', errors.length === 0, errors.length ? `(${errors.join(' | ')})` : '');
  await page.close();
}

// ── [data-anim="off"] — the gap this phase closes ──
{
  const { page, errors } = await loadPage();
  await page.evaluate(() => document.documentElement.setAttribute('data-anim', 'off'));
  const off = await page.evaluate(() => ({
    gud: getComputedStyle(document.getElementById('gudEl')).transitionDuration,
    pc: getComputedStyle(document.getElementById('pcEl')).animationDuration,
    dic: getComputedStyle(document.getElementById('dicEl')).animationDuration,
  }));
  check('[data-anim="off"]: gudang.css .gud-btn transition collapses to ~0', dur(off.gud) <= 0.001, `(got ${off.gud})`);
  check('[data-anim="off"]: petty-cash.css .pc-drawer-scrim animation collapses to ~0', dur(off.pc) <= 0.001, `(got ${off.pc})`);
  check('[data-anim="off"]: workspace-list-kit.css .dic-stage-dot animation collapses to ~0', dur(off.dic) <= 0.001, `(got ${off.dic})`);
  check('zero console/page errors ([data-anim="off"])', errors.length === 0, errors.length ? `(${errors.join(' | ')})` : '');
  await page.close();
}

// ── prefers-reduced-motion: reduce — regression guard (pre-existing OS-level path) ──
{
  const { page, errors } = await loadPage();
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  const reduced = await page.evaluate(() => ({
    gud: getComputedStyle(document.getElementById('gudEl')).transitionDuration,
    pc: getComputedStyle(document.getElementById('pcEl')).animationDuration,
    dic: getComputedStyle(document.getElementById('dicEl')).animationDuration,
  }));
  check('prefers-reduced-motion: gudang.css .gud-btn transition collapses to ~0', dur(reduced.gud) <= 0.001, `(got ${reduced.gud})`);
  check('prefers-reduced-motion: petty-cash.css .pc-drawer-scrim animation collapses to ~0', dur(reduced.pc) <= 0.001, `(got ${reduced.pc})`);
  check('prefers-reduced-motion: workspace-list-kit.css .dic-stage-dot animation collapses to ~0', dur(reduced.dic) <= 0.001, `(got ${reduced.dic})`);
  check('zero console/page errors (prefers-reduced-motion)', errors.length === 0, errors.length ? `(${errors.join(' | ')})` : '');
  await page.close();
}

// ── engineering.css toggle-knob: transform-based travel, visually verified ──
{
  const { page, errors } = await loadPage();
  const before = await page.evaluate(() => {
    const knob = document.getElementById('engKnob');
    const r = knob.getBoundingClientRect();
    return { x: r.x, transform: getComputedStyle(knob).transform };
  });
  await page.evaluate(() => document.getElementById('engToggle').setAttribute('data-on', 'true'));
  await new Promise((r) => setTimeout(r, 200)); // let the .15s transition finish
  const after = await page.evaluate(() => {
    const knob = document.getElementById('engKnob');
    const r = knob.getBoundingClientRect();
    return { x: r.x, transform: getComputedStyle(knob).transform };
  });
  const deltaX = after.x - before.x;
  check('.eng-toggle-knob travels ~17px on toggle (transform-driven, not layout-driven)', Math.abs(deltaX - 17) < 1, `(got deltaX=${deltaX.toFixed(2)})`);
  check('.eng-toggle-knob final state uses a real CSS transform (translateX), not "none"', after.transform !== 'none' && after.transform !== before.transform, `(before=${before.transform}, after=${after.transform})`);
  check('zero console/page errors (toggle-knob)', errors.length === 0, errors.length ? `(${errors.join(' | ')})` : '');
  await page.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
server.close();
if (fail > 0) process.exit(1);
