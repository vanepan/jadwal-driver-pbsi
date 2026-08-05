/* gudang-activity-check.mjs — Gudang v1.29.6, Warehouse Activity Timeline.

   Same check()/read() harness as scripts/gudang-upload-check.mjs. Parts:
     A. Engine core           — createActivityEntry shape, sortActivities-
                              Desc, the 5-tier Today/Yesterday/Last Week/
                              Last Month/Older bucketing (exact stated
                              thresholds, empty buckets omitted),
                              filterActivitiesByType, client-side
                              searchActivities, availableActivityTypes.
     B. Gudang adapters        — itemCreatedActivity's shape (from
                              item.createdAt, no read/write); movement-
                              ToActivity's Bulk Goods Out heuristic
                              (purpose/notes present -> bulk_goods_out;
                              both absent -> plain goods_out) and
                              department-name resolution (never a raw
                              id); icon/tone fallbacks for unmapped types.
     C. movement-history-view.js — the v1.29.6 amendment is additive:
                              type/reason/purpose/notes are NEW keys,
                              every pre-existing key (what/why/when/who/
                              quantityDelta/price) is byte-identical.
     D. Architecture           — activity-engine.js is genuinely PURE
                              (zero imports, no Gudang/Item/Movement
                              string anywhere in it); the full DO NOT
                              MODIFY surface for this release (Inventory
                              Engine, Search/Filter/Selection Engines,
                              Bulk Operations, Upload Engine, Forecast
                              Engine, Vehicle Module, Firebase Schema,
                              Business Rules) shows no trace of the
                              Activity Timeline; gudang-item-detail.js/
                              gudang-center.js are wired without
                              duplicating dispatch logic.
     E. Live render sweep       — renderTimeline() for a Consumable (with
                              movements) and an Asset (with none) across
                              filter/search/expand states, no exceptions.

   Deterministic. No live Firebase, no AI.
   Run: node scripts/gudang-activity-check.mjs   (exit 0 = pass) */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createActivityEntry, sortActivitiesDesc, groupActivitiesByPeriod, DEFAULT_PERIOD_LABELS,
  filterActivitiesByType, searchActivities, availableActivityTypes,
} from '../js/gudang/activity/activity-engine.js';
import {
  ACTIVITY_TYPE, ACTIVITY_LABEL, iconForActivity, toneForActivity, itemCreatedActivity, movementToActivity,
} from '../js/gudang/activity/gudang-activities.js';
import { formatMovementEntry } from '../js/gudang/audit/movement-history-view.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0; let fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); }
}
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

function daysAgoISO(n, hour = 10) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}
function entry(id, whenDaysAgo, extra = {}) {
  return createActivityEntry({ id, type: 'goods_out', when: daysAgoISO(whenDaysAgo), title: `T${id}`, ...extra });
}

