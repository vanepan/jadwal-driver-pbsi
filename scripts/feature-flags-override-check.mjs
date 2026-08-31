/* loadFeatureFlags() regression guard (fixed 2026-08-31).
   Bug: the localStorage-override branch used to `return overrides` directly
   — containing ONLY the flags explicitly set in localStorage — instead of
   backfilling from DEFAULTS the way the Firebase path already did via
   `{ ...DEFAULTS, ...rawFlags }`. A device with a stale
   `pbsi_flag_visualShellV2=true` left over from old testing (and no
   `pbsi_flag_domainShellV1` key at all) got `appFlags.domainShellV1 ===
   undefined`, and every downstream `=== true` check silently fell to the
   `else` branch — the old flat rail/panel ("BOTTOM MODULES") — instead of
   the domain-shell drawer, on a real authenticated session where the
   developer never touched the domainShellV1 flag. Each scenario below runs
   in its own incognito browser context — localStorage is origin-scoped and
   would otherwise leak between scenarios sharing one context. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, r));
const port = server.address().port;
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
let pass = 0, fail = 0;
const ok = (n, c) => { (c ? pass++ : fail++); console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}`); };

async function runScenario(name, setLocalStorage, check) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  if (setLocalStorage) await page.evaluateOnNewDocument(setLocalStorage);
  await page.goto(`http://localhost:${port}/index.html`, { waitUntil: 'networkidle2', timeout: 45000 });
  await new Promise(r => setTimeout(r, 4000));
  const r = await page.evaluate(() => ({
    hasDomshellRail: !!document.querySelector('.domshell-rail'),
    hasOldV2Rail: !!document.getElementById('v2Rail'),
    v2ShellActive: document.body.classList.contains('v2-shell-active'),
    hasV2Topbar: !!document.getElementById('v2Topbar'),
  }));
  check(name, r);
  await page.close();
  await ctx.close();
}

console.log('[feature-flags-override-check] loadFeatureFlags() partial/explicit override scenarios');

await runScenario(
  'the reported bug: only pbsi_flag_visualShellV2 set, no pbsi_flag_domainShellV1 key',
  () => localStorage.setItem('pbsi_flag_visualShellV2', 'true'),
  (name, r) => ok(`${name} -> domain-shell renders (not the old rail)`, r.hasDomshellRail && !r.hasOldV2Rail),
);

await runScenario(
  'explicit domainShellV1=false (documented dev toggle)',
  () => localStorage.setItem('pbsi_flag_domainShellV1', 'false'),
  (name, r) => ok(`${name} -> still forces the OLD rail/panel`, r.hasOldV2Rail && !r.hasDomshellRail),
);

await runScenario(
  'no overrides at all (clean device)',
  null,
  (name, r) => ok(`${name} -> domain-shell by default`, r.hasDomshellRail && !r.hasOldV2Rail),
);

await runScenario(
  'explicit visualShellV2=false (emergency full V1 rollback)',
  () => localStorage.setItem('pbsi_flag_visualShellV2', 'false'),
  (name, r) => ok(`${name} -> full V1 rollback still works`, !r.v2ShellActive && !r.hasV2Topbar),
);

await browser.close();
server.close();
console.log(`\n────────────\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
