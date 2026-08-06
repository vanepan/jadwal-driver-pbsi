/* ============================================================
   GUDANG-DASHBOARD.JS — Warehouse Dashboard screen (v1.29.7)

   Answers "what is happening today?" — NOT "what should I do next?" (that
   is Warehouse Intelligence, v1.29.8). PRESENTATION ONLY: every number
   rendered below comes from dashboard/dashboard-engine.js's pure
   composition functions, which themselves compose only figures existing
   engines already decided (Filter Engine's stock/forecast classification,
   Activity Timeline's entries) — see that file's own header for exactly
   which engine each section traces back to. This file never computes a
   threshold, a count, or an ordering itself (Doc 4 Art.V: "UI never
   computes what an engine already owns" — the same discipline
   scripts/gudang-ui-check.mjs already statically enforces over every file
   in this directory).

   DATA SOURCING (Section 9, Performance — "no duplicated Firebase reads"):
     - st.data (items/locations/assets): already loaded by gudang-center.js's
       refreshCatalog(). Zero new read.
     - st.homeStockBulk: gudang-home.js's own bulk stock/forecast
       classification cache — this file calls that SAME file's newly-
       exported ensureStockBulk() into that SAME cache slot, so whichever
       screen (Home or Dashboard) is opened first pays the one bulk read;
       the other reuses it for free. Feeds Overview's Low/Out counts,
       Warehouse Health, Low Stock, and Forecast Summary.
     - st.dashboardActivity: this file's own lazy cache for Recent
       Activity, fetched via audit/movement-history-view.js#getMovement-
       History (the Audit Engine, not on this release's Do Not Modify
       list). A disclosed, unavoidable SECOND read of gudang/movements
       alongside classifyStockBulk's own internal one: that function is
       frozen (Filter Engine) and returns only aggregates, never the raw
       movements Recent Activity needs. Busted by gudang-center.js's
       refreshCatalog() (Section 10: Live Refresh), same as st.homeStockBulk.

   DELIBERATELY NOT ON THIS SCREEN (brief's own OUT OF SCOPE list): Dead
   Stock, Fast/Slow Moving, Consumption Trends, Restock Suggestions, AI,
   Recommendations, Predictions. This is also why Overview Cards never show
   a "trend" arrow — a real trend needs a period-over-period comparison,
   which IS a Consumption Trend computation.

   OPERATIONAL-METRICS CONSISTENCY (post-review audit): st.homeStockBulk
   classifies every Consumable regardless of active/archived state
   (classifyStockBulk has no opinion on that — see dashboard-engine.js's
   own header). renderPopulatedBody() below calls dashboard-engine.js's
   activeStockBulk() exactly ONCE per render and threads that SAME
   filtered object into Overview, Warehouse Health, Low Stock, and
   Forecast Summary — the one place this filtering happens, not four
   separate ones, so an archived item can never inflate one card's count
   while being correctly absent from another's (Archived Items is the
   only card that ever counts it).

   NO NEW ACTS: every interactive element dispatches through an act
   gudang-center.js already routes (gud-goto, gud-open-item, gud-quick-
   goods-out/in, gud-cat-add-item-home) — "no duplicated workflows" by
   construction, not by discipline.
   ============================================================ */

'use strict';

import { esc, icon, fmtQty, emptyState } from './gudang-atoms.js';
import { forecastSentence } from '../analytics/quiet-intelligence-engine.js';
import { STOCK_STATUS_FILTER } from '../filters/filter-engine.js';
// The SAME cache slot Home's Stock Status/Forecast filters already use —
// see file header. gudang-home.js is not on the Do Not Modify list (it is
// the Experience Layer's own Home screen, not one of the frozen engines).
import { ensureStockBulk } from './gudang-home.js';
import { getMovementHistory } from '../audit/movement-history-view.js';
import { iconForActivity, toneForActivity } from '../activity/gudang-activities.js';
import {
  HEALTH_LEVEL, activeStockBulk, computeOverviewCounts, computeWarehouseHealth, computeForecastSummary,
  computeCategoryDistribution, computeLocationDistribution, computeLowStockList, buildRecentActivity,
} from '../dashboard/dashboard-engine.js';

/* ── lazy load (I/O) ─────────────────────────────────────────────────── */

