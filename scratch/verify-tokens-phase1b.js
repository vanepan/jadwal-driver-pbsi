const puppeteer = require('puppeteer');

const TOKENS = [
  '--accent', '--on-accent', '--accent-hover', '--accent-subtle',
  '--shadow-sm', '--shadow-md', '--shadow-lg',
  '--info', '--ok', '--warn', '--danger',
  '--space-1', '--space-8', '--motion-pop', '--motion-theme', '--bp-md', '--type-body-sm',
];

const SCOPES = [
  { cls: 'gud-root', tokens: ['--accent', '--crit', '--c-green', '--c-blue', '--c-amber', '--shadow-sm', '--primary'] },
  { cls: 'eng-root', tokens: ['--accent', '--crit', '--c-green', '--c-blue', '--c-amber', '--c-violet', '--c-teal', '--c-neutral', '--shadow-sm'] },
  { cls: 'v2-analytics-claude', tokens: ['--accent', '--crit', '--c-green', '--c-blue', '--c-amber', '--c-neutral', '--shadow-sm', '--radius-sm', '--radius-lg'] },
  { cls: 'ot-root', tokens: ['--primary', '--primary-fg', '--primary-tint', '--primary-text', '--primary-hover', '--shadow-lg'] },
  { cls: 'pc-root', tokens: ['--primary', '--primary-fg', '--primary-tint', '--primary-text', '--primary-hover', '--shadow-lg'] },
];

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  for (const theme of ['light', 'dark']) {
    const page = await browser.newPage();
    page.on('console', msg => { if (msg.type() === 'error') console.log('  [console error]', msg.text()); });
    page.on('pageerror', err => console.log('  [page error]', err.message));
    await page.goto('http://localhost:8000/index.html', { waitUntil: 'domcontentloaded' });
    await page.evaluate((t) => { document.documentElement.setAttribute('data-theme', t); }, theme);

    console.log(`\n=== ${theme.toUpperCase()} :root ===`);
    const rootVals = await page.evaluate((tokens) => {
      const cs = getComputedStyle(document.documentElement);
      return Object.fromEntries(tokens.map(t => [t, cs.getPropertyValue(t).trim()]));
    }, TOKENS);
    for (const [k, v] of Object.entries(rootVals)) console.log(`  ${k}: ${v || '(EMPTY/INVALID)'}`);

    for (const scope of SCOPES) {
      const el = await page.evaluate((cls, tokens) => {
        const wrap = document.createElement('div');
        wrap.className = cls;
        document.body.appendChild(wrap);
        const cs = getComputedStyle(wrap);
        const out = Object.fromEntries(tokens.map(t => [t, cs.getPropertyValue(t).trim()]));
        wrap.remove();
        return out;
      }, scope.cls, scope.tokens);
      console.log(`  .${scope.cls}:`);
      for (const [k, v] of Object.entries(el)) console.log(`    ${k}: ${v || '(EMPTY/INVALID)'}`);
    }
    await page.close();
  }
  await browser.close();
})();
