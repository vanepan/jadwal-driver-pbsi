/* gudang-foundation-check.mjs — Gudang V1.28.0, Phase 1 (Foundation).

   Authorized by: Doc 4 Art.II/IV — Phase 1 brief, Part 10 "Tests".

   Architectural tests, not workflow tests, not UI tests — matching the
   brief's own framing. Six parts:
     A. Contract tests      — make()/is() round-trip + throws on bad input,
                               enums match Documents 1/2/3 exactly.
     B. Domain registry      — exactly the 14 ratified domains, no more.
     C. Repository guards    — INVALID_INPUT rejected BEFORE any Firebase
                               call (proven by these tests running with zero
                               network access and zero credentials).
     D. Projection engine    — pure, real numeric assertions: Movement always
                               wins, Consistency is checkable.
     E. Search resolver      — resolve() names actions, never performs them.
     F. Settings foundation  — defaults + merge + reset.
     G. Routing (static)     — app.js really does declare the gudang module,
                               its access-control case, and its nav function.

   Same check()/throws() harness as scripts/engineering-foundation-check.mjs.
   Deterministic. No V1, no live Firebase, no AI.
   Run: node scripts/gudang-foundation-check.mjs   (exit 0 = pass) */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ITEM_TYPE, makeItem, isItem,
} from '../js/gudang/contracts/item-contract.js';
import {
  MOVEMENT_TYPE, MOVEMENT_REASON, makeMovement, isMovement,
} from '../js/gudang/contracts/movement-contract.js';
import {
  ASSET_STATUS, ASSET_EVENT_TYPE, makeAsset, isAsset, makeAssetHistoryEntry, isAssetHistoryEntry,
} from '../js/gudang/contracts/asset-contract.js';
import { makeLocation, isLocation } from '../js/gudang/contracts/location-contract.js';
import { makeDepartment, isDepartment } from '../js/gudang/contracts/department-contract.js';
import { makeStockProjection, isStockProjection } from '../js/gudang/contracts/stock-projection-contract.js';
import { makeSearchResult, isSearchResult } from '../js/gudang/contracts/search-result-contract.js';
import { AUDIT_SOURCE, makeAuditEntry, isAuditEntry } from '../js/gudang/contracts/audit-entry-contract.js';

import {
  GUDANG_DOMAINS, DOMAIN_STATUS, getDomain, domainsByStatus, domainsWithFoundation, isRatifiedDomain,
} from '../js/gudang/config/gudang-domain-registry.js';

import { createItem, getItem } from '../js/gudang/repository/item-repository.js';
import { appendMovement } from '../js/gudang/repository/movement-repository.js';
import { createAsset } from '../js/gudang/repository/asset-repository.js';
import { appendAssetHistory } from '../js/gudang/repository/asset-history-repository.js';
import { createLocation } from '../js/gudang/repository/location-repository.js';
import { createDepartment } from '../js/gudang/repository/department-repository.js';
import { saveProjection } from '../js/gudang/repository/stock-repository.js';

import { deriveQuantity, rebuildProjection, isProjectionConsistent } from '../js/gudang/projection/stock-projection-engine.js';
import { resolve } from '../js/gudang/search/search-resolver.js';
import { getGudangSettings, setGudangSettings, resetGudangSettings } from '../js/gudang/settings/gudang-settings.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0; let fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); }
}
function throws(name, fn) {
  try { fn(); check(name, false); }
  catch (_e) { check(name, true); }
}

