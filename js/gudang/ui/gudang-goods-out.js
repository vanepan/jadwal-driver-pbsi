/* ============================================================
   GUDANG-GOODS-OUT.JS — Goods Out screen (Doc 2 §06)

   Department -> [search item -> quantity -> confirm line] repeat ->
   Ctrl+Enter save. No wizard, no table editing, no CRUD page — one
   continuous loop, keyboard-first on desktop, large touch targets on
   mobile (Doc 2 §13).

   UI never computes stock or business logic: batching lines here is pure
   presentation state; the ACTUAL validation, Movement creation, and Stock
   recalculation all happen inside consumable/goods-out-engine.js
   (executeGoodsOut), already built and tested in Phase 4. This file only
   collects the batch and calls it.
   ============================================================ */

'use strict';

import { esc, icon, kbdRow, fmtQty, emptyState } from './gudang-atoms.js';
import { itemMatchesQuery } from '../search/search-resolver.js';
import { executeGoodsOut } from '../consumable/goods-out-engine.js';
import { ITEM_TYPE } from '../contracts/item-contract.js';

function blankBatch() {
  return {
    departmentId: null, departmentQuery: '',
    itemQuery: '', selectedItemId: null, quantity: '',
    lines: [], saving: false, error: null, savedCount: null,
  };
}

function ensure(st) {
  if (!st.goodsOut) st.goodsOut = blankBatch();
  return st.goodsOut;
}

export function renderGoodsOut(st, c) {
  const b = ensure(st);
  const dept = st.data.departments.find((d) => d.departmentId === b.departmentId);

  if (b.savedCount != null) return savedScreen(b);

  return `<div class="gud-flow">
    <div class="gud-page-head">
      <div><div class="gud-page-crumb">GUDANG</div><h1 class="gud-page-title">Goods Out</h1>
      <p class="gud-page-lede">Keluarkan barang ke bidang. Setiap baris tercatat sebagai pergerakan tersendiri.</p></div>
    </div>

    ${!dept ? departmentPicker(st, b) : itemLoop(st, b, dept)}
  </div>`;
}

function departmentPicker(st, b) {
  const q = b.departmentQuery.trim().toLowerCase();
  const matches = q
    ? st.data.departments.filter((d) => d.name.toLowerCase().includes(q))
    : st.data.departments;
  return `<div class="gud-card -pad gud-flow-step">
    <div class="gud-field"><span>Bidang</span>
      <input class="gud-input" data-act="gud-go-dept-query" value="${esc(b.departmentQuery)}" placeholder="Cari bidang…" autocomplete="off" autofocus />
    </div>
    ${matches.length
      ? `<div class="gud-picker-list gud-mt">${matches.map((d) => `
          <button type="button" class="gud-picker-row" data-act="gud-go-dept-pick" data-id="${esc(d.departmentId)}">${esc(d.name)}</button>`).join('')}</div>`
      : `<div class="gud-mt">
          <div class="gud-muted">${st.data.departments.length === 0 ? 'Belum ada bidang terdaftar di Manajemen User.' : 'Tidak ada bidang yang cocok.'}</div>
        </div>`}
  </div>`;
}

function itemLoop(st, b, dept) {
  const consumables = st.data.items.filter((i) => i.itemType === ITEM_TYPE.CONSUMABLE && i.active);
  const q = b.itemQuery.trim();
  const matches = q ? consumables.filter((i) => itemMatchesQuery(i, q)).slice(0, 8) : [];
  const selected = b.selectedItemId ? consumables.find((i) => i.itemId === b.selectedItemId) : null;

  return `<div class="gud-flow-step">
    <div class="gud-flow-dept">
      ${icon('users', { size: 14, tone: 'text-faint' })} <span>${esc(dept.name)}</span>
      <button type="button" class="gud-link-btn" data-act="gud-go-dept-clear">Ganti</button>
    </div>

    <div class="gud-card -pad gud-mt">
      ${!selected ? `
        <div class="gud-field"><span>Cari Item</span>
          <input class="gud-input" data-act="gud-go-item-query" value="${esc(b.itemQuery)}" placeholder="Nama atau alias item…" autocomplete="off" autofocus />
        </div>
        ${q ? (matches.length
          ? `<div class="gud-picker-list gud-mt">${matches.map((i) => `
              <button type="button" class="gud-picker-row" data-act="gud-go-item-pick" data-id="${esc(i.itemId)}">${esc(i.name)}</button>`).join('')}</div>`
          : `<div class="gud-mt">
              <div class="gud-muted">Tidak ada item yang cocok.</div>
              <button type="button" class="gud-link-btn gud-mt" data-act="gud-cat-add-item-goodsout">${icon('plus', { size: 12 })} Tambah "${esc(q)}" sebagai item baru</button>
            </div>`) : ''}
      ` : `
        <div class="gud-flow-selected">
          <span class="gud-flow-selected-name">${esc(selected.name)}</span>
          <button type="button" class="gud-link-btn" data-act="gud-go-item-clear">Ganti</button>
        </div>
        <div class="gud-field gud-mt"><span>Jumlah</span>
          <div class="gud-qty-row">
            <button type="button" class="gud-icon-btn" data-act="gud-go-qty-minus">${icon('minus', { size: 15 })}</button>
            <input class="gud-input gud-qty-input" data-act="gud-go-qty" type="number" min="0" value="${esc(b.quantity)}" autofocus />
            <button type="button" class="gud-icon-btn" data-act="gud-go-qty-plus">${icon('plus', { size: 15 })}</button>
          </div>
        </div>
        <button type="button" class="gud-btn -primary gud-mt" data-act="gud-go-confirm-line" ${Number(b.quantity) > 0 ? '' : 'disabled'}>
          ${icon('check', { size: 15 })} Konfirmasi Baris
        </button>
      `}
    </div>

    ${lineList(b)}

    ${b.error ? `<div class="gud-flow-error gud-mt">${esc(b.error)}</div>` : ''}

    <div class="gud-flow-foot gud-mt">
      <span class="gud-hint">${kbdRow(['Ctrl', 'Enter'])} simpan batch</span>
      <button type="button" class="gud-btn -primary -big" data-act="gud-go-save" ${b.lines.length && !b.saving ? '' : 'disabled'}>
        ${b.saving ? 'Menyimpan…' : `${icon('check-circle', { size: 16 })} Simpan (${b.lines.length} baris)`}
      </button>
    </div>
  </div>`;
}

