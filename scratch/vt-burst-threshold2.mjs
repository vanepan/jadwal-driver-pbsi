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

async function run(armWith, sequence, label) {
  const page = await browser.newPage();
  await page.goto(`http://localhost:${port}/scratch/navigation-crossfade-harness.html`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.__navReady === true);
  await page.evaluate((a) => window.__nav.setWorkspace(a), armWith);
  await page.evaluate((ns) => { ns.forEach(x => window.__nav.setWorkspace(x)); }, sequence);
  await new Promise(r => setTimeout(r, 500));
  const state = await page.evaluate(() => window.__nav.getState());
  const expected = sequence[sequence.length - 1];
  console.log(`${label}: armed="${armWith}" seq=[${sequence.join(',')}] expected="${expected}" actual="${state.currentWorkspace}" ${expected === state.currentWorkspace ? 'OK' : 'MISMATCH'}`);
  await page.close();
}

// A: arm with 'pending', 5-call burst ending back at 'pending' (the armed state) — does the SAME state matter, or the literal 'home' name?
await run('pending', ['administration', 'overtime', 'engineering', 'home', 'pending'], 'A (return to armed state, different name)');
// B: arm with 'pending', 5-call burst NOT ending at the armed state
await run('pending', ['administration', 'overtime', 'engineering', 'home', 'overtime'], 'B (does NOT return to armed state)');
// C: arm with 'home' (as original), 5-call burst ending at a DIFFERENT state than armed
await run('home', ['pending', 'administration', 'overtime', 'engineering'], 'C (4 calls, home-armed, ends elsewhere)');
// D: arm with 'home', then a single-call burst back to 'home' immediately (n=1, minimal repro)
await run('home', ['pending', 'home'], 'D (2 calls, return to armed state immediately)');
// E: arm with 'home', single call away then nothing else (sanity)
await run('home', ['pending'], 'E (1 call, sanity baseline)');

await browser.close();
server.close();
