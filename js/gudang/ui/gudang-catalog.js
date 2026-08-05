/* ============================================================
   GUDANG-CATALOG.JS — Contextual catalog creation + Edit Item (V1.28.0)

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

   Phase 10.3 (Item Visual Identity & Detail Experience) added Edit Item
   and a photo field to the SAME modal shell/body this file already used
   for Add Item — `itemFormBody()` renders both, differing only in the
   itemType control (editable radio vs. immutable read-only pill) and the
   title/CTA text. Editing calls the EXISTING item-repository.js#updateItem
   — no updateItemDetails(), no new repository, exactly per that phase's
   explicit instruction. A photo is just two more keys (imageStoragePath/
   imageContentType) in the Item's already-open `metadata` bag, uploaded
   through gudang-item-image.js's thin wrapper around js/firebase.js's
   EXISTING uploadFileToStorage()/downloadFileFromStorage() — no new
   upload service, no Image domain, no AssetImage repository.

   CREATE/EDIT ONLY — no archive UI here. That stays a documented future
   gap; archiveItem() still has zero UI caller after this.

   Calls the existing repository functions directly (item/location/
   asset-repository.js, all Phase 1) after building a contract-valid patch
   via the existing make*()/item-repository.js#updateItem. No new engine,
   no new repository, no new domain — this file only orchestrates, exactly
   like gudang-center.js's own header describes for itself.

   Phase 10.1 (Experience Review, Parts 3/4) redesigned the Add Item body:
   "it should feel like registering a physical item," not filling out a
   database form. Ukuran/Varian and Jenis are freeform descriptive tags
   stored in the Item's existing open `metadata` bag (no contract change).
   Kategori is freeform too (item-contract.js loosened its validation — see
   that file's own Phase 10.1 note). Consumable/Asset — the ONE field that
   genuinely can't become freeform, since it decides which engine an Item
   routes through for its lifetime (Doc 1 Art. V) — stays required, renamed
   ("Dicatat sebagai"), and rendered as a small radio pair (Phase 10.2);
   Edit Item shows the same control disabled (Phase 10.3: itemType is
   immutable once set).

   Kategori/Jenis/Lokasi all use the SAME freeform-with-suggestions pattern
   (freeformField() below): a plain <input list="…"> + <datalist>, not a
   custom dropdown widget. Lokasi is the one of the three backed by a real
   repository (Location, Phase 1) — on save, the typed text resolves to an
   existing Location by name or creates a new one inline.
   ============================================================ */

'use strict';

import { esc, icon } from './gudang-atoms.js';
import { ITEM_TYPE, makeItem } from '../contracts/item-contract.js';
import { makeLocation } from '../contracts/location-contract.js';
import { makeAsset } from '../contracts/asset-contract.js';
import { categoriesForItemType, categoryLabel } from '../config/gudang-categories.js';
import { normalizeText } from '../contracts/text-normalization.js';
import { createItem, updateItem } from '../repository/item-repository.js';
import { createLocation } from '../repository/location-repository.js';
import { createAsset } from '../repository/asset-repository.js';
import {
  uploadItemPhoto, loadItemPhotoUrl, itemHasPhoto, validateItemPhoto,
  createItemPhotoSession, startItemPhotoUpload, retryItemPhotoUpload, cancelItemPhotoUpload, deleteItemPhoto,
} from './gudang-item-image.js';
// v1.29.5 (Warehouse Upload Experience, Phase 2/8): Edit Item's photo now
// uploads EAGERLY (the instant a file is picked, not deferred to Save) —
// same shared session-rendering this release's Card/Drawer quick-replace
// uses (gudang-photo-upload.js), just parameterized with this dialog's
// own gud-cat-photo-retry/gud-cat-photo-cancel act names since the
// session lives on m.draft, not on st.photoUpload. Add Item still defers
// the actual upload to Save (there is no itemId to upload against until
// the item is created) — its instant local blob preview already satisfies
// "preview immediately, don't wait for upload" for that one surface; see
// this release's own architecture report for the full reasoning.
import { renderSessionOverlay } from './gudang-photo-upload.js';

function uniqueNonEmpty(arr) {
  return Array.from(new Set(arr.filter(Boolean)));
}

/** One <input list> + <datalist> pair — freeform text with suggestions,
 *  reused for Jenis/Kategori/Lokasi (Part 4: "type, autocomplete, Enter"). */