/** Mirrors gudang-home.js's own ensureStockBulk/ensureCatalogWide "ensure"
 *  idiom exactly: fetch at most once per catalog load, cache on st, bust
 *  only by gudang-center.js's refreshCatalog() (Section 10: Live Refresh —
 *  every Goods In/Out/Bulk op/Archive/Upload/Edit already calls that, so
 *  this needs zero new refresh plumbing). */
function ensureDashboardActivity(st, requestRender) {
  if (st.dashboardActivity || st.dashboardActivityLoading) return;
  st.dashboardActivityLoading = true;
  getMovementHistory({}).then((res) => {
    st.dashboardActivityLoading = false;
    st.dashboardActivity = { movements: res.ok ? res.data : [] };
    requestRender();
  });
}

/* ── render ──────────────────────────────────────────────────────────── */

function statPill(level) {
  const map = {
    [HEALTH_LEVEL.HEALTHY]: { pill: 'ok', label: 'Sehat', ic: 'check-circle' },
    [HEALTH_LEVEL.ATTENTION]: { pill: 'warn', label: 'Perlu Perhatian', ic: 'gauge' },
    [HEALTH_LEVEL.CRITICAL]: { pill: 'crit', label: 'Kritis', ic: 'bolt' },
  };
  return map[level] || map[HEALTH_LEVEL.HEALTHY];
}

function overviewCard({ iconName, title, value, caption = null, tone = null }) {
  return `<div class="gud-ov-card">
    <span class="gud-ov-ic"${tone ? ` data-tone="${esc(tone)}"` : ''}>${icon(iconName, { size: 17 })}</span>
    <div class="gud-ov-val">${esc(value)}</div>
    <div class="gud-ov-title">${esc(title)}</div>
    ${caption ? `<div class="gud-ov-cap">${esc(caption)}</div>` : ''}
  </div>`;
}

function renderOverview(counts) {
  return `<div class="gud-ov-grid">
    ${overviewCard({ iconName: 'box', title: 'Total Item', value: fmtQty(counts.totalItems) })}
    ${overviewCard({ iconName: 'package', title: 'Consumable', value: fmtQty(counts.totalConsumables) })}
    ${overviewCard({ iconName: 'tag', title: 'Asset', value: fmtQty(counts.totalAssets), caption: `${fmtQty(counts.totalAssetUnits)} unit` })}
    ${overviewCard({ iconName: 'gauge', title: 'Stok Rendah', value: fmtQty(counts.lowStock), tone: counts.lowStock ? 'warn' : null })}
    ${overviewCard({ iconName: 'close', title: 'Stok Habis', value: fmtQty(counts.outOfStock), tone: counts.outOfStock ? 'crit' : null })}
    ${overviewCard({ iconName: 'archive', title: 'Diarsipkan', value: fmtQty(counts.archived) })}
  </div>`;
}

function renderHealth(health) {
  const p = statPill(health.level);
  const parts = [];
  if (health.outCount) parts.push(`${fmtQty(health.outCount)} item stok habis`);
  if (health.lowCount) parts.push(`${fmtQty(health.lowCount)} item stok rendah`);
  if (health.criticalForecast) parts.push(`${fmtQty(health.criticalForecast)} item forecast < 7 hari`);
  const sentence = parts.length ? parts.join(' · ') : 'Semua item dalam kondisi stok yang sehat.';
  return `<div class="gud-health-banner" data-tone="${p.pill}">
    <span class="gud-health-ic">${icon(p.ic, { size: 20 })}</span>
    <div class="gud-health-main">
      <div class="gud-health-title">${esc(p.label)}</div>
      <div class="gud-health-sub">${esc(sentence)}</div>
    </div>
  </div>`;
}

function renderLowStock(rows) {
  return `<div class="gud-card -pad">
    <div class="gud-sec-t-row">
      <div class="gud-sec-t">STOK RENDAH</div>
      <button type="button" class="gud-link-btn" data-act="gud-goto" data-val="home">${icon('arrow-right', { size: 12 })} Buka Gudang</button>
    </div>
    ${rows.length ? `<div class="gud-toplist">${rows.map((r) => lowStockRow(r)).join('')}</div>`
      : `<div class="gud-muted">Tidak ada item dengan stok rendah.</div>`}
  </div>`;
}

