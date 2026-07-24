/* ============================================================
   GUDANG-GOODS-IN.JS — Goods In screen (Doc 2 §07)

   Reason (Purchase/Return/Transfer/Adjustment) -> [search item -> quantity
   -> confirm line] repeat -> Ctrl+Enter save. Identical rhythm to Goods
   Out (§06) — the only structural difference is the up-front choice
   (reason, not department), straight from the Blueprint's own text.

   Price is optional, collapsed by default, never required (Doc 2 §07) —
   the "+ tambah harga" toggle is the only thing standing between a plain
   quantity line and a priced one; skipping it blocks nothing.

   UI never computes business logic: consumable/goods-in-engine.js
   (executeGoodsIn, Phase 5) owns validation, Movement creation, and Stock
   recalculation. This file only collects the batch and calls it.
   ============================================================ */

'use strict';

import { esc, icon, kbdRow, fmtQty, fmtRupiah, emptyState } from './gudang-atoms.js';
import { itemMatchesQuery } from '../search/search-resolver.js';
import { executeGoodsIn } from '../consumable/goods-in-engine.js';
import { MOVEMENT_REASON } from '../contracts/movement-contract.js';
import { ITEM_TYPE } from '../contracts/item-contract.js';

const REASON_LABEL = {
  [MOVEMENT_REASON.PURCHASE]: 'Purchase', [MOVEMENT_REASON.RETURN]: 'Return',
  [MOVEMENT_REASON.TRANSFER]: 'Transfer', [MOVEMENT_REASON.ADJUSTMENT]: 'Adjustment',
};
const REASONS = Object.keys(REASON_LABEL);

function blankBatch() {
  return {
    reason: null,
    itemQuery: '', selectedItemId: null, quantity: '', priceOpen: false, price: '',
    lines: [], saving: false, error: null, savedCount: null,
  };
}

function ensure(st) {
  if (!st.goodsIn) st.goodsIn = blankBatch();
  return st.goodsIn;
}

export function renderGoodsIn(st, c) {
  const b = ensure(st);
  if (b.savedCount != null) return savedScreen(b);

  return `<div class="gud-flow">
    <div class="gud-page-head">
      <div><div class="gud-page-crumb">GUDANG</div><h1 class="gud-page-title">Goods In</h1>
      <p class="gud-page-lede">Terima barang masuk. Harga bersifat opsional dan tidak pernah wajib diisi.</p></div>
    </div>

    ${!b.reason ? reasonPicker(b) : itemLoop(st, b)}
  </div>`;
}

function reasonPicker(b) {
  return `<div class="gud-card -pad gud-flow-step">
    <div class="gud-field"><span>Alasan</span></div>
    <div class="gud-reason-grid">${REASONS.map((r) => `
      <button type="button" class="gud-reason-tile" data-act="gud-gi-reason-pick" data-id="${esc(r)}">${esc(REASON_LABEL[r])}</button>`).join('')}</div>
  </div>`;
}

function itemLoop(st, b) {
  const consumables = st.data.items.filter((i) => i.itemType === ITEM_TYPE.CONSUMABLE && i.active);
  const q = b.itemQuery.trim();
  const matches = q ? consumables.filter((i) => itemMatchesQuery(i, q)).slice(0, 8) : [];
  const selected = b.selectedItemId ? consumables.find((i) => i.itemId === b.selectedItemId) : null;

  return `<div class="gud-flow-step">
    <div class="gud-flow-dept">
      ${icon('tag', { size: 14, tone: 'text-faint' })} <span>${esc(REASON_LABEL[b.reason])}</span>
      <button type="button" class="gud-link-btn" data-act="gud-gi-reason-clear">Ganti</button>
    </div>

    <div class="gud-card -pad gud-mt">
      ${!selected ? `
        <div class="gud-field"><span>Cari Item</span>
          <input class="gud-input" data-act="gud-gi-item-query" value="${esc(b.itemQuery)}" placeholder="Nama atau alias item…" autocomplete="off" autofocus />
        </div>
        ${q ? (matches.length
          ? `<div class="gud-picker-list gud-mt">${matches.map((i) => `
              <button type="button" class="gud-picker-row" data-act="gud-gi-item-pick" data-id="${esc(i.itemId)}">${esc(i.name)}</button>`).join('')}</div>`
          : `<div class="gud-mt">
              <div class="gud-muted">Tidak ada item yang cocok.</div>
              <button type="button" class="gud-link-btn gud-mt" data-act="gud-cat-add-item-goodsin">${icon('plus', { size: 12 })} Tambah "${esc(q)}" sebagai item baru</button>
            </div>`) : ''}
      ` : `
        <div class="gud-flow-selected">
          <span class="gud-flow-selected-name">${esc(selected.name)}</span>
          <button type="button" class="gud-link-btn" data-act="gud-gi-item-clear">Ganti</button>
        </div>
        <div class="gud-field gud-mt"><span>Jumlah</span>
          <div class="gud-qty-row">
            <button type="button" class="gud-icon-btn" data-act="gud-gi-qty-minus">${icon('minus', { size: 15 })}</button>
            <input class="gud-input gud-qty-input" data-act="gud-gi-qty" type="number" min="0" value="${esc(b.quantity)}" autofocus />
            <button type="button" class="gud-icon-btn" data-act="gud-gi-qty-plus">${icon('plus', { size: 15 })}</button>
          </div>
        </div>
        ${priceField(b)}
        <button type="button" class="gud-btn -primary gud-mt" data-act="gud-gi-confirm-line" ${Number(b.quantity) > 0 ? '' : 'disabled'}>
          ${icon('check', { size: 15 })} Konfirmasi Baris
        </button>
      `}
    </div>

    ${lineList(b)}

    ${b.error ? `<div class="gud-flow-error gud-mt">${esc(b.error)}</div>` : ''}

    <div class="gud-flow-foot gud-mt">
      <span class="gud-hint">${kbdRow(['Ctrl', 'Enter'])} simpan batch</span>
      <button type="button" class="gud-btn -primary -big" data-act="gud-gi-save" ${b.lines.length && !b.saving ? '' : 'disabled'}>
        ${b.saving ? 'Menyimpan…' : `${icon('check-circle', { size: 16 })} Simpan (${b.lines.length} baris)`}
      </button>
    </div>
  </div>`;
}