function freeformField(label, act, value, suggestions, placeholder) {
  const listId = `dl-${act}`;
  return `<div class="gud-field"><span>${esc(label)} <span class="gud-opt">(opsional)</span></span>
    <input class="gud-input" data-act="${esc(act)}" list="${listId}" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off" />
    <datalist id="${listId}">${suggestions.map((s) => `<option value="${esc(s)}"></option>`).join('')}</datalist>
  </div>`;
}

const CATALOG_TITLE = {
  addItem: 'Tambah Item', editItem: 'Edit Item', addLocation: 'Tambah Lokasi', addAssetUnit: 'Tambah Unit Aset',
};

/** Same id scheme consumable/goods-in-engine.js already uses for movementId
 *  — not a shared utility (only a few call sites here, one file). */
function generateId(prefix) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function renderCatalogModal(st, c) {
  const m = st.modal;
  if (!m) return '';
  const body = m.kind === 'addItem' ? itemFormBody(st, m, false)
    : m.kind === 'editItem' ? itemFormBody(st, m, true)
    : m.kind === 'addLocation' ? addLocationBody(st, m)
    : addAssetUnitBody(st, m);

  return `<div class="gud-scrim -open -center" data-act="gud-scrim">
    <div class="gud-modal-box">
      <div class="gud-modal-head">
        <div>
          <div class="gud-modal-kicker">GUDANG</div>
          <h2 class="gud-modal-title">${esc(CATALOG_TITLE[m.kind])}</h2>
        </div>
        <button type="button" class="gud-icon-btn" data-act="gud-cat-cancel" aria-label="Tutup" title="Tutup">${icon('close', { size: 16 })}</button>
      </div>
      <div class="gud-modal-body">
        ${body}
        ${m.error ? `<div class="gud-flow-error">${esc(m.error)}</div>` : ''}
      </div>
      <div class="gud-modal-foot">
        <span class="gud-modal-hint">Esc untuk batal</span>
        <div class="gud-modal-actions">
          <button type="button" class="gud-btn -ghost" data-act="gud-cat-cancel">Batal</button>
          <button type="button" class="gud-btn -primary" data-act="gud-cat-confirm" ${m.saving || photoStillUploading(m) ? 'disabled' : ''}>
            ${photoStillUploading(m) ? 'Menunggu foto…' : m.saving ? 'Menyimpan…' : `${icon('check', { size: 14 })} Simpan`}
          </button>
        </div>
      </div>
    </div>
  </div>`;
}

/** v1.29.5: true while Edit Item's eager photo upload is still
 *  'preparing'/'uploading' — Save must wait for it to settle (either
 *  'done', so the just-uploaded storagePath is used, or 'error', so the
 *  user can Retry/Cancel first) rather than silently saving mid-flight. */
function photoStillUploading(m) {
  const s = m.draft && m.draft.photoSession;
  return !!(s && (s.status === 'preparing' || s.status === 'uploading'));
}

/** Add Item / Edit Item share the exact same field set (Phase 10.3) — only
 *  the itemType control (editable vs. immutable) and title/CTA differ. */