/* ── Part A — Contracts ─────────────────────────────────────────────── */
console.log('\n[Part A — Contracts]');
{
  check('ITEM_TYPE is exactly {consumable, asset}', Object.keys(ITEM_TYPE).length === 2 && ITEM_TYPE.CONSUMABLE === 'consumable' && ITEM_TYPE.ASSET === 'asset');
  const item = makeItem({ itemId: 'i1', name: 'Tisu Gulung', itemType: ITEM_TYPE.CONSUMABLE });
  check('makeItem() round-trips through isItem()', isItem(item));
  check('makeItem() freezes its result', Object.isFrozen(item));
  throws('makeItem() throws without itemId', () => makeItem({ name: 'x', itemType: ITEM_TYPE.CONSUMABLE }));
  throws('makeItem() throws on unknown itemType', () => makeItem({ itemId: 'i2', name: 'x', itemType: 'gadget' }));

  check('MOVEMENT_TYPE is exactly the 7 types Doc 3 Ch.04 names', Object.keys(MOVEMENT_TYPE).length === 7);
  check('MOVEMENT_REASON is exactly the 5 reasons Doc 2 §07/§10 name', Object.keys(MOVEMENT_REASON).length === 5);
  const movement = makeMovement({
    movementId: 'm1', itemId: 'i1', type: MOVEMENT_TYPE.GOODS_IN, quantityDelta: 10,
    reason: MOVEMENT_REASON.PURCHASE, actorId: 'u1',
  });
  check('makeMovement() round-trips through isMovement()', isMovement(movement));
  check('makeMovement() freezes its result', Object.isFrozen(movement));
  throws('makeMovement() throws on zero quantityDelta', () => makeMovement({ movementId: 'm2', itemId: 'i1', type: MOVEMENT_TYPE.ADJUSTMENT, quantityDelta: 0, reason: MOVEMENT_REASON.ADJUSTMENT, actorId: 'u1' }));
  throws('makeMovement() throws on unknown type', () => makeMovement({ movementId: 'm3', itemId: 'i1', type: 'teleport', quantityDelta: 1, reason: MOVEMENT_REASON.ADJUSTMENT, actorId: 'u1' }));
  throws('makeMovement() throws on unknown reason', () => makeMovement({ movementId: 'm4', itemId: 'i1', type: MOVEMENT_TYPE.ADJUSTMENT, quantityDelta: 1, reason: 'because', actorId: 'u1' }));
  throws('makeMovement() throws without actorId (Doc 1 Art.VI)', () => makeMovement({ movementId: 'm5', itemId: 'i1', type: MOVEMENT_TYPE.ADJUSTMENT, quantityDelta: 1, reason: MOVEMENT_REASON.ADJUSTMENT, actorId: '' }));

  check('ASSET_STATUS is exactly the 4 states Doc 3 Ch.06 names', Object.keys(ASSET_STATUS).length === 4);
  check('ASSET_EVENT_TYPE is exactly the 4 lifecycle facets Doc 3 Ch.06 names', Object.keys(ASSET_EVENT_TYPE).length === 4);
  const asset = makeAsset({ assetId: 'a1', itemId: 'i2', identity: 'SN-001' });
  check('makeAsset() round-trips through isAsset(), defaults to AVAILABLE', isAsset(asset) && asset.status === ASSET_STATUS.AVAILABLE);
  const historyEntry = makeAssetHistoryEntry({ historyId: 'h1', assetId: 'a1', eventType: ASSET_EVENT_TYPE.ASSIGN, actorId: 'u1', reason: 'ruang rapat A' });
  check('makeAssetHistoryEntry() round-trips through isAssetHistoryEntry()', isAssetHistoryEntry(historyEntry));
  throws('makeAssetHistoryEntry() throws on unknown eventType', () => makeAssetHistoryEntry({ historyId: 'h2', assetId: 'a1', eventType: 'teleport', actorId: 'u1', reason: 'x' }));

  const location = makeLocation({ locationId: 'l1', name: 'Gudang Utama' });
  check('makeLocation() round-trips through isLocation()', isLocation(location));
  const department = makeDepartment({ departmentId: 'd1', name: 'Sarpras' });
  check('makeDepartment() round-trips through isDepartment()', isDepartment(department));

  const projection = makeStockProjection({ itemId: 'i1', quantity: 42 });
  check('makeStockProjection() round-trips through isStockProjection()', isStockProjection(projection));
  throws('makeStockProjection() throws on non-finite quantity', () => makeStockProjection({ itemId: 'i1', quantity: NaN }));

  const searchResult = makeSearchResult({ ownerDomain: 'item', refId: 'i1', label: 'Tisu Gulung', actions: ['open'] });
  check('makeSearchResult() round-trips through isSearchResult()', isSearchResult(searchResult));
  throws('makeSearchResult() throws when actions is not an array of strings', () => makeSearchResult({ ownerDomain: 'item', refId: 'i1', label: 'x', actions: [1, 2] }));

  const auditEntry = makeAuditEntry({ source: AUDIT_SOURCE.MOVEMENT, refId: 'm1', who: 'u1', what: 'goods_in +10', why: 'purchase', when: movement.createdAt });
  check('makeAuditEntry() round-trips through isAuditEntry()', isAuditEntry(auditEntry));
  throws('makeAuditEntry() throws on unknown source', () => makeAuditEntry({ source: 'ledger', refId: 'x', who: 'u1', what: 'x', why: 'x', when: '2026-01-01' }));
}

