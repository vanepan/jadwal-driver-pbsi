/* ============================================================
   GUDANG-INTELLIGENCE.JS — Inventory Intelligence screen (v1.29.8)

   Answers "what deserves attention?" — every number and every `reason`
   sentence on this screen comes straight from intelligence/intelligence-
   engine.js's pure compute* functions (see that file's own header for
   which existing engine each section traces back to). PRESENTATION ONLY:
   this file never computes a threshold or a classification itself (same
   "UI never computes what an engine already owns" discipline scripts/
   gudang-ui-check.mjs already statically enforces over every file here).

   DATA SOURCING (Section 12, Performance):
     - st.data (items/locations/departments): already loaded by gudang-
       center.js's refreshCatalog(). Zero new read.
     - st.homeStockBulk: the SAME shared cache gudang-home.js's Stock
       Status/Forecast filters and the Dashboard's Overview/Health/Low
       Stock/Forecast Summary already use (ensureStockBulk(), exported
       since v1.29.7) — narrowed through dashboard-engine.js's own
       activeStockBulk() (read-only reuse; Dashboard is frozen this
       release, never modified) so archived items are excluded here with
       the EXACT same guarantee the Dashboard's own post-review
       consistency audit established, not a second, possibly-different
       filter.
     - st.dashboardActivity: the Dashboard's own Recent Activity cache —
       ensureMovementFeed() below writes into this SAME st key via the
       SAME underlying getMovementHistory({}) call gudang-dashboard.js's
       own (private, unexported) ensureDashboardActivity() already uses.
       This is a MIRROR, not an import (Dashboard is frozen, its ensure
       function was never exported) — but because both write the identical
       shape into the identical st key, whichever screen is opened FIRST
       in a session pays the one gudang/movements read; the other reuses
       it for free, in EITHER direction. This is the single largest lever
       in this release: buildInventoryProfile() below needs the FULL
       (uncapped) movement history, and st.dashboardActivity.movements is
       already exactly that — Dashboard's own Recent Activity feed only
       caps it later, at display time (buildRecentActivity's own
       `movementLimit`), never at fetch time.

   NO NEW READS beyond that one mirrored fetch. Every compute* call below
   is a pure, synchronous, in-memory recomputation over already-fetched
   data — reclassifying the Dead Stock threshold, for instance, costs
   nothing more than a re-render.
   ============================================================ */

'use strict';

import { esc, icon, fmtQty, fmtWhen, emptyState } from './gudang-atoms.js';
import { forecastSentence } from '../analytics/quiet-intelligence-engine.js';
import { ensureStockBulk } from './gudang-home.js';
import { activeStockBulk } from '../dashboard/dashboard-engine.js';
import { getMovementHistory } from '../audit/movement-history-view.js';
import {
  buildInventoryProfile, computeDeadStock, computeVelocity, summarizeVelocity,
  computeSlowMoving, computeFastMoving, computeReorderCandidates, computeOverstock,
  computeConsumptionPattern, computeConsumptionMovers, computeCategoryActivity,
  computeLocationActivity, computeInsightCards,
} from '../intelligence/intelligence-engine.js';

const DEAD_STOCK_PRESETS = [90, 180, 365];
const ROW_CAP = 6;

/* ── lazy load (I/O) — mirrors gudang-dashboard.js's ensureDashboardActivity ── */
function ensureMovementFeed(st, requestRender) {
  if (st.dashboardActivity || st.dashboardActivityLoading) return;
  st.dashboardActivityLoading = true;
  getMovementHistory({}).then((res) => {
    st.dashboardActivityLoading = false;
    st.dashboardActivity = { movements: res.ok ? res.data : [] };
    requestRender();
  });
}

function ensureIntelState(st) {
  if (!st.intelligence) st.intelligence = { deadStockDays: 180, expanded: {} };
  return st.intelligence;
}

/* ── render ──────────────────────────────────────────────────────────── */

function sectionCard({ id, title, sub, rows, expanded, renderRow, emptyText }) {
  const shown = expanded ? rows : rows.slice(0, ROW_CAP);
  const canExpand = rows.length > ROW_CAP;
  return `<div class="gud-card -pad" id="${esc(id)}">
    <div class="gud-card-head"><div class="gud-card-h-title">${esc(title)}</div>${sub ? `<div class="gud-card-h-sub">${esc(sub)}</div>` : ''}</div>
    ${rows.length ? `<div class="gud-toplist">${shown.map(renderRow).join('')}</div>` : `<div class="gud-muted">${esc(emptyText)}</div>`}
    ${canExpand ? `<button type="button" class="gud-btn gud-mt" data-act="gud-intel-toggle" data-val="${esc(id)}">${expanded ? 'Tampilkan Lebih Sedikit' : `Lihat Semua (${fmtQty(rows.length)})`}</button>` : ''}
  </div>`;
}

