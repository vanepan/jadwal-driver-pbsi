/* domain-shell-overtime-render-check.mjs — real-browser render proof that
   Overtime is a standalone top-level domain in the consolidated shell.

   js/app.js has zero exports and boots production Firebase on
   DOMContentLoaded, so the authenticated rail can't be rendered headlessly
   (same limitation navigation-crossfade-check.mjs documents). Instead this
   imports the REAL js/shell/domain-shell.js with a mock `cfg` (the exact DI
   contract app.js's initDomainShellV1() passes) and renders the real
   renderRail()/renderTabBar() with the real domshell CSS. It proves:

     • admin sees a standalone [data-domain="overtime"] rail item (exactly one)
     • it carries a non-empty rail icon (svgIcon('overtime') resolved)
     • clicking it routes through the existing land.navOvertime(screen) handler
       and shows the Overtime screen-tab strip (otMenuTitles), NOT nested in
       Finance
     • Finance still renders as its own domain and still works
     • a role WITHOUT canAccessModule('overtime') sees no Overtime rail item
       (respects overtime.view), Finance unaffected
     • dark mode + 375px mobile: renders, no console errors, no horizontal
       body overflow

   Run: node scripts/domain-shell-overtime-render-check.mjs   (exit 0 = pass)
*/

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); if (detail !== undefined) console.log('     • ' + String(detail).slice(0, 300)); }
};

const HARNESS = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/platform.css">
<style> html,body{margin:0} .app-layout{display:flex} .main-area{flex:1} </style></head>
<body>
  <div class="app-layout">
    <aside id="sidebar"><nav class="sidebar-nav"></nav></aside>
    <div class="main-area"><header class="header">hdr</header><main class="main-content"></main></div>
  </div>
<script type="module">
  import { initDomainShell, refreshDomainShell } from '/js/shell/domain-shell.js';
  const calls = [];
  const noop = (n) => (...a) => { calls.push(n + '(' + a.join(',') + ')'); };
  const land = new Proxy({}, { get: (_, k) => noop(String(k)) });
  window.__calls = calls;
  window.__mkCfg = (canOvertime) => ({
    canAccessModule: (m) => (m === 'overtime' ? !!canOvertime : ['home','driverops','gudang','pettycash','analytics','konfigurasi','engineering'].includes(m)),
    can: (p) => p !== 'eng.settings' && p !== 'eng.analytics' ? true : true,
    isAdmin: () => true, isBidang: () => false, isDriver: () => false,
    setRailModule: noop('setRailModule'), getActiveRailModule: () => 'home', defaultModuleForRole: () => 'home',
    land,
    pcMenuTitles: { dashboard: 'Dashboard', expenses: 'Pengeluaran', settings: 'Pengaturan' },
    otMenuTitles: { dashboard: 'Dashboard', dailyEntry: 'Rekap Lembur', employees: 'Karyawan', closing: 'Tutup Periode', archive: 'Arsip' },
    engMenuTitles: { dashboard: 'Dashboard', timeline: 'Timeline' },
    gudMenuTitles: { dashboard: 'Dashboard' },
    sicMenuTitles: { dashboard: 'Dashboard' },
    mountBefore: document.getElementById('sidebar'),
    getCurrentUser: () => ({ name: 'QA Admin', role: 'admin', username: 'qa' }),
    formatRole: () => 'Administrator',
    logoSrc: '/assets/Logo-PBSI.png', brandLabel: 'Sarpras Ops', versionLabel: 'test',
  });
  window.__initShell = (canOvertime) => {
    document.querySelectorAll('.domshell-rail,.domshell-tabbar,#domshellMobileNavHost').forEach(e => e.remove());
    calls.length = 0;
    initDomainShell(window.__mkCfg(canOvertime));
    refreshDomainShell(true);
  };
  window.__railDomains = () => [...document.querySelectorAll('.domshell-rail-item')].map(b => b.dataset.domain);
  window.__iconPathD = (dom) => {
    const b = document.querySelector('.domshell-rail-item[data-domain="' + dom + '"]');
    return b ? (b.querySelector('svg path')?.getAttribute('d') || '') : null;
  };
  window.__tabLabels = () => [...document.querySelectorAll('.domshell-tab')].map(t => t.textContent.trim());
  window.__clickDomain = (dom) => document.querySelector('.domshell-rail-item[data-domain="' + dom + '"]')?.click();
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

