/* ============================================================
   GUDANG-PHOTO-UPLOAD.JS — Warehouse Upload Experience, quick replace
   (v1.29.5)

   "Replace Photo" directly from a Home catalog Card or the Item Detail
   Drawer (Phase 1/3) — the ONE new surface this release adds beyond the
   existing Add/Edit Item Dialog. Both surfaces call the exact same
   functions here; only the rendered chrome around the overlay differs
   (a small ring in a card thumbnail vs. a larger one in the drawer's
   bigger image block) — one engine, shared orchestration, per Phase 2.

   STATE: st.photoUpload = { itemId, session } | null — at most ONE quick
   replace in flight app-wide (Phase 13 defers "Multiple Photos" to a
   future release; this is the deliberate single-flight boundary that
   keeps this release simple without blocking that future). st.detail.id/
   st.data.items themselves are the read side; this file mutates neither
   except through the existing item-repository.js#updateItem, exactly
   like gudang-catalog.js's own confirmEditItem already does.

   STORAGE SAFETY (Phase 10), followed literally: upload the new photo
   first -> verify the upload succeeded -> write the Item's new metadata
   reference -> ONLY THEN delete the previous Storage object, best-effort,
   never blocking or failing the user-visible success if cleanup itself
   fails (an orphaned old file is a minor cost issue; a broken photo
   reference would not be). Never delete before the new photo is
   confirmed both uploaded AND referenced.
   ============================================================ */

'use strict';

import { esc, progressRing } from './gudang-atoms.js';
import { validateUploadFile } from '../upload/upload-engine.js';
import { createItemPhotoSession, startItemPhotoUpload, cancelItemPhotoUpload, deleteItemPhoto } from './gudang-item-image.js';
import { updateItem } from '../repository/item-repository.js';

/** Renders the upload-in-progress / error overlay for an arbitrary
 *  upload-engine.js session — shared by the Card/Drawer quick-replace
 *  state (st.photoUpload, below) AND the Add/Edit Item dialog's own
 *  per-draft session (gudang-catalog.js), which is why the Retry/Cancel
 *  act names are parameters rather than hardcoded: the two callers
 *  dispatch through different handlers (bulkHandlers-style gud-photo-* for
 *  the shared state here, gud-cat-photo-* for the dialog's own draft),
 *  and only the caller knows which one applies to its own session.
 *  Returns '' once a session is idle/done — the CALLER decides what "no
 *  overlay" means for it (Card/Drawer clear st.photoUpload entirely on
 *  success; the dialog keeps its session but stops needing an overlay). */
export function renderSessionOverlay(session, { size = 40, retryAct = 'gud-photo-retry', cancelAct = 'gud-photo-cancel' } = {}) {
  if (!session || session.status === 'idle' || session.status === 'cancelled') return '';
  if (session.status === 'error') {
    return `<div class="gud-photo-overlay -error" role="alert">
      <span class="gud-photo-overlay-msg">${esc(session.error)}</span>
      <div class="gud-photo-overlay-actions">
        <button type="button" class="gud-btn -sm -primary" data-act="${retryAct}">Coba Lagi</button>
        <button type="button" class="gud-btn -sm -ghost" data-act="${cancelAct}">Batal</button>
      </div>
    </div>`;
  }
  if (session.status === 'done') return '';
  const pct = session.progress && session.progress.total ? Math.round((session.progress.loaded / session.progress.total) * 100) : null;
  const label = session.status === 'preparing' ? 'Menyiapkan…' : pct != null ? `${pct}%` : 'Mengunggah…';
  return `<div class="gud-photo-overlay" aria-live="polite">
    ${progressRing(pct, { size })}
    <span class="gud-photo-overlay-label">${esc(label)}</span>
  </div>`;
}

/** Renders the upload-in-progress / error overlay for `itemId`'s card or
 *  drawer image slot, or '' when no quick replace is running for it. */
export function renderQuickPhotoOverlay(st, itemId, opts = {}) {
  const pu = st.photoUpload;
  if (!pu || pu.itemId !== itemId) return '';
  return renderSessionOverlay(pu.session, opts);
}

/** True while ANY quick replace is actively running (single-flight guard). */
function isBusy(st) {
  return !!(st.photoUpload && (st.photoUpload.session.status === 'preparing' || st.photoUpload.session.status === 'uploading'));
}

