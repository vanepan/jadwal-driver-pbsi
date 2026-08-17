const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  let allOk = true;

  for (const theme of ['light', 'dark']) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
    await page.goto('http://localhost:8000/index.html', { waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 1000));
    await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme);

    // 1. Vehicle drawer tabs still work end-to-end
    const drawerResult = await page.evaluate(async () => {
      const mod = await import('/js/components/vehicle-detail-drawer.js');
      const svc = await import('/js/services/vehicle-asset-service.js');
      const raw = { id: 'v1', name: 'QA Vehicle', plateNumber: 'B 9999 QA', type: 'car', status: 'active', vehicleType: 'Innova', taxDueDate: '2027-01-01', insuranceExpiry: '2027-01-01', fiveYearTaxDueDate: '2029-01-01', odometer: 1000 };
      const asset = svc.normalizeVehicleAsset(raw);
      mod.openVehicleDetailDrawer(asset, {});
      const panelCount = document.querySelectorAll('.vad-tabpanel').length;
      mod.closeVehicleDetailDrawer();
      await new Promise(r => setTimeout(r, 350));
      const stillOpen = !!document.querySelector('.exec-drawer-overlay.is-open');
      return { panelCount, closesCleanly: !stillOpen };
    });

    // 2. Legend + vehicle select still populate (Phase 4a, still intact)
    const legendResult = await page.evaluate(() => {
      const legend = document.querySelector('.legend');
      const sel = document.getElementById('fieldVehicle');
      return {
        legendItems: legend ? legend.querySelectorAll('.legend-item').length : null,
        selectOptions: sel ? sel.options.length : null,
      };
    });

    console.log(`[${theme}] drawer:`, JSON.stringify(drawerResult), '| legend/select:', JSON.stringify(legendResult));
    if (errors.length) { console.log(`[${theme}] ERRORS:`, errors); allOk = false; }
    await page.close();
  }

  console.log(allOk ? '\nALL CLEAN — no console/page errors in either theme' : '\nERRORS FOUND — see above');
  await browser.close();
})();
