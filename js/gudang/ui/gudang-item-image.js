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

   AMENDED — v1.29.5 (Warehouse Upload Experience): this file is now a
   THIN adapter over the new js/gudang/upload/upload-engine.js (a generic,
   domain-ignorant engine — same "engine knows nothing about the caller's
   domain" shape as v1.29.4's bulk-executor.js). compressPhotoForUpload()
   and validateItemPhoto() are UNCHANGED — investigated first, per this
   release's own brief: compression already existed here (1280px max
   dimension, 0.82 JPEG quality, best-effort fallback to the original on
   any failure) and is reused as-is, passed into the engine as its
   `compress` step, never reimplemented. uploadItemPhoto(itemId, file) —
   the original one-shot, no-progress signature every existing caller
   used — is UNCHANGED in behavior, now simply implemented by running one
   throwaway engine session (never duplicated logic). NEW exports —
   createItemPhotoSession/startItemPhotoUpload/retryItemPhotoUpload/
   cancelItemPhotoUpload — give the new upload UI (gudang-photo-upload.js)
   live progress and Retry/Cancel, which the old one-shot function never
   could. deleteItemPhoto() is genuinely new: js/firebase.js had NO delete
   primitive before this release (a replaced photo's old Storage object
   was orphaned forever) — now the Storage Safety sequence (Phase 10)
   can actually clean up after itself, once, only after the NEW photo is
   confirmed uploaded and the Item record is confirmed updated.
   ============================================================ */

'use strict';

import { GUDANG_STORAGE_PREFIX } from '../config/gudang-paths.js';
import {
  createUploadSession, runUpload, retryUpload, cancelUpload,
  validateUploadFile, ACCEPTED_IMAGE_TYPES, MAX_UPLOAD_BYTES,
} from '../upload/upload-engine.js';

// Phase 10.4.2 root cause ("upload hangs forever, no success, no failure"):
// the full chain from this file's calls down to the real Firebase
// uploadBytes()/getBytes() has no bound anywhere — a genuinely-hanging
// (never settling, not merely rejecting) request freezes the Promise
// forever, leaving the modal's `saving` flag stuck true with nothing to
// show the user. src/file-storage/retry-with-backoff.js#withTimeout
// already solved the exact same gap for the exact same underlying
// primitive one layer up (Sarpras Intelligence's own upload path) — this
// is a LOCAL copy of that same reasoning, not an import from src/, since
// Gudang's own doctrine (Doc 1 Art.X) forbids depending on that module.
// Turning a hang into an ordinary rejection is not "hiding" the failure —
// the existing error surfacing in gudang-catalog.js's confirmEditItem/
// confirmCatalogCreate (m.error = res.error) already displays whatever
// error this resolves to; it just never used to resolve at all.
const STORAGE_TIMEOUT_MS = 30000;
function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Waktu unggah habis. Periksa koneksi dan coba lagi.')), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** @param {*} file @returns {string|null} an error message, or null if the file is an acceptable photo.
 *  v1.29.5: delegates to upload-engine.js#validateUploadFile with this
 *  file's own (unchanged) limits — one validation implementation, not two
 *  copies of the same three checks. */
export function validateItemPhoto(file) {
  return validateUploadFile(file, { acceptedTypes: ACCEPTED_IMAGE_TYPES, maxBytes: MAX_UPLOAD_BYTES });
}

function safeExt(mimeType) {
  return { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }[mimeType] || 'bin';
}

// v1.28.9 — every photo uploaded so far has been the raw phone-camera file
// (routinely several MB), driving up both Storage bytes stored and Storage
// egress/read cost (billed per byte served, and every card/detail view
// re-serves the full original). Downscale + re-encode client-side before
// upload — this only affects the display copy this feature stores, never
// the user's original file on their own device. GIFs are passed through
// unchanged to preserve animation (not a realistic case for a warehouse
// item photo, but ACCEPTED_TYPES already allows it, so don't silently
// break it). Best-effort: canvas/codec failure of any kind falls back to
// uploading the original file untouched — compression is a cost
// optimization, never a reason to block the upload feature itself.
const COMPRESS_MAX_DIMENSION = 1280;
const COMPRESS_JPEG_QUALITY = 0.82;

async function compressPhotoForUpload(file) {
  if (file.type === 'image/gif') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, COMPRESS_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
    if (bitmap.close) bitmap.close();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', COMPRESS_JPEG_QUALITY));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' });
  } catch (_) {
    return file;
  }
}

/** The engine's injected `uploader` for item photos — resumable (real
 *  progress), with the same 30s hang-protection ceiling the old one-shot
 *  path already established (Phase 10.4.2's fix; a progress-capable
 *  upload can hang exactly the same way an unbounded one-shot could). */
function itemPhotoUploader(path, file, onProgress) {
  return import('../../firebase.js').then(({ uploadFileToStorageResumable }) =>
    withTimeout(uploadFileToStorageResumable(path, file, onProgress), STORAGE_TIMEOUT_MS));
}

