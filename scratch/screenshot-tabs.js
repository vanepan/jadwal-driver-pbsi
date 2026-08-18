const puppeteer = require('puppeteer');
const path = require('path');
(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto('http://localhost:8000/scratch/domain-shell-harness.html', { waitUntil: 'load' });
  await page.waitForFunction('window.__domainShellReady === true');
  await page.evaluate(() => {
    const land = {};
    ['navHome','navJadwalDriver','navPending','navManajemenDriver','navManajemenKendaraan','navAuditDriver','navAuditKendaraan','navDriverHistory'].forEach(k => land[k] = () => {});
    land.navGudang = () => {}; land.navPettyCash = () => {}; land.navOvertime = () => {}; land.navEngineering = () => {};
    ['navAnalyticsDriver','navDispatchAnalytics','navRecommendationAccuracy','navDriverWellness','navDriverPrediction','navAnalyticsPettyCash','navAnalyticsExecutive','navAnalyticsEngineering','navManajemenUser','navRoleManagement','navKonfigurasiGlobal'].forEach(k => land[k] = () => {});
    let activeModule = null;
    window.__domainShell.initDomainShell({
      canAccessModule: () => true, can: () => true, isAdmin: () => true, isBidang: () => false, isDriver: () => false,
      setRailModule: (n) => { activeModule = n; }, getActiveRailModule: () => activeModule,
      defaultModuleForRole: () => 'home',
      pcMenuTitles: { dashboard: 'Dashboard', expenses: 'Pengeluaran', norGenerate: 'Generate NOR', norHistory: 'Riwayat NOR', settings: 'Pengaturan' },
      otMenuTitles: { dashboard: 'Dashboard', dailyEntry: 'Rekap Lembur', employees: 'Karyawan', rates: 'Tarif', holidays: 'Hari Libur', reports: 'Laporan', reportHistory: 'Riwayat Laporan', records: 'Penyesuaian Data', closing: 'Tutup Periode', archive: 'Arsip' },
      engMenuTitles: { dashboard: 'Dashboard', timeline: 'Timeline', history: 'Riwayat', myjobs: 'Pekerjaan', settings: 'Pengaturan' },
      gudMenuTitles: { dashboard: 'Dashboard', home: 'Catalog', goodsOut: 'Goods Out', goodsIn: 'Goods In', history: 'Movement History', opname: 'Stock Opname', analytics: 'Analytics', intelligence: 'Inventory Intelligence' },
      mountBefore: document.getElementById('sidebar'), land,
    });
    window.__domainShell.refreshDomainShell(true);
    document.querySelector('[data-domain="operations"]')?.click();
  });
  await page.setViewport({ width: 1000, height: 500 });
  await page.screenshot({ path: path.join(__dirname, 'domain-shell-smoke', 'tabs-operations.png') });
  await browser.close();
})();
