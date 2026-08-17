const puppeteer = require('puppeteer');

const VIEWPORTS = [
  { name: 'narrow-mobile-320', width: 320, height: 700 },
  { name: 'mobile-375', width: 375, height: 812 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'desktop-1440', width: 1440, height: 900 },
];

const MARKUP = `
<div id="v2TimelineSurface">
  <div class="v2-tl-header">
    <div class="v2-tl-header-left"><span class="v2-tl-title">Papan Jadwal</span></div>
    <div class="v2-tl-header-right">
      <div class="v2-tl-view-toggle" role="group">
        <button class="v2-tl-view-btn v2-tl-view-btn--active" data-view="timeline">Timeline</button>
        <button class="v2-tl-view-btn" data-view="list">Daftar</button>
      </div>
      <span class="timeline-date-label">14 Agu 2026</span>
    </div>
  </div>
  <div id="v2FilterBar" role="group" aria-label="Filter jadwal">
    <select class="v2-filter-chip" data-empty="true"><option>Semua Driver</option></select>
    <select class="v2-filter-chip" data-empty="false"><option>Innova</option></select>
    <select class="v2-filter-chip" data-empty="true"><option>Semua Status</option></select>
    <button class="v2-filter-clear" style="display:inline-flex">Reset</button>
  </div>
</div>
`;

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  for (const theme of ['light', 'dark']) {
    for (const vp of VIEWPORTS) {
      const page = await browser.newPage();
      await page.setViewport({ width: vp.width, height: vp.height });
      await page.goto('http://localhost:8000/index.html', { waitUntil: 'domcontentloaded' });
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
      await page.evaluate((html) => {
        const body = document.body;
        body.innerHTML = '<div class="main-content" style="max-width:900px;margin:0 auto;">' + html + '</div>';
        document.body.classList.add('v2-shell-active');
      }, MARKUP);

      const result = await page.evaluate(() => {
        const bar = document.getElementById('v2FilterBar');
        const header = document.querySelector('.v2-tl-header');
        const toggle = document.querySelector('.v2-tl-view-toggle');
        const barRect = bar.getBoundingClientRect();
        const headerRect = header.getBoundingClientRect();
        const toggleVisible = toggle && getComputedStyle(toggle).display !== 'none';
        // overflow check: does any child overflow the surface horizontally?
        const surface = document.getElementById('v2TimelineSurface');
        const surfaceRect = surface.getBoundingClientRect();
        const overflowing = surfaceRect.width < surface.scrollWidth - 1;
        return {
          barHeight: Math.round(barRect.height),
          headerHeight: Math.round(headerRect.height),
          toggleVisibleAtThisWidth: toggleVisible,
          horizontalOverflow: overflowing,
          activeChipBg: getComputedStyle(document.querySelectorAll('.v2-filter-chip')[1]).backgroundColor,
          inactiveChipBg: getComputedStyle(document.querySelectorAll('.v2-filter-chip')[0]).backgroundColor,
        };
      });
      console.log(`[${theme}] ${vp.name} (${vp.width}px):`, JSON.stringify(result));
      await page.close();
    }
  }
  await browser.close();
})();
