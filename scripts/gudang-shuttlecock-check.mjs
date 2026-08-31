/* gudang-shuttlecock-check.mjs — V1 UPDATE: Warehouse / Shuttlecock module.

   Deterministic, PURE node test (no live Firebase, no browser, no AI) —
   same check()/read() harness as scripts/gudang-filter-check.mjs and
   scripts/gudang-search-check.mjs. Parts:

     A. Classification       — config/gudang-inventory-class.js: a
                                Shuttlecock item IS an ordinary Consumable
                                carrying metadata.inventoryClass; the
                                predicates are safe on null/partial records.
     B. Access seam           — config/gudang-shuttlecock-access.js:
                                fail-closed by default, honours an injected
                                resolver, never throws, ignores non-functions.
     C. Source-strip           — applyShuttlecockVisibility(): a permitted
                                session gets an exact pass-through; an
                                unpermitted one gets Shuttlecock items
                                removed AND their ids reported for the
                                movement-fed surfaces.
     D. Catalog ordering       — shuttlecockFirst(): Shuttlecock floats to
                                the top, every ordinary item keeps its
                                relative order, no-op when there are none.
     E. Filter engine          — itemMatchesFilter('shuttlecock') restricts
                                to the class; 'consumable' still includes it
                                (it IS a Consumable); 'asset' excludes it;
                                the chip + clearFilterKey round-trip.
     F. Search                 — itemMatchesQuery() finds a Shuttlecock item
                                by the literal word "shuttlecock" and by
                                name; an ordinary item is unaffected.
     G. Permission model       — warehouse.shuttlecock.view exists in the
                                catalog under Warehouse › Shuttlecock, is
                                granted to admin (admin override), is NOT in
                                any other System Role's base grant, and
                                becomes effective for a bidang account only
                                through an Individual Permission override
                                (the real normalizeOverrideRecord()).
     H. Home render            — renderHome()/visibleHomeItemIds(): the
                                Shuttlecock filter chip and top section are
                                drawn ONLY for a session with access, and
                                the section sits above ordinary inventory.
     I. Wiring / architecture  — the two new config files are PURE and
                                Node-loadable; app.js wires the seam to the
                                existing permission service; gudang-center.js
                                applies the strip at the one data boundary.

   Run: node scripts/gudang-shuttlecock-check.mjs   (exit 0 = pass) */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  INVENTORY_CLASS, inventoryClassOf, isShuttlecockItem, isKnownInventoryClass,
  applyShuttlecockVisibility, shuttlecockFirst,
} from '../js/gudang/config/gudang-inventory-class.js';
import {
  setShuttlecockAccessSource, canAccessShuttlecock,
} from '../js/gudang/config/gudang-shuttlecock-access.js';
import {
  createFilterState, isFilterActive, itemMatchesFilter, filterItems,
  activeFilterChips, clearFilterKey,
} from '../js/gudang/filters/filter-engine.js';
import { itemMatchesQuery } from '../js/gudang/search/search-resolver.js';
import { makeItem, ITEM_TYPE } from '../js/gudang/contracts/item-contract.js';
import { PERMISSIONS, buildPermissionTree } from '../js/config/permission-registry.js';
import { ROLE_PERMISSIONS } from '../js/config/role-permissions.js';
import { normalizeOverrideRecord } from '../js/permission-management/user-permission-overrides-rules.js';
import { renderHome, visibleHomeItemIds } from '../js/gudang/ui/gudang-home.js';
import { createSelectionState } from '../js/gudang/selection/selection-engine.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0; let fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); }
}
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const shuttle = (over = {}) => makeItem({
  itemId: over.itemId || 's1', name: over.name || 'Kok Yonex Mavis 350', itemType: ITEM_TYPE.CONSUMABLE,
  metadata: { inventoryClass: INVENTORY_CLASS.SHUTTLECOCK, ...(over.metadata || {}) },
  ...(over.category ? { category: over.category } : {}),
  ...(over.defaultLocationId ? { defaultLocationId: over.defaultLocationId } : {}),
});
const ordinaryConsumable = (over = {}) => makeItem({
  itemId: over.itemId || 'c1', name: over.name || 'Kertas A4', itemType: ITEM_TYPE.CONSUMABLE, ...over,
});
const ordinaryAsset = (over = {}) => makeItem({
  itemId: over.itemId || 'a1', name: over.name || 'Proyektor', itemType: ITEM_TYPE.ASSET, ...over,
});

