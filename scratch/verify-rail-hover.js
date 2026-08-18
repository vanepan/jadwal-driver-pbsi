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

  await page.goto('http://localhost:8000/index.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.setItem('pbsi_flag_visualShellV2', 'true');
    localStorage.setItem('pbsi_flag_domainShellV1', 'true');
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.addStyleTag({ content: '#modalLogin, #app-splash { display: none !important; }' });
  await new Promise((r) => setTimeout(r, 1200));
  await page.setViewport({ width: 1440, height: 900 });

  // State 1: mouse away from rail (default/collapsed)
  await page.mouse.move(700, 500);
  await new Promise((r) => setTimeout(r, 300));
  const beforeHover = await page.evaluate(() => {
    const rail = document.querySelector('.domshell-rail');
    return rail ? { width: rail.getBoundingClientRect().width, cssWidth: getComputedStyle(rail).width } : null;
  });
  await page.screenshot({ path: path.join(OUT_DIR, 'rail-collapsed.png') });

  // State 2: hover directly over the rail
  const railBox = await page.evaluate(() => {
    const rail = document.querySelector('.domshell-rail');
    const r = rail.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + 40 };
  });
  await page.mouse.move(railBox.x, railBox.y);
  await new Promise((r) => setTimeout(r, 400)); // clear the 200ms width transition
  const duringHover = await page.evaluate(() => {
    const rail = document.querySelector('.domshell-rail');
    const label = document.querySelector('.domshell-rail-label');
    return {
      width: rail.getBoundingClientRect().width,
      cssWidth: getComputedStyle(rail).width,
      labelOpacity: label ? getComputedStyle(label).opacity : null,
      isHovered: rail.matches(':hover'),
    };
  });
  await page.screenshot({ path: path.join(OUT_DIR, 'rail-hovered.png') });

  await browser.close();

  console.log('BEFORE HOVER:', JSON.stringify(beforeHover, null, 2));
  console.log('DURING HOVER:', JSON.stringify(duringHover, null, 2));
  console.log('PAGE ERRORS:', pageErrors.length ? pageErrors : 'none');

  const fail = [];
  if (!beforeHover) fail.push('rail not found');
  else if (beforeHover.width > 100) fail.push(`rail should be collapsed (~72px) by default, got ${beforeHover.width}px`);
  if (!duringHover.isHovered) fail.push(':hover pseudo-class not actually matching during simulated hover — mouse position may be off target');
  if (duringHover.width < 150) fail.push(`rail should expand to ~220px on hover, got ${duringHover.width}px`);
  if (duringHover.labelOpacity !== '1') fail.push(`rail labels should be visible (opacity:1) on hover, got opacity:${duringHover.labelOpacity}`);

  if (fail.length) {
    console.error('\nFAILURES:\n' + fail.map((f) => ' - ' + f).join('\n'));
    process.exitCode = 1;
  } else {
    console.log('\nRail collapse/hover-expand behavior verified.');
  }
})();
