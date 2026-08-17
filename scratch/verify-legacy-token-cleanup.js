const puppeteer = require('puppeteer');

const CASES = [
  ['.modal-box', 'backgroundColor'], ['.modal-title', 'color'],
  ['.btn-primary', 'backgroundColor'], ['.btn-danger', 'backgroundColor'],
  ['.form-group input', 'color'],
  ['.timeline-wrapper', 'backgroundColor'], ['.notif-card', 'backgroundColor'],
  ['.dash-card', 'backgroundColor'], ['.request-card', 'backgroundColor'],
  ['.legend', 'backgroundColor'], ['.odo-modal', 'backgroundColor'],
  ['.bottom-nav', 'backgroundColor'], ['.fab-add', 'backgroundColor'],
  ['.profile-avatar', 'backgroundColor'], ['.toast', 'backgroundColor'],
  ['.switch-slider', 'backgroundColor'],
];

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  for (const theme of ['light', 'dark']) {
    const page = await browser.newPage();
    const errors = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    page.on('pageerror', err => errors.push(err.message));
    await page.goto('http://localhost:8000/index.html', { waitUntil: 'domcontentloaded' });
    await page.evaluate((t) => { document.documentElement.setAttribute('data-theme', t); }, theme);

    console.log(`\n=== ${theme.toUpperCase()} ===`);
    const vals = await page.evaluate((cases) => {
      const out = {};
      for (const [sel, prop] of cases) {
        const wrap = document.createElement('div');
        wrap.innerHTML = `<div class="${sel.slice(1)}"></div>`;
        document.body.appendChild(wrap);
        const el = wrap.firstElementChild;
        out[sel] = getComputedStyle(el)[prop];
        wrap.remove();
      }
      return out;
    }, CASES);
    for (const [k, v] of Object.entries(vals)) console.log(`  ${k}: ${v}`);
    if (errors.length) console.log('  ERRORS:', errors.slice(0, 5));
    await page.close();
  }
  await browser.close();
})();