function lineList(b) {
  if (!b.lines.length) return `<div class="gud-mt">${emptyState({ iconName: 'arrow-out', title: 'Belum ada baris', hint: 'Cari item lalu masukkan jumlah untuk menambah baris pertama.' })}</div>`;
  return `<div class="gud-line-list gud-mt gud-stagger">${b.lines.map((l, i) => `
    <div class="gud-line-row">
      <span class="gud-line-name">${esc(l.name)}</span>
      <span class="gud-line-qty">-${fmtQty(l.quantity)}</span>
      <button type="button" class="gud-icon-btn -sm" data-act="gud-go-remove-line" data-id="${i}" aria-label="Hapus">${icon('close', { size: 13 })}</button>
    </div>`).join('')}</div>`;
}

function savedScreen(b) {
  return `<div class="gud-card -pad gud-flow-success">
    ${icon('check-circle', { size: 32, tone: 'c-green' })}
    <div class="gud-empty-t">Goods Out tersimpan</div>
    <div class="gud-empty-h">${b.savedCount} baris pergerakan telah dicatat.</div>
    <button type="button" class="gud-btn -primary gud-mt" data-act="gud-go-new">Buat Batch Baru</button>
  </div>`;
}

async function trySave(st, c, render, refreshCatalog) {
  const b = ensure(st);
  if (!b.lines.length || b.saving) return;
  b.saving = true; b.error = null; render();
  const res = await executeGoodsOut({
    departmentId: b.departmentId,
    lines: b.lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity })),
    actorId: c.actorId,
  });
  b.saving = false;
  if (!res.ok) { b.error = res.error.message; render(); return; }
  const count = b.lines.length;
  st.goodsOut = blankBatch();
  st.goodsOut.savedCount = count;
  await refreshCatalog();
}

export const goodsOutHandlers = {
  onClick(st, act, el, c, render, refreshCatalog) {
    const b = ensure(st);
    switch (act) {
      case 'gud-go-dept-pick': b.departmentId = el.dataset.id; b.departmentQuery = ''; render(); break;
      case 'gud-go-dept-clear': b.departmentId = null; render(); break;
      case 'gud-go-item-pick': b.selectedItemId = el.dataset.id; b.itemQuery = ''; b.quantity = ''; render(); break;
      case 'gud-go-item-clear': b.selectedItemId = null; b.quantity = ''; render(); break;
      case 'gud-go-qty-plus': b.quantity = String((Number(b.quantity) || 0) + 1); render(); break;
      case 'gud-go-qty-minus': b.quantity = String(Math.max(0, (Number(b.quantity) || 0) - 1)); render(); break;
      case 'gud-go-confirm-line': {
        const item = st.data.items.find((i) => i.itemId === b.selectedItemId);
        const qty = Number(b.quantity);
        if (!item || !(qty > 0)) return;
        b.lines.push({ itemId: item.itemId, name: item.name, quantity: qty });
        b.selectedItemId = null; b.quantity = ''; b.itemQuery = '';
        render();
        break;
      }
      case 'gud-go-remove-line': b.lines.splice(Number(el.dataset.id), 1); render(); break;
      case 'gud-go-save': trySave(st, c, render, refreshCatalog); break;
      case 'gud-go-new': st.goodsOut = blankBatch(); render(); break;
      default: break;
    }
  },
  onInput(st, act, t, render) {
    const b = ensure(st);
    if (act === 'gud-go-dept-query') b.departmentQuery = t.value;
    else if (act === 'gud-go-item-query') b.itemQuery = t.value;
    else if (act === 'gud-go-qty') b.quantity = t.value;
    render();
  },
  trySave,
};