/* ── Part A — Classification ─────────────────────────────────────────── */
console.log('\n[Part A — a Shuttlecock item is an ordinary Consumable carrying metadata.inventoryClass]');
{
  const s = shuttle();
  check('isShuttlecockItem() true for an item with metadata.inventoryClass="shuttlecock"', isShuttlecockItem(s) === true);
  check('a Shuttlecock item keeps itemType "consumable" (lifecycle unchanged: stock/goods-in-out/opname)', s.itemType === ITEM_TYPE.CONSUMABLE);
  check('inventoryClassOf() returns the raw class string', inventoryClassOf(s) === 'shuttlecock');
  check('isShuttlecockItem() false for an ordinary Consumable', isShuttlecockItem(ordinaryConsumable()) === false);
  check('inventoryClassOf() null for an ordinary item', inventoryClassOf(ordinaryConsumable()) === null);
  check('predicates never throw on null / a partial record', isShuttlecockItem(null) === false && isShuttlecockItem({}) === false && inventoryClassOf({ metadata: null }) === null);
  check('isKnownInventoryClass() recognises "shuttlecock" and rejects an unknown class', isKnownInventoryClass('shuttlecock') && !isKnownInventoryClass('racket'));
  check('an unknown metadata.inventoryClass value is NOT treated as Shuttlecock', !isShuttlecockItem(makeItem({ itemId: 'x', name: 'X', itemType: ITEM_TYPE.CONSUMABLE, metadata: { inventoryClass: 'racket' } })));
}

/* ── Part B — Access seam (fail-closed, injectable, never throws) ─────── */
console.log('\n[Part B — gudang-shuttlecock-access.js: fail-closed, injectable, never throws]');
{
  // Default (nothing wired) — the Node harness state.
  check('canAccessShuttlecock() is false by default (fail-closed, requirement §13)', canAccessShuttlecock() === false);

  setShuttlecockAccessSource(() => true);
  check('honours an injected resolver returning true', canAccessShuttlecock() === true);

  setShuttlecockAccessSource(() => false);
  check('honours an injected resolver returning false', canAccessShuttlecock() === false);

  setShuttlecockAccessSource(() => { throw new Error('permission service exploded'); });
  check('a throwing resolver fails closed to false, never propagates', canAccessShuttlecock() === false);

  setShuttlecockAccessSource('not a function');
  check('a non-function is ignored (cannot widen access) — still the throwing resolver, still false', canAccessShuttlecock() === false);

  // Non-boolean truthy must NOT be accepted as "yes" (=== true only).
  setShuttlecockAccessSource(() => 1);
  check('a truthy non-boolean (1) is NOT accepted as access', canAccessShuttlecock() === false);

  setShuttlecockAccessSource(() => false); // leave the seam closed for later parts
}

/* ── Part C — Source-strip: applyShuttlecockVisibility() ─────────────── */
console.log('\n[Part C — applyShuttlecockVisibility(): pass-through when permitted, strip + report ids when not]');
{
  const items = [ordinaryConsumable({ itemId: 'c1' }), shuttle({ itemId: 's1' }), ordinaryConsumable({ itemId: 'c2' }), shuttle({ itemId: 's2' })];

  const permitted = applyShuttlecockVisibility(items, true);
  check('permitted session: visible === the SAME array reference (exact pass-through)', permitted.visible === items);
  check('permitted session: hiddenIds is empty', permitted.hiddenIds.size === 0);

  const denied = applyShuttlecockVisibility(items, false);
  check('unpermitted session: every Shuttlecock item is removed from visible', denied.visible.map((i) => i.itemId).join(',') === 'c1,c2');
  check('unpermitted session: hiddenIds names exactly the withheld Shuttlecock ids', denied.hiddenIds.has('s1') && denied.hiddenIds.has('s2') && denied.hiddenIds.size === 2);
  check('anything other than the boolean true is treated as "no access" (fail-closed)', applyShuttlecockVisibility(items, undefined).visible.length === 2);
  check('safe on a non-array input', applyShuttlecockVisibility(null, false).visible.length === 0);
}