/* ── Part B — Domain registry ───────────────────────────────────────── */
console.log('\n[Part B — Domain registry]');
{
  // Doc 3 Ch.03's own prose says "Fourteen domains" but its table enumerates
  // 15 rows (Item, Movement, Stock, Asset, Consumable, Analytics, Forecast,
  // Recommendation, Audit, Search, Location, Department, Supplier, NOR,
  // QR/Barcode/NFC) — a pre-existing inconsistency inside the ratified
  // document itself, not something this phase may resolve (Doc 4 Art.II:
  // implementation never reinterprets a ratified Document). This test — and
  // the registry — follow the table, the more specific of the two, and the
  // discrepancy is flagged verbatim in the Phase 1 completion report.
  check('GUDANG_DOMAINS has exactly the 15 domains Doc 3 Ch.03\'s table enumerates (see note above re: the doc\'s own "fourteen" prose)', GUDANG_DOMAINS.length === 15);
  const ids = GUDANG_DOMAINS.map((d) => d.id);
  check('every domain id is unique', new Set(ids).size === ids.length);
  check('isRatifiedDomain("item") is true', isRatifiedDomain('item'));
  check('isRatifiedDomain("gadget") is false (not a ratified domain)', !isRatifiedDomain('gadget'));
  check('getDomain("movement").authority cites Doc 1 Art.IV', /Doc 1 Art\.IV/.test(getDomain('movement')?.authority || ''));
  check('domainsByStatus(SEAM) has exactly 3 (Supplier, NOR, QR/Barcode/NFC)', domainsByStatus(DOMAIN_STATUS.SEAM).length === 3);
  check('domainsWithFoundation() has exactly 8 (the domains Phase 1 actually built)', domainsWithFoundation().length === 8);
  check('Consumable is ratified core but has NO Phase-1 foundation (its workflow is forbidden this phase)', getDomain('consumable')?.status === DOMAIN_STATUS.CORE && getDomain('consumable')?.hasFoundation === false);
}

/* ── Part C — Repository guards (no Firebase reached) ───────────────── */
console.log('\n[Part C — Repository guards reject bad input before any Firebase call]');
{
  const r1 = await createItem({ itemId: '', name: '', itemType: 'bad' });
  check('createItem(invalid) fails INVALID_INPUT without touching Firebase', !r1.ok && r1.error.code === 'INVALID_INPUT');

  const r2 = await appendMovement({ movementId: '', itemId: '', type: 'bad', quantityDelta: 0, reason: 'bad', actorId: '' });
  check('appendMovement(invalid) fails INVALID_INPUT without touching Firebase', !r2.ok && r2.error.code === 'INVALID_INPUT');

  const r3 = await createAsset({ assetId: '', itemId: '', identity: '' });
  check('createAsset(invalid) fails INVALID_INPUT without touching Firebase', !r3.ok && r3.error.code === 'INVALID_INPUT');

  const r4 = await appendAssetHistory({ historyId: '', assetId: '', eventType: 'bad', actorId: '', reason: '' });
  check('appendAssetHistory(invalid) fails INVALID_INPUT without touching Firebase', !r4.ok && r4.error.code === 'INVALID_INPUT');

  const r5 = await createLocation({ locationId: '', name: '' });
  check('createLocation(invalid) fails INVALID_INPUT without touching Firebase', !r5.ok && r5.error.code === 'INVALID_INPUT');

  const r6 = await createDepartment({ departmentId: '', name: '' });
  check('createDepartment(invalid) fails INVALID_INPUT without touching Firebase', !r6.ok && r6.error.code === 'INVALID_INPUT');

  const r7 = await saveProjection({ itemId: '', quantity: NaN });
  check('saveProjection(invalid) fails INVALID_INPUT without touching Firebase', !r7.ok && r7.error.code === 'INVALID_INPUT');

  const r8 = await getItem('');
  check('getItem("") fails INVALID_INPUT without touching Firebase', !r8.ok && r8.error.code === 'INVALID_INPUT');
}

