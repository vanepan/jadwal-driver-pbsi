/* ============================================================
   GUDANG-STOCK-OPNAME.JS — Stock Opname screen (Doc 2 §10)

   Expected -> counted -> difference (shown quietly) -> adjustment
   movement. Never a direct stock edit. Counted in whatever slice the
   user chooses (a location filter here) — nothing requires completing
   the whole catalog before saving; partial opname is the default shape,
   not a special case.

   UI never computes the discrepancy's effect on Stock: consumable/
   stock-opname-engine.js (Phase 7) reads the FRESH expected quantity and
   decides whether/what Movement to create. This file only shows the
   expected number back to the user and collects counted values.
   ============================================================ */

'use strict';

import { esc, icon, kbdRow, fmtQty, emptyState } from './gudang-atoms.js';
import { getExpectedQuantity, executeStockOpname } from '../consumable/stock-opname-engine.js';
import { ITEM_TYPE } from '../contracts/item-contract.js';

function ensure(st) {
  if (!st.opname) st.opname = { locationId: null, q: '', open: {}, counted: {}, saving: false, error: null, savedResult: null };
  return st.opname;
}

export function renderStockOpname(st, c) {
  const o = ensure(st);
  if (o.savedResult) return savedScreen(o);

  const consumables = st.data.items.filter((i) => i.itemType === ITEM_TYPE.CONSUMABLE && i.active);
  const q = o.q.trim().toLowerCase();
  const filtered = consumables.filter((i) =>
    (!o.locationId || i.defaultLocationId === o.locationId)
    && (!q || i.name.toLowerCase().includes(q)));
  const countedCount = Object.keys(o.counted).length;

  return `<div>
    <div class="gud-page-head">
      <div><div class="gud-page-crumb">GUDANG</div><h1 class="gud-page-title">Stock Opname</h1>
      <p class="gud-page-lede">Hitung sebagian atau seluruh gudang — tidak perlu diselesaikan sekaligus. Selisih akan tercatat sebagai pergerakan penyesuaian.</p></div>
    </div>

    <div class="gud-filterbar gud-mt">
      <input class="gud-input" data-act="gud-op-q" value="${esc(o.q)}" placeholder="Cari item…" autocomplete="off" style="max-width:260px;" />
      <div class="gud-chips">
        <button type="button" class="gud-chip" data-on="${!o.locationId}" data-act="gud-op-loc" data-val="">Semua Lokasi</button>
        ${st.data.locations.map((l) => `
          <button type="button" class="gud-chip" data-on="${o.locationId === l.locationId}" data-act="gud-op-loc" data-val="${esc(l.locationId)}">${esc(l.name)}</button>`).join('')}
      </div>
    </div>

    ${filtered.length ? `<div class="gud-opname-list gud-mt gud-stagger">${filtered.map((i) => opnameRow(i, o)).join('')}</div>`
      : `<div class="gud-mt">${emptyState({ iconName: 'clipboard', title: 'Tidak ada item', hint: 'Tidak ada item Consumable yang cocok dengan filter saat ini.' })}</div>`}

    ${o.error ? `<div class="gud-flow-error gud-mt">${esc(o.error)}</div>` : ''}

    <div class="gud-flow-foot gud-mt">
      <span class="gud-hint">${kbdRow(['Ctrl', 'Enter'])} simpan opname</span>
      <button type="button" class="gud-btn -primary -big" data-act="gud-op-save" ${countedCount && !o.saving ? '' : 'disabled'}>
        ${o.saving ? 'Menyimpan…' : `${icon('check-circle', { size: 16 })} Simpan Opname (${countedCount} item dihitung)`}
      </button>
    </div>
  </div>`;
}

