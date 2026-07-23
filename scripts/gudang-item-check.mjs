/* gudang-item-check.mjs — Gudang V1.28.0, Phase 2 (Item Foundation).

   Authorized by: Doc 1 Art.V · Doc 3 Ch.03 — Phase 2 brief, Part 13
   "Verification" (minimum coverage: identity ownership, repository
   ownership, alias resolution, category validation, normalization,
   duplicate prevention, archive behavior, contract integrity, repository
   boundary, search preparation, architecture integrity).

   Same check()/throws() harness as scripts/gudang-foundation-check.mjs.
   Deterministic. No live Firebase, no AI. Everything tested here is either
   a pure function (item-contract.js, item-identity-rules.js,
   text-normalization.js, gudang-categories.js, item-keyword-index.js) or a
   static source scan (item-repository.js's export surface, cross-contract
   identity duplication) — nothing requires network access or credentials.

   Run: node scripts/gudang-item-check.mjs   (exit 0 = pass) */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ITEM_TYPE, ITEM_SCHEMA, makeItem, updateItemModel, isItem } from '../js/gudang/contracts/item-contract.js';
import { findIdentityCollision, findItemByNormalizedAlias } from '../js/gudang/contracts/item-identity-rules.js';
import { normalizeText, tokenize } from '../js/gudang/contracts/text-normalization.js';
import {
  CATEGORY_SEED, getCategory, isValidCategory, categoriesForItemType, categoryLabel,
} from '../js/gudang/config/gudang-categories.js';
import { GUDANG_DOMAINS, getDomain } from '../js/gudang/config/gudang-domain-registry.js';
import { buildItemKeywordIndex, lookupItemIdsByToken } from '../js/gudang/search/item-keyword-index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0; let fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); }
}
function throws(name, fn) {
  try { fn(); check(name, false); }
  catch (_e) { check(name, true); }
}

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

function makeSampleItem(overrides = {}) {
  return makeItem({
    itemId: 'i-tisu', name: 'Tisu Gulung', itemType: ITEM_TYPE.CONSUMABLE, category: 'atk',
    aliases: ['Tissue', 'Tisu Toilet', 'Roll Tissue'],
    ...overrides,
  });
}

/* ── Part 1 — Identity ownership ────────────────────────────────────── */
console.log('\n[Part 1 — Identity ownership: Item is the only identity owner]');
{
  const otherContracts = [
    'js/gudang/contracts/movement-contract.js',
    'js/gudang/contracts/asset-contract.js',
    'js/gudang/contracts/location-contract.js',
    'js/gudang/contracts/department-contract.js',
    'js/gudang/contracts/stock-projection-contract.js',
    'js/gudang/contracts/search-result-contract.js',
    'js/gudang/contracts/audit-entry-contract.js',
  ];
  const identityFields = ['aliases', 'category', 'normalizedName', 'normalizedAliases', 'searchTokens'];
  const offenders = [];
  for (const rel of otherContracts) {
    const code = read(rel);
    for (const field of identityFields) {
      if (new RegExp(`\\b${field}\\b`).test(code)) offenders.push(`${rel}:${field}`);
    }
  }
  check(`NO other Gudang contract independently defines an Item identity field (aliases/category/normalizedName/normalizedAliases/searchTokens)${offenders.length ? ` — FOUND: ${offenders.join(', ')}` : ''}`, offenders.length === 0);

  throws('makeItem() throws without category (identity is never partial)', () => makeItem({ itemId: 'x', name: 'x', itemType: ITEM_TYPE.CONSUMABLE }));
}

/* ── Part 2 — Repository ownership ──────────────────────────────────── */
console.log('\n[Part 2 — Repository ownership: exactly the allowed exports, none forbidden]');
{
  const code = read('js/gudang/repository/item-repository.js');
  const exported = Array.from(code.matchAll(/export\s+async\s+function\s+(\w+)/g)).map((m) => m[1]);
  const allowed = ['createItem', 'getItem', 'listItems', 'updateItem', 'archiveItem', 'findByAlias'];
  const missing = allowed.filter((fn) => !exported.includes(fn));
  const unexpected = exported.filter((fn) => !allowed.includes(fn));
  check(`item-repository.js exports all 6 allowed functions${missing.length ? ` — MISSING: ${missing.join(', ')}` : ''}`, missing.length === 0);
  check(`item-repository.js exports NO unexpected functions${unexpected.length ? ` — FOUND: ${unexpected.join(', ')}` : ''}`, unexpected.length === 0);
  for (const forbidden of ['deleteItem', 'replaceItem', 'mergeItems']) {
    check(`item-repository.js does NOT export ${forbidden}()`, !exported.includes(forbidden));
  }
}