function itemFormBody(st, m, isEdit) {
  const d = m.draft;
  const jenisSuggestions = uniqueNonEmpty(st.data.items.map((i) => i.metadata?.jenis));
  const kategoriSuggestions = uniqueNonEmpty([
    ...categoriesForItemType(d.itemType).map((cat) => cat.label),
    ...st.data.items.map((i) => i.category && categoryLabel(i.category)),
  ]);
  const lokasiSuggestions = uniqueNonEmpty(st.data.locations.map((l) => l.name));

  return `
    <div class="gud-field"><span>Nama Barang <span class="gud-req">*</span></span>
      <input class="gud-input" data-act="gud-cat-field-name" value="${esc(d.name)}" placeholder="mis. Kertas A4, Super Glue…" autocomplete="off" autofocus /></div>

    ${photoField(d, isEdit)}

    <div class="gud-field"><span>Ukuran / Varian <span class="gud-opt">(opsional)</span></span>
      <input class="gud-input" data-act="gud-cat-field-variant" value="${esc(d.variant)}" placeholder="mis. 25 gr, 500 ml, Merah, XL" autocomplete="off" /></div>

    ${freeformField('Merk / Jenis', 'gud-cat-field-jenis', d.jenis, jenisSuggestions, 'mis. Alat Tulis, Consumable Kantor')}
    ${freeformField('Kategori', 'gud-cat-field-category', d.category, kategoriSuggestions, 'mis. ATK, Cleaning')}
    ${freeformField('Lokasi', 'gud-cat-field-location', d.locationName, lokasiSuggestions, 'mis. Gudang Utama')}

    <div class="gud-field"><span>Alias <span class="gud-opt">(opsional, pisahkan koma — boleh sama dengan alias item lain)</span></span>
      <input class="gud-input" data-act="gud-cat-field-alias" value="${esc(d.aliases)}" placeholder="mis. lem, tinta" autocomplete="off" /></div>

    <div class="gud-field-secondary">
      <span class="gud-field-secondary-label">Dicatat sebagai${isEdit ? ' <span class="gud-opt">(tidak dapat diubah)</span>' : ''}</span>
      <div class="gud-radio-row">
        <label class="gud-radio"><input type="radio" name="gud-cat-itemtype" data-act="gud-cat-set-type" data-val="${ITEM_TYPE.CONSUMABLE}" ${d.itemType === ITEM_TYPE.CONSUMABLE ? 'checked' : ''} ${isEdit ? 'disabled' : ''} /><span class="gud-radio-mark"></span>Consumable</label>
        <label class="gud-radio"><input type="radio" name="gud-cat-itemtype" data-act="gud-cat-set-type" data-val="${ITEM_TYPE.ASSET}" ${d.itemType === ITEM_TYPE.ASSET ? 'checked' : ''} ${isEdit ? 'disabled' : ''} /><span class="gud-radio-mark"></span>Asset</label>
      </div>
    </div>`;
}

/** Drag & drop / browse / paste photo field (Phase 10.3; upload timing
 *  redesigned v1.29.5). The drop zone itself carries
 *  data-act="gud-cat-photo-zone" so gudang-center.js's delegated
 *  dragover/drop/click listeners can find it without a new per-instance
 *  DOM reference — same "one delegated listener" discipline as every
 *  other Gudang interaction.
 *
 *  Add Item (isEdit=false): unchanged — d.photoPreviewUrl is a plain
 *  local blob: preview, the file itself uploads later at Save (no itemId
 *  exists to upload against until then; see the v1.29.5 architecture
 *  report for why this one surface keeps its upload deferred).
 *  Edit Item (isEdit=true): d.photoSession (if any) takes over as the
 *  preview source — it's the NEW file being uploaded EAGERLY in the
 *  background (Phase 8) — with a live progress/error+retry overlay on
 *  top of it. No session yet (nothing new picked) falls back to
 *  d.photoPreviewUrl, the EXISTING item's current photo. */