function lowStockRow(r) {
  const out = r.status === STOCK_STATUS_FILTER.OUT;
  const fc = forecastSentence(r.forecastDays);
  return `<div class="gud-toplist-row" data-act="gud-open-item" data-id="${esc(r.itemId)}" role="button" tabindex="0">
    <span class="gud-pill" data-pill="${out ? 'crit' : 'warn'}">${out ? 'Stok Habis' : 'Stok Rendah'}</span>
    <span class="gud-toplist-name">${esc(r.name)}</span>
    ${fc ? `<span class="gud-muted" style="font-size:11.5px;">${esc(fc)}</span>` : ''}
    <span class="gud-toplist-val">${fmtQty(r.quantity)}</span>
  </div>`;
}

function renderRecentActivity(st, activities) {
  const loading = st.dashboardActivityLoading && !st.dashboardActivity;
  return `<div class="gud-card -pad">
    <div class="gud-sec-t-row">
      <div class="gud-sec-t">AKTIVITAS TERBARU</div>
      <button type="button" class="gud-link-btn" data-act="gud-goto" data-val="history">${icon('arrow-right', { size: 12 })} Movement History</button>
    </div>
    ${loading ? `<div class="gud-muted">Memuat…</div>`
      : activities.length ? `<div class="gud-timeline-rows">${activities.map(activityRow).join('')}</div>`
      : `<div class="gud-muted">Belum ada aktivitas.</div>`}
  </div>`;
}

function activityRow(a) {
  // A synthesized Item Created entry has no movementId to open — every real
  // Movement-derived entry's own `id` is the movementId (movementToActivity
  // sets it that way), not an itemId, so only the item_created row (whose
  // `id` is `created-${itemId}`, gudang-activities.js#itemCreatedActivity)
  // is clickable here without a second lookup this card has no reason to do.
  const openable = a.type === 'item_created';
  const itemId = openable ? a.id.replace(/^created-/, '') : null;
  return `<div class="gud-hist-row"${openable ? ` data-act="gud-open-item" data-id="${esc(itemId)}" role="button" tabindex="0"` : ''}>
    <span class="gud-hist-ic" data-tone="${toneForActivity(a.type)}">${icon(iconForActivity(a.type), { size: 15 })}</span>
    <span class="gud-hist-main">
      <span class="gud-hist-title">${esc(a.title)}</span>
      <span class="gud-hist-sub">${esc(a.description)}</span>
    </span>
  </div>`;
}

function renderQuickActions() {
  const actions = [
    { act: 'gud-cat-add-item-home', ic: 'plus', label: 'Tambah Item' },
    { act: 'gud-quick-goods-in', ic: 'arrow-in', label: 'Goods In' },
    { act: 'gud-quick-goods-out', ic: 'arrow-out', label: 'Goods Out' },
    { act: 'gud-goto', val: 'home', ic: 'box', label: 'Buka Gudang' },
    { act: 'gud-goto', val: 'history', ic: 'history', label: 'Lihat Timeline' },
  ];
  return `<div class="gud-qa-grid">${actions.map((a) => `
    <button type="button" class="gud-qa-tile" data-act="${a.act}"${a.val ? ` data-val="${a.val}"` : ''}>
      ${icon(a.ic, { size: 18 })}<span>${esc(a.label)}</span>
    </button>`).join('')}</div>`;
}

function distRow(row, max) {
  const pct = max > 0 ? Math.round((row.count / max) * 100) : 0;
  return `<div class="gud-dist-row">
    <div class="gud-dist-label">${esc(row.label)}</div>
    <div class="gud-dist-bar"><div class="gud-dist-fill" style="width:${pct}%"></div></div>
    <div class="gud-dist-val">${fmtQty(row.count)}</div>
  </div>`;
}

function renderDistribution(title, rows) {
  const max = rows.reduce((m, r) => Math.max(m, r.count), 0);
  return `<div class="gud-card -pad">
    <div class="gud-card-head"><div class="gud-card-h-title">${esc(title)}</div></div>
    ${rows.length ? rows.map((r) => distRow(r, max)).join('') : `<div class="gud-muted">Belum ada data.</div>`}
  </div>`;
}

