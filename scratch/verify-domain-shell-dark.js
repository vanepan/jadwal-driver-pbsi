const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const OUT_DIR = path.join(__dirname, 'domain-shell-smoke');
fs.mkdirSync(OUT_DIR, { recursive: true });

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  page.on('console', (msg) => { if (msg.type() === 'error') pageErrors.push(msg.text()); });

  await page.goto('http://localhost:8000/index.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.setItem('pbsi_flag_visualShellV2', 'true');
    localStorage.setItem('pbsi_flag_domainShellV1', 'true');
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.addStyleTag({ content: '#modalLogin, #app-splash { display: none !important; }' });
  await new Promise((r) => setTimeout(r, 1200));
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await new Promise((r) => setTimeout(r, 300));
  await page.setViewport({ width: 1440, height: 900 });
  await page.screenshot({ path: path.join(OUT_DIR, 'desktop-1440-dark.png') });
  // open palette in dark too
  await page.evaluate(() => document.querySelector('.domshell-palette-trigger')?.click());
  await new Promise((r) => setTimeout(r, 200));
  await page.screenshot({ path: path.join(OUT_DIR, 'palette-dark.png') });

  await browser.close();
  console.log('errors:', pageErrors.length ? pageErrors : 'none');
})();
