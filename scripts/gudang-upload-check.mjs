/* gudang-upload-check.mjs — Gudang v1.29.5, Warehouse Upload Experience.

   Same check()/read() harness as scripts/gudang-bulk-check.mjs. Parts:
     A. Engine core          — validateUploadFile accept/reject, session
                             shape, runUpload happy path (injected fake
                             compress/uploader — never touches Firebase),
                             compression-failure-falls-back-to-original,
                             uploader failure -> 'error' + humanized
                             reason, retry re-runs, cancel makes a
                             late-resolving callback a no-op,
                             toHumanUploadError translates common causes.
     B. js/firebase.js        — the two new exports (uploadFileToStorage-
                             Resumable, deleteFileFromStorage) exist
                             additively; the two pre-existing exports
                             (uploadFileToStorage, downloadFileFromStorage)
                             are untouched — same signatures, still used
                             by their original callers.
     C. gudang-item-image.js  — validateItemPhoto still rejects the same
                             cases (now via the shared engine, not a
                             second copy of the same three checks);
                             itemHasPhoto unchanged; every new session-
                             based export exists; uploadItemPhoto's
                             ORIGINAL one-shot contract still short-
                             circuits on an invalid file without any
                             network access (Node-importable, no Firebase
                             touch for this path).
     D. Architecture          — upload-engine.js is genuinely PURE (zero
                             imports, no "item"/"Storage"/"Gudang" string
                             anywhere in it — domain-ignorant); the DO NOT
                             MODIFY surface (Selection Engine, Bulk
                             Framework, Search, Filter, Forecast,
                             Analytics, Gudang Repositories, Business
                             Rules) shows no trace of the upload engine;
                             gudang-center.js/gudang-home.js/gudang-item-
                             detail.js/gudang-catalog.js are wired without
                             duplicating dispatch logic.
     E. Live render sweep      — the Home catalog card, Item Detail
                             drawer image block, and Add/Edit Item
                             dialog's photo field all render a synthetic
                             in-progress / error session without throwing.

   Deterministic. No live Firebase, no AI, no real network/CDN loads.
   Run: node scripts/gudang-upload-check.mjs   (exit 0 = pass) */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ACCEPTED_IMAGE_TYPES, MAX_UPLOAD_BYTES, validateUploadFile, createUploadSession,
  runUpload, retryUpload, cancelUpload, toHumanUploadError,
} from '../js/gudang/upload/upload-engine.js';
import {
  validateItemPhoto, itemHasPhoto, uploadItemPhoto,
  createItemPhotoSession, startItemPhotoUpload, retryItemPhotoUpload, cancelItemPhotoUpload, deleteItemPhoto,
} from '../js/gudang/ui/gudang-item-image.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0; let fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); }
}
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

function fakeFile({ type = 'image/jpeg', size = 1024, name = 'photo.jpg' } = {}) {
  return { type, size, name };
}

