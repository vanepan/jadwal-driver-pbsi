/* ============================================================
   GUDANG-MOVEMENT-HISTORY.JS — Movement History screen (Doc 2 §09)

   Reverse-chronological, readable, searchable, filterable by type/person.
   No accounting terminology — every row already speaks plain words
   (audit/movement-history-view.js#formatMovementEntry, Phase 6), this
   file only lays them out as a feed and applies the type/text filters
   client-side over an already-fetched list (Doc 4/Experience brief:
   "no duplicated queries" — one fetch per screen-visit, not one per
   keystroke).
   ============================================================ */

'use strict';

import { esc, icon, emptyState } from './gudang-atoms.js';
import { getMovementHistory, MOVEMENT_TYPE_LABEL } from '../audit/movement-history-view.js';

function ensureData(st, requestRender) {
  if (st.historyData || st.historyLoading) return;
  st.historyLoading = true;
  getMovementHistory({}).then((res) => {
    st.historyData = res.ok ? res.data : [];
    st.historyLoading = false;
    requestRender();
  });
}

export function renderMovementHistory(st, c, requestRender) {
  ensureData(st, requestRender);
  const f = st.historyFilters || (st.historyFilters = { type: null, q: '' });
  const rows = filteredRows(st.historyData || [], f);

  return `<div>
    <div class="gud-page-head">
      <div><div class="gud-page-crumb">GUDANG</div><h1 class="gud-page-title">Movement History</h1>
      <p class="gud-page-lede">Riwayat pergerakan, terbaru di atas. Setiap baris menjawab siapa, apa, dan mengapa.</p></div>
    </div>

    <div class="gud-filterbar gud-mt">
      <input class="gud-input gud-hist-search" data-act="gud-hist-q" value="${esc(f.q)}" placeholder="Cari tipe, alasan, atau pelaku…" autocomplete="off" style="max-width:280px;" />
      <div class="gud-chips">
        <button type="button" class="gud-chip" data-on="${f.type === null}" data-act="gud-hist-type" data-val="">Semua</button>
        ${Object.entries(MOVEMENT_TYPE_LABEL).map(([type, label]) => `
          <button type="button" class="gud-chip" data-on="${f.type === type}" data-act="gud-hist-type" data-val="${esc(type)}">${esc(label)}</button>`).join('')}
      </div>
    </div>

    ${st.historyLoading && !st.historyData ? `<div class="gud-muted gud-mt">Memuat…</div>` : (rows.length ? feedList(rows) : `<div class="gud-mt">${emptyState({
      iconName: 'history', title: 'Belum ada pergerakan',
      hint: (st.historyData || []).length ? 'Tidak ada yang cocok dengan pencarian/filter saat ini.' : 'Riwayat akan muncul di sini setelah Goods In/Out atau Stock Opname pertama.',
    })}</div>`)}
  </div>`;
}

function filteredRows(all, f) {
  let rows = all;
  if (f.type) rows = rows.filter((m) => matchesType(m, f.type));
  const q = f.q.trim().toLowerCase();
  if (q) rows = rows.filter((m) => `${m.what} ${m.why} ${m.who}`.toLowerCase().includes(q));
  return rows;
}
function matchesType(m, type) {
  // formatMovementEntry doesn't carry the raw `type` field through (only its
  // label) — filter chips compare against the same label vocabulary instead,
  // so no second raw-type lookup is needed.
  return m.what === MOVEMENT_TYPE_LABEL[type];
}

function feedList(rows) {
  return `<div class="gud-hist-list gud-mt gud-stagger">${rows.map((m) => `
    <div class="gud-hist-row">
      <span class="gud-hist-ic" data-tone="${m.quantityDelta > 0 ? 'ok' : 'crit'}">${icon(m.quantityDelta > 0 ? 'arrow-in' : 'arrow-out', { size: 15 })}</span>
      <span class="gud-hist-main">
        <span class="gud-hist-title">${esc(m.what)} <span class="gud-hist-qty" data-sign="${m.quantityDelta > 0 ? 'plus' : 'minus'}">${m.quantityDelta > 0 ? '+' : ''}${m.quantityDelta}</span></span>
        <span class="gud-hist-sub">${esc(m.why)} · ${esc(m.who)}</span>
      </span>
      <span class="gud-hist-time">${esc(fmtWhenShort(m.when))}</span>
    </div>`).join('')}</div>`;
}

function fmtWhenShort(iso) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  const d = new Date(t);
  return d.toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export const historyHandlers = {
  onClick(st, act, el, c, render) {
    const f = st.historyFilters || (st.historyFilters = { type: null, q: '' });
    if (act === 'gud-hist-type') { f.type = el.dataset.val || null; render(); }
  },
  onInput(st, act, t, render) {
    const f = st.historyFilters || (st.historyFilters = { type: null, q: '' });
    if (act === 'gud-hist-q') { f.q = t.value; render(); }
  },
};