/* ── Part D — Catalog ordering: shuttlecockFirst() ──────────────────── */
console.log('\n[Part D — shuttlecockFirst(): Shuttlecock on top, ordinary items keep their order (requirement §3)]');
{
  const a = ordinaryConsumable({ itemId: 'a' });
  const b = ordinaryConsumable({ itemId: 'b' });
  const s1 = shuttle({ itemId: 's1' });
  const s2 = shuttle({ itemId: 's2' });
  check('interleaved input -> both Shuttlecock ids first, in their original relative order', shuttlecockFirst([a, s1, b, s2]).map((i) => i.itemId).join(',') === 's1,s2,a,b');
  check('ordinary items keep their exact relative order behind the Shuttlecock block', shuttlecockFirst([b, s1, a]).map((i) => i.itemId).join(',') === 's1,b,a');
  check('no Shuttlecock items -> returns the list untouched (same reference)', (() => { const arr = [a, b]; return shuttlecockFirst(arr) === arr; })());
  check('all Shuttlecock -> unchanged order', shuttlecockFirst([s2, s1]).map((i) => i.itemId).join(',') === 's2,s1');
}

/* ── Part E — Filter engine: the 'shuttlecock' type dimension ────────── */
console.log('\n[Part E — itemMatchesFilter: "shuttlecock" restricts to the class; "consumable" still includes it; "asset" excludes it]');
{
  const s = shuttle({ itemId: 's1' });
  const c = ordinaryConsumable({ itemId: 'c1' });
  const asset = ordinaryAsset({ itemId: 'a1' });

  const fShuttle = { ...createFilterState(), type: 'shuttlecock' };
  check('type="shuttlecock" matches a Shuttlecock item', itemMatchesFilter(s, fShuttle, {}));
  check('type="shuttlecock" does NOT match an ordinary Consumable', !itemMatchesFilter(c, fShuttle, {}));
  check('type="shuttlecock" does NOT match an Asset', !itemMatchesFilter(asset, fShuttle, {}));

  const fConsumable = { ...createFilterState(), type: 'consumable' };
  check('type="consumable" STILL includes a Shuttlecock item (it IS a Consumable)', itemMatchesFilter(s, fConsumable, {}));

  const fAsset = { ...createFilterState(), type: 'asset' };
  check('type="asset" excludes a Shuttlecock item', !itemMatchesFilter(s, fAsset, {}));

  check('isFilterActive() true when type is "shuttlecock"', isFilterActive(fShuttle));
  const chips = activeFilterChips(fShuttle, []);
  check('activeFilterChips() renders a "Shuttlecock" chip for the type dimension', chips.length === 1 && chips[0].key === 'type' && chips[0].label === 'Shuttlecock');
  clearFilterKey(fShuttle, 'type');
  check('clearFilterKey("type") resets it to "all" (same path as Consumable/Asset)', fShuttle.type === 'all' && !isFilterActive(fShuttle));

  check('filterItems(): "shuttlecock" narrows a mixed catalog to only the Shuttlecock items', filterItems([s, c, asset], { ...createFilterState(), type: 'shuttlecock' }, {}).map((i) => i.itemId).join(',') === 's1');
}

/* ── Part F — Search: findable by "shuttlecock" and by name ─────────── */
console.log('\n[Part F — itemMatchesQuery: a Shuttlecock item is findable by the word "shuttlecock" and by name]');
{
  const s = shuttle({ itemId: 's1', name: 'Kok Yonex Mavis 350' }); // name has NO "shuttlecock" in it
  check('matches the literal word "shuttlecock" via metadata.inventoryClass', itemMatchesQuery(s, 'shuttlecock'));
  check('still matches by its actual name', itemMatchesQuery(s, 'Mavis'));
  check('an ordinary Consumable does NOT match "shuttlecock"', !itemMatchesQuery(ordinaryConsumable({ name: 'Kertas A4' }), 'shuttlecock'));
  check('unrelated query still does not match the Shuttlecock item', !itemMatchesQuery(s, 'sabun'));
}

