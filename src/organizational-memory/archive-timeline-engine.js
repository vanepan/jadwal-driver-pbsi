/* ============================================================
   ARCHIVE-TIMELINE-ENGINE.JS — Organizational Memory Foundation (V2.0.7, Phase 10)

   PURPOSE: "Archive Timeline" — a chronological read over the archive
   repository. A reporting shape, not a new data source.

   RESPONSIBILITY: `getArchiveTimeline(domainType)`.

   DEPENDENCIES: repository/archive-repository.js.
   ============================================================ */

'use strict';

import { listArchive as list } from './services/archive-service.js';

/**
 * @param {string} domainType
 * @returns {{id: string, documentNumber: string, documentDate: string|null, archivedAt: string, hasContributedKnowledge: boolean}[]} oldest first (by documentDate, falling back to archivedAt)
 */
export function getArchiveTimeline(domainType) {
  const result = list({ sourceDomainType: domainType });
  const records = result.ok ? result.data : [];
  return [...records]
    .sort((a, b) => (a.documentDate || a.archivedAt).localeCompare(b.documentDate || b.archivedAt))
    .map((r) => Object.freeze({
      id: r.id,
      documentNumber: r.documentNumber,
      documentDate: r.documentDate,
      archivedAt: r.archivedAt,
      hasContributedKnowledge: r.hasContributedKnowledge,
    }));
}