/** v1.29.9 (Part D — Operational Shortcuts): `quickAct`, when given, adds
 *  ONE small icon button reusing an act gudang-center.js already routes
 *  (never a new one) — e.g. Reorder Needed's own "Goods In" shortcut
 *  below reuses gud-home-quick-in verbatim, the exact same act Home's own
 *  catalog card quick actions already dispatch to homeHandlers, screen-
 *  agnostic by construction (it only ever reads st.data.items / writes
 *  st.goodsIn / navigates). Reuses .gud-catalog-quick-btn's own standalone
 *  icon-button style (Home's catalog card quick actions) rather than a
 *  new button class. */
function reasonRow({ itemId, name, reason, tail, pill, quickAct }) {
  return `<div class="gud-toplist-row" data-act="gud-open-item" data-id="${esc(itemId)}" role="button" tabindex="0">
    ${pill ? `<span class="gud-pill" data-pill="${esc(pill.tone)}">${esc(pill.label)}</span>` : ''}
    <span class="gud-toplist-name">${esc(name)}<span class="gud-intel-reason">${esc(reason)}</span></span>
    <span class="gud-toplist-val">${esc(tail)}</span>
    ${quickAct ? `<span class="gud-catalog-quick-btn" data-act="${esc(quickAct.act)}" data-id="${esc(itemId)}" title="${esc(quickAct.title)}" role="button" tabindex="0" aria-label="${esc(quickAct.title)} — ${esc(name)}">${icon(quickAct.icon, { size: 13 })}</span>` : ''}
  </div>`;
}

function renderInsightCards(cards) {
  const ICON = { deadStock: 'history', slowMoving: 'gauge', fastMoving: 'bolt', reorderCandidates: 'arrow-out', overstock: 'archive' };
  return `<div class="gud-ov-grid">${cards.map((c) => `
    <button type="button" class="gud-insight-card" data-act="gud-intel-expand" data-val="${esc(c.key)}">
      <span class="gud-ov-ic"${c.count ? ' data-tone="warn"' : ''}>${icon(ICON[c.key] || 'box', { size: 17 })}</span>
      <div class="gud-ov-val">${fmtQty(c.count)}</div>
      <div class="gud-ov-title">${esc(c.label)}</div>
      <div class="gud-ov-cap">${c.count ? 'Buka Daftar' : 'Tidak ada'} ${c.count ? icon('arrow-right', { size: 10 }) : ''}</div>
    </button>`).join('')}</div>`;
}

function renderDeadStock(intel, rows) {
  return sectionCard({
    id: 'deadStock', title: 'Dead Stock', sub: `Tidak ada Goods Out selama ≥ ${intel.deadStockDays} hari`,
    rows, expanded: !!intel.expanded.deadStock, emptyText: 'Tidak ada item dead stock pada periode ini.',
    renderRow: (r) => reasonRow({ itemId: r.itemId, name: r.name, reason: r.reason, tail: `${fmtQty(r.currentStock)} unit`, pill: { tone: 'crit', label: `${r.daysInactive}h` } }),
  });
}

function renderReorder(intel, rows) {
  const PILL = { high: 'crit', medium: 'warn', low: 'neutral' };
  const LABEL = { high: 'Tinggi', medium: 'Sedang', low: 'Rendah' };
  return sectionCard({
    id: 'reorderCandidates', title: 'Reorder Needed', sub: 'Reuse Forecast Engine — status/forecast tidak dihitung ulang',
    rows, expanded: !!intel.expanded.reorderCandidates, emptyText: 'Tidak ada item yang perlu di-reorder.',
    renderRow: (r) => reasonRow({
      itemId: r.itemId, name: r.name, reason: r.reason, tail: `${fmtQty(r.currentStock)} unit`,
      pill: { tone: PILL[r.priority], label: LABEL[r.priority] },
      // gud-home-quick-in: the SAME act Home's own catalog card quick
      // actions already dispatch (homeHandlers.onClick) — restock
      // directly from the recommendation, no detour through Item Detail.
      quickAct: { act: 'gud-home-quick-in', icon: 'arrow-in', title: 'Goods In' },
    }),
  });
}

function renderOverstock(intel, rows) {
  return sectionCard({
    id: 'overstock', title: 'Overstock', sub: 'Stok jauh melebihi kebutuhan rata-rata',
    rows, expanded: !!intel.expanded.overstock, emptyText: 'Tidak ada item overstock.',
    renderRow: (r) => reasonRow({ itemId: r.itemId, name: r.name, reason: r.reason, tail: `${fmtQty(r.currentStock)} unit` }),
  });
}