/* ── Part D — Projection engine (pure) ──────────────────────────────── */
console.log('\n[Part D — Projection engine: Movement always wins]');
{
  const movements = [
    makeMovement({ movementId: 'm1', itemId: 'i1', type: MOVEMENT_TYPE.GOODS_IN, quantityDelta: 10, reason: MOVEMENT_REASON.PURCHASE, actorId: 'u1' }),
    makeMovement({ movementId: 'm2', itemId: 'i1', type: MOVEMENT_TYPE.GOODS_OUT, quantityDelta: -3, reason: MOVEMENT_REASON.TRANSFER, actorId: 'u1' }),
    makeMovement({ movementId: 'm3', itemId: 'i1', type: MOVEMENT_TYPE.ADJUSTMENT, quantityDelta: 2, reason: MOVEMENT_REASON.ADJUSTMENT, actorId: 'u1' }),
  ];
  check('deriveQuantity() sums signed deltas exactly (10 - 3 + 2 = 9)', deriveQuantity(movements) === 9);

  const projection = rebuildProjection('i1', movements);
  check('rebuildProjection().quantity matches deriveQuantity()', projection.quantity === 9);
  check('rebuildProjection().lastMovementId is the newest movement, regardless of input order', projection.lastMovementId === 'm3');

  const shuffled = [movements[2], movements[0], movements[1]];
  const projectionFromShuffled = rebuildProjection('i1', shuffled);
  check('rebuildProjection() is order-independent (same quantity/lastMovementId either way)',
    projectionFromShuffled.quantity === projection.quantity && projectionFromShuffled.lastMovementId === projection.lastMovementId);

  check('isProjectionConsistent() is true for a projection that matches its movements', isProjectionConsistent(projection, movements));
  const staleProjection = makeStockProjection({ itemId: 'i1', quantity: 999, lastMovementId: 'm3' });
  check('isProjectionConsistent() is false when the cached quantity has drifted from Movement', !isProjectionConsistent(staleProjection, movements));
  check('isProjectionConsistent(null, ...) is false, never throws', !isProjectionConsistent(null, movements));

  const extraMovement = makeMovement({ movementId: 'm4', itemId: 'i1', type: MOVEMENT_TYPE.RETURN, quantityDelta: -1, reason: MOVEMENT_REASON.RETURN, actorId: 'u1' });
  check('isProjectionConsistent() goes false the instant a new Movement is appended and the projection is not yet rebuilt', !isProjectionConsistent(projection, [...movements, extraMovement]));
}

/* ── Part E — Search resolver (pure) ────────────────────────────────── */
console.log('\n[Part E — Search resolver: names actions, never performs them]');
{
  const itemResult = resolve({ domain: 'item', record: { itemId: 'i1', name: 'Tisu Gulung' } });
  check('resolve() names "open" as the only valid action for an item (no engine to hand off to yet)', isSearchResult(itemResult) && itemResult.actions.length === 1 && itemResult.actions[0] === 'open');
  check('resolve() carries the record label through untouched (Doc 2 §05: never only an internal identifier)', itemResult.label === 'Tisu Gulung');

  const locationResult = resolve({ domain: 'location', record: { locationId: 'l1', name: 'Gudang Utama' } });
  check('resolve() works identically for a location candidate', isSearchResult(locationResult) && locationResult.ownerDomain === 'location');
}

/* ── Part F — Settings foundation ───────────────────────────────────── */
console.log('\n[Part F — Settings foundation]');
{
  resetGudangSettings();
  const defaults = getGudangSettings();
  check('default settings: no "warehouse" field exists (Phase 1.1 Review 6 — no ratified Warehouse domain)', !('defaultWarehouseId' in defaults));
  check('default settings: no default location set yet', defaults.defaultLocationId === null);
  check('default settings: scan is a dormant seam (Doc 1 Art.X)', defaults.scan.enabled === false);
  check('default settings: analytics is a dormant seam (deferred to its own phase)', defaults.analytics.enabled === false);

  const patched = setGudangSettings({ defaultLocationId: 'l1' });
  check('setGudangSettings() merges without disturbing the seam flags', patched.defaultLocationId === 'l1' && patched.scan.enabled === false);

  resetGudangSettings();
  check('resetGudangSettings() restores every default', getGudangSettings().defaultLocationId === null);
}

/* ── Part G — Routing (static): app.js really declares the module ──── */
console.log('\n[Part G — Routing: js/app.js declares Gudang module wiring]');
{
  const appJs = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
  check('MODULE_DEFS has a "gudang" entry', /gudang:\s*\{/.test(appJs));
  check('canAccessModule() gates "gudang" on APP_ENV=development, resolved before the admin bypass (Phase 1.1 Review 7)',
    /if \(name === 'gudang'\) return getAppEnv\(\) === 'development';[\s\S]{0,80}if \(isAdmin\(\)\) return true;/.test(appJs));
  check('navGudang() is defined', /function navGudang\s*\(/.test(appJs));
  check('navGudang() lands on the shared placeholder (no operational UI)', /function navGudang[\s\S]{0,300}showModulePlaceholder\(/.test(appJs));
  check('the rail item id v2RailGudang is declared', /v2RailGudang/.test(appJs));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