function priceField(b) {
  if (!b.priceOpen) {
    return `<button type="button" class="gud-link-btn gud-mt" data-act="gud-gi-price-open">${icon('plus', { size: 12 })} tambah harga <span class="gud-opt">(opsional)</span></button>`;
  }
  return `<div class="gud-field gud-mt"><span>Harga per unit <em class="gud-opt">(opsional)</em></span>
    <input class="gud-input" data-act="gud-gi-price" type="number" min="0" value="${esc(b.price)}" placeholder="Rp" /></div>`;
}

function lineList(b) {
  if (!b.lines.length) return `<div class="gud-mt">${emptyState({ iconName: 'arrow-in', title: 'Belum ada baris', hint: 'Cari item lalu masukkan jumlah untuk menambah baris pertama.' })}</div>`;
  return `<div class="gud-line-list gud-mt gud-stagger">${b.lines.map((l, i) => `
    <div class="gud-line-row">
      <span class="gud-line-name">${esc(l.name)}</span>
      ${l.price != null ? `<span class="gud-line-price">${esc(fmtRupiah(l.price))}</span>` : ''}
      <span class="gud-line-qty -in">+${fmtQty(l.quantity)}</span>
      <button type="button" class="gud-icon-btn -sm" data-act="gud-gi-remove-line" data-id="${i}" aria-label="Hapus">${icon('close', { size: 13 })}</button>
    </div>`).join('')}</div>`;
}

function savedScreen(b) {
  return `<div class="gud-card -pad gud-flow-success">
    ${icon('check-circle', { size: 32, tone: 'c-green' })}
    <div class="gud-empty-t">Goods In tersimpan</div>
    <div class="gud-empty-h">${b.savedCount} baris pergerakan telah dicatat.</div>
    <button type="button" class="gud-btn -primary gud-mt" data-act="gud-gi-new">Buat Batch Baru</button>
  </div>`;
}

async function trySave(st, c, render, refreshCatalog) {
  const b = ensure(st);
  if (!b.lines.length || b.saving) return;
  b.saving = true; b.error = null; render();
  const res = await executeGoodsIn({
    reason: b.reason,
    lines: b.lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity, price: l.price })),
    actorId: c.actorId,
  });
  b.saving = false;
  if (!res.ok) { b.error = res.error.message; render(); return; }
  const count = b.lines.length;
  st.goodsIn = blankBatch();
  st.goodsIn.savedCount = count;
  await refreshCatalog();
}

export const goodsInHandlers = {
  onClick(st, act, el, c, render, refreshCatalog) {
    const b = ensure(st);
    switch (act) {
      case 'gud-gi-reason-pick': b.reason = el.dataset.id; render(); break;
      case 'gud-gi-reason-clear': b.reason = null; render(); break;
      case 'gud-gi-item-pick': b.selectedItemId = el.dataset.id; b.itemQuery = ''; b.quantity = ''; b.priceOpen = false; b.price = ''; render(); break;
      case 'gud-gi-item-clear': b.selectedItemId = null; b.quantity = ''; render(); break;
      case 'gud-gi-qty-plus': b.quantity = String((Number(b.quantity) || 0) + 1); render(); break;
      case 'gud-gi-qty-minus': b.quantity = String(Math.max(0, (Number(b.quantity) || 0) - 1)); render(); break;
      case 'gud-gi-price-open': b.priceOpen = true; render(); break;
      case 'gud-gi-confirm-line': {
        const item = st.data.items.find((i) => i.itemId === b.selectedItemId);
        const qty = Number(b.quantity);
        if (!item || !(qty > 0)) return;
        const price = b.priceOpen && b.price !== '' ? Number(b.price) : null;
        b.lines.push({ itemId: item.itemId, name: item.name, quantity: qty, price });
        b.selectedItemId = null; b.quantity = ''; b.itemQuery = ''; b.priceOpen = false; b.price = '';
        render();
        break;
      }
      case 'gud-gi-remove-line': b.lines.splice(Number(el.dataset.id), 1); render(); break;
      case 'gud-gi-save': trySave(st, c, render, refreshCatalog); break;
      case 'gud-gi-new': st.goodsIn = blankBatch(); render(); break;
      default: break;
    }
  },
  onInput(st, act, t, render) {
    const b = ensure(st);
    if (act === 'gud-gi-item-query') b.itemQuery = t.value;
    else if (act === 'gud-gi-qty') b.quantity = t.value;
    else if (act === 'gud-gi-price') b.price = t.value;
    render();
  },
  trySave,
};