function renderForecastSummary(fc) {
  const cells = [
    { label: 'Aman', value: fc.safe, pill: 'ok' },
    { label: 'Rendah', value: fc.low, pill: 'warn' },
    { label: 'Kritis', value: fc.critical, pill: 'crit' },
    { label: 'Tanpa Data', value: fc.none, pill: 'neutral' },
  ];
  return `<div class="gud-card -pad">
    <div class="gud-card-head"><div class="gud-card-h-title">Forecast Summary</div><div class="gud-card-h-sub">Consumable dengan riwayat konsumsi</div></div>
    <div class="gud-fc-grid">${cells.map((c) => `
      <div class="gud-fc-cell">
        <span class="gud-pill" data-pill="${c.pill}">${fmtQty(c.value)}</span>
        <div class="gud-fc-label">${esc(c.label)}</div>
      </div>`).join('')}</div>
  </div>`;
}

export function renderDashboard(st, c, requestRender) {
  ensureStockBulk(st, requestRender);
  ensureDashboardActivity(st, requestRender);

  // Quick Actions stays visible even on an empty catalog — same
  // unconditional-visibility precedent gudang-home.js's own FAB row
  // already sets (Add Item/Goods Out/In render regardless of hasCatalog):
  // "add the first item" is the one action a brand-new install needs most,
  // so it can never be the thing hidden behind an empty state.
  //
  // v1.29.10 (Part E — Loading Behaviour audit): `|| st.loading` closes a
  // real flash-of-wrong-state gap — Dashboard is the module's default
  // landing screen, and st.data.items is genuinely `[]` for the entire
  // span of the FIRST refreshCatalog() call on mount (it only gets
  // replaced once that fetch resolves). Without this, every fresh Gudang
  // session briefly rendered "Gudang siap digunakan / Tambah Item" — a
  // false empty-warehouse state — before snapping to the real Dashboard,
  // even for a catalog with hundreds of items. gudang-home.js/gudang-
  // intelligence.js already guard the identical case with their own
  // `!st.loading` check; this mirrors that established pattern rather than
  // inventing a second convention for the same problem.
  const hasCatalog = st.data.items.length > 0 || st.loading;
  const body = hasCatalog ? renderPopulatedBody(st) : `<div class="gud-mt">${emptyState({
    iconName: 'box', title: 'Gudang siap digunakan',
    hint: 'Tambahkan item pertama untuk mulai melihat kondisi gudang di sini.',
    ctaLabel: 'Tambah Item', ctaAct: 'gud-cat-add-item-home',
  })}</div>`;

  return `<div>
    <div class="gud-page-head">
      <div><div class="gud-page-crumb">GUDANG</div><h1 class="gud-page-title">Dashboard</h1>
      <p class="gud-page-lede">Kondisi gudang hari ini.</p></div>
    </div>

    <div class="gud-sec">
      <div class="gud-sec-t">AKSI CEPAT</div>
      ${renderQuickActions()}
    </div>

    ${body}
  </div>`;
}

function renderPopulatedBody(st) {
  // ONE filtering pass, reused by every operational widget below (Overview's
  // Low/Out, Health, Low Stock, Forecast Summary) — see file header. st.data
  // items still carries the FULL (active + archived) set separately, for
  // Overview's own Total/Archived counts, which need both.
  const stockBulk = activeStockBulk(st.data.items, st.homeStockBulk || {});
  const counts = computeOverviewCounts(st.data.items, st.data.assets, stockBulk);
  const health = computeWarehouseHealth(stockBulk);
  const lowStockRows = computeLowStockList(st.data.items, stockBulk);
  const activities = st.dashboardActivity ? buildRecentActivity(st.dashboardActivity.movements, st.data.items, st.data.departments) : [];
  const categoryRows = computeCategoryDistribution(st.data.items);
  const locationRows = computeLocationDistribution(st.data.items, st.data.locations);
  const forecastSummary = computeForecastSummary(stockBulk);

  return `
    ${renderOverview(counts)}
    <div class="gud-mt">${renderHealth(health)}</div>

    <div class="gud-grid -2 gud-mt">
      ${renderLowStock(lowStockRows)}
      ${renderRecentActivity(st, activities)}
    </div>

    <div class="gud-grid -2 gud-mt">
      ${renderDistribution('Distribusi Kategori', categoryRows)}
      ${renderDistribution('Distribusi Lokasi', locationRows)}
    </div>

    <div class="gud-mt">${renderForecastSummary(forecastSummary)}</div>`;
}
