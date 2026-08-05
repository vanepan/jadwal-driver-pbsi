/* ============================================================
   UPLOAD-ENGINE.JS — Warehouse Upload Experience (v1.29.5)

   THE one unified pipeline every entry point (Paste / Drag / Browse) and
   every surface (Add/Edit Item Dialog, Home catalog Card, Item Detail
   Drawer) drives through — "Paste, Drag, Browse must use ONE upload
   pipeline. Never create separate logic. One upload engine, three entry
   points" (brief, Phase 2). This file has ZERO knowledge of Gudang Items,
   Storage paths, or the Firebase SDK — it only knows "a File, a session,
   and three injected functions" (validate/compress/upload), exactly the
   same "generic engine, domain-ignorant" shape bulk-executor.js already
   established for the v1.29.4 Bulk Operations Framework.

   FUTURE-READY, PER THE BRIEF (Phase 13): nothing here hardcodes "item
   photo." A future Vehicle photo, Photo Gallery entry, Barcode/QR
   snapshot, or Inspection photo would call this SAME engine with its own
   `buildStoragePath`/`compress`/`uploader` — no redesign, because those
   were never hardcoded here to begin with. Not implemented (per the
   brief's own "prepare architecture, do NOT implement them" instruction)
   — this is the one thing making that possible later without a rewrite.

   SESSION LIFECYCLE: idle -> preparing -> uploading -> done | error |
   cancelled. `previewUrl` (a blob: URL the CALLER creates via
   URL.createObjectURL — this file never touches the DOM) is set the
   INSTANT a file is chosen, before any network activity — Phase 8:
   "Preview immediately. Do NOT wait for upload... This should feel
   instant." Retry re-runs the exact same session (same file, same
   preview) from `error`, never reopening a dialog or re-asking the user
   to pick the file again (Phase 7).
   ============================================================ */

'use strict';

export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** @returns {string|null} a friendly error message, or null if the file is acceptable. */
export function validateUploadFile(file, { acceptedTypes = ACCEPTED_IMAGE_TYPES, maxBytes = MAX_UPLOAD_BYTES } = {}) {
  if (!file) return 'Tidak ada file.';
  if (!acceptedTypes.includes(file.type)) return 'Format tidak didukung. Gunakan JPG, PNG, WEBP, atau GIF.';
  if (file.size > maxBytes) return `Ukuran maksimal ${Math.round(maxBytes / (1024 * 1024))}MB.`;
  return null;
}

function generateSessionId() {
  return `up-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** @param {File} file @param {?string} previewUrl - caller-created blob: URL (or null). */
export function createUploadSession(file, previewUrl = null) {
  return {
    sessionId: generateSessionId(),
    file, previewUrl,
    status: 'idle', // 'idle'|'preparing'|'uploading'|'done'|'error'|'cancelled'
    progress: null, // {loaded, total} while status === 'uploading'
    error: null,
    result: null, // {storagePath, contentType} once status === 'done'
  };
}

/** Never surface a raw SDK/network error (brief: "Never expose Firebase
 *  errors"). A message already produced by validateUploadFile/a repository
 *  is already human-readable and passes through unchanged. */
export function toHumanUploadError(err) {
  const msg = typeof err === 'string' ? err : (err && err.message) || '';
  if (/network|offline|net::|ERR_/i.test(msg)) return 'Koneksi terputus. Periksa jaringan dan coba lagi.';
  if (/timeout|habis/i.test(msg)) return 'Waktu unggah habis. Coba lagi.';
  if (/quota/i.test(msg)) return 'Penyimpanan penuh. Hubungi admin.';
  if (/unauthorized|permission/i.test(msg)) return 'Tidak memiliki izin untuk mengunggah.';
  if (/cancel/i.test(msg)) return 'Unggah dibatalkan.';
  if (msg) return msg;
  return 'Unggah gagal. Coba lagi.';
}

/**
 * Runs one session end-to-end: (optional) compress -> upload, reporting
 * every state transition through `onChange(session)` so a caller can
 * re-render on each tick (same "mutate in place, re-render on change"
 * discipline as bulk-executor.js's onProgress).
 *
 * @param {ReturnType<typeof createUploadSession>} session
 * @param {Object} ops
 * @param {(file:File) => string} ops.buildStoragePath - given the (possibly
 *   compressed) file, returns the Storage path to upload to. Domain-
 *   specific path-building lives entirely in the CALLER (e.g. gudang-
 *   item-image.js), never here.
 * @param {(file:File) => Promise<File|Blob>} [ops.compress] - optional
 *   pre-upload transform (e.g. gudang-item-image.js's own
 *   compressPhotoForUpload). Omit for no compression.
 * @param {(path:string, file:File|Blob, onProgress:(p:{loaded,total})=>void) => Promise<{ok:boolean, fullPath?:string, error?:string}>} ops.uploader
 *   - the actual Storage call (e.g. js/firebase.js#uploadFileToStorageResumable),
 *   injected so this file never imports Firebase itself.
 * @param {(session) => void} [ops.onChange]
 * @returns {Promise<{ok:boolean, cancelled?:boolean, storagePath?:string, contentType?:string}>}
 */
export async function runUpload(session, { buildStoragePath, compress, uploader, onChange }) {
  const notify = onChange || (() => {});
  session.status = 'preparing'; session.error = null; session.progress = null;
  notify(session);

  let uploadFile = session.file;
  if (compress) {
    try { uploadFile = (await compress(session.file)) || session.file; }
    catch (_) { /* compression is a cost optimization, never a reason to block the upload */ }
  }
  if (session.status === 'cancelled') return { ok: false, cancelled: true };

  session.status = 'uploading';
  session.progress = { loaded: 0, total: uploadFile.size || 0 };
  notify(session);

  const path = buildStoragePath(uploadFile);
  let res;
  try {
    res = await uploader(path, uploadFile, (p) => {
      if (session.status === 'cancelled') return;
      session.progress = p;
      notify(session);
    });
  } catch (err) {
    res = { ok: false, error: err };
  }
  if (session.status === 'cancelled') return { ok: false, cancelled: true };

  if (!res || !res.ok) {
    session.status = 'error';
    session.error = toHumanUploadError(res && res.error);
    notify(session);
    return { ok: false };
  }

  session.status = 'done';
  session.result = { storagePath: res.fullPath || path, contentType: uploadFile.type };
  notify(session);
  return { ok: true, storagePath: session.result.storagePath, contentType: session.result.contentType };
}

/** Retry (Phase 7): re-runs the SAME session (same file, same preview) —
 *  the user never re-picks the file or reopens anything. */
export function retryUpload(session, ops) {
  session.error = null;
  return runUpload(session, ops);
}

/** Cancel (Phase 7 — shown alongside Retry after a failure): marks the
 *  session so any still-in-flight callback becomes a no-op once it
 *  resolves (runUpload's own `status === 'cancelled'` checks above) —
 *  "I no longer care about this result," not a network-level abort. */
export function cancelUpload(session, onChange) {
  session.status = 'cancelled';
  session.error = null;
  if (onChange) onChange(session);
}
