/* ============================================================
   FILE-STORAGE-CONTRACT.JS — File Storage Foundation (V2.1)

   PURPOSE: fix the shape of ONE stored original file — a real Firebase
   Storage upload, deduplicated by content hash. This is a NEW top-level
   sibling module (js/v2/file-storage/), not nested under knowledge/ or
   organizational-memory/, because BOTH need to reference it (an
   ImportSessionRecord's sha256/storagePath, an ArchiveRecord's fileRef)
   without creating a dependency between those two layers — the same
   "shared leaf, both point at it, it points at neither" shape
   knowledge/contracts/ already has relative to the rest of knowledge/.

   RESPONSIBILITY: define StoredFileRecord and a structural validator.
   Does not upload or hash anything itself — see file-storage-engine.js.

   DEPENDENCIES: none.

   NON-GOALS: no signed URLs, no lifecycle/retention policy, no versioned
   buckets, no download-URL generation — this milestone's explicitly
   minimal scope (store original, path + metadata only, SHA-256 for
   dedup, link back from Knowledge/Archive).
   ============================================================ */

'use strict';

export const FILE_STORAGE_SCHEMA = 'stored-file@1';

/**
 * @typedef {Object} StoredFileRecord
 * @property {string} id               - deterministic, `file:<sha256>`
 * @property {string} sha256           - real content hash (Web Crypto SHA-256), the dedup key
 * @property {string} originalFilename - the filename of the FIRST upload that created this record
 * @property {string} mimeType
 * @property {number} sizeBytes
 * @property {string} storagePath      - Firebase Storage path, e.g. `sarpras-intelligence/<sha256>`
 * @property {string} uploadedAt       - ISO 8601, when the bytes were actually uploaded (first time only)
 * @property {string[]} linkedSessionIds - every ImportSessionRecord.id that has referenced this file since (dedup reuse never re-uploads, but every reuse is recorded)
 */

export function makeStoredFileRecord({ sha256, originalFilename, mimeType, sizeBytes, storagePath }) {
  return Object.freeze({
    id: `file:${sha256}`,
    sha256, originalFilename, mimeType, sizeBytes, storagePath,
    uploadedAt: new Date().toISOString(),
    linkedSessionIds: Object.freeze([]),
  });
}

export function isStoredFileRecord(r) {
  return !!r && typeof r === 'object'
    && typeof r.id === 'string' && r.id.length > 0
    && typeof r.sha256 === 'string' && /^[0-9a-f]{64}$/i.test(r.sha256)
    && typeof r.originalFilename === 'string' && r.originalFilename.length > 0
    && typeof r.mimeType === 'string'
    && typeof r.sizeBytes === 'number' && r.sizeBytes >= 0
    && typeof r.storagePath === 'string' && r.storagePath.length > 0
    && Array.isArray(r.linkedSessionIds);
}