function photoField(d, isEdit) {
  const session = isEdit ? d.photoSession : null;
  const previewUrl = session ? session.previewUrl : d.photoPreviewUrl;
  const overlay = renderSessionOverlay(session, { retryAct: 'gud-cat-photo-retry', cancelAct: 'gud-cat-photo-cancel' });
  return `<div class="gud-field"><span>Foto Item <span class="gud-opt">(opsional)</span></span>
    <div class="gud-photo-drop${previewUrl ? ' -filled' : ''}" data-act="gud-cat-photo-zone" tabindex="0" role="button" aria-label="Unggah foto item" title="Seret, klik, atau tempel untuk mengunggah foto">
      ${previewUrl
        ? `<img class="gud-photo-preview" src="${esc(previewUrl)}" alt="" />
           ${overlay}
           <div class="gud-photo-drop-actions">
             <button type="button" class="gud-link-btn" data-act="gud-cat-photo-browse">Ganti</button>
             <button type="button" class="gud-link-btn -danger" data-act="gud-cat-photo-remove">Hapus</button>
           </div>`
        : `<span class="gud-photo-drop-ic">${icon('package', { size: 22, tone: 'text-faint' })}</span>
           <span class="gud-photo-drop-t">Seret &amp; lepas foto, klik untuk memilih, atau tempel (Ctrl+V)</span>`}
      <input type="file" class="gud-photo-file-input" data-act="gud-cat-field-photo" accept="image/*" tabindex="-1" />
    </div>
    ${d.photoError ? `<div class="gud-flow-error">${esc(d.photoError)}</div>` : ''}
  </div>`;
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

/** Shared blank draft for the Add Item modal, whichever screen opens it —
 *  `prefillName` carries over whatever the triggering picker's own search
 *  query already was (Doc 1: don't make the user retype what they just
 *  typed to discover the item didn't exist yet). */
function blankItemDraft(prefillName) {
  return {
    name: prefillName || '', variant: '', jenis: '', category: '',
    locationName: '', aliases: '', itemType: ITEM_TYPE.CONSUMABLE,
    photoFile: null, photoPreviewUrl: '', photoError: null, photoRemoved: false,
    photoSession: null, // v1.29.5: unused by Add Item (upload stays deferred to Save) — declared for shape symmetry with itemDraftFromExisting.
    existingStoragePath: null, existingContentType: null,
  };
}

/** Pre-fills an Edit Item draft from an existing Item. The photo preview
 *  itself loads asynchronously after the modal opens (see
 *  catalogHandlers.onClick's 'gud-cat-edit-item' case) — existingStoragePath
 *  is set here synchronously so Save behaves correctly even if the user
 *  saves before that download resolves. */
function itemDraftFromExisting(item) {
  return {
    name: item.name, variant: item.metadata?.variant || '', jenis: item.metadata?.jenis || '',
    category: item.category ? categoryLabel(item.category) : '',
    locationName: '', // resolved below once locations are available to the caller
    aliases: item.aliases.join(', '), itemType: item.itemType,
    photoFile: null, photoPreviewUrl: '', photoError: null, photoRemoved: false,
    photoSession: null, // v1.29.5: set once the user picks a NEW file (applyPhotoFile) — see photoField's own header for the precedence over photoPreviewUrl.
    existingStoragePath: item.metadata?.imageStoragePath || null,
    existingContentType: item.metadata?.imageContentType || null,
  };
}

/** v1.29.4 (Bulk Operations, Phase 3: Bulk Edit): exported so Bulk Edit's
 *  Location field can resolve/create a Location by typed name exactly the
 *  same way Add/Edit Item already does — never a second implementation of
 *  "typed text -> existing Location by normalized name, or create one." */
export async function resolveOrCreateLocationId(st, locationNameRaw) {
  const locationName = (locationNameRaw || '').trim();
  if (!locationName) return { ok: true, locationId: null };
  const normalized = normalizeText(locationName);
  const existing = st.data.locations.find((l) => normalizeText(l.name) === normalized);
  if (existing) return { ok: true, locationId: existing.locationId };
  const locRes = await createLocation(makeLocation({ locationId: generateId('loc'), name: locationName }));
  if (!locRes.ok) return { ok: false, error: locRes.error.message };
  return { ok: true, locationId: locRes.data.locationId };
}

/** "Remove photo" semantics — discard EVERYTHING currently shown: the
 *  existing item's own photo blob AND any in-flight replacement's blob
 *  alike (both are being thrown away). */
function revokePreview(d) {
  if (d.photoPreviewUrl && d.photoPreviewUrl.startsWith('blob:')) URL.revokeObjectURL(d.photoPreviewUrl);
  if (d.photoSession && d.photoSession.previewUrl && d.photoSession.previewUrl.startsWith('blob:')) URL.revokeObjectURL(d.photoSession.previewUrl);
}

/** "Cancel this ONE attempt" semantics — discard only a session's own
 *  blob, deliberately leaving d.photoPreviewUrl (the EXISTING item's
 *  photo, a separate blob) untouched so photoField() correctly falls
 *  back to showing it again once the session is cleared. */
function revokeSessionPreviewOnly(session) {
  if (session && session.previewUrl && session.previewUrl.startsWith('blob:')) URL.revokeObjectURL(session.previewUrl);
}

function applyPhotoFile(st, file, render) {
  const m = st.modal;
  if (!m || (m.kind !== 'addItem' && m.kind !== 'editItem')) return;
  const invalid = validateItemPhoto(file);
  if (invalid) { m.draft.photoError = invalid; render(); return; }
  m.draft.photoError = null;
  m.draft.photoRemoved = false;

  if (m.kind === 'addItem') {
    // Upload stays deferred to Save — no itemId exists to upload against
    // yet (see this release's architecture report for the full reasoning).
    revokePreview(m.draft);
    m.draft.photoFile = file;
    m.draft.photoPreviewUrl = URL.createObjectURL(file);
    render();
    return;
  }

  // editItem (v1.29.5, Phase 2/8): preview instantly, upload EAGERLY in
  // the background — Save just reads the session's already-settled
  // result (photoStillUploading() gates Save while it's still in flight).
  if (m.draft.photoSession) cancelItemPhotoUpload(m.draft.photoSession);
  revokeSessionPreviewOnly(m.draft.photoSession);
  const session = createItemPhotoSession(file, URL.createObjectURL(file));
  m.draft.photoSession = session;
  render();
  startItemPhotoUpload(session, m.context.itemId, () => {
    // Stale-session guard: the modal may have closed, or an even newer
    // file may have been picked since — never act on a superseded session.
    if (st.modal && st.modal.kind === 'editItem' && st.modal.draft.photoSession === session) render();
  });
}

/* ── handlers ─────────────────────────────────────────────────────────── */
export const catalogHandlers = {
  onClick(st, act, el, c, render, refreshCatalog) {
    switch (act) {
      case 'gud-cat-add-item-home':
        st.modal = { kind: 'addItem', context: 'home', draft: blankItemDraft(el.dataset.val), saving: false, error: null };
        render(); break;
      case 'gud-cat-add-item-goodsout':
        st.modal = { kind: 'addItem', context: 'goodsOut', draft: blankItemDraft((st.goodsOut && st.goodsOut.itemQuery) || el.dataset.val), saving: false, error: null };
        render(); break;
      case 'gud-cat-add-item-goodsin':
        st.modal = { kind: 'addItem', context: 'goodsIn', draft: blankItemDraft((st.goodsIn && st.goodsIn.itemQuery) || el.dataset.val), saving: false, error: null };
        render(); break;
      case 'gud-cat-add-item-search':
        st.modal = { kind: 'addItem', context: 'search', draft: blankItemDraft(el.dataset.val), saving: false, error: null };
        render(); break;
      case 'gud-cat-edit-item': {
        const item = st.data.items.find((i) => i.itemId === el.dataset.id);
        if (!item) return;
        const loc = item.defaultLocationId ? st.data.locations.find((l) => l.locationId === item.defaultLocationId) : null;
        const draft = itemDraftFromExisting(item);
        draft.locationName = loc ? loc.name : '';
        st.modal = { kind: 'editItem', context: { itemId: item.itemId }, draft, saving: false, error: null };
        render();
        if (itemHasPhoto(item)) {
          loadItemPhotoUrl(item.metadata.imageStoragePath, item.metadata.imageContentType).then((res) => {
            const stillOpen = st.modal && st.modal.kind === 'editItem' && st.modal.context.itemId === item.itemId;
            if (stillOpen && res.ok) { st.modal.draft.photoPreviewUrl = res.url; render(); }
          });
        }
        break;
      }
      case 'gud-cat-add-loc-opname':
        st.modal = { kind: 'addLocation', context: 'opname', draft: { name: '', parentLocationId: '' }, saving: false, error: null };
        render(); break;
      case 'gud-cat-add-asset-unit':
        st.modal = { kind: 'addAssetUnit', context: { itemId: el.dataset.id }, draft: { identity: '', locationId: '' }, saving: false, error: null };
        render(); break;
      case 'gud-cat-cancel': {
        if (st.modal && (st.modal.kind === 'addItem' || st.modal.kind === 'editItem')) {
          // v1.29.5: an eager Edit-Item upload may have already SUCCEEDED
          // (photo sitting in Storage) even though the modal is being
          // abandoned before Save — clean it up (Storage Safety), not
          // just the local blob preview.
          const s = st.modal.draft.photoSession;
          if (s) {
            cancelItemPhotoUpload(s);
            if (s.status === 'done' && s.result && s.result.storagePath) deleteItemPhoto(s.result.storagePath).catch(() => {});
          }
          revokePreview(st.modal.draft);
        }
        st.modal = null; render(); break;
      }
      case 'gud-cat-set-type': {
        const m = st.modal;
        if (!m || m.kind !== 'addItem') return; // editItem's radios are disabled — itemType is immutable
        m.draft.itemType = el.dataset.val;
        render(); break;
      }
      case 'gud-cat-photo-zone':
      case 'gud-cat-photo-browse': {
        const input = el.closest('.gud-photo-drop')?.querySelector('input[type="file"]') || el.querySelector('input[type="file"]');
        if (input) input.click();
        break;
      }
      case 'gud-cat-photo-remove': {
        const m = st.modal;
        if (!m) return;
        const s = m.draft.photoSession;
        if (s) {
          cancelItemPhotoUpload(s);
          if (s.status === 'done' && s.result && s.result.storagePath) deleteItemPhoto(s.result.storagePath).catch(() => {});
        }
        revokePreview(m.draft);
        m.draft.photoFile = null; m.draft.photoPreviewUrl = ''; m.draft.photoSession = null; m.draft.photoError = null; m.draft.photoRemoved = true;
        render(); break;
      }
      // v1.29.5 (Phase 7 — Retry/Cancel, Edit Item's eager upload only;
      // Add Item never creates a session, so these are no-ops there).
      case 'gud-cat-photo-retry': {
        const m = st.modal;
        if (!m || !m.draft.photoSession) return;
        const session = m.draft.photoSession;
        retryItemPhotoUpload(session, m.context.itemId, () => {
          if (st.modal && st.modal.kind === 'editItem' && st.modal.draft.photoSession === session) render();
        });
        render(); break;
      }
      case 'gud-cat-photo-cancel': {
        const m = st.modal;
        if (!m || !m.draft.photoSession) return;
        cancelItemPhotoUpload(m.draft.photoSession);
        revokeSessionPreviewOnly(m.draft.photoSession);
        m.draft.photoSession = null;
        m.draft.photoError = null;
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
      case 'gud-cat-field-variant': d.variant = t.value; break;
      case 'gud-cat-field-jenis': d.jenis = t.value; break;
      case 'gud-cat-field-category': d.category = t.value; break;
      case 'gud-cat-field-location': d.locationName = t.value; break;
      case 'gud-cat-field-alias': d.aliases = t.value; break;
      case 'gud-cat-field-parent-loc': d.parentLocationId = t.value; break;
      case 'gud-cat-field-identity': d.identity = t.value; break;
      case 'gud-cat-field-asset-loc': d.locationId = t.value; break;
      case 'gud-cat-field-photo': {
        const file = t.files && t.files[0];
        if (file) applyPhotoFile(st, file, render);
        return;
      }
      default: return;
    }
    render();
  },
  /** Drag-and-drop and clipboard-paste both hand a raw File to the same
   *  path browse/onInput already uses — wired from gudang-center.js's
   *  delegated dragover/drop/paste listeners (Phase 10.3; no other Gudang
   *  interaction needed these DOM event types before). */
  onPhotoFile(st, file, render) { applyPhotoFile(st, file, render); },
};

async function confirmCatalogCreate(st, c, render, refreshCatalog) {
  const m = st.modal;
  if (!m || m.saving) return;
  m.error = null;

  if ((m.kind === 'addItem' || m.kind === 'editItem') && !m.draft.name.trim()) { m.error = 'Nama Barang wajib diisi.'; render(); return; }
  if (m.kind === 'addLocation' && !m.draft.name.trim()) { m.error = 'Nama wajib diisi.'; render(); return; }
  if (m.kind === 'addAssetUnit' && !m.draft.identity.trim()) { m.error = 'Serial/tag wajib diisi.'; render(); return; }

  m.saving = true; render();

  if (m.kind === 'editItem') {
    await confirmEditItem(st, m, render, refreshCatalog);
    return;
  }

  let seed, newId;
  try {
    if (m.kind === 'addItem') {
      newId = generateId('item');
      const metadata = {};
      if (m.draft.variant.trim()) metadata.variant = m.draft.variant.trim();
      if (m.draft.jenis.trim()) metadata.jenis = m.draft.jenis.trim();

      if (m.draft.photoFile) {
        const photoRes = await uploadItemPhoto(newId, m.draft.photoFile);
        if (!photoRes.ok) { m.saving = false; m.error = photoRes.error; render(); return; }
        metadata.imageStoragePath = photoRes.storagePath;
        metadata.imageContentType = photoRes.contentType;
      }

      // Lokasi (Part 4): typed text resolves to an existing Location by
      // name, or creates one on the spot — "type, autocomplete, Enter,
      // created automatically," no separate management screen.
      const locRes = await resolveOrCreateLocationId(st, m.draft.locationName);
      if (!locRes.ok) { m.saving = false; m.error = locRes.error; render(); return; }

      seed = makeItem({
        itemId: newId, name: m.draft.name.trim(), itemType: m.draft.itemType,
        aliases: m.draft.aliases.split(',').map((s) => s.trim()).filter(Boolean),
        category: m.draft.category.trim() || null,
        defaultLocationId: locRes.locationId, metadata,
      });
    } else if (m.kind === 'addLocation') {
      newId = generateId('loc');
      seed = makeLocation({ locationId: newId, name: m.draft.name.trim(), parentLocationId: m.draft.parentLocationId || null });
    } else if (m.kind === 'addAssetUnit') {
      newId = generateId('asset');
      seed = makeAsset({ assetId: newId, itemId: m.context.itemId, identity: m.draft.identity.trim(), locationId: m.draft.locationId || null });
    }
  } catch (err) {
    m.saving = false; m.error = err.message; render(); return;
  }

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

/** Edit Item save path — builds a patch and calls the EXISTING
 *  item-repository.js#updateItem (Phase 10.3's explicit instruction: reuse
 *  it, never add updateItemDetails() or a second repository). Deliberately
 *  does NOT touch st.detail — leaving the Item Detail drawer open with its
 *  id unchanged is what makes "Save -> returns to the same Item Detail, no
 *  full reload" work: refreshCatalog() below re-fetches st.data.items, and
 *  the drawer's own render re-reads the (now updated) item from there. */
async function confirmEditItem(st, m, render, refreshCatalog) {
  const existing = st.data.items.find((i) => i.itemId === m.context.itemId);
  if (!existing) { m.saving = false; m.error = 'Item tidak ditemukan (mungkin sudah dihapus).'; render(); return; }

  const metadata = { ...existing.metadata };
  if (m.draft.variant.trim()) metadata.variant = m.draft.variant.trim(); else delete metadata.variant;
  if (m.draft.jenis.trim()) metadata.jenis = m.draft.jenis.trim(); else delete metadata.jenis;

  // v1.29.5 (Upload Experience, Phase 8): the photo — if the user picked
  // one — was already uploaded EAGERLY the moment it was selected
  // (applyPhotoFile below kicks off startItemPhotoUpload immediately, not
  // here at Save) — this just reads the already-settled result. The Save
  // button stays disabled while a session is still 'preparing'/'uploading'
  // (renderCatalogModal's `m.saving`/confirm-button gate, below), so
  // reaching 'error' here without the user having a chance to Retry/
  // Cancel first should not normally happen — guarded anyway rather than
  // silently saving an incomplete photo state.
  let oldStoragePathToDelete = null;
  if (m.draft.photoSession) {
    const session = m.draft.photoSession;
    if (session.status === 'done' && session.result) {
      metadata.imageStoragePath = session.result.storagePath;
      metadata.imageContentType = session.result.contentType;
      oldStoragePathToDelete = existing.metadata && existing.metadata.imageStoragePath || null;
    } else if (session.status === 'error') {
      m.saving = false; m.error = session.error || 'Unggah foto gagal. Coba lagi atau hapus foto.'; render(); return;
    } else {
      m.saving = false; m.error = 'Unggah foto masih berlangsung. Tunggu sebentar lalu simpan lagi.'; render(); return;
    }
  } else if (m.draft.photoRemoved) {
    delete metadata.imageStoragePath;
    delete metadata.imageContentType;
    oldStoragePathToDelete = existing.metadata && existing.metadata.imageStoragePath || null;
  }

  const locRes = await resolveOrCreateLocationId(st, m.draft.locationName);
  if (!locRes.ok) { m.saving = false; m.error = locRes.error; render(); return; }

  const patch = {
    name: m.draft.name.trim(),
    aliases: m.draft.aliases.split(',').map((s) => s.trim()).filter(Boolean),
    category: m.draft.category.trim() || null,
    defaultLocationId: locRes.locationId,
    metadata,
  };
  const res = await updateItem(existing.itemId, patch);
  m.saving = false;
  if (!res.ok) { m.error = res.error.message; render(); return; }

  // Force Item Detail to re-download the photo rather than keep showing
  // whatever it cached before this save (only matters when the photo
  // itself changed, but resetting unconditionally is cheap and can't be
  // stale either way).
  if (st.detail && st.detail.kind === 'item' && st.detail.id === existing.itemId) {
    st.detail.imageLoaded = null;
    st.detail.imageUrl = null;
  }
  revokePreview(m.draft);
  st.modal = null;
  // Storage Safety (Phase 10): delete the PREVIOUS photo only now — after
  // the new reference is confirmed written — best-effort, never blocking
  // or failing the save the user already sees as successful.
  if (oldStoragePathToDelete) deleteItemPhoto(oldStoragePathToDelete).catch(() => {});
  await refreshCatalog();
}
