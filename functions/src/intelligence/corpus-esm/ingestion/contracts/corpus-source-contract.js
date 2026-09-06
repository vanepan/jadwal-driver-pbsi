/* ============================================================
   CORPUS-SOURCE-CONTRACT.JS — Corpus Ingestion & Document Analysis
   (V2, Phase 5.x.2)

   PURPOSE: fix the shape of ONE ingestion input — the original bytes of a
   historical document plus the small amount of metadata a caller can
   honestly supply about them. This is what the extraction adapters
   consume; it is NOT a CorpusDocument (that is the canonical record —
   corpus-document-contract.js) and it is NEVER persisted.

   IDENTITY IS CHECKSUM-BASED, NOT FILENAME-BASED (§5). `checksum` is the
   SHA-256 of the ORIGINAL bytes (corpus-checksum.js). `originalFilename`
   is an ingestion hint only — never authoritative for classification or
   date.

   RESPONSIBILITY: CORPUS_FORMAT, detectFormat(), makeCorpusSource(),
   isCorpusSource().

   DEPENDENCIES: none.

   NON-GOALS: does not hash (corpus-checksum.js), does not extract, does
   not classify. Does not fetch bytes from anywhere.
   ============================================================ */

'use strict';

export const CORPUS_SOURCE_SCHEMA = 'corpus-source@1';

export const CORPUS_FORMAT = Object.freeze({
  PDF: 'pdf',
  DOCX: 'docx',
  UNKNOWN: 'unknown',
});

const PDF_MAGIC = '%PDF-';
// DOCX (and every OOXML) is a ZIP — "PK\x03\x04".
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

function headBytes(bytes) {
  if (!bytes) return null;
  if (typeof bytes === 'string') return bytes.slice(0, 8);
  // ArrayBuffer / Uint8Array / Buffer / number[]
  const u = bytes instanceof Uint8Array ? bytes
    : (bytes.buffer ? new Uint8Array(bytes.buffer, bytes.byteOffset || 0, Math.min(8, bytes.byteLength || 8))
      : new Uint8Array(bytes).subarray(0, 8));
  return u;
}

/**
 * Deterministic format detection. Byte magic wins; MIME is a strong hint;
 * filename extension is the WEAKEST hint and only used when nothing else
 * decides (§6 — "Filename may be used as a weak ingestion hint only").
 * @returns {string} CORPUS_FORMAT.*
 */
export function detectFormat({ bytes, mimeType, originalFilename } = {}) {
  const head = headBytes(bytes);
  if (head) {
    if (typeof head === 'string') {
      if (head.startsWith(PDF_MAGIC)) return CORPUS_FORMAT.PDF;
    } else {
      const asStr = String.fromCharCode(...Array.from(head.slice(0, 5)));
      if (asStr === PDF_MAGIC) return CORPUS_FORMAT.PDF;
      if (ZIP_MAGIC.every((b, i) => head[i] === b)) {
        // a ZIP — could be .docx / .xlsx / .pptx. Narrow with MIME/ext.
        if (/wordprocessingml/i.test(mimeType || '')) return CORPUS_FORMAT.DOCX;
        if (/\.docx$/i.test(originalFilename || '')) return CORPUS_FORMAT.DOCX;
        return CORPUS_FORMAT.UNKNOWN; // an OOXML zip we do not support
      }
    }
  }
  const mt = String(mimeType || '').toLowerCase();
  if (mt === 'application/pdf') return CORPUS_FORMAT.PDF;
  if (/wordprocessingml|msword/.test(mt)) return CORPUS_FORMAT.DOCX;
  const fn = String(originalFilename || '').toLowerCase();
  if (fn.endsWith('.pdf')) return CORPUS_FORMAT.PDF;
  if (fn.endsWith('.docx')) return CORPUS_FORMAT.DOCX;
  return CORPUS_FORMAT.UNKNOWN;
}

/**
 * @typedef {Object} CorpusSource
 * @property {string} schema
 * @property {string} checksum          - SHA-256 hex of the ORIGINAL bytes (required)
 * @property {Uint8Array|ArrayBuffer|Buffer|string|null} bytes - the original bytes (may be null if only metadata is on hand)
 * @property {string} format            - CORPUS_FORMAT.*
 * @property {string|null} mimeType
 * @property {string|null} originalFilename   - ingestion hint ONLY
 * @property {number|null} sizeBytes
 * @property {string} receivedAt        - ISO 8601, when the ingestion request arrived (INGESTION metadata, never a document fact — §7)
 */

export function makeCorpusSource({
  checksum, bytes = null, mimeType = null, originalFilename = null, sizeBytes = null, format, receivedAt,
} = {}) {
  const resolvedFormat = Object.values(CORPUS_FORMAT).includes(format)
    ? format
    : detectFormat({ bytes, mimeType, originalFilename });
  let size = Number(sizeBytes);
  if (!Number.isFinite(size) || size < 0) {
    size = bytes && bytes.byteLength != null ? bytes.byteLength : (typeof bytes === 'string' ? bytes.length : null);
  }
  return Object.freeze({
    schema: CORPUS_SOURCE_SCHEMA,
    checksum: checksum ? String(checksum) : '',
    bytes: bytes ?? null,
    format: resolvedFormat,
    mimeType: mimeType == null ? null : String(mimeType),
    originalFilename: originalFilename == null ? null : String(originalFilename),
    sizeBytes: size == null ? null : size,
    receivedAt: String(receivedAt || new Date().toISOString()),
  });
}

export function isCorpusSource(s) {
  if (!s || typeof s !== 'object') return false;
  if (s.schema !== CORPUS_SOURCE_SCHEMA) return false;
  if (typeof s.checksum !== 'string' || !/^[0-9a-f]{64}$/i.test(s.checksum)) return false;
  if (!Object.values(CORPUS_FORMAT).includes(s.format)) return false;
  if (s.mimeType !== null && typeof s.mimeType !== 'string') return false;
  if (s.originalFilename !== null && typeof s.originalFilename !== 'string') return false;
  if (s.sizeBytes !== null && !(typeof s.sizeBytes === 'number' && s.sizeBytes >= 0)) return false;
  if (typeof s.receivedAt !== 'string' || !s.receivedAt) return false;
  return true;
}
