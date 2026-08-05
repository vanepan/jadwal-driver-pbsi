/* ============================================================
   INTELLIGENCE-ENGINE.JS — Inventory Intelligence Engine (v1.29.8)

   NOT AI. NOT prediction. NOT machine learning. Every function here is a
   deterministic, reproducible calculation over data engines this app
   already owns — Movement (the truth), the Filter Engine's stock/forecast
   classification, and Item/Location identity. Given the same inputs, every
   function below always returns the same output; nothing here samples,
   trains, guesses, or hedges. The brief names three specific hedge
   phrases as never acceptable output — scripts/gudang-intelligence-
   check.mjs's own Part B asserts none of them appear anywhere in this
   file or the screen that renders it (deliberately not quoted verbatim
   here, so this sentence itself can never trip that same check).

   ONE MOVEMENTS PASS (Section 12, Performance): buildInventoryProfile()
   below is the SINGLE place every section's raw material comes from —
   Dead Stock, Slow/Fast Moving, Velocity, Overstock, and Consumption
   Pattern all read the same per-item profile it builds in one linear scan
   over the full movements array. Reorder Candidates is the one exception,
   by design: it deliberately does NOT touch movements at all — Section 4
   says "Reuse Forecast Engine. Do NOT calculate stock prediction again,"
   so it reads `status`/`forecastDays`/`quantity` straight from the SAME
   activeStockBulk()-scoped classification Dashboard already computed
   (dashboard-engine.js, imported read-only — Dashboard is frozen this
   release, never modified).

   MIRRORS, DOES NOT IMPORT, two formulas that are already computed inside
   frozen files but never exposed by them:
     - monthsSpanned()/average-monthly-consumption — analytics-engine.js's
       own formula (its own header states this exact rate), already
       mirrored once by filters/stock-status-bulk.js for the identical
       reason (frozen, not exported). This is the SECOND mirror of the
       same formula, needed because neither frozen file exposes per-item
       consumption — only stock-status-bulk.js's aggregated OUT/LOW/
       AVAILABLE status and a derived forecastDays survive to callers.
       Velocity/Overstock/Consumption Pattern all need the raw monthly
       rate itself, which nothing currently returns.
     - the forecast day bucket boundaries (<7/<30/30+) — filter-engine.js's
       own (frozen, unexported) forecastBucket(), already mirrored once by
       dashboard-engine.js. This is the THIRD mirror, reused here only for
       Reorder Candidates' priority label, so it can never disagree with
       what Home's own Forecast filter or the Dashboard's own Forecast
       Summary already call "< 7 Hari"/"< 30 Hari".
   Every mirror is a stated, disclosed exception — not a new, different
   formula. If any of the three ever change, all three copies must be
   updated by hand; this is the same tradeoff the codebase already
   accepted twice before, extended once more for the same reason: the
   formula lives inside a Do-Not-Modify file that never returns it.

   EXPLAINABILITY (Section 11): every recommendation row below carries a
   plain-language `reason` string built FROM the same numbers the row
   itself displays (e.g. "Tidak ada Goods Out selama 214 hari") — never a
   separate, unverifiable claim. This is produced by the engine (not left
   to the UI to improvise) so a reason can never silently drift from the
   computation that justified it, and so scripts/gudang-intelligence-
   check.mjs can assert every row's `reason` is non-empty and internally
   consistent with its own numbers.

   FUTURE READY (Section 14): every compute* function returns a flat array
   of plain objects with the SAME shape family — {itemId, name, reason,
   metrics...} — deliberately, so a later Executive Intelligence/AI
   Assistant/Procurement layer can consume these arrays directly (sort,
   filter, summarize) without this engine being redesigned. Nothing beyond
   that shape discipline is built for them this release — no hooks, no
   stub functions, no speculative fields.
   ============================================================ */

'use strict';

import { ITEM_TYPE } from '../contracts/item-contract.js';
import { MOVEMENT_TYPE } from '../contracts/movement-contract.js';
import { categoryLabel } from '../config/gudang-categories.js';
import { STOCK_STATUS_FILTER } from '../filters/filter-engine.js';

const DAY_MS = 86400000;
const DAYS_PER_MONTH = 30;

