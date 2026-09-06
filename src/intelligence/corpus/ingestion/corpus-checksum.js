/* ============================================================
   CORPUS-CHECKSUM.JS — Corpus Ingestion & Document Analysis
   (V2, Phase 5.x.2)

   PURPOSE: the ONE deterministic content hash for corpus identity (§5).
   SHA-256 of the ORIGINAL bytes, hex-encoded, lowercase. Works
   identically in the browser and under Node via the Web Crypto API
   (`globalThis.crypto.subtle`, present in Node 18+ and every target
   browser). Deliberately kept in its own dependency-free file — same
   isolation discipline as src/file-storage/file-hash.js — so the CJS
   server mirror (functions/src/intelligence/corpusChecksum.js) can match
   it byte-for-byte.

   RESPONSIBILITY: computeCorpusChecksum(bytes), normalizeChecksum(s),
   isChecksum(s), corpusDocumentIdFromChecksum re-export.

   DEPENDENCIES: none (Web Crypto is a platform global).

   NON-GOALS: does NOT hash extracted text (§5 — identity is the original
   bytes, never the extraction output). Does NOT read files.
   ============================================================ */

'use strict';

export { corpusDocumentIdFromChecksum } from '../contracts/corpus-document-contract.js';

const HEX64 = /^[0-9a-f]{64}$/;

/** Coerce assorted byte containers to a Uint8Array without copying when possible. */
function toU8(bytes) {
  if (bytes == null) throw new Error('computeCorpusChecksum: bytes are required.');
  if (bytes instanceof Uint8Array) return bytes;
  if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes);
  if (ArrayBuffer.isView(bytes)) return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (typeof bytes === 'string') return new TextEncoder().encode(bytes);
  if (Array.isArray(bytes)) return Uint8Array.from(bytes);
  throw new Error('computeCorpusChecksum: unsupported bytes type.');
}

/**
 * @param {Uint8Array|ArrayBuffer|Buffer|string|number[]} bytes  the ORIGINAL document bytes
 * @returns {Promise<string>} lowercase hex SHA-256
 */
export async function computeCorpusChecksum(bytes) {
  const u8 = toU8(bytes);
  const subtle = globalThis.crypto && globalThis.crypto.subtle;
  if (!subtle || typeof subtle.digest !== 'function') {
    throw new Error('computeCorpusChecksum: Web Crypto (crypto.subtle) is unavailable in this runtime.');
  }
  const digest = await subtle.digest('SHA-256', u8);
  const view = new Uint8Array(digest);
  let out = '';
  for (let i = 0; i < view.length; i += 1) out += view[i].toString(16).padStart(2, '0');
  return out;
}

/** Lowercase + trim; returns '' if it is not a 64-hex string. */
export function normalizeChecksum(s) {
  const v = String(s == null ? '' : s).trim().toLowerCase();
  return HEX64.test(v) ? v : '';
}

export function isChecksum(s) {
  return typeof s === 'string' && HEX64.test(s);
}
