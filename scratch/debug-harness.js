const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  page.on('console', (msg) => console.log('[console]', msg.type(), msg.text()));
  page.on('pageerror', (err) => console.log('[pageerror]', err.message));
  page.on('requestfailed', (req) => console.log('[requestfailed]', req.url(), req.failure()?.errorText));
  await page.goto('http://localhost:8000/scratch/exec-home-harness.html', { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 2000));
  const ready = await page.evaluate(() => window.__execHarnessReady);
  console.log('ready:', ready);
  await browser.close();
})();