/* ── Part G — Permission model (existing architecture, no new system) ── */
console.log('\n[Part G — warehouse.shuttlecock.view: catalogued, admin-granted, per-bidang via Individual override]');
{
  const perm = PERMISSIONS['warehouse.shuttlecock.view'];
  check('warehouse.shuttlecock.view exists in the permission catalog', !!perm);
  check('it is filed under module "Warehouse", category "Shuttlecock"', perm && perm.module === 'Warehouse' && perm.category === 'Shuttlecock');
  check('it has a non-empty title + description (renderable by the Role/IPM admin UI with no code change)', !!(perm && perm.title && perm.description));

  const tree = buildPermissionTree();
  check('the permission tree exposes a Warehouse › Shuttlecock leaf with exactly this one permission', tree.Warehouse && tree.Warehouse.Shuttlecock && tree.Warehouse.Shuttlecock.length === 1 && tree.Warehouse.Shuttlecock[0].id === 'warehouse.shuttlecock.view');
  check('the pre-existing Warehouse › Items / Goods In leaves are untouched (3 / 1)', tree.Warehouse.Items.length === 3 && tree.Warehouse['Goods In'].length === 1);

  check('admin holds warehouse.shuttlecock.view in its BASE grant (admin override, requirement §8)', ROLE_PERMISSIONS.admin.includes('warehouse.shuttlecock.view'));
  for (const roleId of ['bidang', 'driver', 'viewer']) {
    check(`${roleId} does NOT hold warehouse.shuttlecock.view by default (requirement §2 — not visible to all bidang)`, !ROLE_PERMISSIONS[roleId].includes('warehouse.shuttlecock.view'));
  }

  // A specific bidang/unit gains it ONLY through the existing Individual
  // Permission Assignment path — driven here through the REAL
  // normalizeOverrideRecord() the live cache applies on every RTDB read.
  const withOverride = new Set([...ROLE_PERMISSIONS.bidang, ...normalizeOverrideRecord({ permissions: ['warehouse.shuttlecock.view'] })]);
  check('bidang + Individual override => warehouse.shuttlecock.view becomes effective for that ONE account', withOverride.has('warehouse.shuttlecock.view'));
  const noOverride = new Set([...ROLE_PERMISSIONS.bidang, ...normalizeOverrideRecord(null)]);
  check('a different bidang account with no override => still denied (per-unit granularity, requirement §7)', !noOverride.has('warehouse.shuttlecock.view'));
  check('the Individual override layer still refuses to smuggle system.admin alongside it', !normalizeOverrideRecord({ permissions: ['warehouse.shuttlecock.view', 'system.admin'] }).has('system.admin'));
}