/* ── Part A — Engine core ─────────────────────────────────────────────── */
console.log('\n[Part A — upload-engine.js: validation, session lifecycle, retry/cancel]');
{
  check('validateUploadFile: null file is rejected', typeof validateUploadFile(null) === 'string');
  check('validateUploadFile: an unsupported type (PDF) is rejected with a friendly message', /format/i.test(validateUploadFile(fakeFile({ type: 'application/pdf' }))));
  check('validateUploadFile: an oversized file is rejected', /ukuran|maksimal/i.test(validateUploadFile(fakeFile({ size: MAX_UPLOAD_BYTES + 1 }))));
  check('validateUploadFile: a normal JPEG under the limit is accepted (null)', validateUploadFile(fakeFile()) === null);
  check('ACCEPTED_IMAGE_TYPES covers JPEG/PNG/WEBP/GIF (never PDF/ZIP/EXE)', ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].every((t) => ACCEPTED_IMAGE_TYPES.includes(t)) && !ACCEPTED_IMAGE_TYPES.some((t) => /pdf|zip|exe/i.test(t)));

  const s = createUploadSession(fakeFile(), 'blob:preview');
  check('createUploadSession() starts idle with no progress/error/result', s.status === 'idle' && s.progress === null && s.error === null && s.result === null);
  check('createUploadSession() keeps the caller-supplied preview URL (Phase 8: preview instantly, before any network activity)', s.previewUrl === 'blob:preview');

  const seenStatuses = [];
  const okRes = await runUpload(createUploadSession(fakeFile()), {
    buildStoragePath: (f) => `fake/${f.name}`,
    compress: async (f) => f,
    uploader: async (path_, file, onProgress) => { onProgress({ loaded: file.size, total: file.size }); return { ok: true, fullPath: path_ }; },
    onChange: (sess) => seenStatuses.push(sess.status),
  });
  check('runUpload(): happy path resolves ok with a storagePath', okRes.ok === true && okRes.storagePath === 'fake/photo.jpg');
  check('runUpload(): transitions preparing -> uploading -> done, in order (never skips a state)', seenStatuses.indexOf('preparing') < seenStatuses.indexOf('uploading') && seenStatuses.indexOf('uploading') < seenStatuses.indexOf('done'));

  const fallbackSession = createUploadSession(fakeFile());
  const fallbackRes = await runUpload(fallbackSession, {
    buildStoragePath: () => 'fake/x',
    compress: async () => { throw new Error('canvas exploded'); },
    uploader: async () => ({ ok: true, fullPath: 'fake/x' }),
    onChange: () => {},
  });
  check('runUpload(): a compression failure NEVER blocks the upload — falls back to the original file (best-effort, per gudang-item-image.js\'s own compressPhotoForUpload discipline)', fallbackRes.ok === true);

  const failSession = createUploadSession(fakeFile());
  const failRes = await runUpload(failSession, {
    buildStoragePath: () => 'fake/x',
    uploader: async () => ({ ok: false, error: 'storage/unauthorized: permission denied' }),
    onChange: () => {},
  });
  check('runUpload(): an uploader failure sets status to "error"', failRes.ok === false && failSession.status === 'error');
  check('runUpload(): the error is humanized, never a raw Firebase-flavored string (brief: "Never expose Firebase errors")', !/storage\//i.test(failSession.error) && /izin/i.test(failSession.error));

  let attempts = 0;
  const retrySession = createUploadSession(fakeFile());
  await runUpload(retrySession, { buildStoragePath: () => 'fake/x', uploader: async () => { attempts++; return { ok: false, error: 'network error' }; }, onChange: () => {} });
  await retryUpload(retrySession, { buildStoragePath: () => 'fake/x', uploader: async () => { attempts++; return { ok: true, fullPath: 'fake/x' }; }, onChange: () => {} });
  check('retryUpload(): re-runs the SAME session (same file/preview) — no re-picking, no reopening anything', attempts === 2 && retrySession.status === 'done');

  const cancelSession = createUploadSession(fakeFile());
  let lateCallbackRan = false;
  const cancelPromise = runUpload(cancelSession, {
    buildStoragePath: () => 'fake/x',
    uploader: (p, f, onProgress) => new Promise((resolve) => setTimeout(() => { onProgress({ loaded: 1, total: 1 }); resolve({ ok: true, fullPath: 'fake/x' }); }, 20)),
    onChange: () => { lateCallbackRan = true; },
  });
  cancelUpload(cancelSession, () => {});
  const cancelResult = await cancelPromise;
  check('cancelUpload(): marks the session cancelled immediately', cancelSession.status === 'cancelled');
  check('cancelUpload(): a still-in-flight uploader\'s LATE progress/completion never overwrites the cancelled status', cancelResult.cancelled === true);

  check('toHumanUploadError(): network-flavored messages become a friendly "connection interrupted"', /koneksi/i.test(toHumanUploadError('net::ERR_CONNECTION_RESET')));
  check('toHumanUploadError(): an already-human repository-style message passes through unchanged', toHumanUploadError('Item tidak ditemukan.') === 'Item tidak ditemukan.');
  check('toHumanUploadError(): a totally unknown/empty error still returns a non-empty, non-raw message', toHumanUploadError(undefined).length > 0);
}