function opnameRow(item, o) {
  const counted = o.counted[item.itemId];
  if (counted) {
    const diff = counted.countedQuantity - counted.expectedQuantity;
    return `<div class="gud-opname-row -done">
      <span class="gud-opname-name">${esc(item.name)}</span>
      <span class="gud-opname-diff" data-sign="${diff === 0 ? 'zero' : diff > 0 ? 'plus' : 'minus'}">${diff === 0 ? 'Sesuai' : (diff > 0 ? `+${diff}` : diff)}</span>
      <button type="button" class="gud-icon-btn -sm" data-act="gud-op-undo" data-id="${esc(item.itemId)}" aria-label="Hitung ulang">${icon('close', { size: 13 })}</button>
    </div>`;
  }
  const isOpen = o.open[item.itemId];
  if (!isOpen) {
    return `<div class="gud-opname-row">
      <span class="gud-opname-name">${esc(item.name)}</span>
      <button type="button" class="gud-btn -sm" data-act="gud-op-open" data-id="${esc(item.itemId)}">Hitung</button>
    </div>`;
  }
  const expected = o.expected && o.expected[item.itemId];
  const draft = o.draft && o.draft[item.itemId] != null ? o.draft[item.itemId] : '';
  return `<div class="gud-opname-row -counting">
    <span class="gud-opname-name">${esc(item.name)}</span>
    <span class="gud-opname-expected">${expected == null ? 'Memuat…' : `Ekspektasi: ${fmtQty(expected)}`}</span>
    <input class="gud-input gud-opname-input" data-act="gud-op-count" data-id="${esc(item.itemId)}" type="number" min="0" value="${esc(draft)}" placeholder="Hasil hitung" autofocus />
    <button type="button" class="gud-icon-btn -sm" data-act="gud-op-confirm-count" data-id="${esc(item.itemId)}" aria-label="Konfirmasi" ${draft === '' || expected == null ? 'disabled' : ''}>${icon('check', { size: 13 })}</button>
    <button type="button" class="gud-icon-btn -sm" data-act="gud-op-cancel" data-id="${esc(item.itemId)}" aria-label="Batal">${icon('close', { size: 13 })}</button>
  </div>`;
}

function savedScreen(o) {
  return `<div class="gud-card -pad gud-flow-success">
    ${icon('check-circle', { size: 32, tone: 'c-green' })}
    <div class="gud-empty-t">Stock Opname tersimpan</div>
    <div class="gud-empty-h">${o.savedResult.adjusted} item disesuaikan, ${o.savedResult.unchanged} item sesuai ekspektasi.</div>
    <button type="button" class="gud-btn -primary gud-mt" data-act="gud-op-new">Opname Baru</button>
  </div>`;
}

async function openRow(st, itemId, render) {
  const o = ensure(st);
  o.open[itemId] = true;
  render();
  const res = await getExpectedQuantity(itemId);
  if (!o.expected) o.expected = {};
  o.expected[itemId] = res.ok ? res.data : 0;
  render();
}

async function trySave(st, c, render, refreshCatalog) {
  const o = ensure(st);
  const lines = Object.entries(o.counted).map(([itemId, v]) => ({ itemId, countedQuantity: v.countedQuantity }));
  if (!lines.length || o.saving) return;
  o.saving = true; o.error = null; render();
  const res = await executeStockOpname({ lines, actorId: c.actorId });
  o.saving = false;
  if (!res.ok) { o.error = res.error.message; render(); return; }
  const adjusted = res.data.movements.length;
  const unchanged = res.data.unchanged.length;
  st.opname = { locationId: null, q: '', open: {}, counted: {}, saving: false, error: null, savedResult: { adjusted, unchanged } };
  await refreshCatalog();
}

export const opnameHandlers = {
  onClick(st, act, el, c, render, refreshCatalog) {
    const o = ensure(st);
    const id = el.dataset.id;
    switch (act) {
      case 'gud-op-loc': o.locationId = el.dataset.val || null; render(); break;
      case 'gud-op-open': openRow(st, id, render); break;
      case 'gud-op-cancel': delete o.open[id]; if (o.draft) delete o.draft[id]; render(); break;
      case 'gud-op-undo': delete o.counted[id]; render(); break;
      case 'gud-op-confirm-count': {
        const val = Number((o.draft && o.draft[id]) ?? '');
        const expected = (o.expected && o.expected[id]) ?? null;
        if (!Number.isFinite(val) || val < 0 || expected == null) return;
        o.counted[id] = { countedQuantity: val, expectedQuantity: expected };
        delete o.open[id];
        if (o.draft) delete o.draft[id];
        render();
        break;
      }
      case 'gud-op-save': trySave(st, c, render, refreshCatalog); break;
      case 'gud-op-new': st.opname = null; ensure(st); render(); break;
      default: break;
    }
  },
  onInput(st, act, t, render) {
    const o = ensure(st);
    if (act === 'gud-op-q') { o.q = t.value; render(); return; }
    if (act === 'gud-op-count') {
      if (!o.draft) o.draft = {};
      o.draft[t.dataset.id] = t.value;
      render();
    }
  },
  trySave,
};
