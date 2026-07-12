/* ============================================================
   FILE-HASH.JS — File Storage Foundation (V2.1)

   PURPOSE: the real, deterministic content hash — kept in its OWN file,
   deliberately separate from file-storage-engine.js, so it has ZERO
   Firebase dependency and stays directly unit-testable under Node (same
   reasoning knowledge/connectors/nor-connector.js's own header already
   documents for why Firebase-dependent code must be isolated rather than
   mixed into a module other code needs to import cheaply).

   RESPONSIBILITY: computeSha256(file).

   DEPENDENCIES: none (Web Crypto API, a platform global — available
   identically in every modern browser and in Node 19+; verified against
   Node 24 in this milestone).
   ============================================================ */

'use strict';

/**
 * Real SHA-256 over a file's actual bytes — not a proxy, not metadata.
 * @param {File|Blob} file
 * @returns {Promise<string>} lowercase hex digest
 */
export async function computeSha256(file) {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
