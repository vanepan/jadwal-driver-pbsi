const puppeteer = require('puppeteer');
const path = require('path');
(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto('http://localhost:8000/index.html', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1500));
  await page.setViewport({ width: 1440, height: 900 });
  await page.screenshot({ path: path.join(__dirname, 'domain-shell-smoke', 'login-light.png') });
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await new Promise(r => setTimeout(r, 300));
  await page.screenshot({ path: path.join(__dirname, 'domain-shell-smoke', 'login-dark.png') });
  await browser.close();
})();
