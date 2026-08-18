// Redesign Phase 1a — domain-shell.js logic verification.
//
// Pure-logic test: drives js/shell/domain-shell.js directly through a
// minimal DOM harness (scratch/domain-shell-harness.html) with a MOCK cfg
// object standing in for app.js's real permission/nav functions. This
// avoids needing a real authenticated Firebase session (this environment
// always hits real production Firebase — see project memory "Firebase Prod
// in Local Testing") to test something that is actually pure client-side
// logic: which domains/tabs are visible per role, and whether clicking
// routes to the correct mocked land() function.
//
// A separate script (verify-domain-shell-phase1a-smoke.js) loads the REAL
// app with the flag on to catch integration/wiring mistakes this mocked
// test can't see (typos in real function names, wrong DOM selectors, etc).

const puppeteer = require('puppeteer');

const ROLES = {
  admin:   { isAdmin: true,  isBidang: false, isDriver: false, perms: ['system.admin', 'eng.settings', 'eng.analytics'] },
  bidang:  { isAdmin: false, isBidang: true,  isDriver: false, perms: [] },
  driver:  { isAdmin: false, isBidang: false, isDriver: true,  perms: [] },
  viewer:  { isAdmin: false, isBidang: false, isDriver: false, perms: [] },
};

// Coarse module-level gate mirroring the real MODULE_PERMISSIONS map —
// enough to exercise domainVisible()'s canAccessModule() dependency.
const MODULE_PERMS = {
  home: null, // always true
  engineering: 'eng.view',
  driverops: 'driver.schedule.view',
  pettycash: 'pettycash.view',
  overtime: 'overtime.view',
  analytics: 'analytics.view',
  konfigurasi: 'konfigurasi.view',
  roleManagement: 'system.admin',
  gudang: 'warehouse.view',
  // Real gate is isV2Enabled(), a pilot allowlist check, NOT a
  // MODULE_PERMISSIONS entry (see app.js's canAccessModule() — it
  // special-cases this BEFORE the permission-map lookup). Modeled here as a
  // broadly-granted fake permission string, consistent with this mock's
  // documented "every role sees every non-admin-only module" philosophy —
  // NOT asserted against REAL_MODULE_PERMISSIONS below since it legitimately
  // isn't in that real map.
  sarprasIntelligence: 'sarprasIntelligence.pilot',
};

// Phase 1 drift-guard (v1.30.10.7) — this mock is only useful if it actually
// mirrors the real permission map. Hardcoded literal of js/app.js:1625-1641's
// MODULE_PERMISSIONS, re-checked by hand against that file each time this
// script runs the assertion below. This caught a real, pre-existing gap:
// 'engineering' was missing from MODULE_PERMS above, so this test's mock
// silently treated the Engineering domain as invisible for every role
// (including admin) despite the mock's own documented intent of granting
// every non-admin-only module broadly — the Engineering domain was never
// actually exercised by this test before this fix.
const REAL_MODULE_PERMISSIONS = {
  engineering: 'eng.view',
  driverops: 'driver.schedule.view',
  pettycash: 'pettycash.view',
  overtime: 'overtime.view',
  analytics: 'analytics.view',
  konfigurasi: 'konfigurasi.view',
  roleManagement: 'system.admin',
  gudang: 'warehouse.view',
};
(function assertNoPermissionDrift() {
  const drift = [];
  for (const [mod, perm] of Object.entries(REAL_MODULE_PERMISSIONS)) {
    if (MODULE_PERMS[mod] !== perm) drift.push(`${mod}: mock=${MODULE_PERMS[mod]} real=${perm}`);
  }
  for (const mod of Object.keys(MODULE_PERMS)) {
    if (mod === 'home' || mod === 'sarprasIntelligence') continue; // gated outside MODULE_PERMISSIONS, not in the real map
    if (!(mod in REAL_MODULE_PERMISSIONS)) drift.push(`${mod}: present in mock but not in real MODULE_PERMISSIONS`);
  }
  if (drift.length) {
    console.error('MODULE_PERMS drifted from js/app.js MODULE_PERMISSIONS:\n' + drift.map((d) => ' - ' + d).join('\n'));
    process.exitCode = 1;
    process.exit(1);
  }
})();
// Every role in this harness can see every module-level gate except the
// system.admin-only ones — mirrors the real app where driver.schedule.view/
// pettycash.view/etc are broadly granted, only system.admin is exclusive.
function canAccessModule(name, role) {
  if (name === 'home') return true;
  const perm = MODULE_PERMS[name];
  if (!perm) return false;
  if (perm === 'system.admin') return role.isAdmin;
  return true; // broad grant for every other coarse module gate in this mock
}