/* ── 1. admin (canAccessModule('overtime') === true) ── */
console.log('\n[1. admin — standalone Overtime domain]');
await page.evaluate(() => window.__initShell(true));
const domains = await page.evaluate(() => window.__railDomains());
check('rail renders a standalone "overtime" domain', domains.includes('overtime'), JSON.stringify(domains));
check('exactly ONE overtime rail item (no duplicate)', domains.filter(d => d === 'overtime').length === 1, JSON.stringify(domains));
check('Finance domain still renders alongside it', domains.includes('finance'));
check('rail order is finance then overtime then engineering',
  domains.indexOf('finance') < domains.indexOf('overtime') && domains.indexOf('overtime') < domains.indexOf('engineering'),
  JSON.stringify(domains));
const dPath = await page.evaluate(() => window.__iconPathD('overtime'));
check('overtime rail icon has a non-empty SVG path', typeof dPath === 'string' && dPath.trim().length > 3, JSON.stringify(dPath));

/* ── 2. clicking Overtime routes through the existing handler ── */
console.log('\n[2. clicking Overtime opens the existing Overtime screens]');
await page.evaluate(() => { window.__calls.length = 0; window.__clickDomain('overtime'); });
const afterClick = await page.evaluate(() => ({ calls: window.__calls.slice(), tabs: window.__tabLabels() }));
check('land.navOvertime(...) was invoked (no new handler)', afterClick.calls.some(c => c.startsWith('navOvertime(')), JSON.stringify(afterClick.calls));
check('setRailModule(overtime) was invoked', afterClick.calls.includes('setRailModule(overtime)'), JSON.stringify(afterClick.calls));
check('the Overtime screen-tab strip shows its own otMenuTitles screens', afterClick.tabs.includes('Rekap Lembur') && afterClick.tabs.includes('Tutup Periode'), JSON.stringify(afterClick.tabs));
check('those tabs are NOT the Finance/pettycash tabs', !afterClick.tabs.includes('Pengeluaran'), JSON.stringify(afterClick.tabs));

/* ── 3. Finance still works as its own domain ── */
console.log('\n[3. Finance still valid]');
await page.evaluate(() => window.__clickDomain('finance'));
const finTabs = await page.evaluate(() => window.__tabLabels());
check('Finance shows its pettycash screens', finTabs.includes('Pengeluaran'), JSON.stringify(finTabs));
check('Finance no longer shows an "Overtime" tab', !finTabs.includes('Overtime'), JSON.stringify(finTabs));

/* ── 4. role without overtime.view ── */
console.log('\n[4. no overtime.view — Overtime hidden, Finance unaffected]');
await page.evaluate(() => window.__initShell(false));
const domains2 = await page.evaluate(() => window.__railDomains());
check('no "overtime" rail item when canAccessModule(overtime) is false (respects overtime.view)', !domains2.includes('overtime'), JSON.stringify(domains2));
check('Finance still renders for that role', domains2.includes('finance'), JSON.stringify(domains2));

/* ── 5. dark mode ── */
console.log('\n[5. dark mode]');
const errBeforeDark = errors.length;
await page.evaluate(() => { document.documentElement.setAttribute('data-theme', 'dark'); window.__initShell(true); });
const darkDomains = await page.evaluate(() => window.__railDomains());
check('renders in dark mode with the standalone Overtime domain', darkDomains.includes('overtime'));
check('no new console errors in dark mode', errors.length === errBeforeDark, errors.slice(errBeforeDark).join('; '));
await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));

/* ── 6. mobile 375px ── */
console.log('\n[6. mobile 375px]');
const errBeforeMobile = errors.length;
await page.setViewport({ width: 375, height: 812 });
await page.evaluate(() => window.__initShell(true));
await new Promise(r => setTimeout(r, 150));
const mobile = await page.evaluate(() => ({
  domains: window.__railDomains(),
  overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
  railInSidebar: !!document.querySelector('#sidebar .domshell-rail, #domshellMobileNavHost .domshell-rail'),
}));
check('Overtime rail item still present at 375px', mobile.domains.includes('overtime'), JSON.stringify(mobile.domains));
check('no horizontal body overflow at 375px', !mobile.overflow);
check('rail is relocated into the sidebar drawer host (mobile nav intact)', mobile.railInSidebar);
check('no new console errors at 375px', errors.length === errBeforeMobile, errors.slice(errBeforeMobile).join('; '));

console.log('\n[7. overall console cleanliness]');
check('zero console/page errors across all renders', errors.length === 0, errors.join(' | '));

await browser.close();
server.close();
console.log(`\ndomain-shell-overtime-render-check: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
