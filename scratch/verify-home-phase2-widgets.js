// Phase 2 (Admin Home) verification — exercises the actual widget render()
// functions with synthetic ctx data via a real module import in a real
// browser (esc() uses document.createElement, so this needs a DOM, not
// plain Node). Bypasses the app's own auth/routing entirely since the goal
// is verifying the NEW widget code renders correctly, not re-testing the
// already-verified Phase 1 shell or the unrelated auth pipeline.

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, 'home-phase2-verify');
fs.mkdirSync(OUT_DIR, { recursive: true });

const SYNTHETIC_CTX = {
  role: 'admin',
  assignments: [
    { date: new Date().toISOString().slice(0, 10), driver: 'Budi Santoso', vehicle: 'Toyota Hiace',
      startTime: '07:00', endTime: '23:59', status: 'in_progress' },
    { date: new Date().toISOString().slice(0, 10), driver: 'Siti Rahayu', vehicle: 'Avanza',
      startTime: '23:58', endTime: '23:59', status: 'scheduled' },
  ],
  requests: [],
  logs: [],
  engineeringEvents: [],
  drivers: [
    { id: 'd1', name: 'Budi Santoso' }, { id: 'd2', name: 'Siti Rahayu' },
    { id: 'd3', name: 'Agus Wijaya' }, { id: 'd4', name: 'Dewi Lestari' },
  ],
  vehicles: [
    { id: 'v1', name: 'Toyota Hiace', color: 'oklch(56% 0.13 30)' },
    { id: 'v2', name: 'Avanza', color: 'oklch(56% 0.13 150)' },
    { id: 'v3', name: 'Innova', color: 'oklch(56% 0.13 205)' },
    { id: 'v4', name: 'Fortuner', color: 'oklch(56% 0.13 265)' },
  ],
  vehicleFlags: {
    total: 3, overdueCount: 1, dueSoonCount: 1, upcomingCount: 1, completedCount: 0,
    top: [
      { vehicleId: 'v3', vehicleName: 'Innova', typeLabel: 'Perawatan', statusLabel: 'Terlambat', tone: 'danger' },
      { vehicleId: 'v4', vehicleName: 'Fortuner', typeLabel: 'Asuransi', statusLabel: 'Segera', tone: 'warn' },
    ],
  },
  models: null,
  recommendations: {
    certified: true,
    recs: [
      { title: 'Jadwalkan servis Vehicle D', reason: 'Melewati batas 1.200 km', expectedBenefit: 'Mencegah kerusakan mendadak',
        actionable: true, category: 'maintenance', priority: { rank: 0, label: 'Kritis', tone: 'danger' } },
      { title: 'Pindahkan trip Rudi 20 menit', reason: 'Menghindari overlap Vehicle D', expectedBenefit: 'Konflik hilang tanpa ganti driver',
        actionable: true, category: 'scheduling', priority: { rank: 1, label: 'Sedang', tone: 'warn' } },
    ],
  },
};

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const results = { errors: [], widgetOutputLengths: {} };

  for (const theme of ['light', 'dark']) {
    const page = await browser.newPage();
    page.on('pageerror', (err) => results.errors.push(`[${theme}] ${err.message}`));
    page.on('console', (msg) => { if (msg.type() === 'error') results.errors.push(`[${theme}] console: ${msg.text()}`); });

    await page.goto('http://localhost:8000/index.html', { waitUntil: 'domcontentloaded' });
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);

    const output = await page.evaluate(async (ctx) => {
      const mod = await import('/js/widgets/executive/index.js');
      const out = {};
      for (const id of ['exec-drivers', 'exec-vehicle-flags', 'exec-recommendation']) {
        try {
          out[id] = mod.widgets[id].render(ctx);
        } catch (e) {
          out[id] = `ERROR: ${e.message}\n${e.stack}`;
        }
      }
      return out;
    }, SYNTHETIC_CTX);

    for (const [id, html] of Object.entries(output)) {
      results.widgetOutputLengths[`${theme}:${id}`] = html.length;
      if (html.startsWith('ERROR:')) results.errors.push(`[${theme}] ${id}: ${html}`);
    }

    // Render into a styled container (reusing the app's own workspace CSS,
    // which is injected at runtime by injectWorkspaceStyles()) for a visual
    // sanity screenshot.
    await page.evaluate(async (out) => {
      const styleMod = await import('/js/workspace/workspace-styles.js');
      document.body.innerHTML = `
        <div id="v" style="max-width:900px;margin:40px auto;display:flex;flex-direction:column;gap:24px;
             font-family:var(--font-sans,sans-serif);background:var(--canvas);padding:24px;">
          <div class="wsp-card"><h3>exec-drivers</h3><div class="wsp-card__body">${out['exec-drivers']}</div></div>
          <div class="wsp-card"><h3>exec-vehicle-flags</h3><div class="wsp-card__body">${out['exec-vehicle-flags']}</div></div>
          <div class="wsp-card"><h3>exec-recommendation</h3><div class="wsp-card__body">${out['exec-recommendation']}</div></div>
        </div>`;
      if (typeof styleMod.injectWorkspaceStyles === 'function') styleMod.injectWorkspaceStyles();
    }, output);
    await new Promise(r => setTimeout(r, 150));
    await page.screenshot({ path: path.join(OUT_DIR, `widgets-${theme}.png`), fullPage: true });

    await page.close();
  }

  await browser.close();
  fs.writeFileSync(path.join(OUT_DIR, 'results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
  if (results.errors.length) process.exitCode = 1;
})();
