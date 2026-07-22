/* ============================================================
   DUPLICATE-DETECTION-ENGINE.JS — Organizational Memory Foundation (V2.0.7, Phase 10)

   PURPOSE: "Duplicate Detection" — groups archived records by
   document-hash.js's content fingerprint; any group with more than one
   member is a real duplicate (same core identifying fields), not a
   guess.

   RESPONSIBILITY: `findDuplicateArchiveRecords(domainType)`.

   DEPENDENCIES: repository/archive-repository.js.
   ============================================================ */

'use strict';

import { listArchive as list } from './services/archive-service.js';

/**
 * @param {string} domainType
 * @returns {{documentHash: string, recordIds: string[]}[]}
 */
export function findDuplicateArchiveRecords(domainType) {
  const result = list({ sourceDomainType: domainType });
  const records = result.ok ? result.data : [];

  const byHash = new Map();
  for (const record of records) {
    if (!byHash.has(record.documentHash)) byHash.set(record.documentHash, []);
    byHash.get(record.documentHash).push(record.id);
  }

  return [...byHash.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([documentHash, recordIds]) => Object.freeze({ documentHash, recordIds: Object.freeze(recordIds) }));
}
