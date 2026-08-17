// Phase 3 (Assignment Board) smoke test — boots the real app (bypassing the
// login/splash screens the same way scratch/verify-app-shell-rebuild.js
// does), lands on the Driver Operations timeline, and confirms the new
// shape/convoy/conflict-dot code paths in createAssignmentBlock() and
// buildListCard() run without throwing, with synthetic assignment data
// injected directly (no real Firebase data available in this environment).
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const OUT_DIR = path.join(__dirname, 'timeline-phase3-verify');
fs.mkdirSync(OUT_DIR, { recursive: true });

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Permission denied|Fetch Firebase/.test(m.text())) errors.push(`console: ${m.text()}`); });

  await page.goto('http://localhost:8000/index.html', { waitUntil: 'domcontentloaded' });
  await page.addStyleTag({ content: '#modalLogin, #app-splash { display: none !important; }' });

  await page.evaluate(() => {
    document.body.classList.add('v2-shell-active', 'app-ready');
  });
  await new Promise(r => setTimeout(r, 400)); // let DOMContentLoaded init finish

  const result = await page.evaluate(async () => {
    const today = new Date().toISOString().slice(0, 10);
    const synthetic = [
      { id: 'a1', driver: 'Budi Santoso', vehicle: 'Toyota Hiace', date: today, startTime: '08:00', endTime: '10:00',
        status: 'assigned', purpose: 'Antar tamu VIP ke Bandara', destination: 'Bandara Soekarno-Hatta' },
      { id: 'a2', driver: 'Siti Rahayu', vehicle: 'Innova', date: today, startTime: '09:00', endTime: '11:00',
        status: 'assigned', purpose: 'Ambil dokumen', destination: 'Kantor Wilayah' },
      // Same date/time/destination, different driver -> should be flagged convoy.
      { id: 'a3', driver: 'Agus Wijaya', vehicle: 'Fortuner', date: today, startTime: '13:00', endTime: '15:00',
        status: 'assigned', purpose: 'Relokasi peralatan (konvoi 1)', destination: 'Gudang Site B' },
      { id: 'a4', driver: 'Rudi Hartono', vehicle: 'Avanza', date: today, startTime: '13:00', endTime: '15:00',
        status: 'assigned', purpose: 'Relokasi peralatan (konvoi 2)', destination: 'Gudang Site B' },
    ];
    try {
      const tl = await import('/js/timeline.js');
      tl.setAssignments(synthetic);
      tl.setCurrentDate(today);
      tl.renderTimeline();
      const blocks = document.querySelectorAll('.assignment-block').length;
      const shapeDots = document.querySelectorAll('.block-vehicle-shape').length;
      const convoyMarks = document.querySelectorAll('.block-convoy-mark').length;
      return { ok: true, blocks, shapeDots, convoyMarks };
    } catch (e) {
      return { ok: false, error: e.message, stack: e.stack };
    }
  });

  await page.screenshot({ path: path.join(OUT_DIR, 'timeline-desktop.png'), fullPage: false });

  // Detail drawer: click the first block, screenshot the drawer.
  await page.evaluate(() => document.querySelector('.assignment-block')?.click());
  await new Promise(r => setTimeout(r, 350));
  await page.screenshot({ path: path.join(OUT_DIR, 'detail-drawer.png') });

  console.log(JSON.stringify({ result, errors }, null, 2));
  await browser.close();
  if (!result.ok || errors.length) process.exitCode = 1;
})();