/* ── Part 3 — Alias resolution ──────────────────────────────────────── */
console.log('\n[Part 3 — Alias resolution: one Item, many aliases, all resolving to it]');
{
  const tisu = makeSampleItem();
  const sabun = makeItem({ itemId: 'i-sabun', name: 'Sabun Cuci Tangan', itemType: ITEM_TYPE.CONSUMABLE, category: 'cleaning', aliases: ['Hand Soap'] });
  const catalog = [tisu, sabun];

  check('findItemByNormalizedAlias resolves the canonical name', findItemByNormalizedAlias(normalizeText('Tisu Gulung'), catalog)?.itemId === 'i-tisu');
  check('findItemByNormalizedAlias resolves "Tissue" to the same Item', findItemByNormalizedAlias(normalizeText('Tissue'), catalog)?.itemId === 'i-tisu');
  check('findItemByNormalizedAlias resolves "Tisu Toilet" to the same Item', findItemByNormalizedAlias(normalizeText('  ROLL TISSUE  '), catalog)?.itemId === 'i-tisu');
  check('findItemByNormalizedAlias resolves an unrelated item\'s alias to ITSELF, not the first item', findItemByNormalizedAlias(normalizeText('Hand Soap'), catalog)?.itemId === 'i-sabun');
  check('findItemByNormalizedAlias returns null for an alias nobody owns', findItemByNormalizedAlias(normalizeText('Nonexistent Thing'), catalog) === null);
  check('aliases never become identities: the Item\'s own itemId is unrelated to any alias text', tisu.itemId === 'i-tisu' && !tisu.aliases.includes(tisu.itemId));
}

/* ── Part 4 — Category validation ───────────────────────────────────── */
console.log('\n[Part 4 — Categories: lightweight, flat, scoped to ItemType]');
{
  check('CATEGORY_SEED has exactly 14 categories (6 Consumable + 8 Asset)', CATEGORY_SEED.length === 14);
  check('every category is a flat leaf — no parent/child field exists anywhere', CATEGORY_SEED.every((c) => !('parentId' in c) && !('children' in c)));
  check('isValidCategory("atk", consumable) is true', isValidCategory('atk', ITEM_TYPE.CONSUMABLE));
  check('isValidCategory("atk", asset) is false — a category never crosses ItemType', !isValidCategory('atk', ITEM_TYPE.ASSET));
  check('isValidCategory("vehicle", asset) is true', isValidCategory('vehicle', ITEM_TYPE.ASSET));
  check('isValidCategory("nonexistent", consumable) is false', !isValidCategory('nonexistent', ITEM_TYPE.CONSUMABLE));
  check('categoriesForItemType(consumable) has exactly 6 entries', categoriesForItemType(ITEM_TYPE.CONSUMABLE).length === 6);
  check('categoriesForItemType(asset) has exactly 8 entries', categoriesForItemType(ITEM_TYPE.ASSET).length === 8);
  check('getCategory("gym_equipment") resolves the Asset category, distinct from Consumable\'s "gym"', getCategory('gym_equipment')?.itemType === ITEM_TYPE.ASSET && getCategory('gym')?.itemType === ITEM_TYPE.CONSUMABLE);
  check('categoryLabel("hvac") returns "HVAC"', categoryLabel('hvac') === 'HVAC');
  check('categoryLabel(unknown id) falls back to the id itself, never throws', categoryLabel('totally-unknown') === 'totally-unknown');

  throws('makeItem() throws when category does not match itemType (Asset category on a Consumable)', () => makeItem({ itemId: 'x', name: 'x', itemType: ITEM_TYPE.CONSUMABLE, category: 'vehicle' }));
  throws('makeItem() throws on a category that does not exist at all', () => makeItem({ itemId: 'x', name: 'x', itemType: ITEM_TYPE.CONSUMABLE, category: 'nope' }));
}

