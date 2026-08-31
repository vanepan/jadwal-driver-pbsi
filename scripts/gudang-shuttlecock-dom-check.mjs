/* gudang-shuttlecock-dom-check.mjs — V1 UPDATE: Warehouse / Shuttlecock
   module. Real-browser render + RESPONSIVE check (requirement §10/§14).

   Boots the real app in headless Chromium (same static-server pattern as
   scripts/gudang-ui-smoke.mjs), mounts the Gudang module so the full
   gudang.css cascade + .gud-root wrapper are live, then renders the Home /
   Catalog screen from a synthetic catalog (a Shuttlecock item + ordinary
   items) via the real renderHome() and asserts, at every required
   viewport width:

     - no unintended HORIZONTAL overflow of the catalog surface;
     - the prioritised "Shuttlecock" section renders ABOVE ordinary
       inventory, with the ordinary grid still present;
     - no catalog card is clipped (every card fits its grid column);
     - WITHOUT the permission: no Shuttlecock section, no Shuttlecock
       filter chip, no Shuttlecock card, and "shuttlecock" search text
       finds nothing.

   Widths: 320, 375, 390, 430, 768, 1024, 1440 (requirement §14).

   Firebase reads fail permission-denied (unauthenticated) — every
   per-card figure is pre-seeded into the fake state so renderHome() needs
   zero network. Screenshots for the record land in
   scripts/__gudang-ui-screenshots/.

   Run: node scripts/gudang-shuttlecock-dom-check.mjs   (exit 0 = pass) */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

let pass = 0; let fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };

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

const errors = [];
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 960 });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Permission denied|permission_denied/i.test(m.text())) errors.push('console.error: ' + m.text()); });
await page.goto(`http://localhost:${port}/index.html`, { waitUntil: 'networkidle2', timeout: 45000 });
await new Promise((r) => setTimeout(r, 2000));

// Mount Gudang once (loads gudang.css + puts .gud-root on the host), then
// drive Home renders off a synthetic catalog through the REAL renderHome().
const setup = await page.evaluate(async () => {
  const homeMod = await import('/js/gudang/ui/gudang-home.js');
  const centerMod = await import('/js/gudang/ui/gudang-center.js');
  const accessMod = await import('/js/gudang/config/gudang-shuttlecock-access.js');
  const { createSelectionState } = await import('/js/gudang/selection/selection-engine.js');
  const { makeItem, ITEM_TYPE } = await import('/js/gudang/contracts/item-contract.js');
  const { itemMatchesQuery } = await import('/js/gudang/search/search-resolver.js');
  const { applyShuttlecockVisibility } = await import('/js/gudang/config/gudang-inventory-class.js');

  const host = document.createElement('div');
  host.id = '__gudShuttleHost';
  host.style.cssText = 'width:100%;min-height:900px;background:var(--canvas,#fff);';
  document.body.appendChild(host);
  await centerMod.mountGudang(host); // host gets class .gud-root + full CSS

  const shuttle = makeItem({ itemId: 's1', name: 'Kok Yonex Mavis 350 Slow', itemType: ITEM_TYPE.CONSUMABLE, category: 'Shuttlecock', metadata: { inventoryClass: 'shuttlecock' } });
  const shuttle2 = makeItem({ itemId: 's2', name: 'Kok RSL Classic Tourney', itemType: ITEM_TYPE.CONSUMABLE, metadata: { inventoryClass: 'shuttlecock' } });
  const ordinary = [
    makeItem({ itemId: 'c1', name: 'Kertas A4 80gsm Sinar Dunia', itemType: ITEM_TYPE.CONSUMABLE, category: 'atk' }),
    makeItem({ itemId: 'c2', name: 'Spidol Whiteboard Snowman Hitam', itemType: ITEM_TYPE.CONSUMABLE }),
    makeItem({ itemId: 'c3', name: 'Air Mineral Galon Aqua 19L', itemType: ITEM_TYPE.CONSUMABLE }),
    makeItem({ itemId: 'c4', name: 'Sabun Cuci Tangan Refill 800ml', itemType: ITEM_TYPE.CONSUMABLE }),
    makeItem({ itemId: 'a1', name: 'Proyektor Epson EB-X500', itemType: ITEM_TYPE.ASSET }),
  ];
  const allItems = [shuttle, ...ordinary, shuttle2];

  const baseSt = (items) => ({
    data: { items, locations: [], departments: [], assets: [] },
    loading: false, selection: createSelectionState(),
    homeStockBulk: null, homeStockBulkLoading: false,
    homeCardData: Object.fromEntries(items.map((i) => [i.itemId, { loading: false, stock: 12, forecast: null }])),
    homeImageCache: {}, hiddenShuttlecockItemIds: new Set(),
  });

  window.__renderCatalog = (canAccess) => {
    accessMod.setShuttlecockAccessSource(() => canAccess === true);
    const vis = applyShuttlecockVisibility(allItems, canAccess === true); // mirrors gudang-center.js#refreshCatalog
    const st = baseSt(vis.visible);
    st.hiddenShuttlecockItemIds = vis.hiddenIds;
    const html = homeMod.renderHome(st, {}, () => {});
    host.innerHTML = `<div class="gud-content">${html}</div>`; // html already carries .gud-home
    window.scrollTo(0, 0);
    const cardIds = [...host.querySelectorAll('.gud-catalog-card')].map((el) => el.dataset.id);
    return {
      visibleIds: vis.visible.map((i) => i.itemId),
      cardIds,
      visibleOrderIds: homeMod.visibleHomeItemIds(st),
      searchFindsShuttle: vis.visible.some((i) => itemMatchesQuery(i, 'shuttlecock')),
    };
  };
  return { ok: true };
});
check('Gudang mounts and the synthetic-catalog render harness installs', setup && setup.ok === true);