function buildItemPhotoPath(itemId) {
  return (file) => `${GUDANG_STORAGE_PREFIX}/${itemId}/${Date.now()}.${safeExt(file.type)}`;
}

function itemPhotoUploadOps(itemId) {
  return { buildStoragePath: buildItemPhotoPath(itemId), compress: compressPhotoForUpload, uploader: itemPhotoUploader };
}

/** Creates a fresh upload session for `file` — `previewUrl` should already
 *  be a blob: URL the caller made via URL.createObjectURL (Phase 8:
 *  preview shows instantly, before any network activity; this file never
 *  touches the DOM itself). */
export function createItemPhotoSession(file, previewUrl) {
  return createUploadSession(file, previewUrl);
}

/** Starts (or restarts from idle) uploading a session for `itemId`.
 *  `onChange(session)` fires on every state transition (preparing ->
 *  uploading, each progress tick, done/error) so the caller can re-render. */
export function startItemPhotoUpload(session, itemId, onChange) {
  return runUpload(session, { ...itemPhotoUploadOps(itemId), onChange });
}

/** Retry (Phase 7): re-runs the SAME session — same file, same preview,
 *  no re-picking, no reopening anything. */
export function retryItemPhotoUpload(session, itemId, onChange) {
  return retryUpload(session, { ...itemPhotoUploadOps(itemId), onChange });
}

/** Cancel (Phase 7). */
export function cancelItemPhotoUpload(session, onChange) {
  cancelUpload(session, onChange);
}

/**
 * Uploads one photo for `itemId` and waits for the whole result — the
 * ORIGINAL one-shot, no-progress contract every existing caller already
 * used, UNCHANGED in behavior, now simply running one throwaway engine
 * session underneath (never a second compress/upload implementation).
 * @returns {Promise<{ok:boolean, storagePath:?string, contentType:?string, error:?string}>}
 */
export async function uploadItemPhoto(itemId, file) {
  const invalid = validateItemPhoto(file);
  if (invalid) return { ok: false, storagePath: null, contentType: null, error: invalid };
  const session = createUploadSession(file, null);
  const res = await startItemPhotoUpload(session, itemId, () => {});
  if (!res.ok) return { ok: false, storagePath: null, contentType: null, error: session.error || 'Unggah gagal.' };
  return { ok: true, storagePath: res.storagePath, contentType: res.contentType, error: null };
}

/**
 * Deletes a previously-uploaded photo's Storage object (Phase 10, Storage
 * Safety) — call ONLY after a replacement photo is confirmed uploaded AND
 * the Item record confirmed updated to point at it; never before, and
 * never as a precondition for either of those succeeding. A no-op success
 * when `storagePath` is falsy (nothing to delete).
 * @returns {Promise<{ok:boolean, error:?string}>}
 */
export async function deleteItemPhoto(storagePath) {
  if (!storagePath) return { ok: true, error: null };
  const { deleteFileFromStorage } = await import('../../firebase.js');
  return deleteFileFromStorage(storagePath);
}

// v1.28.7 — this project's Storage read path was confirmed (via direct
// Network-tab inspection) to be intermittently flaky: the identical
// authenticated request to the identical URL sometimes returns a clean 200
// with the real file bytes, and sometimes a transient 503 that exhausts the
// SDK's own internal retry budget (storage/retry-limit-exceeded) well under
// this file's 30s withTimeout ceiling — i.e. the SDK gives up on its own,
// our wrapper is not what's cutting it short. A single attempt is simply
// not enough against that failure rate; reopening/retrying empirically does
// get through. This is a bounded outer retry of fresh attempts (never an
// unbounded hang — each attempt still carries its own 30s ceiling above).
const DOWNLOAD_RETRY_DELAYS_MS = [1000, 2000, 4000];
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Downloads a previously-uploaded photo's bytes and wraps them in a local
 * object URL for an <img> tag. Never a signed/public URL (see header).
 * @returns {Promise<{ok:boolean, url:?string, error:?string}>}
 */
export async function loadItemPhotoUrl(storagePath, contentType) {
  const { downloadFileFromStorage } = await import('../../firebase.js');
  let lastError = null;
  for (let attempt = 0; attempt <= DOWNLOAD_RETRY_DELAYS_MS.length; attempt++) {
    let res;
    try {
      res = await withTimeout(downloadFileFromStorage(storagePath), STORAGE_TIMEOUT_MS);
    } catch (err) {
      lastError = err.message;
      res = null;
    }
    if (res && res.ok) {
      const blob = new Blob([res.bytes], { type: contentType || 'application/octet-stream' });
      return { ok: true, url: URL.createObjectURL(blob), error: null };
    }
    if (res && !res.ok) lastError = res.error;
    if (attempt < DOWNLOAD_RETRY_DELAYS_MS.length) await wait(DOWNLOAD_RETRY_DELAYS_MS[attempt]);
  }
  return { ok: false, url: null, error: lastError };
}

/** @param {import('../contracts/item-contract.js').Item} item */
export function itemHasPhoto(item) {
  return !!(item && item.metadata && item.metadata.imageStoragePath);
}