/* ── Part 5 — Normalization ─────────────────────────────────────────── */
console.log('\n[Part 5 — Normalization: deterministic, no ranking, no fuzzy matching]');
{
  check('normalizeText trims, lowercases, and collapses internal whitespace', normalizeText('  Tisu   Gulung ') === 'tisu gulung');
  check('normalizeText is deterministic — same input, same output, twice', normalizeText('ABC') === normalizeText('ABC'));
  check('tokenize splits on non-alphanumerics', JSON.stringify(tokenize('Tisu-Gulung/500ml')) === JSON.stringify(['tisu', 'gulung', '500ml']));

  const tisu = makeSampleItem();
  check('makeItem computes normalizedName from name', tisu.normalizedName === 'tisu gulung');
  check('makeItem computes normalizedAliases from aliases (lowercased, deduped)', JSON.stringify([...tisu.normalizedAliases].sort()) === JSON.stringify(['roll tissue', 'tissue', 'tisu toilet'].sort()));
  check('makeItem computes non-empty searchTokens from name + aliases', tisu.searchTokens.length > 0 && tisu.searchTokens.includes('tisu'));

  throws('makeItem() throws when name tokenizes to nothing (e.g. "!!!")', () => makeItem({ itemId: 'x', name: '!!!', itemType: ITEM_TYPE.CONSUMABLE, category: 'atk' }));
}

/* ── Part 6 — Duplicate prevention ──────────────────────────────────── */
console.log('\n[Part 6 — Duplicate prevention: identity resolves to exactly one Item]');
{
  const a = makeItem({ itemId: 'a', name: 'Kertas A4', itemType: ITEM_TYPE.CONSUMABLE, category: 'atk', aliases: ['Paper A4'] });
  const bSameName = makeItem({ itemId: 'b', name: 'Kertas A4', itemType: ITEM_TYPE.CONSUMABLE, category: 'atk' });
  const cAliasCollidesWithAName = makeItem({ itemId: 'c', name: 'HVS', itemType: ITEM_TYPE.CONSUMABLE, category: 'atk', aliases: ['Kertas A4'] });
  const dAliasCollidesWithAAlias = makeItem({ itemId: 'd', name: 'Kertas Print', itemType: ITEM_TYPE.CONSUMABLE, category: 'atk', aliases: ['Paper A4'] });
  const eDistinct = makeItem({ itemId: 'e', name: 'Pulpen', itemType: ITEM_TYPE.CONSUMABLE, category: 'atk' });

  check('findIdentityCollision catches a duplicate normalizedName', findIdentityCollision(bSameName, [a]) === 'a');
  check('findIdentityCollision catches an alias colliding with another Item\'s name', findIdentityCollision(cAliasCollidesWithAName, [a]) === 'a');
  check('findIdentityCollision catches an alias colliding with another Item\'s alias', findIdentityCollision(dAliasCollidesWithAAlias, [a]) === 'a');
  check('findIdentityCollision returns null for genuinely distinct Items', findIdentityCollision(eDistinct, [a]) === null);
  check('findIdentityCollision excludes the candidate itself (so re-checking an unchanged Item during update never self-collides)', findIdentityCollision(a, [a]) === null);
}

/* ── Part 7 — Archive behavior ──────────────────────────────────────── */
console.log('\n[Part 7 — Archive: identity deactivated, never deleted]');
{
  const original = makeSampleItem();
  const archived = updateItemModel(original, { active: false });
  check('archiving sets active to false', archived.active === false);
  check('archiving preserves itemId', archived.itemId === original.itemId);
  check('archiving preserves itemType', archived.itemType === original.itemType);
  check('archiving preserves createdAt (no re-creation)', archived.createdAt === original.createdAt);
  check('archiving preserves name/category/aliases untouched', archived.name === original.name && archived.category === original.category);

  const repoCode = read('js/gudang/repository/item-repository.js');
  check('archiveItem() is implemented as updateItem(itemId, { active: false }) — no separate deletion path', /archiveItem\([^)]*\)\s*{\s*return updateItem\([^,]+,\s*\{\s*active:\s*false\s*\}\)/.test(repoCode));
}

