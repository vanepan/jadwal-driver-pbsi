const puppeteer = require('puppeteer');
const path = require('path');
(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto('http://localhost:8000/index.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.setItem('pbsi_flag_visualShellV2', 'true');
    localStorage.setItem('pbsi_flag_domainShellV1', 'true');
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.addStyleTag({ content: '#modalLogin, #app-splash { display: none !important; }' });
  await new Promise(r => setTimeout(r, 1200));
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await page.setViewport({ width: 1440, height: 900 });
  const railBox = await page.evaluate(() => {
    const rail = document.querySelector('.domshell-rail');
    const r = rail.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + 40 };
  });
  await page.mouse.move(railBox.x, railBox.y);
  await new Promise(r => setTimeout(r, 400));
  await page.screenshot({ path: path.join(__dirname, 'domain-shell-smoke', 'rail-hovered-dark.png') });
  await browser.close();
})();
