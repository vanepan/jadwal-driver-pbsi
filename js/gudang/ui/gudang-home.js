/* ============================================================
   GUDANG-HOME.JS — Home screen (Doc 2 §04)

   Search dominant, autofocused. Quick Goods Out / Quick Goods In skip
   Search entirely (§04: "one tap jumps straight into §06/§07"). Low
   Stock / Recent Activity / Restock Recommendation are quiet sentences —
   no charts, no KPI cards, no dashboard clutter (Doc 1 Art.VII, R-05/R-06).

   UI never computes analytics (Experience brief, Architecture section):
   every figure here comes from analytics-engine.js#getLowStockAlerts /
   audit/movement-history-view.js#getMovementHistory, both already built
   and tested (Phase 6/8). This file only asks for them and lays them out.
   ============================================================ */

'use strict';

import { esc, icon, emptyState, kbdRow, fmtWhen } from './gudang-atoms.js';
import { getLowStockAlerts } from '../analytics/analytics-engine.js';
import { forecastSentence } from '../analytics/quiet-intelligence-engine.js';
import { getMovementHistory } from '../audit/movement-history-view.js';

/** Kick off Home's own aggregate reads once per screen-visit, cached on
 *  st.home so re-renders (e.g. after a keystroke elsewhere) never re-fetch —
 *  "no duplicated queries" (Experience brief, Performance section). */
function ensureHomeData(st, requestRender) {
  if (st.home || st.homeLoading) return;
  st.homeLoading = true;
  Promise.all([getLowStockAlerts(8), getMovementHistory({})]).then(([lowStockRes, historyRes]) => {
    st.home = {
      lowStock: lowStockRes.ok ? lowStockRes.data : [],
      recent: historyRes.ok ? historyRes.data.slice(0, 6) : [],
    };
    st.homeLoading = false;
    requestRender();
  });
}

export function renderHome(st, c, requestRender) {
  ensureHomeData(st, requestRender);
  const hasCatalog = st.data.items.length > 0;

  return `
    <div class="gud-home">
      <button type="button" class="gud-home-search" data-act="gud-search-open">
        ${icon('search', { size: 20, tone: 'text-faint' })}
        <span class="gud-home-search-ph">Cari item, lokasi, aset…</span>
        <span class="gud-home-search-kbd">${kbdRow(['Ctrl', 'K'])}</span>
      </button>

      <div class="gud-home-quick">
        <button type="button" class="gud-quick-tile" data-act="gud-quick-goods-out">
          <span class="gud-quick-ic" data-tone="c-blue">${icon('arrow-out', { size: 22 })}</span>
          <span class="gud-quick-t">Goods Out</span>
          <span class="gud-quick-s">Keluarkan barang ke bidang</span>
        </button>
        <button type="button" class="gud-quick-tile" data-act="gud-quick-goods-in">
          <span class="gud-quick-ic" data-tone="c-green">${icon('arrow-in', { size: 22 })}</span>
          <span class="gud-quick-t">Goods In</span>
          <span class="gud-quick-s">Terima barang masuk</span>
        </button>
        <button type="button" class="gud-quick-tile" data-act="gud-cat-add-item-home">
          <span class="gud-quick-ic" data-tone="c-violet">${icon('plus', { size: 22 })}</span>
          <span class="gud-quick-t">Tambah Item</span>
          <span class="gud-quick-s">Daftarkan item baru ke katalog</span>
        </button>
      </div>

      ${!hasCatalog && !st.loading ? emptyState({
        iconName: 'box',
        title: 'Belum ada item di Gudang',
        hint: 'Gunakan tombol "Tambah Item" di atas untuk mendaftarkan item pertama.',
      }) : renderInsights(st)}
    </div>`;
}

function renderInsights(st) {
  if (!st.home) return `<div class="gud-home-sections"><div class="gud-muted">Memuat…</div></div>`;
  const { lowStock, recent } = st.home;

  const lowStockBlock = lowStock.length
    ? `<div class="gud-insight-list gud-stagger">${lowStock.map((a) => `
        <div class="gud-insight-row" data-act="gud-open-item" data-id="${esc(a.itemId)}">
          <span class="gud-insight-dot" data-tone="warn"></span>
          <span class="gud-insight-name">${esc(a.name)}</span>
          <span class="gud-insight-hint">${esc(forecastSentence(a.daysRemaining) || 'Restock recommended')}</span>
        </div>`).join('')}</div>`
    : `<div class="gud-muted">Tidak ada item yang perlu direstock saat ini.</div>`;

  const recentBlock = recent.length
    ? `<div class="gud-insight-list gud-stagger">${recent.map((m) => `
        <div class="gud-insight-row">
          <span class="gud-insight-dot" data-tone="${m.quantityDelta > 0 ? 'ok' : 'info'}"></span>
          <span class="gud-insight-name">${esc(m.what)} · ${esc(m.quantityDelta > 0 ? '+' : '')}${m.quantityDelta}</span>
          <span class="gud-insight-hint">${esc(fmtWhen(m.when))}</span>
        </div>`).join('')}</div>`
    : `<div class="gud-muted">Belum ada aktivitas.</div>`;

  return `
    <div class="gud-home-sections">
      <section class="gud-home-sec">
        <div class="gud-sec-head"><span class="gud-sec-tag">PERLU PERHATIAN</span></div>
        <div class="gud-sec-title" style="margin-bottom:12px;">Stok Rendah</div>
        ${lowStockBlock}
      </section>
      <section class="gud-home-sec">
        <div class="gud-sec-head"><span class="gud-sec-tag">TERBARU</span></div>
        <div class="gud-sec-title" style="margin-bottom:12px;">Aktivitas Terkini</div>
        ${recentBlock}
      </section>
    </div>`;
}
