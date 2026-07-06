/* workspace-foundation-check.mjs — v1.19.9 Executive Command Center Foundation.
   Serves the static app, loads the REAL Workspace layer in headless Chromium
   (no app.js boot — the harness only provides design tokens), and asserts:
     • every production role resolves to its intended workspace (+ safe fallback),
     • the Widget Registry knows every widget referenced by a workspace and loads
       implementations lazily (render is a function),
     • the renderer mounts exactly one card per widget for each role (no card left
       in the loading/skeleton state),
     • the Engineering workspace renders architecture-only placeholders,
     • deep-link controls are declarative + keyboard-accessible (native buttons),
   with zero console/page errors. Captures light + dark screenshots.
   Run: node scripts/workspace-foundation-check.mjs  (exit 0 = pass) */

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
  if (/Failed to load resource/i.test(m.text())) return; // bare-harness asset 404s
  consoleErrors.push('console.error: ' + m.text());
});

await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
await page.goto(`http://localhost:${port}/scripts/workspace-foundation-harness.html`, { waitUntil: 'networkidle0', timeout: 45000 });

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };

const result = await page.evaluate(async () => {
  const reg = await import('/js/workspace/workspace-registry.js');
  const wreg = await import('/js/workspace/widget-registry.js');
  const router = await import('/js/workspace/home-router.js');

  const fakeCtx = (role) => ({
    user: { id: 'u1', name: 'Uji Coba', role }, role,
    assignments: [], myAssignments: [], requests: [], myRequests: [], logs: [],
    models: null, actions: {},
  });

  const out = { errors: [] };

  // 1) Role resolution
  out.roles = {
    admin: reg.resolveWorkspaceForRole('admin').id,
    bidang: reg.resolveWorkspaceForRole('bidang').id,
    driver: reg.resolveWorkspaceForRole('driver').id,
    engineering: reg.resolveWorkspaceForRole('engineering').id,
    viewer: reg.resolveWorkspaceForRole('viewer').id, // fallback
  };

  // 2) Widget counts per workspace
  out.counts = {
    executive: reg.WORKSPACES.executive.widgets.length,
    request: reg.WORKSPACES.request.widgets.length,
    driver: reg.WORKSPACES.driver.widgets.length,
    engineering: reg.WORKSPACES.engineering.widgets.length,
  };

  // 3) Registry knows every referenced widget
  out.registryOk = true;
  for (const ws of Object.values(reg.WORKSPACES)) {
    for (const id of ws.widgets) {
      if (!wreg.getWidgetDef(id)) { out.registryOk = false; out.missing = id; }
    }
  }

  // 4) Lazy load resolves a render function for a sample widget in each group
  const sampleImpl = await wreg.loadWidgetImpl('exec-hero');
  out.lazyRenderFn = !!(sampleImpl && typeof sampleImpl.render === 'function');

  // 5) Render each role, count mounted cards
  async function renderRole(role) {
    const host = document.createElement('div');
    host.className = 'exec-ui v2-analytics-claude';
    document.body.appendChild(host);
    await router.renderHome(host, fakeCtx(role));
    return {
      // Variant-agnostic: every widget root carries data-widget-id; skeletons
      // carry aria-busy until mounted.
      cards: host.querySelectorAll('[data-widget-id]').length,
      loading: host.querySelectorAll('[data-widget-id][aria-busy="true"]').length,
      buttons: host.querySelectorAll('.wsp-btn, .wsp-chip, .wsp-summary, .wsp-row--click').length,
      nonButtonClickable: host.querySelectorAll('[data-wsp-action]:not(button), [data-wsp-detail]:not(button)').length,
      host,
    };
  }

  out.exec = await renderRole('admin');
  out.req = await renderRole('bidang');
  out.drv = await renderRole('driver');
  out.eng = await renderRole('engineering');
  out.engPlaceholders = out.eng.host.querySelectorAll('.wsp-placeholder').length;
  out.stylesInjected = !!document.getElementById('wsp-styles');

  // Render the admin workspace into the visible #host for screenshots (done
  // here, inside the one evaluate, so no second import races teardown).
  const shotHost = document.getElementById('host');
  shotHost.className = 'exec-ui v2-analytics-claude';
  await router.renderHome(shotHost, fakeCtx('admin'));

  // strip DOM refs before returning
  delete out.exec.host; delete out.req.host; delete out.drv.host; delete out.eng.host;
  return out;
});

check('admin → executive workspace', result.roles.admin === 'executive');
check('bidang → request workspace', result.roles.bidang === 'request');
check('driver → driver workspace', result.roles.driver === 'driver');
check('engineering → engineering workspace', result.roles.engineering === 'engineering');
check('unknown role → safe fallback (request)', result.roles.viewer === 'request');

check('executive workspace has widgets', result.counts.executive >= 8);
check('request workspace has widgets', result.counts.request >= 8);
check('driver workspace has widgets', result.counts.driver >= 8);
check('engineering workspace has widgets', result.counts.engineering >= 6);

check('every referenced widget is registered', result.registryOk === true);
check('widget impl loads lazily with a render fn', result.lazyRenderFn === true);
check('workspace styles injected once', result.stylesInjected === true);

check('executive renders one card per widget', result.exec.cards === result.counts.executive);
check('executive: no card stuck loading', result.exec.loading === 0);
check('request renders one card per widget', result.req.cards === result.counts.request);
check('request: no card stuck loading', result.req.loading === 0);
check('driver renders one card per widget', result.drv.cards === result.counts.driver);
check('driver: no card stuck loading', result.drv.loading === 0);
check('engineering renders one card per widget', result.eng.cards === result.counts.engineering);
check('engineering: no card stuck loading', result.eng.loading === 0);
check('engineering shows placeholder widgets', result.engPlaceholders === result.counts.engineering);

check('deep links are native buttons (a11y)',
  result.exec.nonButtonClickable === 0 && result.req.nonButtonClickable === 0 &&
  result.drv.nonButtonClickable === 0 && result.eng.nonButtonClickable === 0);
check('executive has interactive controls', result.exec.buttons > 0);

// Screenshots (light + dark) — #host already holds the admin workspace.
try {
  if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, 'workspace-foundation-light.png') });
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await page.screenshot({ path: path.join(SHOTS, 'workspace-foundation-dark.png') });
} catch (err) { console.log('  (screenshot skipped:', err.message, ')'); }

check('zero console/page errors', consoleErrors.length === 0);
if (consoleErrors.length) consoleErrors.forEach(e => console.log('   ✗', e.slice(0, 200)));

await browser.close();
server.close();

console.log(`\nWORKSPACE FOUNDATION: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
