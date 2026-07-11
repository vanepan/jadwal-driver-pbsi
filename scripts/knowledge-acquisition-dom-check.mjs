/* knowledge-acquisition-dom-check.mjs — DOM integration test for the
   Knowledge Acquisition Framework (V2.0.2, "First Knowledge Acquisition").
   Run: node scripts/knowledge-acquisition-dom-check.mjs   (exit 0 = pass)

   Loads a harness that imports the REAL NOR connector, the REAL Builder
   pipeline (stage-registry + orchestrator + runIncremental/runFull), and
   the REAL Memory repository in a browser, and proves the wiring end-to-
   end: NOR is the only connector with a registered Stage, connector.fetch()
   executes cleanly against an unauthenticated/empty petty-cash cache
   (proving correct empty-state handling — no crash, no network write),
   and a full Builder run completes successfully with the NOR stage
   included. This harness deliberately never calls any petty-cash write
   path (e.g. generateNor()) — doing so would attempt a real write against
   the live Firebase project this app points at, which a check script must
   never do. Proving non-zero item acquisition requires real NOR data in a
   real environment; see js/v2/knowledge/connectors/nor-connector.js for
   the (Node-unreachable) mapping logic covered structurally by
   knowledge-acquisition-check.mjs's synthetic-connector coverage instead. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/scripts/knowledge-acquisition-harness.html';
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
console.log('\n[Knowledge Acquisition — real NOR connector, browser]');
const bootErrors = [];
const page = await browser.newPage();
page.on('pageerror', (e) => bootErrors.push('pageerror: ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('Failed to load resource')) bootErrors.push('console.error: ' + m.text());
});
page.on('response', (r) => {
  if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) bootErrors.push(`bad status ${r.status()}: ${r.url()}`);
});

await page.goto(`http://localhost:${port}/scripts/knowledge-acquisition-harness.html`, { waitUntil: 'networkidle2', timeout: 45000 });
await page.waitForFunction('window.__ready === true', { timeout: 15000 }).catch(() => {});

check('harness loaded with zero fatal boot errors', bootErrors.length === 0);
if (bootErrors.length) bootErrors.forEach((e) => console.log('    ' + e));

const connectorId = await page.evaluate(() => window.__NOR_CONNECTOR_ID);
check('NOR_CONNECTOR_ID is "nor"', connectorId === 'nor');

const hasNor = await page.evaluate(() => window.__hasConnector('nor'));
check('nor connector is registered', hasNor === true);

const connectorCount = await page.evaluate(() => window.__listConnectors().length);
check('all 12 connectors registered (11 placeholders + nor)', connectorCount === 12);

const stages = await page.evaluate(() => window.__listStages());
check('exactly one stage is registered', stages.length === 1);
check('the one registered stage is acquire-nor', stages[0] && stages[0].id === 'acquire-nor');

const fetchResult = await page.evaluate((id) => {
  const connector = window.__getConnector(id);
  return connector.fetch(null);
}, connectorId);
check('nor connector.fetch(null) succeeds against an empty/unauthenticated cache', fetchResult.ok === true);
check('fetch result items is an array', Array.isArray(fetchResult.items));

const acquisition = await page.evaluate((id) => window.__runAcquisition(id), connectorId);
check('runAcquisition("nor") completes successfully', acquisition.result.ok === true);
check('runAcquisition returns a well-formed import report', acquisition.report.connectorId === 'nor' && acquisition.report.sourceId === 'petty_cash.nors');

const builderRun = await page.evaluate(() => window.__runFull());
check('Builder runFull() completes with the NOR stage included', builderRun.ok === true && builderRun.stagesCompleted === 1);

const repoItems = await page.evaluate(() => window.__repoList({ domainType: 'nor' }));
check('repository list() for domainType nor succeeds (0+ items is valid in a data-less environment)', repoItems.ok === true && Array.isArray(repoItems.data));

await browser.close();
server.close();

console.log(`\n${pass}/${pass + fail} checks passed.`);
process.exit(fail > 0 ? 1 : 0);
