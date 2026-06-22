/* UAT screenshot capture for the Executive Filter Bar (v1.15.4).
   Renders docs/uat/v1.15.4/harness.html (real platform.css) at every
   required breakpoint and writes PNGs next to it. Run:
     node docs/uat/v1.15.4/shoot.mjs
*/
import puppeteer from '../../../functions/node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const URL = pathToFileURL(path.join(HERE, 'harness.html')).href;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

// label → width. Heights are tall enough to capture the full bar.
const BREAKPOINTS = [
  ['fold-closed', 280],
  ['320', 320],
  ['375', 375],
  ['390', 390],
  ['414', 414],
  ['430', 430],
  ['fold-open', 717],
  ['768', 768],
  ['tablet', 820],
  ['desktop', 1440],
];

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--force-device-scale-factor=2'],
});
const page = await browser.newPage();

for (const [label, width] of BREAKPOINTS) {
  await page.setViewport({ width, height: 420, deviceScaleFactor: 2 });
  await page.goto(URL, { waitUntil: 'networkidle0' });
  // Measure the rendered filter bar so the shot is tightly cropped.
  const box = await page.evaluate(() => {
    const el = document.querySelector('.v2-admin-workspace-layout');
    const r = el.getBoundingClientRect();
    return { x: 0, y: Math.max(0, r.top - 8), width: window.innerWidth, height: Math.ceil(r.height + 16) };
  });
  const out = path.join(HERE, `bp-${label}.png`);
  await page.screenshot({ path: out, clip: box });
  console.log(`✓ ${label.padEnd(12)} ${String(width).padStart(4)}px → ${path.basename(out)}`);
}

await browser.close();
console.log('Done.');