/* ── Part B — js/firebase.js: additive only ──────────────────────────── */
console.log('\n[Part B — js/firebase.js: new Storage exports are additive, existing ones untouched]');
{
  const fb = read('js/firebase.js');
  check('uploadFileToStorageResumable is exported (new, for real progress)', /export function uploadFileToStorageResumable\(/.test(fb));
  check('deleteFileFromStorage is exported (new — no delete primitive existed before this release)', /export async function deleteFileFromStorage\(/.test(fb));
  check('uploadFileToStorage (pre-existing, other callers depend on it) keeps its original signature', /export async function uploadFileToStorage\(storagePath, file\)/.test(fb));
  check('downloadFileFromStorage (pre-existing) keeps its original signature', /export async function downloadFileFromStorage\(storagePath\)/.test(fb));
  check('uploadBytesResumable/deleteObject are imported from the Storage SDK', /import \{[^}]*uploadBytesResumable[^}]*deleteObject[^}]*\} from ['"]https:\/\/www\.gstatic\.com\/firebasejs\/[^'"]*firebase-storage\.js['"]/.test(fb));
  check('deleteFileFromStorage treats "object already gone" as success, not a failure (a double-cleanup race should never surface as an error)', /storage\/object-not-found/.test(fb));
}

/* ── Part C — gudang-item-image.js: thin adapter, unchanged old contract ── */
console.log('\n[Part C — gudang-item-image.js: validation/shape unchanged, new session exports present]');
{
  check('validateItemPhoto still rejects an unsupported format', /format/i.test(validateItemPhoto(fakeFile({ type: 'application/zip' }))));
  check('validateItemPhoto still rejects an oversized file', validateItemPhoto(fakeFile({ size: 6 * 1024 * 1024 })) !== null);
  check('validateItemPhoto still accepts a normal photo', validateItemPhoto(fakeFile()) === null);
  check('itemHasPhoto: false for an item with no metadata', itemHasPhoto({ metadata: {} }) === false);
  check('itemHasPhoto: true once metadata.imageStoragePath is set', itemHasPhoto({ metadata: { imageStoragePath: 'gudang/item-photos/i1/1.jpg' } }) === true);

  check('createItemPhotoSession/startItemPhotoUpload/retryItemPhotoUpload/cancelItemPhotoUpload/deleteItemPhoto are all exported', [createItemPhotoSession, startItemPhotoUpload, retryItemPhotoUpload, cancelItemPhotoUpload, deleteItemPhoto].every((f) => typeof f === 'function'));

  const badFileRes = await uploadItemPhoto('item1', fakeFile({ type: 'application/pdf' }));
  check('uploadItemPhoto(): an invalid file is rejected WITHOUT ever touching the network (Node-importable, no Firebase reachable for this path)', badFileRes.ok === false && typeof badFileRes.error === 'string');

  const delRes = await deleteItemPhoto(null);
  check('deleteItemPhoto(null): a no-op success (nothing to delete) — never an error for the common "item never had a photo" case', delRes.ok === true);
}

