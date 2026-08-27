/* bottom-nav-notif-check.mjs — Design System Program Phase 11 (Administration)

   Regression check for the mobile-notification-nav-gap fix (audit finding
   Notifications D1): 'driver' and 'engineering' workspaces in
   js/config/bottom-nav-registry.js grew from 5 to 6 items each (a new
   badge:'notif' entry, matching the pattern 'request'/'executive' already
   use). Verifies the real registry data + the real renderBottomNav()
   markup shape render without horizontal overflow or a clipped/invisible
   item, at every mandated mobile viewport.

   Method: real unauthenticated boot of the actual index.html (same pattern
   as smoke-boot.mjs / mobile-first-verification-check.mjs — the real app
   never fires a write with no logged-in session), then inject the
   bottom-nav fragment as a DOM child of the live page so it inherits the
   REAL stylesheet cascade exactly (style.css + platform.css, real load
   order, real :root tokens) — no hand-duplicated <link> list, no risk of
   a synthetic-page CSS-loading discrepancy. js/app.js has no exports and
   would fire a real Firebase read if imported directly, so this copies
   renderBottomNav()'s markup-generation shape verbatim from
   js/app.js:754-768 and imports BOTTOM_NAV_ITEMS/bottomNavIconPath for
   real data (bottom-nav-registry.js is explicitly PURE/dependency-free,
   safe to import, per its own header comment).

   Run: node scripts/bottom-nav-notif-check.mjs (exit 0 = pass) */

import puppeteer from 'puppeteer';
import http from 'http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BOTTOM_NAV_ITEMS, bottomNavIconPath } from '../js/config/bottom-nav-registry.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); if (detail !== undefined) console.log('     • ' + String(detail).slice(0, 300)); }
};

// Exact markup shape from js/app.js renderBottomNav() (lines ~754-768).
function renderItemsHtml(items) {
  return items.map((item) => {
    const badgeHtml = item.badge === 'requests'
      ? `<span class="bottom-nav-badge" id="bottomNavRequestsBadge" style="display:none;"></span>`
      : item.badge === 'notif'
        ? `<span class="bottom-nav-dot" id="bottomNavNotifDot" style="display:none;"></span>`
        : '';
    return `<button class="bottom-nav-item" id="${item.id}" type="button">
      <svg viewBox="0 0 20 20" fill="currentColor" width="22" height="22"><path d="${bottomNavIconPath(item.icon)}"/></svg>
      <span>${item.label}</span>
      ${badgeHtml}
    </button>`;
  }).join('');
}

const server = http.createServer((req, res) => {
  if (req.url === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  const content = fs.readFileSync(file);
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Content-Length': content.length });
  res.end(content);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });

const VIEWPORTS = [375, 390, 402, 430];
const WORKSPACES = ['driver', 'engineering'];

console.log('[Phase 11] Bottom-nav Notifikasi item — real registry data, real app cascade, mandated viewports\n');

for (const ws of WORKSPACES) {
  const items = BOTTOM_NAV_ITEMS[ws];
  check(`${ws}: registry now has 6 items (was 5)`, items.length === 6, `got ${items.length}`);
  const notifItem = items.find((it) => it.badge === 'notif');
  check(`${ws}: has exactly one badge:'notif' item`, !!notifItem, JSON.stringify(items.map((i) => i.id)));
  check(`${ws}: notif item action is 'openNotifications' (existing, already-wired action)`, notifItem?.action === 'openNotifications');
}

for (const width of VIEWPORTS) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.setViewport({ width, height: 800, deviceScaleFactor: 1 });
  await page.goto(`http://localhost:${port}/index.html`, { waitUntil: 'networkidle0', timeout: 45000 });

  for (const ws of WORKSPACES) {
    const itemsHtml = renderItemsHtml(BOTTOM_NAV_ITEMS[ws]);
    const info = await page.evaluate((itemsHtml) => {
      const nav = document.createElement('nav');
      nav.className = 'bottom-nav';
      nav.id = '__testBottomNav';
      nav.style.display = 'flex'; // real CSS keeps .bottom-nav display:none above the mobile breakpoint
      nav.innerHTML = itemsHtml;
      document.body.appendChild(nav);

      const navRect = nav.getBoundingClientRect();
      const items = [...nav.querySelectorAll('.bottom-nav-item')];
      const result = {
        viewportWidth: window.innerWidth,
        scrollOverflow: document.documentElement.scrollWidth > window.innerWidth,
        itemRects: items.map((it) => {
          const r = it.getBoundingClientRect();
          const span = it.querySelector('span');
          return { width: r.width, right: r.right, labelVisible: span && span.getBoundingClientRect().height > 0 };
        }),
      };
      nav.remove();
      return result;
    }, itemsHtml);

    check(`${ws}@${width}px: no page horizontal overflow`, info.scrollOverflow === false);
    check(`${ws}@${width}px: all 6 items fit within viewport (last item right edge <= viewport width)`,
      info.itemRects[info.itemRects.length - 1].right <= info.viewportWidth + 1,
      JSON.stringify(info.itemRects.map((r) => r.right.toFixed(1))));
    check(`${ws}@${width}px: every item has a non-zero rendered width (none collapsed to 0)`,
      info.itemRects.every((r) => r.width > 20), JSON.stringify(info.itemRects.map((r) => r.width.toFixed(1))));
    check(`${ws}@${width}px: every label span is present/visible (not display:none clipped)`,
      info.itemRects.every((r) => r.labelVisible), JSON.stringify(info.itemRects.map((r) => r.labelVisible)));
  }

  check(`@${width}px: zero page errors during injection`, errors.length === 0, errors.join(' | '));
  await page.close();
}

await browser.close();
server.close();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
