const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto('http://localhost:8000/scratch/domain-shell-harness.html', { waitUntil: 'load' });
  await page.waitForFunction('window.__domainShellReady === true');
  const out = await page.evaluate(() => {
    const land = {};
    ['navHome','navJadwalDriver','navPending','navManajemenDriver','navManajemenKendaraan','navAuditDriver','navAuditKendaraan','navDriverHistory'].forEach(k => land[k] = () => {});
    land.navGudang = () => {}; land.navPettyCash = () => {}; land.navOvertime = () => {}; land.navEngineering = () => {};
    ['navAnalyticsDriver','navDispatchAnalytics','navRecommendationAccuracy','navDriverWellness','navDriverPrediction','navAnalyticsPettyCash','navAnalyticsExecutive','navAnalyticsEngineering','navManajemenUser','navRoleManagement','navKonfigurasiGlobal'].forEach(k => land[k] = () => {});
    let activeModule = null;
    window.__domainShell.initDomainShell({
      canAccessModule: () => true, can: () => true, isAdmin: () => true, isBidang: () => false, isDriver: () => false,
      setRailModule: (n) => { activeModule = n; }, getActiveRailModule: () => activeModule,
      defaultModuleForRole: () => 'home',
      pcMenuTitles: { dashboard: 'Dashboard' }, otMenuTitles: {}, engMenuTitles: {}, gudMenuTitles: {},
      mountBefore: document.getElementById('sidebar'), land,
    });
    window.__domainShell.refreshDomainShell(true);
    document.querySelector('[data-domain="operations"]')?.click();
    const tabbar = document.querySelector('.domshell-tabbar');
    return {
      tabbarExists: !!tabbar,
      tabbarDisplay: tabbar ? getComputedStyle(tabbar).display : null,
      tabbarHTML: tabbar ? tabbar.innerHTML.slice(0, 300) : null,
      tabbarParent: tabbar ? tabbar.parentElement.className : null,
      tabbarRect: tabbar ? tabbar.getBoundingClientRect() : null,
    };
  });
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
})();