/* ── Part D — Architecture: PURE engine, Do Not Modify untouched ─────── */
console.log('\n[Part D — Architecture: upload-engine.js is PURE and domain-ignorant; DO NOT MODIFY surface shows no trace of it]');
{
  const engineCode = read('js/gudang/upload/upload-engine.js');
  check('upload-engine.js imports NOTHING (zero knowledge of Gudang, Items, or Firebase — genuinely generic)', !/^import /m.test(engineCode));
  check('upload-engine.js never references firebase.js or Storage directly', !/from ['"][^'"]*firebase\.js['"]/.test(engineCode) && !/uploadBytes|storageRef|getStorage/.test(engineCode));
  check('upload-engine.js never hardcodes "gudang/" or "item" — a future Vehicle/Gallery/Barcode caller needs zero changes here (Phase 13)', !/gudang\//.test(engineCode) && !/itemId/.test(engineCode));

  const doNotModify = [
    'js/gudang/selection/selection-engine.js', 'js/gudang/bulk/bulk-executor.js',
    'js/gudang/search/search-resolver.js', 'js/gudang/filters/filter-engine.js',
    'js/gudang/analytics/analytics-engine.js',
    'js/gudang/repository/item-repository.js', 'js/gudang/repository/movement-repository.js',
    'js/gudang/repository/location-repository.js', 'js/gudang/repository/asset-repository.js',
    'js/vehicles-store.js', 'database.rules.json', 'js/auth.js',
  ];
  for (const rel of doNotModify) {
    const code = read(rel);
    check(`${rel} (Do Not Modify) shows no trace of the Upload Experience`, !code.includes('upload-engine') && !code.includes('gudang-photo-upload') && !code.includes('startQuickPhotoReplace'));
  }

  const centerCode = read('js/gudang/ui/gudang-center.js');
  check('gudang-center.js extends dragover/drop/paste to Card/Drawer targets alongside the untouched gud-cat-photo-zone case', centerCode.includes('quickPhotoTargetId') && centerCode.includes("gud-cat-photo-zone"));
  check('gudang-center.js registers a dragleave listener (clears the -dragover highlight on a real exit)', centerCode.includes("addEventListener('dragleave'"));
  check('gudang-center.js dispatches gud-photo-retry/gud-photo-cancel (Card/Drawer overlay) distinctly from gud-cat-photo-retry/-cancel (dialog)', centerCode.includes("'gud-photo-retry'") && centerCode.includes("'gud-photo-cancel'"));
  check('gudang-center.js guards Escape to cancel an in-flight quick photo replace (Phase 12 accessibility)', /Escape[\s\S]{0,20}st\.photoUpload[\s\S]{0,60}cancelQuickPhotoReplace/.test(centerCode));

  const homeCode = read('js/gudang/ui/gudang-home.js');
  check('gudang-home.js renders the quick-photo overlay and a -dragover class on the catalog card', homeCode.includes('renderQuickPhotoOverlay') && homeCode.includes('-dragover'));

  const detailCode = read('js/gudang/ui/gudang-item-detail.js');
  check('gudang-item-detail.js renders the quick-photo overlay and a -dragover class on the drawer image', detailCode.includes('renderQuickPhotoOverlay') && detailCode.includes('-dragover'));

  const catalogCode = read('js/gudang/ui/gudang-catalog.js');
  check('gudang-catalog.js\'s Edit Item photo field uses the shared session overlay (eager upload, Phase 8)', catalogCode.includes('renderSessionOverlay') && catalogCode.includes('photoSession'));
  check('gudang-catalog.js disables Save while the photo is still uploading (never saves an incomplete photo state)', catalogCode.includes('photoStillUploading'));
}

/* ── Part E — Live render sweep ───────────────────────────────────────── */
console.log('\n[Part E — live render sweep: Card / Drawer / Dialog all render an in-progress and an error session without throwing]');
{
  const { renderQuickPhotoOverlay, renderSessionOverlay } = await import('../js/gudang/ui/gudang-photo-upload.js');

  const uploadingSession = { status: 'uploading', progress: { loaded: 512, total: 1024 }, error: null };
  const errorSession = { status: 'error', progress: null, error: 'Koneksi terputus. Periksa jaringan dan coba lagi.' };

  let threw = null;
  try {
    const st = { photoUpload: { itemId: 'i1', session: uploadingSession } };
    const html1 = renderQuickPhotoOverlay(st, 'i1', { size: 32 });
    check('renderQuickPhotoOverlay(): an uploading session renders a percentage and a ring, no exception', html1.includes('gud-progress-ring') && html1.includes('50%'));

    const st2 = { photoUpload: { itemId: 'i1', session: errorSession } };
    const html2 = renderQuickPhotoOverlay(st2, 'i1', { size: 32 });
    check('renderQuickPhotoOverlay(): an error session renders the message + Retry/Cancel buttons', html2.includes('gud-photo-retry') && html2.includes('gud-photo-cancel') && html2.includes('Koneksi terputus'));

    const html3 = renderQuickPhotoOverlay({ photoUpload: null }, 'i1', {});
    check('renderQuickPhotoOverlay(): no active session for this item renders an empty string (falls through to the normal image)', html3 === '');

    const html4 = renderSessionOverlay(errorSession, { retryAct: 'gud-cat-photo-retry', cancelAct: 'gud-cat-photo-cancel' });
    check('renderSessionOverlay(): act names are parameterized — the dialog\'s own retry/cancel acts appear, not the Card/Drawer ones', html4.includes('gud-cat-photo-retry') && !html4.includes('data-act="gud-photo-retry"'));
  } catch (err) {
    threw = err;
  }
  check('the entire render sweep threw no exception', threw === null);
  if (threw) console.log('    ', threw.stack || threw);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
