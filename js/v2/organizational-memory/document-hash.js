/* ============================================================
   DOCUMENT-HASH.JS — Organizational Memory Foundation (V2.0.7, Phase 10)

   PURPOSE: "Document Hash" — a real, deterministic, dependency-free
   content hash over a document's core identifying fields, feeding
   duplicate-detection-engine.js. Research confirmed no hashing/checksum
   mechanism exists anywhere in js/petty-cash/*.js or js/docs/*.js — this
   is genuinely new, and deliberately simple: a pure FNV-1a 32-bit hash
   over a canonical JSON string, needing no crypto library and producing
   the exact same result in Node and the browser (no `crypto.subtle`
   async dependency, no environment-specific API).

   RESPONSIBILITY: `computeDocumentHash(fields)`.

   DEPENDENCIES: none.

   NON-GOALS: not cryptographically secure — this is a content-equality
   fingerprint for duplicate detection, not a security primitive. Two
   different documents could theoretically collide (32-bit space); at this
   platform's realistic archive scale that risk is accepted, the same way
   `js/petty-cash/petty-cash-store.js#genId()`'s random suffix accepts
   collision risk rather than adding a coordination mechanism.
   ============================================================ */

'use strict';

/** Canonical stringify: sorts object keys recursively so field order never
 *  changes the hash. */
function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** FNV-1a, 32-bit, hex-encoded. Pure, synchronous, dependency-free. */
export function computeDocumentHash(fields) {
  const input = canonicalize(fields || {});
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
