'use strict';

/* ============================================================
   functions/src/intelligence/corpusChecksum.js — Phase 5.x.2

   The CJS mirror of src/intelligence/corpus/ingestion/corpus-checksum.js
   — SHA-256 of the ORIGINAL document bytes, lowercase hex. Same identity
   the browser produces via Web Crypto; here it uses Node's built-in
   `crypto`. scripts/intelligence-corpus-ingestion-check.cjs asserts the
   two agree on the same bytes.

   §5 — identity is the ORIGINAL bytes, never the extracted text, never
   the filename.
   ============================================================ */

const crypto = require('node:crypto');

const HEX64 = /^[0-9a-f]{64}$/;

function toBuffer(bytes) {
  if (bytes == null) throw new Error('computeCorpusChecksum: bytes are required.');
  if (Buffer.isBuffer(bytes)) return bytes;
  if (bytes instanceof Uint8Array || bytes instanceof ArrayBuffer || ArrayBuffer.isView(bytes)) return Buffer.from(bytes);
  if (typeof bytes === 'string') return Buffer.from(bytes, 'utf8');
  if (Array.isArray(bytes)) return Buffer.from(bytes);
  throw new Error('computeCorpusChecksum: unsupported bytes type.');
}

/**
 * @param {Buffer|Uint8Array|ArrayBuffer|string|number[]} bytes
 * @returns {Promise<string>} lowercase hex SHA-256
 */
async function computeCorpusChecksum(bytes) {
  return crypto.createHash('sha256').update(toBuffer(bytes)).digest('hex');
}

/** Synchronous variant — the Admin SDK context is synchronous-friendly. */
function computeCorpusChecksumSync(bytes) {
  return crypto.createHash('sha256').update(toBuffer(bytes)).digest('hex');
}

function normalizeChecksum(s) {
  const v = String(s == null ? '' : s).trim().toLowerCase();
  return HEX64.test(v) ? v : '';
}

function isChecksum(s) {
  return typeof s === 'string' && HEX64.test(s);
}

module.exports = { computeCorpusChecksum, computeCorpusChecksumSync, normalizeChecksum, isChecksum };