/** Entry point for both Drag&Drop (Card/Drawer) and Paste (Drawer) —
 *  Phase 2's "one engine, three entry points" applies here too: Browse
 *  has no dedicated affordance on Card/Drawer (unchanged — the existing
 *  Edit Item dialog remains the browse path for those surfaces; see the
 *  v1.29.5 architecture report for why that scope line was drawn there),
 *  but Drag and Paste both funnel through this SAME function. */
export function startQuickPhotoReplace(st, itemId, file, render, refreshCatalog, showToast) {
  if (isBusy(st)) {
    if (showToast) showToast('Tunggu unggahan foto sebelumnya selesai.');
    return;
  }
  const invalid = validateUploadFile(file);
  const previewUrl = invalid ? null : URL.createObjectURL(file);
  const session = createItemPhotoSession(file, previewUrl);
  st.photoUpload = { itemId, session };
  if (invalid) {
    session.status = 'error';
    session.error = invalid;
    render();
    return;
  }
  render();
  runQuickPhotoUpload(st, itemId, render, refreshCatalog, showToast);
}

async function runQuickPhotoUpload(st, itemId, render, refreshCatalog, showToast) {
  const pu = st.photoUpload;
  if (!pu || pu.itemId !== itemId) return;
  const item = st.data.items.find((i) => i.itemId === itemId);
  if (!item) { pu.session.status = 'error'; pu.session.error = 'Item tidak ditemukan (mungkin sudah dihapus).'; render(); return; }
  const oldPath = item.metadata && item.metadata.imageStoragePath || null;

  const res = await startItemPhotoUpload(pu.session, itemId, () => render());
  // A cancel (or a newer session superseding this one) may have run while
  // the upload was in flight — never act on a stale result.
  if (!st.photoUpload || st.photoUpload.session !== pu.session) return;
  if (!res.ok) { render(); return; } // session.status/error already set by the engine

  // Upload confirmed successful — NOW swap the Item's reference. Never
  // before this point (Phase 3/10: "Removing the old photo should happen
  // automatically after successful upload... Upload first. Swap only
  // after success.").
  const metadata = { ...(item.metadata || {}), imageStoragePath: res.storagePath, imageContentType: res.contentType };
  const updRes = await updateItem(itemId, { metadata });
  if (!st.photoUpload || st.photoUpload.session !== pu.session) return;
  if (!updRes.ok) {
    pu.session.status = 'error';
    pu.session.error = updRes.error.message;
    render();
    return;
  }

  // Bust every cache that could otherwise show the stale photo (Phase 11:
  // never render a photo twice / never serve a stale one) — the same two
  // caches gudang-catalog.js#confirmEditItem already invalidates.
  if (st.homeImageCache) delete st.homeImageCache[itemId];
  if (st.detail && st.detail.id === itemId) { st.detail.imageLoaded = null; st.detail.imageUrl = null; }
  if (pu.session.previewUrl) URL.revokeObjectURL(pu.session.previewUrl);
  st.photoUpload = null;
  render();

  // Delete the PREVIOUS file last, best-effort — a cleanup failure here
  // must never look like the replace itself failed (it already succeeded).
  if (oldPath) deleteItemPhoto(oldPath).catch(() => {});
  if (showToast) showToast('Foto item diperbarui.');
  await refreshCatalog();
}

/** Retry (Phase 7) — re-runs the SAME session (same file, same preview). */
export function retryQuickPhotoReplace(st, render, refreshCatalog, showToast) {
  const pu = st.photoUpload;
  if (!pu) return;
  pu.session.status = 'idle';
  pu.session.error = null;
  runQuickPhotoUpload(st, pu.itemId, render, refreshCatalog, showToast);
}

/** Cancel (Phase 7) / Escape (Phase 12) — discards the in-flight session
 *  entirely; nothing was ever swapped, so there is nothing to undo. */
export function cancelQuickPhotoReplace(st, render) {
  const pu = st.photoUpload;
  if (!pu) return;
  cancelItemPhotoUpload(pu.session);
  if (pu.session.previewUrl) URL.revokeObjectURL(pu.session.previewUrl);
  st.photoUpload = null;
  render();
}
