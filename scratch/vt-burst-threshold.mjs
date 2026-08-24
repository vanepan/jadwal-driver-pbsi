import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const file = path.join(ROOT, p);
  if (!fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, r));
const port = server.address().port;
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });

for (const n of [2, 3, 4, 5, 6, 7, 8, 9, 10]) {
  const page = await browser.newPage();
  await page.goto(`http://localhost:${port}/scratch/navigation-crossfade-harness.html`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.__navReady === true);
  await page.evaluate(() => window.__nav.setWorkspace('home'));
  const cycle = ['pending', 'administration', 'overtime', 'engineering', 'home'];
  const names = Array.from({ length: n }, (_, i) => cycle[i % cycle.length]);
  await page.evaluate((ns) => { ns.forEach(x => window.__nav.setWorkspace(x)); }, names);
  await new Promise(r => setTimeout(r, 500));
  const state = await page.evaluate(() => window.__nav.getState());
  const expected = names[names.length - 1];
  console.log(`n=${n}: expected="${expected}" actual="${state.currentWorkspace}" ${expected === state.currentWorkspace ? 'OK' : 'MISMATCH'}`);
  await page.close();
}
await browser.close();
server.close();
