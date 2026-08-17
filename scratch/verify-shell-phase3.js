const puppeteer = require('puppeteer');

const SELECTORS = ['.sidebar', '.header', '.sidebar-nav-primary', '.brand-title', '.header-display-name', '.role-badge'];

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  for (const theme of ['light', 'dark']) {
    const page = await browser.newPage();
    const errors = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    page.on('pageerror', err => errors.push(err.message));
    await page.goto('http://localhost:8000/index.html', { waitUntil: 'domcontentloaded' });
    await page.evaluate((t) => { document.documentElement.setAttribute('data-theme', t); }, theme);

    console.log(`\n=== ${theme.toUpperCase()} shell ===`);
    const vals = await page.evaluate((sels) => {
      const out = {};
      for (const s of sels) {
        const el = document.querySelector(s);
        if (!el) { out[s] = '(NOT FOUND IN DOM)'; continue; }
        const cs = getComputedStyle(el);
        out[s] = { bg: cs.backgroundColor, color: cs.color, border: cs.borderBottomColor };
      }
      return out;
    }, SELECTORS);
    for (const [sel, v] of Object.entries(vals)) console.log(`  ${sel}:`, v);
    if (errors.length) console.log('  errors:', errors);
    await page.close();
  }
  await browser.close();
})();