/** Mirrors analytics-engine.js#monthsSpanned exactly (see file header). */
function monthsSpanned(movements) {
  if (movements.length === 0) return 1;
  const times = movements.map((m) => new Date(m.when).getTime());
  const earliest = Math.min(...times);
  const latest = Math.max(...times);
  const days = Math.max(1, (latest - earliest) / DAY_MS);
  return Math.max(1, days / DAYS_PER_MONTH);
}

/** Mirrors filter-engine.js's own (frozen, unexported) forecastBucket()
 *  boundaries — see file header. Only used for Reorder Candidates' label. */
function forecastPriority(status, forecastDays) {
  if (status === STOCK_STATUS_FILTER.OUT) return 'high';
  if (forecastDays == null) return 'medium'; // Low stock, no consumption history to time it — still worth a look, just not urgently dated
  if (forecastDays < 7) return 'high';
  if (forecastDays < 30) return 'medium';
  return 'low';
}

/* ── the one movements pass ─────────────────────────────────────────── */

/**
 * Builds a per-Consumable-item activity profile from the FULL movements
 * array in ONE linear pass — every section below reads from this, never
 * re-scanning movements itself. Assets are skipped entirely (Doc 1 Art.V:
 * no stock, no Movement). "Consumption" is GOODS_OUT only, the same
 * definition analytics-engine.js's own header states and stock-status-
 * bulk.js already mirrors — never Adjustment or Stock Opname corrections.
 *
 * ACTIVE ITEMS ONLY (same discipline the Dashboard's own post-review
 * consistency audit established, applied here proactively rather than
 * waiting to be found again): an archived item is excluded from this
 * profile entirely, so its movement history can never inflate Velocity,
 * Category/Location Activity, or Consumption Pattern while correctly
 * being absent from Overview-style counts elsewhere. This is the ONE
 * place that decision is made for every section below that reads from
 * this profile — Dead Stock/Slow/Fast/Overstock ALSO independently guard
 * on `stockBulk[itemId]` presence (an activeStockBulk()-scoped map, see
 * gudang-intelligence.js), so an archived item is excluded twice over,
 * never once by accident.
 * @param {object[]} items @param {object[]} movements (formatMovementEntry shape: {itemId, when, quantityDelta, type})
 * @param {number} [now]
 * @returns {Object<string,{goodsOutCount:number, totalMovementCount:number,
 *   lastGoodsOutAt:?string, lastMovementAt:?string, avgMonthlyConsumption:number,
 *   last30:number, prior30:number, last7:number}>}
 */
export function buildInventoryProfile(items, movements, now = Date.now()) {
  const consumableIds = new Set(items.filter((i) => i.active && i.itemType === ITEM_TYPE.CONSUMABLE).map((i) => i.itemId));
  const byItem = new Map();
  for (const id of consumableIds) byItem.set(id, { all: [], goodsOut: [] });

  for (const m of movements) {
    const bucket = byItem.get(m.itemId);
    if (!bucket) continue; // Asset, or an item id no longer in the current catalog
    bucket.all.push(m);
    if (m.type === MOVEMENT_TYPE.GOODS_OUT) bucket.goodsOut.push(m);
  }

  const t30 = now - 30 * DAY_MS;
  const t60 = now - 60 * DAY_MS;
  const t7 = now - 7 * DAY_MS;

  const profile = {};
  for (const [itemId, { all, goodsOut }] of byItem) {
    const lastGoodsOutAt = goodsOut.length ? goodsOut.reduce((max, m) => (m.when > max ? m.when : max), goodsOut[0].when) : null;
    const lastMovementAt = all.length ? all.reduce((max, m) => (m.when > max ? m.when : max), all[0].when) : null;
    const totalConsumed = goodsOut.reduce((sum, m) => sum + Math.abs(m.quantityDelta), 0);
    const avgMonthlyConsumption = goodsOut.length === 0 ? 0 : totalConsumed / monthsSpanned(goodsOut);
    const sumSince = (t) => goodsOut.filter((m) => new Date(m.when).getTime() >= t).reduce((s, m) => s + Math.abs(m.quantityDelta), 0);
    const last30 = sumSince(t30);
    const prior30 = goodsOut.filter((m) => { const t = new Date(m.when).getTime(); return t >= t60 && t < t30; }).reduce((s, m) => s + Math.abs(m.quantityDelta), 0);
    const last7 = sumSince(t7);
    profile[itemId] = {
      goodsOutCount: goodsOut.length,
      totalMovementCount: all.length,
      lastGoodsOutAt,
      lastMovementAt,
      avgMonthlyConsumption,
      last30,
      prior30,
      last7,
    };
  }
  return profile;
}

