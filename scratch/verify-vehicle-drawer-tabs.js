const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto('http://localhost:8000/index.html', { waitUntil: 'domcontentloaded' });

  // Actually import the real module and call its exported functions, so this
  // exercises the real CSS injection (ensureStyles) and the real buildTabGroup
  // output — not a hand-copied approximation.
  const result = await page.evaluate(async () => {
    const mod = await import('/js/components/vehicle-detail-drawer.js');
    const svc = await import('/js/services/vehicle-asset-service.js');
    const raw = {
      id: 'v1', name: 'Test Vehicle', plateNumber: 'B 1234 XY', type: 'car',
      status: 'active', vehicleType: 'Innova',
      taxDueDate: '2027-01-01', insuranceExpiry: '2027-01-01',
      fiveYearTaxDueDate: '2029-01-01', odometer: 45000,
    };
    let fakeAsset;
    try {
      fakeAsset = svc.normalizeVehicleAsset(raw);
    } catch (e) {
      return { error: 'normalize threw: ' + e.message, stack: e.stack };
    }
    let drawerEl;
    try {
      drawerEl = mod.openVehicleDetailDrawer(fakeAsset, {});
    } catch (e) {
      return { error: 'open threw: ' + e.message, stack: e.stack };
    }
    if (!drawerEl) return { error: 'openVehicleDetailDrawer returned null' };

    const panels = Array.from(document.querySelectorAll('.vad-tabpanel')).map(p => p.dataset.panel);
    const labels = Array.from(document.querySelectorAll('.vad-tabnav-label')).map(l => l.textContent);
    const initiallyVisible = Array.from(document.querySelectorAll('.vad-tabpanel'))
      .filter(p => getComputedStyle(p).display !== 'none').map(p => p.dataset.panel);

    // Click tab 3's label and check panel visibility flips.
    const label3 = document.querySelector('label[for="vadtab-3"]');
    label3.click();
    await new Promise(r => setTimeout(r, 50));
    const afterClickVisible = Array.from(document.querySelectorAll('.vad-tabpanel'))
      .filter(p => getComputedStyle(p).display !== 'none').map(p => p.dataset.panel);
    const activeLabelBg = getComputedStyle(label3).backgroundColor;
    const inactiveLabel = document.querySelector('label[for="vadtab-1"]');
    const inactiveLabelBg = getComputedStyle(inactiveLabel).backgroundColor;

    return {
      panelCount: panels.length,
      panelIds: panels,
      labels,
      initiallyVisible,
      afterClickVisible,
      activeLabelBg,
      inactiveLabelBg,
    };
  });

  console.log('LIGHT theme:', JSON.stringify(result, null, 2));

  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  const darkCheck = await page.evaluate(() => {
    const label3 = document.querySelector('label[for="vadtab-3"]');
    return { activeLabelBgDark: getComputedStyle(label3).backgroundColor };
  });
  console.log('DARK theme:', JSON.stringify(darkCheck, null, 2));

  await browser.close();
})();