/* ── WITHOUT the permission ─────────────────────────────────────────── */
const denied = await page.evaluate(() => {
  const r = window.__renderCatalog(false);
  const host = document.getElementById('__gudShuttleHost');
  return {
    ...r,
    hasSection: !!host.querySelector('.gud-catalog-shuttle-head'),
    hasChip: !!host.querySelector('[data-act="gud-home-type"][data-val="shuttlecock"]'),
    hasShuttleCardPill: [...host.querySelectorAll('.gud-pill')].some((el) => el.textContent.trim() === 'Shuttlecock'),
    cardCount: r.cardIds.length,
  };
});
console.log('\n[No permission — Shuttlecock leaves no trace]');
check('the Shuttlecock items are stripped from the catalog (7 items, 2 hidden -> 5 cards)', denied.cardCount === 5 && !denied.cardIds.includes('s1') && !denied.cardIds.includes('s2'));
check('no "Shuttlecock" section header', denied.hasSection === false);
check('no "Shuttlecock" filter chip', denied.hasChip === false);
check('no per-card "Shuttlecock" pill', denied.hasShuttleCardPill === false);
check('search text "shuttlecock" finds nothing in the permitted catalog', denied.searchFindsShuttle === false);

/* ── WITH the permission — responsive sweep ─────────────────────────── */
console.log('\n[With permission — section renders + responsive across 7 widths]');
const WIDTHS = [320, 375, 390, 430, 768, 1024, 1440];
const screenshotsDir = path.join(ROOT, 'scripts', '__gudang-ui-screenshots');
fs.mkdirSync(screenshotsDir, { recursive: true });

for (const w of WIDTHS) {
  await page.setViewport({ width: w, height: 900 });
  const r = await page.evaluate(() => {
    const info = window.__renderCatalog(true);
    const host = document.getElementById('__gudShuttleHost');
    window.scrollTo(0, 0);
    const docOverflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    const content = host.querySelector('.gud-content');
    const shuttleSection = host.querySelector('.gud-catalog-shuttle');
    const grids = [...host.querySelectorAll('.gud-catalog-grid')];
    const ordinaryGrid = grids.find((g) => !shuttleSection || !shuttleSection.contains(g)) || null;
    // A card is "clipped" if it is wider than the grid track that holds it.
    let widestCardOverflow = 0;
    for (const g of grids) {
      for (const card of g.querySelectorAll('.gud-catalog-card')) {
        widestCardOverflow = Math.max(widestCardOverflow, card.getBoundingClientRect().width - (g.clientWidth + 1));
      }
    }
    const head = host.querySelector('.gud-catalog-shuttle-head');
    const firstOrdinaryCard = ordinaryGrid ? ordinaryGrid.querySelector('.gud-catalog-card') : null;
    return {
      ...info,
      docOverflow,
      contentOverflow: content ? content.scrollWidth - content.clientWidth : 0,
      widestCardOverflow,
      hasSection: !!head,
      hasChip: !!host.querySelector('[data-act="gud-home-type"][data-val="shuttlecock"]'),
      shuttleCards: shuttleSection ? shuttleSection.querySelectorAll('.gud-catalog-card').length : 0,
      ordinaryGridHasCards: !!firstOrdinaryCard,
      // scroll-independent: the section header must start above the first
      // ordinary card in document flow.
      sectionAboveOrdinary: !!(head && firstOrdinaryCard) && head.getBoundingClientRect().top < firstOrdinaryCard.getBoundingClientRect().top,
    };
  });
  const tag = `w${w}`;
  check(`${tag}: no horizontal page overflow (documentElement)`, r.docOverflow <= 1);
  check(`${tag}: catalog surface does not overflow its container`, r.contentOverflow <= 1);
  check(`${tag}: no catalog card is clipped by its grid column`, r.widestCardOverflow <= 1);
  check(`${tag}: the "Shuttlecock" section + filter chip are present`, r.hasSection && r.hasChip);
  check(`${tag}: both Shuttlecock cards render in the top section`, r.shuttleCards === 2);
  check(`${tag}: ordinary inventory still renders in its own grid below`, r.ordinaryGridHasCards);
  check(`${tag}: the Shuttlecock section sits ABOVE ordinary inventory`, r.sectionAboveOrdinary);
  check(`${tag}: rendered card order puts both Shuttlecock cards first`, r.cardIds[0] === 's1' && r.cardIds[1] === 's2');
  check(`${tag}: visibleHomeItemIds() (Select All / Shift+Click order) also puts Shuttlecock first`, r.visibleOrderIds[0] === 's1' && r.visibleOrderIds[1] === 's2');
  check(`${tag}: search text "shuttlecock" resolves the items for a permitted session`, r.searchFindsShuttle === true);

  if (w === 390 || w === 1440) {
    try {
      const h = await page.$('#__gudShuttleHost');
      if (h) await h.screenshot({ path: path.join(screenshotsDir, `shuttlecock-${tag}.png`) });
    } catch (_) {}
  }
}

check('zero non-permission console/page errors during the sweep', errors.length === 0);
if (errors.length) errors.forEach((e) => console.log('   • ' + e.slice(0, 200)));

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
server.close();
process.exit(fail === 0 ? 0 : 1);
