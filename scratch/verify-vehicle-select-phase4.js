const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', err => errors.push(err.message));
  await page.goto('http://localhost:8000/index.html', { waitUntil: 'networkidle2', timeout: 20000 }).catch(e => console.log('nav warn:', e.message));

  // give module init a moment to run (mirrors initApp's async init sequence)
  await new Promise(r => setTimeout(r, 1500));

  const result = await page.evaluate(() => {
    const legend = document.querySelector('.legend');
    const sel = document.getElementById('fieldVehicle');
    return {
      legendItemCount: legend ? legend.querySelectorAll('.legend-item').length : null,
      legendHTML: legend ? legend.innerHTML : null,
      selectOptionCount: sel ? sel.options.length : null,
      selectOptionValues: sel ? Array.from(sel.options).map(o => o.value) : null,
    };
  });

  console.log('Result:', JSON.stringify(result, null, 2));
  console.log('\nErrors:', errors.length ? errors.slice(0, 10).join('\n') : '(none)');

  await browser.close();
})();