function daysSince(iso, now) {
  if (!iso) return null;
  return Math.floor((now - new Date(iso).getTime()) / DAY_MS);
}

/* ── Section 1: Dead Stock ─────────────────────────────────────────── */

/**
 * Inventory with no GOODS_OUT movement for at least `thresholdDays` — the
 * brief's own definition, literally ("no outbound movement for a
 * configurable period"). Requires currentStock > 0 (a stated refinement,
 * not in the brief's literal wording): an item already at zero stock has
 * nothing sitting on a shelf to review — that is Stock Status's "Habis"
 * concern (already surfaced on the Dashboard), not a dead-stock review
 * item. An item with GOODS_OUT history uses its last one; an item that
 * has NEVER had a GOODS_OUT uses item.createdAt instead, so a genuinely
 * unused item does not silently stay invisible to this list for lack of
 * a movement to measure from.
 * @param {object[]} items @param {object} profile @param {object} stockBulk
 * @param {{thresholdDays?:number, now?:number}} [opts]
 */
export function computeDeadStock(items, profile, stockBulk, { thresholdDays = 180, now = Date.now() } = {}) {
  const rows = [];
  for (const item of items) {
    if (item.itemType !== ITEM_TYPE.CONSUMABLE) continue;
    const s = stockBulk[item.itemId];
    if (!s || !(s.quantity > 0)) continue;
    const p = profile[item.itemId];
    const referenceAt = p?.lastGoodsOutAt || item.createdAt;
    const daysInactive = daysSince(referenceAt, now);
    if (daysInactive == null || daysInactive < thresholdDays) continue;
    rows.push({
      itemId: item.itemId,
      name: item.name,
      currentStock: s.quantity,
      lastMovement: p?.lastGoodsOutAt || null,
      daysInactive,
      reason: p?.lastGoodsOutAt
        ? `Tidak ada Goods Out selama ${daysInactive} hari`
        : `Belum pernah ada Goods Out sejak item dibuat (${daysInactive} hari)`,
    });
  }
  return rows.sort((a, b) => b.daysInactive - a.daysInactive);
}

/* ── Sections 2/3/6: Velocity, Slow Moving, Fast Moving ───────────────── */

export const VELOCITY_TIER = Object.freeze({
  INACTIVE: 'inactive', LOW: 'low', MEDIUM: 'medium', HIGH: 'high', VERY_HIGH: 'very_high',
});
const VELOCITY_LABEL = Object.freeze({
  inactive: 'Inactive', low: 'Low', medium: 'Medium', high: 'High', very_high: 'Very High',
});

/** Stated partition (brief names the 5 labels, not the exact numbers — same
 *  "labels ratified, thresholds not" situation activity-engine.js's own
 *  5-tier day buckets and filter-engine.js's own forecast buckets already
 *  faced, same discipline: state it plainly, don't hide it in the math).
 *  Based on GOODS_OUT movement COUNT (how many times a Consumable was
 *  actually issued) — "Movement count"/"movement frequency" is what
 *  Sections 2/3 separately ask for, distinct from "Average monthly usage"
 *  (a quantity), which every row still carries alongside it. A simple,
 *  explainable signal deliberately chosen over a rate-per-month
 *  normalization (which would need each item's own observed history
 *  length, and would read as "statistical jargon" the brief's own UX
 *  section explicitly rules out — "how many times did this actually
 *  move" is immediately understandable without translation). */
function velocityTier(p) {
  if (p.goodsOutCount === 0) return VELOCITY_TIER.INACTIVE;
  if (p.goodsOutCount >= 10 && p.avgMonthlyConsumption > 0) return VELOCITY_TIER.VERY_HIGH;
  if (p.goodsOutCount >= 5) return VELOCITY_TIER.HIGH;
  if (p.goodsOutCount >= 2) return VELOCITY_TIER.MEDIUM;
  return VELOCITY_TIER.LOW;
}