function renderFastMoving(intel, rows) {
  return sectionCard({
    id: 'fastMoving', title: 'Fast Moving', sub: 'Frekuensi pergerakan tinggi',
    rows, expanded: !!intel.expanded.fastMoving, emptyText: 'Belum ada item fast moving.',
    renderRow: (r) => reasonRow({ itemId: r.itemId, name: r.name, reason: r.reason, tail: forecastSentence(r.forecastDays) || `${fmtQty(r.movementCount)}x` }),
  });
}

function renderSlowMoving(intel, rows) {
  return sectionCard({
    id: 'slowMoving', title: 'Slow Moving', sub: 'Frekuensi pergerakan rendah, bukan dead stock',
    rows, expanded: !!intel.expanded.slowMoving, emptyText: 'Belum ada item slow moving.',
    renderRow: (r) => reasonRow({ itemId: r.itemId, name: r.name, reason: r.reason, tail: `${fmtQty(r.currentStock)} unit` }),
  });
}

function renderVelocity(summary) {
  const cells = [
    { label: 'Very High', value: summary.very_high, pill: 'ok' },
    { label: 'High', value: summary.high, pill: 'ok' },
    { label: 'Medium', value: summary.medium, pill: 'info' },
    { label: 'Low', value: summary.low, pill: 'warn' },
    { label: 'Inactive', value: summary.inactive, pill: 'neutral' },
  ];
  return `<div class="gud-card -pad">
    <div class="gud-card-head"><div class="gud-card-h-title">Inventory Velocity</div><div class="gud-card-h-sub">Berdasarkan jumlah Goods Out tercatat</div></div>
    <div class="gud-fc-grid">${cells.map((c) => `
      <div class="gud-fc-cell">
        <span class="gud-pill" data-pill="${c.pill}">${fmtQty(c.value)}</span>
        <div class="gud-fc-label">${esc(c.label)}</div>
      </div>`).join('')}</div>
  </div>`;
}

function renderConsumptionPattern(movers) {
  const moverRow = (r, sign) => `<div class="gud-toplist-row" data-act="gud-open-item" data-id="${esc(r.itemId)}" role="button" tabindex="0">
    <span class="gud-toplist-name">${esc(r.name)}</span>
    <span class="gud-toplist-val" data-sign="${sign}">${sign === 'plus' ? '+' : ''}${fmtQty(r.monthly)} / ${fmtQty(r.priorMonthly)}</span>
  </div>`;
  return `<div class="gud-grid -2 gud-mt">
    <div class="gud-card -pad">
      <div class="gud-card-head"><div class="gud-card-h-title">Meningkat</div><div class="gud-card-h-sub">30 hari terakhir vs 30 hari sebelumnya</div></div>
      ${movers.accelerating.length ? movers.accelerating.map((r) => moverRow(r, 'plus')).join('') : `<div class="gud-muted">Tidak ada perubahan signifikan.</div>`}
    </div>
    <div class="gud-card -pad">
      <div class="gud-card-head"><div class="gud-card-h-title">Menurun</div><div class="gud-card-h-sub">30 hari terakhir vs 30 hari sebelumnya</div></div>
      ${movers.slowing.length ? movers.slowing.map((r) => moverRow(r, 'minus')).join('') : `<div class="gud-muted">Tidak ada perubahan signifikan.</div>`}
    </div>
  </div>`;
}

function distRow(row, max) {
  const pct = max > 0 ? Math.round((row.movementCount / max) * 100) : 0;
  return `<div class="gud-dist-row">
    <div class="gud-dist-label">${esc(row.label)}</div>
    <div class="gud-dist-bar"><div class="gud-dist-fill" style="width:${pct}%"></div></div>
    <div class="gud-dist-val">${fmtQty(row.movementCount)}</div>
  </div>`;
}

function renderActivityRanking(title, rows) {
  const max = rows.reduce((m, r) => Math.max(m, r.movementCount), 0);
  return `<div class="gud-card -pad">
    <div class="gud-card-head"><div class="gud-card-h-title">${esc(title)}</div><div class="gud-card-h-sub">Jumlah pergerakan Goods Out</div></div>
    ${rows.length ? rows.map((r) => distRow(r, max)).join('') : `<div class="gud-muted">Belum ada data.</div>`}
  </div>`;
}

