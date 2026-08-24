import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(ROOT, 'scratch');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();

async function setup(vp, theme) {
  await page.setViewport(vp);
  await page.goto(`http://localhost:${port}/index.html`, { waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 4200));
  await page.evaluate((t) => {
    const login = document.getElementById('modalLogin');
    if (login) login.style.display = 'none';
    const splash = document.querySelector('.app-splash');
    if (splash) splash.style.display = 'none';
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem('pbsi_theme', t);
  }, theme);
  await new Promise(r => setTimeout(r, 200));
}

const VIEWPORTS = {
  mobile375: { width: 375, height: 700, isMobile: true },
  mobile390: { width: 390, height: 700, isMobile: true },
  mobile402: { width: 402, height: 700, isMobile: true },
  mobile430: { width: 430, height: 700, isMobile: true },
};

for (const [name, vp] of Object.entries(VIEWPORTS)) {
  for (const theme of ['light', 'dark']) {
    await setup(vp, theme);
    await page.screenshot({ path: path.join(SHOTS, `real-header-${name}-${theme}.png`), clip: { x: 0, y: 0, width: vp.width, height: 260 } });
    console.log('saved', name, theme);
  }
}

await browser.close();
server.close();