/** Section 6. Every active Consumable, bucketed — a distribution, not a
 *  ranked list (Sections 2/3 are the ranked lists over the same signal).
 *  @param {object[]} items @param {object} profile */
export function computeVelocity(items, profile) {
  const rows = [];
  for (const item of items) {
    if (item.itemType !== ITEM_TYPE.CONSUMABLE) continue;
    const p = profile[item.itemId];
    if (!p) continue;
    const tier = velocityTier(p);
    rows.push({ itemId: item.itemId, name: item.name, tier, tierLabel: VELOCITY_LABEL[tier], goodsOutCount: p.goodsOutCount, avgMonthlyConsumption: p.avgMonthlyConsumption });
  }
  return rows;
}

/** @returns {{inactive:number, low:number, medium:number, high:number, very_high:number, total:number}} */
export function summarizeVelocity(velocityRows) {
  const out = { inactive: 0, low: 0, medium: 0, high: 0, very_high: 0 };
  for (const r of velocityRows) out[r.tier]++;
  return { ...out, total: velocityRows.length };
}

/** Section 2. Low velocity, but NOT Inactive — Inactive-and-long-idle is
 *  Dead Stock's own, more specific concern (Section 1); Slow Moving is
 *  "still moving, just rarely," a distinct, milder signal. Requires
 *  currentStock > 0 (same reasoning as Dead Stock: nothing to review at
 *  zero stock). @param {object[]} items @param {object} profile @param {object} stockBulk @param {number} [limit] */
export function computeSlowMoving(items, profile, stockBulk, limit = 20) {
  const rows = [];
  for (const item of items) {
    if (item.itemType !== ITEM_TYPE.CONSUMABLE) continue;
    const p = profile[item.itemId];
    const s = stockBulk[item.itemId];
    if (!p || !s || !(s.quantity > 0)) continue;
    if (velocityTier(p) !== VELOCITY_TIER.LOW) continue;
    rows.push({
      itemId: item.itemId, name: item.name, currentStock: s.quantity,
      movementCount: p.goodsOutCount, avgMonthlyConsumption: p.avgMonthlyConsumption,
      reason: p.goodsOutCount === 0
        ? 'Belum pernah ada Goods Out'
        : `Hanya ${p.goodsOutCount} kali Goods Out tercatat`,
    });
  }
  rows.sort((a, b) => a.movementCount - b.movementCount || a.avgMonthlyConsumption - b.avgMonthlyConsumption);
  return rows.slice(0, limit);
}

/** Section 3. High/Very High velocity — consistently high movement.
 *  @param {object[]} items @param {object} profile @param {object} stockBulk @param {number} [limit] */
export function computeFastMoving(items, profile, stockBulk, limit = 20) {
  const rows = [];
  for (const item of items) {
    if (item.itemType !== ITEM_TYPE.CONSUMABLE) continue;
    const p = profile[item.itemId];
    const s = stockBulk[item.itemId];
    if (!p || !s) continue;
    const tier = velocityTier(p);
    if (tier !== VELOCITY_TIER.HIGH && tier !== VELOCITY_TIER.VERY_HIGH) continue;
    rows.push({
      itemId: item.itemId, name: item.name, currentStock: s.quantity,
      movementCount: p.goodsOutCount, avgMonthlyConsumption: p.avgMonthlyConsumption,
      forecastDays: s.forecastDays,
      reason: `${p.goodsOutCount} kali Goods Out, rata-rata ${Math.round(p.avgMonthlyConsumption)} unit/bulan`,
    });
  }
  rows.sort((a, b) => b.movementCount - a.movementCount);
  return rows.slice(0, limit);
}

/* ── Section 4: Reorder Candidates (reuses the Forecast Engine's own
   already-decided classification — no stock/forecast math here at all) ── */

