/* ============================================================
   GUDANG-CATALOG.JS — Contextual catalog creation (V1.28.0 Phase 10)

   Goods In/Out, Stock Opname, and Item Detail all assume the catalog
   (Item/Location/Asset) already exists — nothing in Phases 1-9 ever
   populates it. This file closes that gap the same way the rest of the
   Experience Layer works: one small modal, opened at the exact point a
   user discovers the catalog is missing something, never a separate
   "Catalog" screen or nav destination (Doc 4: no redesigned navigation).

   No Add-Department here (Phase 10.1): "departemen" is now the real Bidang
   roster read live from User Management (gudang-bidang-source.js) — not
   something a Gudang user creates. Department stays a ratified domain with
   its own repository (Doc 3 Ch.03); this file just never had a reason to
   write to it.

   CREATE ONLY — no edit/archive UI here. That stays a documented future
   gap; updateItem/archiveItem etc. still have zero UI callers after this.

   Calls the existing repository create* functions directly
   (item/location/asset-repository.js, all Phase 1) after building a
   contract-valid object via the existing make*() constructors
   (item/location/asset-contract.js). No new engine, no new repository, no
   new domain — this file only orchestrates, exactly like gudang-center.js's
   own header describes for itself.
   ============================================================ */

'use strict';

import { esc, icon } from './gudang-atoms.js';
import { ITEM_TYPE, makeItem } from '../contracts/item-contract.js';
import { makeLocation } from '../contracts/location-contract.js';
import { makeAsset } from '../contracts/asset-contract.js';
import { categoriesForItemType } from '../config/gudang-categories.js';
import { createItem } from '../repository/item-repository.js';
import { createLocation } from '../repository/location-repository.js';
import { createAsset } from '../repository/asset-repository.js';

const CATALOG_TITLE = {
  addItem: 'Tambah Item', addLocation: 'Tambah Lokasi', addAssetUnit: 'Tambah Unit Aset',
};

/** Same id scheme consumable/goods-in-engine.js already uses for movementId
 *  — not a shared utility (only 4 call sites here, one file). */
function generateId(prefix) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function renderCatalogModal(st, c) {
  const m = st.modal;
  if (!m) return '';
  const body = m.kind === 'addItem' ? addItemBody(st, m)
    : m.kind === 'addLocation' ? addLocationBody(st, m)
    : addAssetUnitBody(st, m);

  return `<div class="gud-scrim -open -center" data-act="gud-scrim">
    <div class="gud-modal-box">
      <div class="gud-modal-head">
        <div>
          <div class="gud-modal-kicker">GUDANG</div>
          <h2 class="gud-modal-title">${esc(CATALOG_TITLE[m.kind])}</h2>
        </div>
        <button type="button" class="gud-icon-btn" data-act="gud-cat-cancel" aria-label="Tutup">${icon('close', { size: 16 })}</button>
      </div>
      <div class="gud-modal-body">
        ${body}
        ${m.error ? `<div class="gud-flow-error">${esc(m.error)}</div>` : ''}
      </div>
      <div class="gud-modal-foot">
        <span class="gud-modal-hint">Esc untuk batal</span>
        <div class="gud-modal-actions">
          <button type="button" class="gud-btn -ghost" data-act="gud-cat-cancel">Batal</button>
          <button type="button" class="gud-btn -primary" data-act="gud-cat-confirm" ${m.saving ? 'disabled' : ''}>
            ${m.saving ? 'Menyimpan…' : `${icon('check', { size: 14 })} Simpan`}
          </button>
        </div>
      </div>
    </div>
  </div>`;
}