export function renderIntelligence(st, c, requestRender) {
  ensureStockBulk(st, requestRender);
  ensureMovementFeed(st, requestRender);
  const intel = ensureIntelState(st);

  const hasCatalog = st.data.items.length > 0;
  const header = `<div class="gud-page-head">
    <div><div class="gud-page-crumb">GUDANG</div><h1 class="gud-page-title">Inventory Intelligence</h1>
    <p class="gud-page-lede">Apa yang perlu diperhatikan — dihitung dari aktivitas gudang yang sudah tercatat, bukan prediksi.</p></div>
  </div>`;

  if (!hasCatalog && !st.loading) {
    return `${header}<div class="gud-mt">${emptyState({ iconName: 'chart', title: 'Belum ada data untuk dianalisis', hint: 'Tambahkan item dan catat Goods Out/In terlebih dahulu — insight akan muncul di sini secara otomatis.' })}</div>`;
  }

  const loadingMovements = st.dashboardActivityLoading && !st.dashboardActivity;
  if (!st.homeStockBulk || loadingMovements) {
    return `${header}<div class="gud-mt gud-muted">Menganalisis aktivitas gudang…</div>`;
  }

  const stockBulk = activeStockBulk(st.data.items, st.homeStockBulk);
  const movements = st.dashboardActivity.movements;
  const profile = buildInventoryProfile(st.data.items, movements);

  const deadStock = computeDeadStock(st.data.items, profile, stockBulk, { thresholdDays: intel.deadStockDays });
  const slowMoving = computeSlowMoving(st.data.items, profile, stockBulk);
  const fastMoving = computeFastMoving(st.data.items, profile, stockBulk);
  const reorderCandidates = computeReorderCandidates(st.data.items, stockBulk);
  const overstock = computeOverstock(st.data.items, profile, stockBulk);
  const velocitySummary = summarizeVelocity(computeVelocity(st.data.items, profile));
  const consumptionMovers = computeConsumptionMovers(computeConsumptionPattern(st.data.items, profile));
  const categoryActivity = computeCategoryActivity(st.data.items, movements);
  const locationActivity = computeLocationActivity(st.data.items, movements, st.data.locations);

  const insightCards = computeInsightCards({ deadStock, slowMoving, fastMoving, reorderCandidates, overstock });

  return `<div>
    ${header}
    ${renderInsightCards(insightCards)}

    <div class="gud-sec">
      <div class="gud-sec-t-row">
        <div class="gud-sec-t">DEAD STOCK</div>
        <select class="gud-chip-select" data-act="gud-intel-threshold" aria-label="Periode Dead Stock">
          ${DEAD_STOCK_PRESETS.map((d) => `<option value="${d}" ${intel.deadStockDays === d ? 'selected' : ''}>${d} hari</option>`).join('')}
        </select>
      </div>
      ${renderDeadStock(intel, deadStock)}
    </div>

    <div class="gud-grid -2 gud-mt">
      ${renderReorder(intel, reorderCandidates)}
      ${renderOverstock(intel, overstock)}
    </div>

    <div class="gud-grid -2 gud-mt">
      ${renderFastMoving(intel, fastMoving)}
      ${renderSlowMoving(intel, slowMoving)}
    </div>

    <div class="gud-mt">${renderVelocity(velocitySummary)}</div>

    <div class="gud-sec">
      <div class="gud-sec-t">POLA KONSUMSI</div>
      ${renderConsumptionPattern(consumptionMovers)}
    </div>

    <div class="gud-grid -2 gud-mt">
      ${renderActivityRanking('Kategori Paling Aktif', categoryActivity)}
      ${renderActivityRanking('Lokasi Paling Aktif', locationActivity)}
    </div>
  </div>`;
}

export const intelligenceHandlers = {
  onClick(st, act, el, c, render) {
    const intel = ensureIntelState(st);
    if (act === 'gud-intel-expand') {
      // An Insight Card click (Section 10 — "Open List") always expands
      // AND scrolls to that section, regardless of its current state — a
      // zero-count card has nothing to expand into, but still scrolls
      // there so the "Tidak ada" empty text is visible, not just the
      // card itself.
      const key = el.dataset.val;
      intel.expanded[key] = true;
      render();
      document.getElementById(key)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (act === 'gud-intel-toggle') {
      // A section's own "Lihat Semua"/"Tampilkan Lebih Sedikit" button —
      // a real toggle, already scrolled to by definition (the user is
      // looking right at it), so no scroll here.
      const key = el.dataset.val;
      intel.expanded[key] = !intel.expanded[key];
      render();
    }
  },
  onInput(st, act, el, render) {
    const intel = ensureIntelState(st);
    if (act === 'gud-intel-threshold') {
      intel.deadStockDays = Number(el.value) || 180;
      render();
    }
  },
};
