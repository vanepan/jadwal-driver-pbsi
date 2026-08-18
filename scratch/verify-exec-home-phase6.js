// Phase 6 (v1.30.10.6) verification: pulse metric count-up on refresh, Quick
// Nav de-pill (launcher grid), motion stagger for exec-drivers/
// exec-vehicle-flags. Reuses the existing exec-home-harness.html (real
// widgets.render(ctx)/onMount, real platform.css/style.css), same technique
// as verify-exec-home-visual.js.

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const OUT_DIR = path.join(__dirname, 'exec-home-verify');
fs.mkdirSync(OUT_DIR, { recursive: true });

const baseModels = {
  exec: {
    driverKpis: { activeVehicles: 4, activeDrivers: 2 },
    score: { value: 90, level: 'excellent', label: 'Sangat Baik' },
    scoreBreakdown: { components: [] },
  },
  engineering: { overdueAssignments: { count: 0 } },
  wellness: { summary: { atRiskDrivers: 0 } },
  pettyLowBalance: { low: false },
};

function makeCtx({ pending, trips }) {
  return {
    user: { name: 'Evan' },
    role: 'admin',
    models: baseModels,
    requests: Array.from({ length: pending }, (_, i) => ({
      id: `r${i}`, status: 'pending', createdAt: new Date(Date.now() - 3600e3).toISOString(), purpose: 'Antar Sampel',
    })),
    recommendations: { certified: true, board: { critical: [] }, recs: [] },
    engineeringEvents: [],
    assignments: Array.from({ length: trips }, (_, i) => ({ id: `a${i}`, date: new Date().toISOString().slice(0, 10) })),
    drivers: [{ name: 'Dedi' }, { name: 'Grace' }],
    vehicles: [{ id: 'v1', name: 'Avanza A', color: '#8B2E2E' }],
    vehicleFlags: { top: [{ vehicleId: 'v1', vehicleName: 'Avanza A', typeLabel: 'Mobil', statusLabel: 'Servis segera', tone: 'warn' }] },
  };
}

