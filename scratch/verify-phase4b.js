const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', err => errors.push('PAGEERROR: ' + err.message + '\n' + (err.stack || '')));
  await page.goto('http://localhost:8000/index.html', { waitUntil: 'networkidle2', timeout: 20000 }).catch(e => console.log('nav warn:', e.message));
  await new Promise(r => setTimeout(r, 1500));

  // Directly exercise createAssignmentBlock's new logic by importing timeline.js
  // as a module in-page and calling the exported helpers it depends on, to
  // confirm the checkConflict/checkVehicleConflict wiring is live and callable.
  const modCheck = await page.evaluate(async () => {
    try {
      const mod = await import('/js/assignments.js');
      const ok = typeof mod.checkConflict === 'function' && typeof mod.checkVehicleConflict === 'function';
      // exercise them with harmless made-up args — should return false, not throw
      const r1 = mod.checkConflict('NoSuchDriver', '08:00', '09:00', '2099-01-01', null);
      const r2 = mod.checkVehicleConflict('NoSuchVehicle', '08:00', '09:00', '2099-01-01', null);
      return { ok, r1, r2 };
    } catch (e) {
      return { error: e.message, stack: e.stack };
    }
  });

  console.log('assignments.js conflict-fn check:', JSON.stringify(modCheck, null, 2));
  console.log('\nConsole/page errors:', errors.length ? errors.slice(0, 15).join('\n---\n') : '(none)');

  await browser.close();
})();