async function run() {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  page.on('console', (msg) => { if (msg.type() === 'error') pageErrors.push(msg.text()); });

  await page.goto('http://localhost:8000/scratch/domain-shell-harness.html', { waitUntil: 'load' });
  await page.waitForFunction('window.__domainShellReady === true');

  const results = { roles: {}, clickRouting: null, nestedFinance: null, syncFromExternal: null };

  for (const [roleName, role] of Object.entries(ROLES)) {
    const out = await page.evaluate(({ roleName, role, canAccessModuleSrc, moduleParams }) => {
      // Rebuild canAccessModule inside the page context (functions don't
      // serialize across evaluate() boundaries).
      const MODULE_PERMS = moduleParams;
      function canAccessModule(name) {
        if (name === 'home') return true;
        const perm = MODULE_PERMS[name];
        if (!perm) return false;
        if (perm === 'system.admin') return role.isAdmin;
        return true;
      }
      const landCalls = [];
      const mkLand = (id) => () => landCalls.push(id);
      const land = {};
      [
        'navHome', 'navJadwalDriver', 'navPending', 'navManajemenDriver', 'navManajemenKendaraan',
        'navAuditDriver', 'navAuditKendaraan', 'navDriverHistory', 'navJadwalSaya',
        'navAnalyticsDriver', 'navDispatchAnalytics', 'navRecommendationAccuracy',
        'navDriverWellness', 'navDriverPrediction', 'navAnalyticsPettyCash',
        'navAnalyticsExecutive', 'navAnalyticsEngineering',
        'navManajemenUser', 'navRoleManagement', 'navKonfigurasiGlobal',
      ].forEach((k) => { land[k] = mkLand(k); });
      land.navGudang = (screen) => landCalls.push(`navGudang:${screen}`);
      land.navPettyCash = (screen) => landCalls.push(`navPettyCash:${screen}`);
      land.navOvertime = (screen) => landCalls.push(`navOvertime:${screen}`);
      land.navEngineering = (screen) => landCalls.push(`navEngineering:${screen}`);
      land.navSarprasIntelligence = (screen) => landCalls.push(`navSarprasIntelligence:${screen}`);

      const setRailModuleCalls = [];
      let activeModule = null;

      // Fresh DOM each role, since initDomainShell() inserts elements once.
      document.querySelector('.domshell-rail')?.remove();
      document.querySelector('.domshell-tabbar')?.remove();

      window.__domainShell.initDomainShell({
        canAccessModule,
        can: (perm) => role.perms.includes(perm),
        isAdmin: () => role.isAdmin,
        isBidang: () => role.isBidang,
        isDriver: () => role.isDriver,
        setRailModule: (name) => { setRailModuleCalls.push(name); activeModule = name; },
        getActiveRailModule: () => activeModule,
        defaultModuleForRole: () => 'home',
        pcMenuTitles: { dashboard: 'Dashboard', expenses: 'Pengeluaran', norGenerate: 'Generate NOR', norHistory: 'Riwayat NOR', settings: 'Pengaturan' },
        otMenuTitles: { dashboard: 'Dashboard', dailyEntry: 'Rekap Lembur', employees: 'Karyawan', rates: 'Tarif', holidays: 'Hari Libur', reports: 'Laporan', reportHistory: 'Riwayat Laporan', records: 'Penyesuaian Data', closing: 'Tutup Periode', archive: 'Arsip' },
        engMenuTitles: { dashboard: 'Dashboard', timeline: 'Timeline', history: 'Riwayat', myjobs: 'Pekerjaan', settings: 'Pengaturan' },
        gudMenuTitles: { dashboard: 'Dashboard', home: 'Catalog', goodsOut: 'Goods Out', goodsIn: 'Goods In', history: 'Movement History', opname: 'Stock Opname', analytics: 'Analytics', intelligence: 'Inventory Intelligence' },
        sicMenuTitles: { dashboard: 'Home', nor: 'NOR', archive: 'Documents', learning: 'Intelligence', settings: 'Settings' },
        mountBefore: document.getElementById('sidebar'),
      getCurrentUser: () => ({ name: 'Test User', role: 'admin' }),
      formatRole: (r) => r,
      logoSrc: '/assets/Logo-PBSI.png',
      brandLabel: 'Sarpras Ops',
      versionLabel: 'test',
        land,
      });

      // Force the initial landing (mirrors app.js's refreshDomainShell(true)
      // call from updatePermissionUI(true), since initDomainShell() itself
      // deliberately doesn't navigate — see its doc comment).
      window.__domainShell.refreshDomainShell(true);

      const railLabels = Array.from(document.querySelectorAll('.domshell-rail-item .domshell-rail-label'))
        .map((el) => el.textContent);
      const activeRailLabel = document.querySelector('.domshell-rail-item--active .domshell-rail-label')?.textContent || null;

      // Navigate to Operations to inspect its tab set for this role (the
      // default landing is Today, which never has a tab row of its own).
      document.querySelector('[data-domain="operations"]')?.click();
      const operationsTabs = Array.from(document.querySelectorAll('.domshell-tab')).map((el) => el.textContent);
      // Computed display, not just DOM presence — a real bug (display:none
      // never cleared because JS set style.display='' against a base CSS
      // rule of display:none) shipped invisible for a whole session despite
      // every DOM-content assertion here passing. Never trust textContent
      // alone for "is this visible" again.
      const tabbarDisplay = getComputedStyle(document.querySelector('.domshell-tabbar')).display;

      // Navigate to Control to check the cross-module Roles tab specifically
      // (module: roleManagement, gated separately from Control's own
      // konfigurasi.view — see the fix in buildDomains()).
      document.querySelector('[data-domain="control"]')?.click();
      const controlTabs = Array.from(document.querySelectorAll('.domshell-tab')).map((el) => el.textContent);

      // Navigate to the new Sarpras Intelligence domain — confirms its
      // screens actually render and route, not just that the rail button
      // exists.
      document.querySelector('[data-domain="sarprasIntelligence"]')?.click();
      const sicTabs = Array.from(document.querySelectorAll('.domshell-tab')).map((el) => el.textContent);

      return { railLabels, activeRailLabel, operationsTabs, controlTabs, sicTabs, tabbarDisplay, landCalls: [...landCalls], setRailModuleCalls: [...setRailModuleCalls] };
    }, { roleName, role, moduleParams: MODULE_PERMS });

    results.roles[roleName] = out;
  }

  // ── Click routing: admin, click "Warehouse" then a screen tab ──
  results.clickRouting = await page.evaluate((role) => {
    document.querySelector('.domshell-rail')?.remove();
    document.querySelector('.domshell-tabbar')?.remove();
    const landCalls = [];
    let activeModule = null;
    window.__domainShell.initDomainShell({
      canAccessModule: (name) => name === 'home' || name === 'gudang' || name === 'driverops',
      can: () => true, isAdmin: () => true, isBidang: () => false, isDriver: () => false,
      setRailModule: (name) => { activeModule = name; },
      getActiveRailModule: () => activeModule,
      defaultModuleForRole: () => 'home',
      pcMenuTitles: {}, otMenuTitles: {}, engMenuTitles: {},
      gudMenuTitles: { dashboard: 'Dashboard', goodsIn: 'Goods In' },
      sicMenuTitles: {},
      mountBefore: document.getElementById('sidebar'),
      getCurrentUser: () => ({ name: 'Test User', role: 'admin' }),
      formatRole: (r) => r,
      logoSrc: '/assets/Logo-PBSI.png',
      brandLabel: 'Sarpras Ops',
      versionLabel: 'test',
      land: {
        navHome: () => landCalls.push('navHome'),
        navJadwalDriver: () => landCalls.push('navJadwalDriver'),
        navPending: () => {}, navManajemenDriver: () => {}, navManajemenKendaraan: () => {},
        navAuditDriver: () => {}, navAuditKendaraan: () => {}, navDriverHistory: () => {},
        navGudang: (s) => landCalls.push(`navGudang:${s}`),
        navPettyCash: () => {}, navOvertime: () => {}, navEngineering: () => {},
        navAnalyticsDriver: () => {}, navDispatchAnalytics: () => {}, navRecommendationAccuracy: () => {},
        navDriverWellness: () => {}, navDriverPrediction: () => {}, navAnalyticsPettyCash: () => {},
        navAnalyticsExecutive: () => {}, navAnalyticsEngineering: () => {},
        navManajemenUser: () => {}, navRoleManagement: () => {}, navKonfigurasiGlobal: () => {},
      },
    });
    window.__domainShell.refreshDomainShell(true);
    document.querySelector('[data-domain="warehouse"]')?.click();
    const afterDomainClick = { activeModule, landCalls: [...landCalls] };
    document.querySelector('[data-top="goodsIn"]')?.click();
    return { afterDomainClick, afterTabClick: { activeModule, landCalls: [...landCalls] } };
  });

  // ── Nested module: Finance -> Overtime top-tab should reach a sub-tab ──
  results.nestedFinance = await page.evaluate(() => {
    document.querySelector('.domshell-rail')?.remove();
    document.querySelector('.domshell-tabbar')?.remove();
    const landCalls = [];
    let activeModule = null;
    window.__domainShell.initDomainShell({
      canAccessModule: (name) => ['home', 'pettycash', 'overtime'].includes(name),
      can: () => true, isAdmin: () => true, isBidang: () => false, isDriver: () => false,
      setRailModule: (name) => { activeModule = name; },
      getActiveRailModule: () => activeModule,
      defaultModuleForRole: () => 'home',
      pcMenuTitles: { dashboard: 'Dashboard', expenses: 'Pengeluaran' },
      otMenuTitles: { dashboard: 'Dashboard', employees: 'Karyawan' },
      engMenuTitles: {}, gudMenuTitles: {}, sicMenuTitles: {},
      mountBefore: document.getElementById('sidebar'),
      getCurrentUser: () => ({ name: 'Test User', role: 'admin' }),
      formatRole: (r) => r,
      logoSrc: '/assets/Logo-PBSI.png',
      brandLabel: 'Sarpras Ops',
      versionLabel: 'test',
      land: {
        navHome: () => {}, navJadwalDriver: () => {}, navPending: () => {},
        navManajemenDriver: () => {}, navManajemenKendaraan: () => {},
        navAuditDriver: () => {}, navAuditKendaraan: () => {}, navDriverHistory: () => {},
        navGudang: () => {},
        navPettyCash: (s) => landCalls.push(`navPettyCash:${s}`),
        navOvertime: (s) => landCalls.push(`navOvertime:${s}`),
        navEngineering: () => {},
        navAnalyticsDriver: () => {}, navDispatchAnalytics: () => {}, navRecommendationAccuracy: () => {},
        navDriverWellness: () => {}, navDriverPrediction: () => {}, navAnalyticsPettyCash: () => {},
        navAnalyticsExecutive: () => {}, navAnalyticsEngineering: () => {},
        navManajemenUser: () => {}, navRoleManagement: () => {}, navKonfigurasiGlobal: () => {},
      },
    });
    window.__domainShell.refreshDomainShell(true);
    document.querySelector('[data-domain="finance"]')?.click();
    const landedOnCash = [...landCalls];
    document.querySelector('[data-top="overtime"]')?.click();
    const landedOnOvertimeDefault = [...landCalls];
    const subTabLabels = Array.from(document.querySelectorAll('.domshell-tab--sub')).map((el) => el.textContent);
    document.querySelector('[data-sub="employees"]')?.click();
    return { landedOnCash, landedOnOvertimeDefault, subTabLabels, afterSubClick: [...landCalls], finalActiveModule: activeModule };
  });

  // ── syncDomainShellActiveState: external setRailModule('pettycash') call
  //    (simulating a deep link this shell doesn't own) should re-highlight
  //    the Finance domain in the rail without going through enterDomain(). ──
  results.syncFromExternal = await page.evaluate(() => {
    document.querySelector('.domshell-rail')?.remove();
    document.querySelector('.domshell-tabbar')?.remove();
    let activeModule = 'home';
    window.__domainShell.initDomainShell({
      canAccessModule: (name) => ['home', 'pettycash'].includes(name),
      can: () => true, isAdmin: () => true, isBidang: () => false, isDriver: () => false,
      setRailModule: (name) => { activeModule = name; },
      getActiveRailModule: () => activeModule,
      defaultModuleForRole: () => 'home',
      pcMenuTitles: { dashboard: 'Dashboard' }, otMenuTitles: {}, engMenuTitles: {}, gudMenuTitles: {}, sicMenuTitles: {},
      mountBefore: document.getElementById('sidebar'),
      getCurrentUser: () => ({ name: 'Test User', role: 'admin' }),
      formatRole: (r) => r,
      logoSrc: '/assets/Logo-PBSI.png',
      brandLabel: 'Sarpras Ops',
      versionLabel: 'test',
      land: {
        navHome: () => {}, navJadwalDriver: () => {}, navPending: () => {},
        navManajemenDriver: () => {}, navManajemenKendaraan: () => {},
        navAuditDriver: () => {}, navAuditKendaraan: () => {}, navDriverHistory: () => {},
        navGudang: () => {}, navPettyCash: () => {}, navOvertime: () => {}, navEngineering: () => {},
        navAnalyticsDriver: () => {}, navDispatchAnalytics: () => {}, navRecommendationAccuracy: () => {},
        navDriverWellness: () => {}, navDriverPrediction: () => {}, navAnalyticsPettyCash: () => {},
        navAnalyticsExecutive: () => {}, navAnalyticsEngineering: () => {},
        navManajemenUser: () => {}, navRoleManagement: () => {}, navKonfigurasiGlobal: () => {},
      },
    });
    window.__domainShell.refreshDomainShell(true); // lands on 'today', activeModule='home'
    const before = document.querySelector('.domshell-rail-item--active .domshell-rail-label')?.textContent;
    // Simulate a deep link elsewhere in the app calling setRailModule('pettycash')
    // directly, then the app.js hook calling syncDomainShellActiveState().
    activeModule = 'pettycash';
    window.__domainShell.syncDomainShellActiveState();
    const after = document.querySelector('.domshell-rail-item--active .domshell-rail-label')?.textContent;
    return { before, after };
  });

  await browser.close();

  console.log(JSON.stringify(results, null, 2));
  console.log('\n--- PAGE ERRORS ---');
  console.log(pageErrors.length ? pageErrors : 'none');

  // ── Assertions ──
  // This mock's canAccessModule() intentionally grants every role broad
  // module-level access (mirrors driver.schedule.view/pettycash.view/etc.
  // being broadly granted in the real app) EXCEPT roleManagement, which is
  // system.admin-gated — so the interesting per-role signal isn't "which
  // rail domains show" (same set for everyone in this mock) but "which
  // ADMIN-ONLY screens within a visible domain are correctly hidden".
  const fail = [];
  const a = results.roles.admin;
  if (!a.railLabels.includes('Today') || !a.railLabels.includes('Operations') || !a.railLabels.includes('Control')) fail.push('admin missing expected rail domains');
  if (!a.railLabels.includes('Engineering')) fail.push('admin missing Engineering rail domain (regression: this was silently broken by the MODULE_PERMS gap fixed above)');
  if (!a.railLabels.includes('Sarpras Intelligence')) fail.push('admin missing Sarpras Intelligence rail domain (was entirely absent from the IA before this phase)');
  if (!a.sicTabs.includes('Home') || !a.sicTabs.includes('NOR') || !a.sicTabs.includes('Settings')) fail.push(`admin Sarpras Intelligence tabs incomplete: ${JSON.stringify(a.sicTabs)}`);
  if (!a.landCalls.includes('navSarprasIntelligence:dashboard')) fail.push('clicking Sarpras Intelligence domain did not land on its default (dashboard) screen');
  if (!a.operationsTabs.includes('Drivers') || !a.operationsTabs.includes('Vehicles') || !a.operationsTabs.some(l => l.includes('Audit'))) fail.push('admin missing Master Data/Audit tabs in Operations');
  if (a.tabbarDisplay !== 'flex') fail.push(`tab bar has tab content but computed display is "${a.tabbarDisplay}", not visible`);
  if (!a.controlTabs.includes('Roles')) fail.push('admin missing Roles tab in Control');

  const b = results.roles.bidang;
  if (!b.railLabels.includes('Engineering')) fail.push('bidang missing Engineering rail domain (mock grants eng.view broadly, same as pettycash/overtime/gudang)');
  if (b.operationsTabs.includes('Drivers') || b.operationsTabs.includes('Vehicles') || b.operationsTabs.some(l => l.includes('Audit'))) {
    fail.push(`bidang (non-admin) should NOT see Master Data/Audit tabs, got: ${JSON.stringify(b.operationsTabs)}`);
  }
  if (b.controlTabs.includes('Roles')) fail.push('bidang (non-admin) should NOT see the Roles tab (system.admin-gated) — cross-module visibility gap');

  const d = results.roles.driver;
  if (d.controlTabs.includes('Roles')) fail.push('driver should NOT see the Roles tab');
  if (!d.operationsTabs.includes('Jadwal Saya')) fail.push('driver missing the Jadwal Saya tab (equivalence-check regression fixed in domain-shell.js this phase)');
  if (d.operationsTabs.includes('Drivers') || d.operationsTabs.includes('Vehicles')) fail.push('driver should NOT see Master Data tabs (admin-only)');

  if (results.clickRouting.afterDomainClick.activeModule !== 'gudang') fail.push('clicking Warehouse domain did not setRailModule(gudang)');
  if (!results.clickRouting.afterTabClick.landCalls.includes('navGudang:goodsIn')) fail.push('clicking Goods In tab did not call navGudang(goodsIn)');

  if (!results.nestedFinance.landedOnCash.includes('navPettyCash:dashboard')) fail.push('Finance domain default landing did not call navPettyCash(dashboard)');
  if (!results.nestedFinance.landedOnOvertimeDefault.includes('navOvertime:dashboard')) fail.push('Finance->Overtime top-tab did not call navOvertime(dashboard)');
  if (!results.nestedFinance.subTabLabels.includes('Karyawan')) fail.push('Overtime sub-tab strip missing Karyawan');
  if (!results.nestedFinance.afterSubClick.includes('navOvertime:employees')) fail.push('clicking Overtime sub-tab did not call navOvertime(employees)');
  if (results.nestedFinance.finalActiveModule !== 'overtime') fail.push('activeModule should be overtime after entering the nested Overtime module');

  if (results.syncFromExternal.before !== 'Today') fail.push(`expected initial active domain Today, got ${results.syncFromExternal.before}`);
  if (results.syncFromExternal.after !== 'Finance') fail.push(`syncDomainShellActiveState did not re-highlight Finance after external setRailModule('pettycash'), got ${results.syncFromExternal.after}`);

  const realErrors = pageErrors.filter((e) => !/favicon\.ico/.test(e));
  if (realErrors.length) fail.push(`console/page errors: ${realErrors.join(' | ')}`);

  if (fail.length) {
    console.error('\nFAILURES:\n' + fail.map((f) => ' - ' + f).join('\n'));
    process.exitCode = 1;
  } else {
    console.log('\nAll domain-shell.js logic checks passed.');
  }
}

run().catch((err) => { console.error(err); process.exitCode = 1; });
