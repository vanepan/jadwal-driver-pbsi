/* ============================================================
   GUDANG-ITEM-IMAGE.JS — Item photo upload/display plumbing (Phase 10.3)

   "Image belongs to Item. Exactly the same way name belongs to Item."
   There is no Image domain, no AssetImage repository — a photo is just
   two more keys in the Item's already-open `metadata` bag (Doc 3 Ch.03:
   metadata is explicitly "open... never enumerated" in item-contract.js),
   written through the exact same updateItem()/createItem() every other
   Item field already goes through.

   STORAGE: reuses js/firebase.js's existing uploadFileToStorage()/
   downloadFileFromStorage() — the same primitive src/file-storage/
   file-storage-engine.js (Sarpras Intelligence) calls, NOT that engine
   itself (its SHA-256 dedup registry is a separate feature's
   infrastructure; coupling Gudang to it would be a cross-domain
   dependency this phase's "no new engines/domains" explicitly forbids).
   No new upload service, no second Firebase app instance.

   That file's own header is explicit: "no getDownloadURL() call (no
   signed/public URLs)" is a deliberate non-goal of this app's Storage
   layer, not an oversight — so this file stores `imageStoragePath`
   (never a public `imageUrl`) and displays photos by downloading the
   authenticated bytes (downloadFileFromStorage) and wrapping them in a
   local object URL, exactly like downloadFileFromStorage's existing
   preview caller (dataset-import-center.js) already does.

   PERFORMANCE (Doc 1 Art.IX, same discipline as analytics-engine.js's
   documented per-item cap): one Storage read per item whose photo is
   actually rendered — bounded by whichever screen calls this (Home's
   PAGE_SIZE, Item Detail's single item), and memoized in the caller's own
   `st.*ImageCache` for the session so scrolling/re-rendering never
   re-downloads a photo already resolved once. No thumbnail/resize
   pipeline exists — see this phase's report for that disclosed tradeoff.
   ============================================================ */

'use strict';

import { GUDANG_STORAGE_PREFIX } from '../config/gudang-paths.js';

const MAX_BYTES = 5 * 1024 * 1024; // 5MB — generous for a phone photo, small enough to stay a quick warehouse-floor upload
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/** @param {*} file @returns {string|null} an error message, or null if the file is an acceptable photo. */
export function validateItemPhoto(file) {
  if (!file) return 'Tidak ada file.';
  if (!ACCEPTED_TYPES.includes(file.type)) return 'Format tidak didukung. Gunakan JPG, PNG, WEBP, atau GIF.';
  if (file.size > MAX_BYTES) return 'Ukuran foto maksimal 5MB.';
  return null;
}

function safeExt(mimeType) {
  return { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }[mimeType] || 'bin';
}

/**
 * Uploads one photo for `itemId`. Each call gets a fresh timestamped path —
 * replacing a photo never overwrites the old object in Storage (this app's
 * Storage layer has no delete primitive, by the same explicit non-goal
 * js/firebase.js's own header documents) — the Item's metadata simply stops
 * pointing at the old path once saved.
 * @returns {Promise<{ok:boolean, storagePath:?string, contentType:?string, error:?string}>}
 */
export async function uploadItemPhoto(itemId, file) {
  const invalid = validateItemPhoto(file);
  if (invalid) return { ok: false, storagePath: null, contentType: null, error: invalid };
  const { uploadFileToStorage } = await import('../../firebase.js');
  const path = `${GUDANG_STORAGE_PREFIX}/${itemId}/${Date.now()}.${safeExt(file.type)}`;
  const res = await uploadFileToStorage(path, file);
  if (!res.ok) return { ok: false, storagePath: null, contentType: null, error: res.error };
  return { ok: true, storagePath: res.fullPath || path, contentType: file.type, error: null };
}

/**
 * Downloads a previously-uploaded photo's bytes and wraps them in a local
 * object URL for an <img> tag. Never a signed/public URL (see header).
 * @returns {Promise<{ok:boolean, url:?string, error:?string}>}
 */
export async function loadItemPhotoUrl(storagePath, contentType) {
  const { downloadFileFromStorage } = await import('../../firebase.js');
  const res = await downloadFileFromStorage(storagePath);
  if (!res.ok) return { ok: false, url: null, error: res.error };
  const blob = new Blob([res.bytes], { type: contentType || 'application/octet-stream' });
  return { ok: true, url: URL.createObjectURL(blob), error: null };
}

/** @param {import('../contracts/item-contract.js').Item} item */
export function itemHasPhoto(item) {
  return !!(item && item.metadata && item.metadata.imageStoragePath);
}
