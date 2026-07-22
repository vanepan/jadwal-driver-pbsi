/* ============================================================
   FILE-HASH.JS — File Storage Foundation (V2.1)

   PURPOSE: the real, deterministic content hash — kept in its OWN file,
   deliberately separate from file-storage-engine.js, so it has ZERO
   Firebase dependency and stays directly unit-testable under Node (same
   reasoning knowledge/connectors/nor-connector.js's own header already
   documents for why Firebase-dependent code must be isolated rather than
   mixed into a module other code needs to import cheaply).

   RESPONSIBILITY: computeSha256(file).

   DEPENDENCIES: ./worker-runtime.js (Phase 7, Part 3 — the actual hashing
   now runs off the main thread when a Worker is available; this file's own
   public contract — signature, return shape, Node compatibility — is
   UNCHANGED, so every existing caller keeps working with zero edits).
   ============================================================ */

'use strict';

import { hashFile } from './worker-runtime.js';

/**
 * Real SHA-256 over a file's actual bytes — not a proxy, not metadata.
 * @param {File|Blob} file
 * @returns {Promise<string>} lowercase hex digest
 */
export async function computeSha256(file) {
  return hashFile(file);
}