const ctxA = makeCtx({ pending: 2, trips: 3 });
const ctxB = makeCtx({ pending: 5, trips: 9 });
const WIDGET_IDS = ['exec-hero', 'exec-attention', 'exec-drivers', 'exec-vehicle-flags', 'exec-quick'];

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  page.on('console', (msg) => { if (msg.type() === 'error') pageErrors.push(msg.text()); });

  await page.setViewport({ width: 1400, height: 1400 });
  await page.goto('http://localhost:8000/scratch/exec-home-harness.html', { waitUntil: 'load' });
  await page.waitForFunction('window.__execHarnessReady === true');

  // ── 1) First mount (ctxA) — let entrance/count-up settle, read final values.
  await page.evaluate((ctx, ids) => window.__mountExecWidgets(ctx, ids), ctxA, WIDGET_IDS);
  await new Promise((r) => setTimeout(r, 900));
  const afterMountA = await page.evaluate(() => ({
    pendingStat: document.querySelector('.wsp-hero__stat-big[data-stat-key="pending"]')?.textContent,
    tripsStat: document.querySelector('.wsp-hero__stat-big[data-stat-key="trips"]')?.textContent,
  }));

  // ── 2) Refresh in place (ctxB) — re-run render+onMount against the SAME
  // host, mirroring how a live Firebase update re-renders (root node is not
  // recreated). Sample mid-tween, then after settle.
  await page.evaluate((ctx, ids) => window.__mountExecWidgets(ctx, ids), ctxB, WIDGET_IDS);
  await new Promise((r) => setTimeout(r, 120));
  const midTween = await page.evaluate(() => ({
    pendingStat: document.querySelector('.wsp-hero__stat-big[data-stat-key="pending"]')?.textContent,
    tripsStat: document.querySelector('.wsp-hero__stat-big[data-stat-key="trips"]')?.textContent,
  }));
  await new Promise((r) => setTimeout(r, 900));
  const afterRefreshB = await page.evaluate(() => ({
    pendingStat: document.querySelector('.wsp-hero__stat-big[data-stat-key="pending"]')?.textContent,
    tripsStat: document.querySelector('.wsp-hero__stat-big[data-stat-key="trips"]')?.textContent,
  }));

  // ── 3) Reduced motion — force data-anim="off", refresh again, must snap
  // straight to final values with no intermediate frame.
  await page.evaluate(() => document.documentElement.setAttribute('data-anim', 'off'));
  await page.evaluate((ctx, ids) => window.__mountExecWidgets(ctx, ids), ctxA, WIDGET_IDS);
  const reducedImmediate = await page.evaluate(() => ({
    pendingStat: document.querySelector('.wsp-hero__stat-big[data-stat-key="pending"]')?.textContent,
    tripsStat: document.querySelector('.wsp-hero__stat-big[data-stat-key="trips"]')?.textContent,
  }));
  await page.evaluate(() => document.documentElement.removeAttribute('data-anim'));

  // ── 4) Quick Nav — no pill/border/background at rest; grid layout.
  await page.evaluate((ctx, ids) => window.__mountExecWidgets(ctx, ids), ctxB, WIDGET_IDS);
  await new Promise((r) => setTimeout(r, 900));
  const launcher = await page.evaluate(() => {
    const grid = document.querySelector('.wsp-launcher');
    const item = document.querySelector('.wsp-launcher__item');
    if (!grid || !item) return null;
    const cs = getComputedStyle(item);
    return {
      display: getComputedStyle(grid).display,
      itemCount: document.querySelectorAll('.wsp-launcher__item').length,
      borderStyle: cs.borderStyle,
      borderRadius: cs.borderRadius,
      backgroundColor: cs.backgroundColor,
      hasPillClass: !!document.querySelector('.wsp-chip'),
    };
  });

  // ── 5) Motion stagger — computed animation-delay on drivers/vehicle-flags.
  const delays = await page.evaluate(() => {
    const get = (id) => {
      const el = document.querySelector(`[data-widget-id="${id}"]`);
      return el ? getComputedStyle(el).animationDelay : null;
    };
    return { drivers: get('exec-drivers'), vehicleFlags: get('exec-vehicle-flags'), quick: get('exec-quick') };
  });

  await page.screenshot({ path: path.join(OUT_DIR, 'phase6-light.png'), fullPage: true });
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await new Promise((r) => setTimeout(r, 300));
  await page.screenshot({ path: path.join(OUT_DIR, 'phase6-dark.png'), fullPage: true });

  await browser.close();

  console.log(JSON.stringify({ afterMountA, midTween, afterRefreshB, reducedImmediate, launcher, delays }, null, 2));
  console.log('\n--- PAGE ERRORS ---');
  console.log(pageErrors.length ? pageErrors : 'none');

  const fail = [];
  if (afterMountA.pendingStat !== '2') fail.push(`ctxA pending stat expected 2, got ${afterMountA.pendingStat}`);
  if (afterMountA.tripsStat !== '3') fail.push(`ctxA trips stat expected 3, got ${afterMountA.tripsStat}`);
  if (afterRefreshB.pendingStat !== '5') fail.push(`ctxB pending stat expected 5, got ${afterRefreshB.pendingStat}`);
  if (afterRefreshB.tripsStat !== '9') fail.push(`ctxB trips stat expected 9, got ${afterRefreshB.tripsStat}`);
  // Mid-tween must NOT already equal the target (proves it's animating, not
  // snapping) and must NOT equal the old value either once >0ms have passed
  // (proves it started moving, not frozen at the old number).
  if (midTween.pendingStat === '5' && midTween.tripsStat === '9') fail.push('stats reached target instantly (no tween observed) — expected an intermediate value at 120ms');
  if (reducedImmediate.pendingStat !== '2') fail.push(`reduced-motion pending stat expected instant 2, got ${reducedImmediate.pendingStat}`);
  if (reducedImmediate.tripsStat !== '3') fail.push(`reduced-motion trips stat expected instant 3, got ${reducedImmediate.tripsStat}`);
  if (!launcher) fail.push('launcher grid not found');
  else {
    if (launcher.itemCount < 5) fail.push(`expected >=5 launcher items, got ${launcher.itemCount}`);
    if (launcher.hasPillClass) fail.push('old .wsp-chip pill still rendered for Quick Nav');
    if (launcher.borderRadius && parseFloat(launcher.borderRadius) > 20) fail.push(`launcher item border-radius reads pill-shaped: ${launcher.borderRadius}`);
    if (!/none|^$/.test(launcher.borderStyle)) fail.push(`launcher item has a border at rest: ${launcher.borderStyle}`);
  }
  if (delays.drivers !== '0.4s') fail.push(`exec-drivers animation-delay expected 0.4s, got ${delays.drivers}`);
  if (delays.vehicleFlags !== '0.46s') fail.push(`exec-vehicle-flags animation-delay expected 0.46s, got ${delays.vehicleFlags}`);
  if (delays.quick !== '0.6s') fail.push(`exec-quick animation-delay expected 0.6s (unchanged), got ${delays.quick}`);
  if (pageErrors.length) fail.push(`page errors: ${pageErrors.join(' | ')}`);

  if (fail.length) {
    console.error('\nFAILURES:\n' + fail.map((f) => ' - ' + f).join('\n'));
    process.exitCode = 1;
  } else {
    console.log('\nPhase 6 (pulse count-up + launcher de-pill + motion stagger) verified.');
  }
})();
