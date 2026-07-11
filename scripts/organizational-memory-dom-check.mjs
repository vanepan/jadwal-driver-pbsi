/* organizational-memory-dom-check.mjs — DOM integration test for
   Organizational Memory (V2.0.7): the real NOR archive source.
   Run: node scripts/organizational-memory-dom-check.mjs   (exit 0 = pass)

   Mirrors knowledge-acquisition-dom-check.mjs's pattern exactly, including
   its safety constraint: never calls any petty-cash WRITE path — only
   ever reads against an unauthenticated/empty cache, so this never
   attempts a real network write against the live Firebase project. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/scripts/organizational-memory-harness.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('not found'); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
console.log('\n[Organizational Memory — real NOR archive source, browser]');
const bootErrors = [];
const page = await browser.newPage();
page.on('pageerror', (e) => bootErrors.push('pageerror: ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('Failed to load resource')) bootErrors.push('console.error: ' + m.text());
});
page.on('response', (r) => {
  if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) bootErrors.push(`bad status ${r.status()}: ${r.url()}`);
});

await page.goto(`http://localhost:${port}/scripts/organizational-memory-harness.html`, { waitUntil: 'networkidle2', timeout: 45000 });
await page.waitForFunction('window.__ready === true', { timeout: 15000 }).catch(() => {});

check('harness loaded with zero fatal boot errors', bootErrors.length === 0);
if (bootErrors.length) bootErrors.forEach((e) => console.log('    ' + e));

const sourceId = await page.evaluate(() => window.__NOR_ARCHIVE_SOURCE_ID);
check('NOR_ARCHIVE_SOURCE_ID is "nor"', sourceId === 'nor');

const hasNor = await page.evaluate(() => window.__hasArchiveSource('nor'));
check('nor archive source is registered', hasNor === true);

const sourceCount = await page.evaluate(() => window.__listArchiveSources().length);
check('all 4 archive sources registered (3 placeholders + nor)', sourceCount === 4);

const fetchResult = await page.evaluate((id) => window.__getArchiveSource(id).fetch(), sourceId);
check('nor archive source.fetch() succeeds against an empty/unauthenticated cache', fetchResult.ok === true);
check('fetch result items is an array', Array.isArray(fetchResult.items));

const ingestResult = await page.evaluate((id) => window.__ingestArchive(id), sourceId);
check('ingestArchive("nor") completes successfully', ingestResult.ok === true);

const health = await page.evaluate(() => window.__computeArchiveHealth('nor'));
check('computeArchiveHealth("nor") returns a well-formed report even with 0 archived records', health.domainType === 'nor' && typeof health.healthScore === 'number');

const archiveList = await page.evaluate(() => window.__listArchive({ sourceDomainType: 'nor' }));
check('archive repository list() for domainType nor succeeds (0+ records is valid in a data-less environment)', archiveList.ok === true && Array.isArray(archiveList.data));

await browser.close();
server.close();

console.log(`\n${pass}/${pass + fail} checks passed.`);
process.exit(fail > 0 ? 1 : 0);