/** @param {object[]} items @param {object} stockBulk @param {number} [limit] */
export function computeReorderCandidates(items, stockBulk, limit = 20) {
  const rows = [];
  for (const item of items) {
    if (item.itemType !== ITEM_TYPE.CONSUMABLE) continue;
    const s = stockBulk[item.itemId];
    if (!s || (s.status !== STOCK_STATUS_FILTER.LOW && s.status !== STOCK_STATUS_FILTER.OUT)) continue;
    const priority = forecastPriority(s.status, s.forecastDays);
    rows.push({
      itemId: item.itemId, name: item.name, currentStock: s.quantity, forecastDays: s.forecastDays, priority,
      reason: s.status === STOCK_STATUS_FILTER.OUT
        ? 'Stok habis'
        : (s.forecastDays != null ? `Diperkirakan habis dalam ${s.forecastDays} hari` : 'Stok rendah dibanding rata-rata konsumsi'),
    });
  }
  const priorityRank = { high: 0, medium: 1, low: 2 };
  rows.sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority] || (a.forecastDays ?? Infinity) - (b.forecastDays ?? Infinity));
  return rows.slice(0, limit);
}

/* ── Section 5: Overstock ──────────────────────────────────────────── */

/**
 * "Excessive remaining stock compared to actual usage" — reads the SAME
 * forecastDays the Forecast Engine already computed (quantity divided by
 * consumption pace), inverted: a very LARGE forecastDays means the stock
 * on hand represents many months of runway at the current pace. Requires
 * avgMonthlyConsumption > 0 (real, ongoing usage) — an item with ZERO
 * consumption ever is Dead Stock's concern (Section 1), not Overstock's;
 * Overstock specifically means "usage exists, there's just too much
 * sitting stock relative to it." `minMonths` (default 3) is a stated,
 * disclosed threshold — no ratified document names one.
 * @param {object[]} items @param {object} profile @param {object} stockBulk @param {{minMonths?:number}} [opts]
 */
export function computeOverstock(items, profile, stockBulk, { minMonths = 3 } = {}) {
  const minDays = minMonths * DAYS_PER_MONTH;
  const rows = [];
  for (const item of items) {
    if (item.itemType !== ITEM_TYPE.CONSUMABLE) continue;
    const p = profile[item.itemId];
    const s = stockBulk[item.itemId];
    // `!(avgMonthlyConsumption > 0)`, not `<= 0` — NaN fails BOTH
    // comparisons, so `<= 0` alone would let a NaN average (unreachable
    // with real Movement data, since createdAt is always a valid ISO
    // string at write time, but not worth leaving as a latent gap) slip
    // past this guard and into a row with a garbage "rata-rata NaN
    // unit/bulan" reason.
    if (!p || !s || !(p.avgMonthlyConsumption > 0) || s.forecastDays == null || s.forecastDays < minDays) continue;
    rows.push({
      itemId: item.itemId, name: item.name, currentStock: s.quantity,
      avgMonthlyConsumption: p.avgMonthlyConsumption, forecastDays: s.forecastDays,
      reason: `Stok saat ini setara ${Math.round(s.forecastDays / DAYS_PER_MONTH)} bulan konsumsi (rata-rata ${Math.round(p.avgMonthlyConsumption)} unit/bulan)`,
    });
  }
  return rows.sort((a, b) => b.forecastDays - a.forecastDays);
}

/* ── Section 7: Consumption Pattern (historical only, no forecasting) ── */

const TREND = Object.freeze({ ACCELERATING: 'accelerating', SLOWING: 'slowing', STABLE: 'stable' });

/** Stated dead-zone: within ±15% of the prior 30-day total counts as
 *  Stable, not noise misread as a trend — same "don't overreact to small
 *  swings" discipline as every other stated threshold in this file.
 *  @param {object[]} items @param {object} profile */
export function computeConsumptionPattern(items, profile) {
  const rows = [];
  for (const item of items) {
    if (item.itemType !== ITEM_TYPE.CONSUMABLE) continue;
    const p = profile[item.itemId];
    if (!p || (p.last30 === 0 && p.prior30 === 0)) continue;
    let trend = TREND.STABLE;
    if (p.prior30 === 0 && p.last30 > 0) trend = TREND.ACCELERATING;
    else if (p.prior30 > 0) {
      const pct = (p.last30 - p.prior30) / p.prior30;
      if (pct >= 0.15) trend = TREND.ACCELERATING;
      else if (pct <= -0.15) trend = TREND.SLOWING;
    }
    rows.push({ itemId: item.itemId, name: item.name, monthly: p.last30, weekly: p.last7, priorMonthly: p.prior30, trend });
  }
  return rows;
}

