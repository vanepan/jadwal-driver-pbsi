const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', err => errors.push(err.message));
  await page.goto('http://localhost:8000/index.html', { waitUntil: 'domcontentloaded' });

  const result = await page.evaluate(() => {
    const cases = [
      { html: '<button class="p-btn p-btn-primary">Primary</button>', check: el => getComputedStyle(el).minHeight },
      { html: '<button class="p-btn p-btn-secondary">Secondary</button>', check: el => getComputedStyle(el).backgroundColor },
      { html: '<button class="p-btn p-btn-tertiary">Tertiary</button>', check: el => getComputedStyle(el).color },
      { html: '<button class="p-btn p-btn-icon"></button>', check: el => getComputedStyle(el).minWidth + '/' + getComputedStyle(el).minHeight },
      { html: '<span class="p-pill p-pill--removable ok">OK<button class="p-pill-remove">x</button></span>', check: el => getComputedStyle(el).paddingRight },
      { html: '<div class="p-card"><div class="p-card-title">T</div><div class="p-card-sub">S</div></div>', check: el => getComputedStyle(el).boxShadow },
      { html: '<div class="p-card p-card--boxed"></div>', check: el => getComputedStyle(el).boxShadow },
      { html: '<div class="p-table-wrap"><table class="p-table"><tr><th>H</th></tr><tr><td>D</td></tr></table></div>', check: el => getComputedStyle(el).overflowX },
      { html: '<div class="p-navitem p-navitem--active">Nav</div>', check: el => getComputedStyle(el).backgroundColor },
      { html: '<div class="p-tabs"><button class="p-tab p-tab--active">A</button></div>', check: el => getComputedStyle(el).borderBottomColor },
      { html: '<div class="p-kpi-strip"><div class="p-kpi"><div class="p-kpi-label">L</div><div class="p-kpi-value">42</div><div class="p-kpi-delta p-kpi-delta--up">+1</div></div></div>', check: el => getComputedStyle(el).display },
      { html: '<div class="p-error"><div class="p-error-icon"></div><div class="p-error-title">T</div></div>', check: el => getComputedStyle(el).color },
    ];
    const out = [];
    for (const c of cases) {
      const wrap = document.createElement('div');
      wrap.innerHTML = c.html;
      document.body.appendChild(wrap);
      const target = wrap.firstElementChild;
      out.push({ html: c.html.slice(0, 60), value: c.check(target) });
      wrap.remove();
    }
    return out;
  });

  console.log('=== Phase 2 component sanity ===');
  for (const r of result) console.log(`  ${r.html}... -> ${r.value}`);
  console.log('\n=== Console/page errors ===');
  console.log(errors.length ? errors.join('\n') : '(none)');

  await browser.close();
})();