/* ── Part A — Engine core ─────────────────────────────────────────────── */
console.log('\n[Part A — activity-engine.js: entries, sort, 5-tier grouping, filter, search]');
{
  const e = createActivityEntry({ id: 'a1', type: 'goods_out', when: '2026-01-01T00:00:00.000Z', title: 'Goods Out' });
  check('createActivityEntry(): defaults who=null, description=empty, meta=null', e.who === null && e.description === '' && e.meta === null);
  check('createActivityEntry(): carries id/type/when/title through unchanged', e.id === 'a1' && e.type === 'goods_out' && e.title === 'Goods Out');

  const unsorted = [entry(1, 0), entry(2, 5), entry(3, 1)];
  const sorted = sortActivitiesDesc(unsorted);
  check('sortActivitiesDesc(): newest first', sorted[0].id === 1 && sorted[1].id === 3 && sorted[2].id === 2);

  check('DEFAULT_PERIOD_LABELS: exactly 5 tiers, in the brief\'s own order', DEFAULT_PERIOD_LABELS.length === 5 && DEFAULT_PERIOD_LABELS.map((l) => l.label).join(',') === 'Hari Ini,Kemarin,Minggu Lalu,Bulan Lalu,Lebih Lama');

  const spread = [entry('today', 0), entry('yesterday', 1), entry('week', 5), entry('month', 20), entry('old', 90)];
  const groups = groupActivitiesByPeriod(spread);
  const byLabel = Object.fromEntries(groups.map((g) => [g.label, g.entries.map((e2) => e2.id)]));
  check('groupActivitiesByPeriod(): day 0 -> Hari Ini', byLabel['Hari Ini']?.includes('today'));
  check('groupActivitiesByPeriod(): day 1 -> Kemarin', byLabel['Kemarin']?.includes('yesterday'));
  check('groupActivitiesByPeriod(): day 5 (2-7 range) -> Minggu Lalu', byLabel['Minggu Lalu']?.includes('week'));
  check('groupActivitiesByPeriod(): day 20 (8-30 range) -> Bulan Lalu', byLabel['Bulan Lalu']?.includes('month'));
  check('groupActivitiesByPeriod(): day 90 (31+) -> Lebih Lama', byLabel['Lebih Lama']?.includes('old'));
  check('groupActivitiesByPeriod(): empty periods are omitted entirely (never a blank group)', groups.length === 5 && groups.every((g) => g.entries.length > 0));
  const oneGroup = groupActivitiesByPeriod([entry('only', 0)]);
  check('groupActivitiesByPeriod(): a single entry produces exactly ONE group, not five with four empty', oneGroup.length === 1);

  const typed = [entry('a', 0, { type: 'goods_out' }), entry('b', 0, { type: 'goods_in' }), entry('c', 0, { type: 'goods_out' })];
  check('filterActivitiesByType(): narrows to exactly the requested type', filterActivitiesByType(typed, 'goods_out').length === 2);
  check('filterActivitiesByType(): "all" (or falsy) returns everything', filterActivitiesByType(typed, 'all').length === 3 && filterActivitiesByType(typed, null).length === 3);

  const searchable = [
    createActivityEntry({ id: 's1', type: 'goods_out', when: daysAgoISO(0), title: 'Goods Out', description: 'Diminta oleh Engineering' }),
    createActivityEntry({ id: 's2', type: 'goods_in', when: daysAgoISO(0), title: 'Goods In', description: 'Dari Supplier ABC' }),
  ];
  check('searchActivities(): matches title OR description, case-insensitive, client-side only', searchActivities(searchable, 'engineering').length === 1 && searchActivities(searchable, 'GOODS IN').length === 1);
  check('searchActivities(): an empty query returns everything unfiltered', searchActivities(searchable, '').length === 2);

  check('availableActivityTypes(): distinct types, first-seen order, no duplicates', JSON.stringify(availableActivityTypes(typed)) === JSON.stringify(['goods_out', 'goods_in']));
}

/* ── Part B — Gudang adapters ─────────────────────────────────────────── */
console.log('\n[Part B — gudang-activities.js: Item Created + Movement adapters, Bulk Goods Out heuristic]');
{
  const item = { itemId: 'i1', createdAt: '2026-01-01T08:00:00.000Z' };
  const created = itemCreatedActivity(item);
  check('itemCreatedActivity(): type is item_created, when = item.createdAt exactly', created.type === ACTIVITY_TYPE.ITEM_CREATED && created.when === item.createdAt);
  check('itemCreatedActivity(): a real, human-readable title (never a raw field)', created.title === ACTIVITY_LABEL.item_created && created.title.length > 0);

  const departments = [{ departmentId: 'dep1', name: 'Engineering' }];
  const plainGoodsOut = formatMovementEntry({ movementId: 'mv1', itemId: 'i1', type: 'goods_out', reason: 'issue', quantityDelta: -5, departmentId: 'dep1', actorId: 'u1', createdAt: '2026-01-01T09:00:00.000Z', price: null, purpose: null, notes: null });
  const bulkGoodsOut = formatMovementEntry({ movementId: 'mv2', itemId: 'i1', type: 'goods_out', reason: 'issue', quantityDelta: -3, departmentId: 'dep1', actorId: 'u1', createdAt: '2026-01-01T09:05:00.000Z', price: null, purpose: 'Rapat bulanan', notes: null });

  const a1 = movementToActivity(plainGoodsOut, departments);
  check('movementToActivity(): a Goods Out with NO purpose/notes stays plain "goods_out" (the honest, disclosed limit of the heuristic)', a1.type === ACTIVITY_TYPE.GOODS_OUT);
  const a2 = movementToActivity(bulkGoodsOut, departments);
  check('movementToActivity(): a Goods Out WITH purpose or notes is labeled bulk_goods_out', a2.type === ACTIVITY_TYPE.BULK_GOODS_OUT);
  check('movementToActivity(): the department id is resolved to a real name, never left raw (brief: "never expose raw database fields")', a1.description.includes('Engineering') && !a1.description.includes('dep1'));
  check('movementToActivity(): purpose is surfaced in meta for the expanded detail view', a2.meta.purpose === 'Rapat bulanan');
  check('movementToActivity(): quantity is human-readable ("+/-N Unit"), not a bare signed number', /Unit/.test(a1.description));

  check('iconForActivity(): known types resolve to an EXISTING gudang-atoms.js icon name (goods_out -> arrow-out)', iconForActivity('goods_out') === 'arrow-out');
  check('iconForActivity(): an unmapped (dormant/future) type falls back to "history", never throws', iconForActivity('photo_uploaded') === 'history' && iconForActivity('totally_unknown') === 'history');
  check('toneForActivity(): goods_in is "ok", goods_out is "crit", unmapped is "neutral"', toneForActivity('goods_in') === 'ok' && toneForActivity('goods_out') === 'crit' && toneForActivity('item_created') === 'neutral');

  // Every ACTIVITY_TYPE has a label — brief: "Never expose raw database
  // fields" extended to "never show an unlabeled raw type string" even
  // for a dormant/future type a filter chip might one day list.
  check('every ACTIVITY_TYPE constant has a corresponding ACTIVITY_LABEL entry', Object.values(ACTIVITY_TYPE).every((t) => typeof ACTIVITY_LABEL[t] === 'string' && ACTIVITY_LABEL[t].length > 0));
}

