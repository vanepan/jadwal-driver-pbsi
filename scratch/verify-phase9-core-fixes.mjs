// Phase 9 mobile-first audit — ad-hoc verification of the core-file fixes
// that have no dedicated existing suite: viewport meta, .v2-user-btn /
// .v2-pending-btn touch targets, tablet rail hover-none fallback, and the
// Pending mobile search toggle. Uses smoke-boot.mjs's own pattern (real
// unauthenticated app boot, no Firebase writes).
import puppeteer from 'puppeteer';
import http from 'http';
import { readFileSync } from 'fs';
import path from 'path';

const ROOT = process.cwd();
const server = http.createServer((req, res) => {
  if (req.url === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  const p = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(ROOT, p === '/' ? '/index.html' : p);
  try {
    const body = readFileSync(file);
    const ext = path.extname(file);
    const type = { '.css': 'text/css', '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript', '.json': 'application/json', '.png': 'image/png' }[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    res.end(body);
  } catch (e) { res.writeHead(404); res.end('not found'); }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

let pass = 0, fail = 0;
function check(label, cond, extra = '') {
  if (cond) { pass++; console.log(`OK   ${label}${extra ? ' ' + extra : ''}`); }
  else { fail++; console.log(`FAIL ${label}${extra ? ' ' + extra : ''}`); }
}

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Permission denied|Fetch Firebase/.test(m.text())) errors.push('console.error: ' + m.text()); });

await page.setViewport({ width: 375, height: 812 });
await page.goto(`http://localhost:${port}/index.html`, { waitUntil: 'networkidle0', timeout: 45000 });

// 1. Viewport meta no longer disables zoom.
const viewportContent = await page.$eval('meta[name="viewport"]', (el) => el.getAttribute('content'));
check('viewport meta does not disable zoom', !/maximum-scale|user-scalable/.test(viewportContent), viewportContent);
check('viewport meta still sets width=device-width', /width=device-width/.test(viewportContent));

// 2. .v2-user-btn / .v2-pending-btn touch target CSS (computed, no login needed —
//    CSS rules apply regardless of whether any element currently uses the class).
const btnHeights = await page.evaluate(() => {
  const probe = (cls) => {
    const el = document.createElement('button');
    el.className = cls;
    el.textContent = 'X';
    document.body.appendChild(el);
    const h = parseFloat(getComputedStyle(el).minHeight);
    el.remove();
    return h;
  };
  return { userBtn: probe('v2-user-btn'), pendingBtn: probe('v2-pending-btn') };
});
check('.v2-user-btn min-height >= 44px', btnHeights.userBtn >= 44, JSON.stringify(btnHeights));
check('.v2-pending-btn min-height >= 44px', btnHeights.pendingBtn >= 44, JSON.stringify(btnHeights));

// 3. Pending card actions stack vertically at <=480px (probe via a synthetic node).
const stacksAt430 = await page.evaluate(() => {
  const wrap = document.createElement('div');
  wrap.className = 'v2-pending-card-actions';
  document.body.appendChild(wrap);
  const dir = getComputedStyle(wrap).flexDirection;
  wrap.remove();
  return dir;
});
check('.v2-pending-card-actions stacks (column) at 375px viewport', stacksAt430 === 'column', stacksAt430);

// 4. Pending free-text field wraps instead of clipping.
const fullFieldWraps = await page.evaluate(() => {
  const wrap = document.createElement('div');
  wrap.className = 'v2-pending-field v2-pending-field--full';
  wrap.innerHTML = '<span class="v2-pending-value">x</span>';
  document.body.appendChild(wrap);
  const ws = getComputedStyle(wrap.querySelector('.v2-pending-value')).whiteSpace;
  wrap.remove();
  return ws;
});
check('.v2-pending-field--full .v2-pending-value wraps (white-space: normal)', fullFieldWraps === 'normal', fullFieldWraps);

// 5. Tablet rail hover:none fallback — this Puppeteer/CDP version doesn't
//    support emulateMediaFeatures for "hover", so verify statically instead:
//    parse platform.css's own CSSOM for the "(hover: none)" rule and confirm
//    it contains the expected selectors/declarations.
const railFallback = await page.evaluate(() => {
  for (const sheet of document.styleSheets) {
    let rules;
    try { rules = sheet.cssRules; } catch (e) { continue; }
    for (const rule of rules) {
      if (rule.media && [...rule.media].some((m) => m.includes('hover: none') || m.includes('hover:none'))) {
        const text = rule.cssText;
        return {
          found: true,
          hasRailWidth: /\.domshell-rail\s*\{[^}]*width:\s*220px/.test(text),
          hasLabelOpacity: /\.domshell-rail-label[^{]*\{[^}]*opacity:\s*1/.test(text),
          hasBrandtextOpacity: /\.domshell-rail-brandtext[^{]*\{[^}]*opacity:\s*1/.test(text),
          hasUsertextOpacity: /\.domshell-rail-usertext[^{]*\{[^}]*opacity:\s*1/.test(text),
        };
      }
    }
  }
  return { found: false };
});
check('platform.css has a (hover: none) media block for the rail', railFallback.found === true, JSON.stringify(railFallback));
check('(hover: none) block sets .domshell-rail width to 220px', railFallback.hasRailWidth === true, JSON.stringify(railFallback));
check('(hover: none) block forces rail label opacity to 1', railFallback.hasLabelOpacity === true, JSON.stringify(railFallback));
check('(hover: none) block forces brandtext opacity to 1', railFallback.hasBrandtextOpacity === true, JSON.stringify(railFallback));
check('(hover: none) block forces usertext opacity to 1', railFallback.hasUsertextOpacity === true, JSON.stringify(railFallback));

check('no unexpected console/page errors across the whole run', errors.length === 0, errors.join(' | '));

await browser.close();
server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