/** Top movers in each direction, for a compact "what changed recently"
 *  card — the full list from computeConsumptionPattern() above is what a
 *  future drill-down would page through; this is just its two extremes.
 *  @param {object[]} patternRows @param {number} [limit] */
export function computeConsumptionMovers(patternRows, limit = 5) {
  const accelerating = patternRows.filter((r) => r.trend === TREND.ACCELERATING).sort((a, b) => (b.monthly - b.priorMonthly) - (a.monthly - a.priorMonthly)).slice(0, limit);
  const slowing = patternRows.filter((r) => r.trend === TREND.SLOWING).sort((a, b) => (a.monthly - a.priorMonthly) - (b.monthly - b.priorMonthly)).slice(0, limit);
  return { accelerating, slowing };
}

/* ── Sections 8/9: Most Active Categories / Locations ─────────────────── */

/** GOODS_OUT movement activity grouped by the owning item's category —
 *  "most ACTIVE" (how much is moving), a different, complementary metric
 *  to Dashboard's own Category Distribution (how many DISTINCT items exist
 *  per category) — never recomputes that one, this is a new grouping over
 *  the same movements this file already scanned once. Active items only
 *  (same discipline as buildInventoryProfile() above) — an archived
 *  item's id is simply absent from `categoryById`, so its past movements
 *  are excluded the same way an unknown/deleted item id already is.
 *  @param {object[]} items @param {object[]} movements @param {number} [limit] */
export function computeCategoryActivity(items, movements, limit = 8) {
  const categoryById = new Map(items.filter((i) => i.active).map((i) => [i.itemId, i.category]));
  const counts = new Map();
  for (const m of movements) {
    if (m.type !== MOVEMENT_TYPE.GOODS_OUT) continue;
    const cat = categoryById.get(m.itemId);
    if (cat === undefined) continue; // item id no longer in the catalog
    const label = cat ? categoryLabel(cat) : 'Tanpa Kategori';
    const cur = counts.get(label) || { count: 0, quantity: 0 };
    cur.count += 1;
    cur.quantity += Math.abs(m.quantityDelta);
    counts.set(label, cur);
  }
  return [...counts.entries()].map(([label, v]) => ({ label, movementCount: v.count, quantity: v.quantity }))
    .sort((a, b) => b.movementCount - a.movementCount).slice(0, limit);
}

/** Active items only — see computeCategoryActivity()'s own note above.
 *  @param {object[]} items @param {object[]} movements @param {object[]} locations @param {number} [limit] */
export function computeLocationActivity(items, movements, locations, limit = 8) {
  const locationById = new Map(items.filter((i) => i.active).map((i) => [i.itemId, i.defaultLocationId]));
  const nameById = new Map(locations.map((l) => [l.locationId, l.name]));
  const counts = new Map();
  for (const m of movements) {
    if (m.type !== MOVEMENT_TYPE.GOODS_OUT) continue;
    const locId = locationById.get(m.itemId);
    if (locId === undefined) continue;
    const label = locId ? (nameById.get(locId) || locId) : 'Tanpa Lokasi';
    const cur = counts.get(label) || { count: 0, quantity: 0 };
    cur.count += 1;
    cur.quantity += Math.abs(m.quantityDelta);
    counts.set(label, cur);
  }
  return [...counts.entries()].map(([label, v]) => ({ label, movementCount: v.count, quantity: v.quantity }))
    .sort((a, b) => b.movementCount - a.movementCount).slice(0, limit);
}

/* ── Section 10: Insight Cards (also THE Future Ready extension point —
   Section 14: a later Executive Intelligence layer consumes this same
   {key,label,count} shape, unmodified) ── */

/** @param {{deadStock:object[], slowMoving:object[], fastMoving:object[], reorderCandidates:object[], overstock:object[]}} lists */
export function computeInsightCards(lists) {
  return [
    { key: 'deadStock', label: 'Dead Stock', count: lists.deadStock.length },
    { key: 'slowMoving', label: 'Slow Moving', count: lists.slowMoving.length },
    { key: 'fastMoving', label: 'Fast Moving', count: lists.fastMoving.length },
    { key: 'reorderCandidates', label: 'Reorder Needed', count: lists.reorderCandidates.length },
    { key: 'overstock', label: 'Overstock', count: lists.overstock.length },
  ];
}