/* ── Part H — Home render: chip + section are permission-gated ───────── */
console.log('\n[Part H — renderHome/visibleHomeItemIds: Shuttlecock chip + top section only for a permitted session]');
{
  const s1 = shuttle({ itemId: 's1', name: 'Kok Mavis 350' });
  const c1 = ordinaryConsumable({ itemId: 'c1', name: 'Kertas A4' });
  const c2 = ordinaryConsumable({ itemId: 'c2', name: 'Pulpen' });
  const makeSt = (items) => ({
    data: { items, locations: [], departments: [], assets: [] },
    loading: false, selection: createSelectionState(),
    homeStockBulk: null, homeStockBulkLoading: false,
    // pre-seed the per-card caches so renderHome() needs zero Firebase reads
    homeCardData: Object.fromEntries(items.map((i) => [i.itemId, { loading: false, stock: 0, forecast: null }])),
    homeImageCache: {},
    hiddenShuttlecockItemIds: new Set(),
  });
  const noop = () => {};

  // Session WITHOUT access: gudang-center.js would have stripped the
  // Shuttlecock item upstream — mirror that (c1/c2 only) — and the seam is
  // closed, so no chip / no section tag.
  setShuttlecockAccessSource(() => false);
  const deniedHtml = renderHome(makeSt([c1, c2]), {}, noop);
  check('no-access: the "Shuttlecock" filter chip is absent', !/data-val="shuttlecock"/.test(deniedHtml));
  check('no-access: the top "Shuttlecock" section tag is absent', !deniedHtml.includes('gud-catalog-shuttle-head'));

  // Session WITH access: Shuttlecock item present, seam open.
  setShuttlecockAccessSource(() => true);
  const okSt = makeSt([c1, s1, c2]);
  const okHtml = renderHome(okSt, {}, noop);
  check('with access: the "Shuttlecock" filter chip is rendered', /data-act="gud-home-type" data-val="shuttlecock"/.test(okHtml));
  check('with access + a Shuttlecock item: the top "Shuttlecock" section is rendered', okHtml.includes('gud-catalog-shuttle-head') && okHtml.includes('>Shuttlecock<'));
  check('with access: a per-card "Shuttlecock" pill marks the item', okHtml.includes('data-pill="info">Shuttlecock<'));
  check('with access but NO Shuttlecock item in view: chip shows, section does not', (() => {
    const html = renderHome(makeSt([c1, c2]), {}, noop);
    return /data-val="shuttlecock"/.test(html) && !html.includes('gud-catalog-shuttle-head');
  })());

  const order = visibleHomeItemIds(okSt);
  check('visibleHomeItemIds(): the Shuttlecock id sorts to the front (matches the rendered order for Shift+Click / Select All)', order[0] === 's1' && order.join(',') === 's1,c1,c2');

  setShuttlecockAccessSource(() => false); // restore closed
}

/* ── Part I — Wiring / architecture ─────────────────────────────────── */
console.log('\n[Part I — the seam is PURE and wired to the EXISTING permission service]');
{
  const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  for (const rel of ['js/gudang/config/gudang-inventory-class.js', 'js/gudang/config/gudang-shuttlecock-access.js']) {
    const src = stripComments(read(rel));
    check(`${rel} imports nothing from repository/ (PURE — no Firebase reachable)`, !/from ['"].*repository\//.test(src));
    check(`${rel} never imports firebase.js`, !/from ['"][^'"]*firebase\.js['"]/.test(src));
    check(`${rel} has NO import statement pulling in permission-service.js / auth.js (dependency-injection seam)`, !/import[\s\S]*?from\s*['"][^'"]*(permission-service|auth)\.js['"]/.test(src));
    check(`${rel} hardcodes no bidang name / user email (requirement §7/§12)`, !/===\s*['"](bidang|akuntes)['"]/.test(src) && !/@/.test(src));
  }

  const appCode = read('js/app.js');
  check('app.js imports setShuttlecockAccessSource from the config seam', appCode.includes("import { setShuttlecockAccessSource } from './gudang/config/gudang-shuttlecock-access.js'"));
  check('app.js wires it to the existing permission service — can(\'warehouse.shuttlecock.view\')', /setShuttlecockAccessSource\(\(\)\s*=>\s*can\('warehouse\.shuttlecock\.view'\)\)/.test(appCode));

  const centerCode = read('js/gudang/ui/gudang-center.js');
  check('gudang-center.js applies the strip at the ONE data boundary (refreshCatalog -> applyShuttlecockVisibility)', centerCode.includes('applyShuttlecockVisibility(itemsRes.data, canAccessShuttlecock())'));
  check('gudang-center.js stashes hiddenShuttlecockItemIds for the movement-fed surfaces', centerCode.includes('st.hiddenShuttlecockItemIds = shuttlecockVisibility.hiddenIds'));

  const filterCode = read('js/gudang/filters/filter-engine.js');
  check('filter-engine.js stays PURE (no repository/firebase import) after adding the shuttlecock dimension', !/from ['"].*repository\//.test(filterCode) && !filterCode.includes("firebase.js'"));

  // database.rules.json is deliberately NOT modified (requirement §13) —
  // the whole gudang/* subtree is already admin/developer-only at the DB
  // layer; per-record field filtering by permission is out of scope.
  check('database.rules.json contains no speculative "shuttlecock" rule (requirement §13 — no speculative security-rule change)', !read('database.rules.json').includes('shuttlecock'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
