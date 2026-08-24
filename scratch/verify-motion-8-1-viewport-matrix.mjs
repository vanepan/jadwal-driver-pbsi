/* Phase 8.1 — viewport/theme/motion-state regression matrix, against the
   real unauthenticated shell (login screen), same serving pattern as
   scripts/smoke-boot.mjs. Confirms the style.css/platform.css edits don't
   introduce horizontal overflow or console errors at any required width,
   theme, or motion-preference combination. Login/domain-shell/authenticated
   surfaces (rail, palette, Settings toggle, Request sheet) are covered
   separately in scratch/verify-rail-hover-debounce.mjs,
   verify-command-palette-motion.mjs, and verify-reduced-motion-gap-closure.mjs
   — those don't need real auth since they mount isolated harnesses. This
   script's authenticated-surface visual spot-check (the two overshoot-curve
   sites: .pbsi-toggle-input in Settings, .req-mode-card__tick in Request
   submission) is NOT TESTABLE here — same documented credential constraint
   as every prior real-browser pass in this program (see e.g. the Phase 7G.5
   report). Flagged, not silently skipped. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('not found'); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const url = `http://localhost:${port}/index.html`;

const WIDTHS = [375, 390, 402, 430, 1194, 1440];
const THEMES = ['light', 'dark'];
const MOTION_STATES = [
  { label: 'default', apply: async () => {} },
  { label: 'prefers-reduced-motion:reduce', apply: async (page) => page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]) },
  { label: 'data-anim=off', apply: async (page) => page.evaluate(() => document.documentElement.setAttribute('data-anim', 'off')) },
];

let pass = 0, fail = 0;
function check(label, cond, extra = '') {
  if (cond) { pass++; console.log(`OK   ${label}${extra ? ' ' + extra : ''}`); }
  else { fail++; console.log(`FAIL ${label}${extra ? ' ' + extra : ''}`); }
}

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });

for (const width of WIDTHS) {
  for (const theme of THEMES) {
    for (const state of MOTION_STATES) {
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
      page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
      await page.setViewport({ width, height: 900 });
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
      await state.apply(page);
      await new Promise((r) => setTimeout(r, 1200));

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      const fatal = errors.filter((e) => /SyntaxError|ReferenceError|TypeError|is not a function|Failed to (load|fetch) module|Cannot use import|Unexpected token|does not provide an export/i.test(e));

      const tag = `${width}px / ${theme} / ${state.label}`;
      check(`${tag} — zero horizontal overflow`, overflow <= 0, `(scrollWidth-innerWidth=${overflow})`);
      check(`${tag} — zero fatal console/page errors`, fatal.length === 0, fatal.length ? `(${fatal[0]})` : '');

      await page.close();
    }
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
server.close();
if (fail > 0) process.exit(1);
