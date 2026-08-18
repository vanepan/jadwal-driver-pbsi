// Visual verification of the Today/Executive Home changes (v1.30.10.x):
// 4th "Trip Hari Ini" stat, headline live-count interpolation, Attention
// Center domain eyebrows + link-style CTAs. Drives the REAL exported
// widgets.render(ctx) functions from js/widgets/executive/index.js with
// synthetic ctx data (bypassing real Firebase auth, same technique as the
// domain-shell harness), so this is real code + real CSS, just synthetic
// input data standing in for a live admin session.

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const OUT_DIR = path.join(__dirname, 'exec-home-verify');
fs.mkdirSync(OUT_DIR, { recursive: true });

const ctx = {
  user: { name: 'Evan' },
  models: {
    exec: {
      driverKpis: { activeVehicles: 4, activeDrivers: 2 },
      score: { value: 90, level: 'excellent', label: 'Sangat Baik' },
      scoreBreakdown: {
        components: [
          { key: 'driverOps', label: 'Operasional Driver', weightPct: 25, score: 92 },
          { key: 'engineering', label: 'Operasional Teknik', weightPct: 25, score: 95 },
          { key: 'vehicleUtil', label: 'Utilisasi Armada', weightPct: 20, score: 88 },
          { key: 'request', label: 'Permintaan', weightPct: 15, score: 80 },
          { key: 'pettyCash', label: 'Petty Cash', weightPct: 15, score: 90 },
        ],
      },
    },
    engineering: { overdueAssignments: { count: 0 } },
    wellness: { summary: { atRiskDrivers: 2 } },
    pettyLowBalance: { low: false },
  },
  requests: [
    { id: 'r1', status: 'pending', createdAt: new Date(Date.now() - 3600e3).toISOString(), purpose: 'Antar Sampel Lab RSCM', destination: 'RSCM' },
    { id: 'r2', status: 'pending', createdAt: new Date(Date.now() - 7200e3).toISOString(), purpose: 'Jemput Delegasi Kemenpora' },
  ],
  recommendations: { certified: true, board: { critical: [] }, recs: [] },
  engineeringEvents: [],
  assignments: [
    { id: 'a1', date: new Date().toISOString().slice(0, 10) },
    { id: 'a2', date: new Date().toISOString().slice(0, 10) },
    { id: 'a3', date: new Date().toISOString().slice(0, 10) },
    { id: 'a4', date: new Date().toISOString().slice(0, 10) },
    { id: 'a5', date: new Date().toISOString().slice(0, 10) },
    { id: 'a6', date: new Date().toISOString().slice(0, 10) },
    { id: 'a7', date: new Date().toISOString().slice(0, 10) },
  ],
};

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  page.on('console', (msg) => { if (msg.type() === 'error') pageErrors.push(msg.text()); });

  await page.goto('http://localhost:8000/scratch/exec-home-harness.html', { waitUntil: 'load' });
  await page.waitForFunction('window.__execHarnessReady === true');

  const mountResult = await page.evaluate((ctx) => {
    window.__mountExecWidgets(ctx, ['exec-hero', 'exec-attention']);
    return {
      headlineText: document.querySelector('.wsp-hero__headline')?.textContent || null,
      statsCount: document.querySelectorAll('.wsp-hero__stat').length,
      statLabels: Array.from(document.querySelectorAll('.wsp-hero__stat-lbl')).map(el => el.textContent),
      tripStatValue: Array.from(document.querySelectorAll('.wsp-hero__stat')).find(el => el.textContent.includes('Trip Hari Ini'))?.querySelector('.wsp-hero__stat-big')?.textContent,
      domainEyebrows: Array.from(document.querySelectorAll('.wsp-sevrow__domain')).map(el => el.textContent),
      linkCtas: Array.from(document.querySelectorAll('.wsp-btn--link')).map(el => el.textContent.trim()),
    };
  }, ctx);

  await page.setViewport({ width: 1400, height: 1100 });
  await new Promise((r) => setTimeout(r, 600)); // let the count-up/ring motion settle
  await page.screenshot({ path: path.join(OUT_DIR, 'exec-home-light.png') });
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await new Promise((r) => setTimeout(r, 300));
  await page.screenshot({ path: path.join(OUT_DIR, 'exec-home-dark.png') });

  await browser.close();

  console.log(JSON.stringify(mountResult, null, 2));
  console.log('\n--- PAGE ERRORS ---');
  console.log(pageErrors.length ? pageErrors : 'none');

  const fail = [];
  if (mountResult.statsCount !== 4) fail.push(`expected 4 hero stats, got ${mountResult.statsCount}`);
  if (!mountResult.statLabels.includes('Trip Hari Ini')) fail.push('Trip Hari Ini stat missing');
  if (mountResult.tripStatValue !== '7') fail.push(`expected Trip Hari Ini = 7, got ${mountResult.tripStatValue}`);
  if (!/hal perlu perhatian/.test(mountResult.headlineText || '')) fail.push(`headline should interpolate finding count, got: ${mountResult.headlineText}`);
  if (mountResult.domainEyebrows.length < 2) fail.push(`expected >=2 domain eyebrows, got ${JSON.stringify(mountResult.domainEyebrows)}`);
  if (mountResult.linkCtas.length < 2) fail.push(`expected >=2 link-style CTAs, got ${JSON.stringify(mountResult.linkCtas)}`);
  if (pageErrors.length) fail.push(`page errors: ${pageErrors.join(' | ')}`);

  if (fail.length) {
    console.error('\nFAILURES:\n' + fail.map((f) => ' - ' + f).join('\n'));
    process.exitCode = 1;
  } else {
    console.log('\nExec Home visual changes verified.');
  }
})();
