/* ============================================================
   GUDANG-MOVEMENT-HISTORY.JS — Movement History screen (Doc 2 §09)

   Reverse-chronological, readable, searchable, filterable by type/person.
   No accounting terminology — every row already speaks plain words
   (audit/movement-history-view.js#formatMovementEntry, Phase 6), this
   file only lays them out as a feed and applies the type/text filters
   client-side over an already-fetched list (Doc 4/Experience brief:
   "no duplicated queries" — one fetch per screen-visit, not one per
   keystroke).

   Phase 10.2: replaced the flat border-top "table feeling" list with a
   day-grouped timeline (GitHub Activity / Apple Wallet history mental
   model) — each row is now a standalone card, grouped under "Hari Ini" /
   "Kemarin" / a plain date label. Grouping is pure display arithmetic over
   `m.when` (a field formatMovementEntry already returns) — no new data,
   no re-fetch, same filteredRows() as before feeding a different layout.
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

    ${st.historyLoading && !st.historyData ? `<div class="gud-muted gud-mt">Memuat…</div>` : (rows.length ? feedList(rows) : `<div class="gud-mt">${emptyState((st.historyData || []).length ? {
      iconName: 'history', title: 'Tidak ada yang cocok',
      hint: 'Coba kata kunci atau filter lain.',
    } : {
      iconName: 'history', title: 'Belum ada aktivitas',
      hint: 'Aktivitas pertama akan muncul di sini setelah Goods In/Out atau Stock Opname pertama.',
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

/** Groups rows into "Hari Ini" / "Kemarin" / a plain date label, newest
 *  group first — reverse-chronological is already guaranteed by
 *  getMovementHistory(), so grouping only has to be stable, not re-sort. */
function feedList(rows) {
  const groups = [];
  let current = null;
  for (const m of rows) {
    const label = dayLabel(m.when);
    if (!current || current.label !== label) { current = { label, rows: [] }; groups.push(current); }
    current.rows.push(m);
  }
  return `<div class="gud-timeline gud-mt">${groups.map((g) => `
    <section class="gud-timeline-group">
      <div class="gud-timeline-label">${esc(g.label)}</div>
      <div class="gud-timeline-rows gud-stagger">${g.rows.map(historyCard).join('')}</div>
    </section>`).join('')}</div>`;
}

function historyCard(m) {
  return `<div class="gud-hist-row" ${m.itemId ? `data-act="gud-open-item" data-id="${esc(m.itemId)}"` : ''}>
      <span class="gud-hist-ic" data-tone="${m.quantityDelta > 0 ? 'ok' : 'crit'}">${icon(m.quantityDelta > 0 ? 'arrow-in' : 'arrow-out', { size: 15 })}</span>
      <span class="gud-hist-main">
        <span class="gud-hist-title">${esc(m.what)} <span class="gud-hist-qty" data-sign="${m.quantityDelta > 0 ? 'plus' : 'minus'}">${m.quantityDelta > 0 ? '+' : ''}${m.quantityDelta}</span></span>
        <span class="gud-hist-sub">${esc(m.why)} · ${esc(m.who)}</span>
      </span>
      <span class="gud-hist-time">${esc(fmtTimeOnly(m.when))}</span>
    </div>`;
}

function dayLabel(iso) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 'Tidak diketahui';
  const d = new Date(t);
  const today = new Date();
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(today) - startOf(d)) / 86400000);
  if (diffDays === 0) return 'Hari Ini';
  if (diffDays === 1) return 'Kemarin';
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

function fmtTimeOnly(iso) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  return new Date(t).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
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
