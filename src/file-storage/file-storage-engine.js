/* ============================================================
   FILE-STORAGE-ENGINE.JS — File Storage Foundation (V2.1)

   PURPOSE: "never store identical files twice" — the one real upload
   orchestration point. Computes a real SHA-256 (Web Crypto API,
   deterministic, works identically in the browser and under Node —
   verified against Node 24 in this milestone's test suite), checks the
   dedup registry FIRST, and only calls the actual Firebase Storage upload
   primitive (js/firebase.js#uploadFileToStorage, V1, additive-only) when
   the content has never been seen before.

   RESPONSIBILITY: uploadFile(file, opts) — orchestration only; hashing
   itself lives in ./file-hash.js (deliberately isolated, see that file's
   header) and is re-exported here for callers that only need "the
   engine" as one import surface.

   DEPENDENCIES: ./file-hash.js, ./file-storage-registry.js, ./contracts/
   file-storage-contract.js, js/firebase.js (V1 — the one Firebase touch
   in this file; lazily loaded, same as every other V2 connector that
   eventually needs a real V1 dependency — this module is only ever
   imported by the UI layer when Sarpras Intelligence itself is mounted).

   NON-GOALS: does not decide domainType/knowledgeKind/datasetType (see
   knowledge/datasets/import-session/metadata-inference-engine.js). Does
   not create or mutate an ImportSessionRecord itself — the UI layer
   attaches this function's result onto a session via
   import-session-engine.js#attachDocumentHash and friends.
   ============================================================ */

'use strict';

import { computeSha256 } from './file-hash.js';
import { getStoredFileBySha256, registerStoredFile, linkSessionToStoredFile } from './file-storage-registry.js';
import { makeStoredFileRecord } from './contracts/file-storage-contract.js';
import { withRetryAsync, withTimeout } from './retry-with-backoff.js';
import { uploadFileToStorage } from '../../js/firebase.js';

export { computeSha256 };

function storagePathFor(domainType, sha256) {
  return `sarpras-intelligence/${domainType}/${sha256}`;
}

// Sprint 1 (Autonomy Closure, Part 4) — see retry-with-backoff.js#withTimeout's
// header: bounds each individual upload attempt so a true network hang
// can't freeze the whole batch forever.
const UPLOAD_ATTEMPT_TIMEOUT_MS = 30000;

/**
 * Uploads `file` if (and only if) its content has never been stored
 * before; otherwise reuses the existing StoredFileRecord and simply
 * records this session as another reference to it.
 * @param {File|Blob} file
 * @param {{domainType: string, importSessionId: string, precomputedSha256?: string|null}} opts
 *   Phase 6.5 (Pipeline Observability Hardening, Part 10) — `precomputedSha256`
 *   lets a caller that already hashed this exact file (dataset-import-
 *   center.js#processOneFile does, for its own dedup/inference signals)
 *   skip a second real SHA-256 pass over the same bytes — a genuine,
 *   measured CPU cost this milestone's bottleneck audit found being paid
 *   twice per file. Optional and backward-compatible: omitted, this
 *   function hashes exactly as it always did.
 * @returns {Promise<{ok: boolean, record: import('./contracts/file-storage-contract.js').StoredFileRecord|null, wasDuplicate: boolean, sha256: string, error: string|null}>}
 */
export async function uploadFile(file, { domainType, importSessionId, precomputedSha256 = null }) {
  const sha256 = precomputedSha256 || await computeSha256(file);
  const existing = getStoredFileBySha256(sha256);

  if (existing) {
    const linked = linkSessionToStoredFile(sha256, importSessionId) || existing;
    return { ok: true, record: linked, wasDuplicate: true, sha256, error: null };
  }

  // Phase 1 (Operational Engine Hardening) — a network hiccup uploading to
  // Storage is exactly the kind of transient failure the engine should
  // recover from on its own; 3 attempts (~300ms/900ms backoff) before
  // this becomes a real, honestly-reported failure the caller must handle.
  const uploadResult = await withRetryAsync(() => withTimeout(
    uploadFileToStorage(storagePathFor(domainType, sha256), file),
    UPLOAD_ATTEMPT_TIMEOUT_MS,
    'STORAGE_UPLOAD_TIMEOUT',
  ));
  if (!uploadResult.ok) {
    return { ok: false, record: null, wasDuplicate: false, sha256, error: uploadResult.error };
  }

  const record = makeStoredFileRecord({
    sha256,
    originalFilename: file.name || 'unknown',
    mimeType: file.type || 'application/octet-stream',
    sizeBytes: file.size || 0,
    storagePath: uploadResult.fullPath || storagePathFor(domainType, sha256),
  });
  registerStoredFile(record);
  const linked = linkSessionToStoredFile(sha256, importSessionId) || record;
  return { ok: true, record: linked, wasDuplicate: false, sha256, error: null };
}