function addItemBody(st, m) {
  const d = m.draft;
  const cats = categoriesForItemType(d.itemType);
  return `
    <div class="gud-field"><span>Nama</span>
      <input class="gud-input" data-act="gud-cat-field-name" value="${esc(d.name)}" placeholder="Nama item…" autocomplete="off" autofocus /></div>
    <div class="gud-field"><span>Jenis</span>
      <div class="gud-chips">
        <button type="button" class="gud-chip" data-on="${d.itemType === ITEM_TYPE.CONSUMABLE}" data-act="gud-cat-set-type" data-val="${ITEM_TYPE.CONSUMABLE}">Consumable</button>
        <button type="button" class="gud-chip" data-on="${d.itemType === ITEM_TYPE.ASSET}" data-act="gud-cat-set-type" data-val="${ITEM_TYPE.ASSET}">Asset</button>
      </div></div>
    <div class="gud-field"><span>Kategori</span>
      <select class="gud-input" data-act="gud-cat-field-category">
        <option value="">Pilih kategori…</option>
        ${cats.map((cat) => `<option value="${esc(cat.id)}" ${d.category === cat.id ? 'selected' : ''}>${esc(cat.label)}</option>`).join('')}
      </select></div>
    <div class="gud-field"><span>Alias <span class="gud-opt">(opsional, pisahkan koma)</span></span>
      <input class="gud-input" data-act="gud-cat-field-alias" value="${esc(d.aliases)}" placeholder="mis. tinta, tinta printer" autocomplete="off" /></div>
    <div class="gud-field"><span>Lokasi Default <span class="gud-opt">(opsional)</span></span>
      <select class="gud-input" data-act="gud-cat-field-default-loc">
        <option value="">Tanpa lokasi default</option>
        ${st.data.locations.map((l) => `<option value="${esc(l.locationId)}" ${d.defaultLocationId === l.locationId ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}
      </select></div>`;
}

function addLocationBody(st, m) {
  const d = m.draft;
  return `
    <div class="gud-field"><span>Nama</span>
      <input class="gud-input" data-act="gud-cat-field-name" value="${esc(d.name)}" placeholder="Nama lokasi…" autocomplete="off" autofocus /></div>
    <div class="gud-field"><span>Lokasi Induk <span class="gud-opt">(opsional)</span></span>
      <select class="gud-input" data-act="gud-cat-field-parent-loc">
        <option value="">Tanpa induk</option>
        ${st.data.locations.map((l) => `<option value="${esc(l.locationId)}" ${d.parentLocationId === l.locationId ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}
      </select></div>`;
}

function addAssetUnitBody(st, m) {
  const d = m.draft;
  const item = st.data.items.find((i) => i.itemId === m.context.itemId);
  return `
    ${item ? `<div class="gud-muted">Unit baru untuk <strong>${esc(item.name)}</strong></div>` : ''}
    <div class="gud-field"><span>Serial / Tag</span>
      <input class="gud-input" data-act="gud-cat-field-identity" value="${esc(d.identity)}" placeholder="Nomor seri / tag aset…" autocomplete="off" autofocus /></div>
    <div class="gud-field"><span>Lokasi <span class="gud-opt">(opsional)</span></span>
      <select class="gud-input" data-act="gud-cat-field-asset-loc">
        <option value="">Tanpa lokasi</option>
        ${st.data.locations.map((l) => `<option value="${esc(l.locationId)}" ${d.locationId === l.locationId ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}
      </select></div>`;
}

/* ── handlers ─────────────────────────────────────────────────────────── */
export const catalogHandlers = {
  onClick(st, act, el, c, render, refreshCatalog) {
    switch (act) {
      case 'gud-cat-add-item-home':
        st.modal = { kind: 'addItem', context: 'home', draft: { name: '', itemType: ITEM_TYPE.CONSUMABLE, category: '', aliases: '', defaultLocationId: '' }, saving: false, error: null };
        render(); break;
      case 'gud-cat-add-item-goodsout':
        st.modal = { kind: 'addItem', context: 'goodsOut', draft: { name: (st.goodsOut && st.goodsOut.itemQuery) || '', itemType: ITEM_TYPE.CONSUMABLE, category: '', aliases: '', defaultLocationId: '' }, saving: false, error: null };
        render(); break;
      case 'gud-cat-add-item-goodsin':
        st.modal = { kind: 'addItem', context: 'goodsIn', draft: { name: (st.goodsIn && st.goodsIn.itemQuery) || '', itemType: ITEM_TYPE.CONSUMABLE, category: '', aliases: '', defaultLocationId: '' }, saving: false, error: null };
        render(); break;
      case 'gud-cat-add-loc-opname':
        st.modal = { kind: 'addLocation', context: 'opname', draft: { name: '', parentLocationId: '' }, saving: false, error: null };
        render(); break;
      case 'gud-cat-add-asset-unit':
        st.modal = { kind: 'addAssetUnit', context: { itemId: el.dataset.id }, draft: { identity: '', locationId: '' }, saving: false, error: null };
        render(); break;
      case 'gud-cat-cancel': st.modal = null; render(); break;
      case 'gud-cat-set-type': {
        const m = st.modal;
        if (!m || m.kind !== 'addItem') return;
        m.draft.itemType = el.dataset.val; m.draft.category = '';
        render(); break;
      }
      case 'gud-cat-confirm': confirmCatalogCreate(st, c, render, refreshCatalog); break;
      default: break;
    }
  },
  onInput(st, act, t, render) {
    const m = st.modal;
    if (!m) return;
    const d = m.draft;
    switch (act) {
      case 'gud-cat-field-name': d.name = t.value; break;
      case 'gud-cat-field-alias': d.aliases = t.value; break;
      case 'gud-cat-field-category': d.category = t.value; break;
      case 'gud-cat-field-default-loc': d.defaultLocationId = t.value; break;
      case 'gud-cat-field-parent-loc': d.parentLocationId = t.value; break;
      case 'gud-cat-field-identity': d.identity = t.value; break;
      case 'gud-cat-field-asset-loc': d.locationId = t.value; break;
      default: return;
    }
    render();
  },
};

async function confirmCatalogCreate(st, c, render, refreshCatalog) {
  const m = st.modal;
  if (!m || m.saving) return;
  m.error = null;

  let seed, newId;
  try {
    if (m.kind === 'addItem') {
      if (!m.draft.name.trim()) { m.error = 'Nama wajib diisi.'; render(); return; }
      if (!m.draft.category) { m.error = 'Kategori wajib dipilih.'; render(); return; }
      newId = generateId('item');
      seed = makeItem({
        itemId: newId, name: m.draft.name.trim(), itemType: m.draft.itemType,
        aliases: m.draft.aliases.split(',').map((s) => s.trim()).filter(Boolean),
        category: m.draft.category,
        defaultLocationId: m.draft.defaultLocationId || null,
      });
    } else if (m.kind === 'addLocation') {
      if (!m.draft.name.trim()) { m.error = 'Nama wajib diisi.'; render(); return; }
      newId = generateId('loc');
      seed = makeLocation({ locationId: newId, name: m.draft.name.trim(), parentLocationId: m.draft.parentLocationId || null });
    } else if (m.kind === 'addAssetUnit') {
      if (!m.draft.identity.trim()) { m.error = 'Serial/tag wajib diisi.'; render(); return; }
      newId = generateId('asset');
      seed = makeAsset({ assetId: newId, itemId: m.context.itemId, identity: m.draft.identity.trim(), locationId: m.draft.locationId || null });
    }
  } catch (err) {
    m.error = err.message; render(); return;
  }

  m.saving = true; render();
  const res = m.kind === 'addItem' ? await createItem(seed)
    : m.kind === 'addLocation' ? await createLocation(seed)
    : await createAsset(seed);
  m.saving = false;
  if (!res.ok) { m.error = res.error.message; render(); return; }

  // Hand the new id back to whichever flow opened this modal, exactly the
  // way each flow already tracks its own selection (Doc 4: no duplicated
  // queries — refreshCatalog() below is the one existing re-fetch point).
  if (m.kind === 'addItem') {
    if (m.context === 'goodsOut' && st.goodsOut) { st.goodsOut.selectedItemId = newId; st.goodsOut.itemQuery = ''; }
    if (m.context === 'goodsIn' && st.goodsIn) { st.goodsIn.selectedItemId = newId; st.goodsIn.itemQuery = ''; }
  } else if (m.kind === 'addLocation' && m.context === 'opname' && st.opname) {
    st.opname.locationId = newId;
  }
  st.modal = null;
  await refreshCatalog();
}