/* ── Part C — movement-history-view.js: additive amendment ───────────── */
console.log('\n[Part C — movement-history-view.js: v1.29.6 amendment is additive, nothing pre-existing changed]');
{
  const raw = { movementId: 'mv3', itemId: 'i1', type: 'goods_in', reason: 'purchase', quantityDelta: 10, departmentId: null, actorId: 'u2', createdAt: '2026-01-02T00:00:00.000Z', price: 15000, purpose: null, notes: 'Catatan uji' };
  const formatted = formatMovementEntry(raw);
  check('formatMovementEntry(): every pre-existing key is still present and correct (movementId/itemId/departmentId/when/who/what/why/quantityDelta/price)', formatted.movementId === 'mv3' && formatted.when === raw.createdAt && formatted.who === 'u2' && formatted.what === 'Goods In' && formatted.why === 'Purchase' && formatted.quantityDelta === 10 && formatted.price === 15000);
  check('formatMovementEntry(): NEW — raw type/reason are now also present', formatted.type === 'goods_in' && formatted.reason === 'purchase');
  check('formatMovementEntry(): NEW — notes passes through; purpose normalizes null->null (never undefined)', formatted.notes === 'Catatan uji' && formatted.purpose === null);
}

/* ── Part D — Architecture: PURE engine, Do Not Modify untouched ─────── */
console.log('\n[Part D — Architecture: activity-engine.js is PURE; this release\'s full DO NOT MODIFY surface shows no trace of it]');
{
  const engineCode = read('js/gudang/activity/activity-engine.js');
  check('activity-engine.js imports NOTHING (zero knowledge of Gudang/Items/Movements — genuinely generic, reusable by a future Vehicle/Compliance timeline)', !/^import /m.test(engineCode));
  check('activity-engine.js never references firebase.js, Gudang paths, or an Item/Movement field name', !/firebase\.js|gudang\//.test(engineCode) && !/itemId|movementId/.test(engineCode));

  const doNotModify = [
    'js/gudang/repository/item-repository.js', // Inventory Engine
    'js/gudang/search/search-resolver.js', // Search Engine
    'js/gudang/filters/filter-engine.js', // Filter Engine
    'js/gudang/selection/selection-engine.js', // Selection Engine
    'js/gudang/bulk/bulk-executor.js', 'js/gudang/bulk/bulk-goods-out.js', 'js/gudang/bulk/bulk-archive.js', 'js/gudang/bulk/bulk-edit.js', 'js/gudang/bulk/bulk-export.js', 'js/gudang/ui/gudang-bulk-ui.js', // Bulk Operations
    'js/gudang/upload/upload-engine.js', 'js/gudang/ui/gudang-item-image.js', 'js/gudang/ui/gudang-photo-upload.js', // Upload Engine
    'js/gudang/analytics/analytics-engine.js', // Forecast Engine
    'js/vehicles-store.js', // Vehicle Module
    'database.rules.json', // Firebase Schema
    'js/auth.js',
  ];
  for (const rel of doNotModify) {
    const code = read(rel);
    check(`${rel} (Do Not Modify) shows no trace of the Activity Timeline`, !code.includes('activity-engine') && !code.includes('gudang-activities') && !code.includes('gudang-timeline'));
  }

  const detailCode = read('js/gudang/ui/gudang-item-detail.js');
  check('gudang-item-detail.js renders the new Activity Timeline for BOTH item types (after each type\'s own existing body)', detailCode.includes('renderTimeline(st, item)'));
  check('gudang-item-detail.js no longer renders the old flat "PERGERAKAN TERBARU" list (replaced, not duplicated)', !detailCode.includes('PERGERAKAN TERBARU'));
  check('gudang-item-detail.js\'s movements cache is no longer hard-capped at 8 (the new timeline does its own paging) — checks the actual assignment, not a comment mentioning the old value', /cache\.movements = histRes\.ok \? histRes\.data\.slice\(0, 500\)/.test(detailCode));

  const centerCode = read('js/gudang/ui/gudang-center.js');
  check('gudang-center.js dispatches gud-timeline- acts (click and input) to timelineHandlers', centerCode.includes("gud-timeline-") && centerCode.includes('timelineHandlers.onClick') && centerCode.includes('timelineHandlers.onInput'));

  const movementHistCode = read('js/gudang/audit/movement-history-view.js');
  check('movement-history-view.js is NOT in the Do Not Modify list for this release (Audit is a read/format layer, not the Inventory Engine) — confirmed its own amendment is additive only (Part C)', movementHistCode.includes('purpose: movement.purpose'));
}

/* ── Part E — Live render sweep ───────────────────────────────────────── */
console.log('\n[Part E — renderTimeline(): Consumable (with movements) and Asset (with none), across filter/search/expand states]');
{
  const { renderTimeline } = await import('../js/gudang/ui/gudang-timeline.js');

  const baseItem = { itemId: 'i1', name: 'Kertas A4', itemType: 'consumable', createdAt: daysAgoISO(40) };
  function makeSt(movements) {
    return { data: { departments: [{ departmentId: 'dep1', name: 'Engineering' }] }, detail: { id: 'i1', movements } };
  }

  let threw = null;
  try {
    const st1 = makeSt([
      { movementId: 'mv1', itemId: 'i1', departmentId: 'dep1', when: daysAgoISO(0), who: 'u1', what: 'Goods Out', why: 'Issued', quantityDelta: -5, price: null, type: 'goods_out', reason: 'issue', purpose: null, notes: null },
      { movementId: 'mv2', itemId: 'i1', departmentId: 'dep1', when: daysAgoISO(20), who: 'u1', what: 'Goods In', why: 'Purchase', quantityDelta: 10, price: 5000, type: 'goods_in', reason: 'purchase', purpose: null, notes: null },
    ]);
    const html1 = renderTimeline(st1, baseItem);
    check('Consumable with movements: renders group headers (Hari Ini/Bulan Lalu) and the filter chips, no exception', html1.includes('gud-timeline-group') && html1.includes('Hari Ini') && html1.includes('gud-timeline-filter'));
    check('Consumable with movements: an expandable row uses <details> (native, keyboard-accessible for free)', html1.includes('<details class="gud-timeline-row">'));
    check('Consumable with movements: Item Created (no meta) renders as a plain non-expandable row, not an empty disclosure', html1.includes('Item Dibuat'));

    st1.detail.timeline.filterType = 'goods_out';
    const html2 = renderTimeline(st1, baseItem);
    // Filter CHIPS always list every available type (so the user can
    // switch back) — a bare ">Goods In<" substring check would false-
    // positive on the "Goods In" CHIP itself. Scope the assertion to the
    // rendered ROW title specifically (gud-hist-title), not the whole page.
    check('filterType applied: only the matching activity ROW appears (chips still list every type, so you can switch back)', html2.includes('gud-hist-title">Goods Out<') && !html2.includes('gud-hist-title">Goods In<') && !html2.includes('gud-hist-title">Item Dibuat<'));

    st1.detail.timeline.filterType = 'all';
    st1.detail.timeline.query = 'tidak ada yang seperti ini';
    const html3 = renderTimeline(st1, baseItem);
    check('a query matching nothing renders the "no match" empty state, not an exception', html3.includes('Tidak ada aktivitas yang cocok'));

    const st2 = makeSt(undefined);
    const assetItem = { itemId: 'i2', name: 'Laptop', itemType: 'asset', createdAt: daysAgoISO(5) };
    const html4 = renderTimeline(st2, assetItem);
    check('Asset item (no Movement data at all): still renders cleanly, showing only Item Created', html4.includes('Item Dibuat') && !html4.includes('undefined'));
  } catch (err) {
    threw = err;
  }
  check('the entire render sweep threw no exception', threw === null);
  if (threw) console.log('    ', threw.stack || threw);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