/* ── Part 8 — Contract integrity ────────────────────────────────────── */
console.log('\n[Part 8 — Contract integrity: identity is stable forever]');
{
  const item = makeSampleItem();
  check('ITEM_SCHEMA is a versioned string', /^gudang\.item@\d+$/.test(ITEM_SCHEMA));
  check('makeItem() round-trips through isItem()', isItem(item));
  check('makeItem() freezes its result, including nested arrays', Object.isFrozen(item) && Object.isFrozen(item.aliases) && Object.isFrozen(item.searchTokens));

  throws('updateItemModel() throws when patch tries to change itemId', () => updateItemModel(item, { itemId: 'different' }));
  throws('updateItemModel() throws when patch tries to change itemType', () => updateItemModel(item, { itemType: ITEM_TYPE.ASSET }));

  const renamed = updateItemModel(item, { name: 'Tisu Gulung Premium' });
  check('updateItemModel() allows renaming and recomputes normalizedName/searchTokens', renamed.normalizedName === 'tisu gulung premium' && renamed.searchTokens.includes('premium'));
  check('updateItemModel() never changes createdAt', renamed.createdAt === item.createdAt);
}

/* ── Part 9 — Repository boundary ───────────────────────────────────── */
console.log('\n[Part 9 — Repository boundary: item-repository.js is persistence only]');
{
  const code = read('js/gudang/repository/item-repository.js');
  const codeNoComments = stripComments(code);
  check('no DOM/window/UI coupling', !/document\.|window\.|innerHTML|querySelector/.test(codeNoComments));
  check('no analytics/forecast/recommendation logic (outside comments explaining their absence)', !/\banalytics\b|\bforecast\b|\brecommendation\b/i.test(codeNoComments));
  check('no search-ranking logic (rank, score, fuzzy — outside comments explaining their absence)', !/\brank\b|\bscore\b|\bfuzzy\b/i.test(codeNoComments));
  const imports = Array.from(code.matchAll(/from\s+'([^']+)'/g)).map((m) => m[1]);
  const badImports = imports.filter((i) => /\/(projection|audit|search|settings)\//.test(i));
  check(`imports only config/contracts/repository-result — nothing from projection/audit/search/settings${badImports.length ? ` — FOUND: ${badImports.join(', ')}` : ''}`, badImports.length === 0);
}

/* ── Part 10 — Search preparation ───────────────────────────────────── */
console.log('\n[Part 10 — Search preparation: prepared, deterministic, NOT wired into live Search]');
{
  const items = [makeSampleItem(), makeItem({ itemId: 'i-sabun', name: 'Sabun Cuci Tangan', itemType: ITEM_TYPE.CONSUMABLE, category: 'cleaning', aliases: ['Hand Soap'] })];
  const index = buildItemKeywordIndex(items);
  check('buildItemKeywordIndex indexes a name token to its owning item', lookupItemIdsByToken(index, 'tisu').includes('i-tisu'));
  check('buildItemKeywordIndex indexes an alias token too', lookupItemIdsByToken(index, 'tissue').includes('i-tisu'));
  check('buildItemKeywordIndex keeps different items\' tokens separate', !lookupItemIdsByToken(index, 'sabun').includes('i-tisu'));
  check('lookupItemIdsByToken returns an empty array for an unindexed token, never throws', JSON.stringify(lookupItemIdsByToken(index, 'nonexistent')) === '[]');

  const searchResolverCode = read('js/gudang/search/search-resolver.js');
  check('search-resolver.js (Phase 1 Foundation) does NOT import item-keyword-index.js — prepared, not wired in (Phase 2 Mission: "Do NOT modify Foundation")', !searchResolverCode.includes('item-keyword-index'));
}

/* ── Part 11 — Architecture integrity ───────────────────────────────── */
console.log('\n[Part 11 — Architecture integrity: no drift introduced by Item Foundation]');
{
  check('GUDANG_DOMAINS still has exactly 15 entries — Category was NOT added as a 16th domain', GUDANG_DOMAINS.length === 15);
  check('config/gudang-domain-registry.js was not touched to mention "category" (Doc 3 Ch.03 stays frozen)', !read('js/gudang/config/gudang-domain-registry.js').includes('category'));
  check('the "item" domain entry is unchanged: still authorized by Doc 3 Ch.03', getDomain('item')?.authority === 'Doc 3 Ch.03');
  check('the "consumable" domain still has no Phase-1/2 foundation (its workflow remains forbidden)', getDomain('consumable')?.hasFoundation === false);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
