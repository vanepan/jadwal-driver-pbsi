const puppeteer = require('puppeteer');
const path = require('path');
(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 1000 });
  await page.goto('http://localhost:8000/scratch/modal-drawer-harness.html', { waitUntil: 'load' });
  await page.evaluate(() => localStorage.setItem('pbsi_current_user', JSON.stringify({username:'admin1',name:'Admin',role:'admin'})));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction('window.__modalHarnessReady === true');
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await page.evaluate((list) => window.__modal.setAssignments(list), [{ id: 'a1', driver: 'Dedi', phone: '0812', vehicle: 'Avanza A', date: '2026-08-20', startTime: '08:00', endTime: '10:00', destination: 'Kemenpora', purpose: 'Antar Delegasi', pic: 'Grace', pax: 2, status: 'assigned' }]);
  await page.evaluate(() => window.__modal.openDetailModal('a1'));
  await new Promise(r => setTimeout(r, 400));
  await page.screenshot({ path: path.join(__dirname, 'modal-drawer-verify', 'dark-mode.png') });
  await browser.close();
})();
