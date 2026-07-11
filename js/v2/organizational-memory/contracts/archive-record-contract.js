/* ============================================================
   ARCHIVE-RECORD-CONTRACT.JS — Organizational Memory Foundation (V2.0.7, Phase 10)

   PURPOSE: fix the shape of ONE archived organizational document —
   distinct from a KnowledgeItem (js/v2/knowledge/contracts/
   knowledge-item-contract.js). A KnowledgeItem is an extracted STRUCTURAL
   FACT with a Draft->Approved curation lifecycle; an ArchiveRecord is the
   organizational record OF the document itself — its number, its "Dari"
   (sender/origin), its hash, whether it has contributed Knowledge yet.
   Per the frozen architecture (Official Documents -> Knowledge Acquisition
   -> Knowledge Repository -> Organizational Memory -> Applications),
   Organizational Memory sits downstream of Knowledge, cross-referencing
   it — it does not replace or duplicate it.

   "Dari:" (sender/origin classification): per research grounding this
   milestone, the app's only real "Dari" concept today is
   `settings.senderTitle` (js/petty-cash/petty-cash-config.js's
   DEFAULT_SETTINGS) — a single GLOBAL org setting, snapshotted onto every
   NOR's view model at generation time (js/petty-cash/nor-document-engine.js),
   not a per-document/per-department field. `senderOrigin` below reuses
   that exact value honestly — it will classify every current NOR into one
   group until the underlying V1 setting is ever made per-document. This
   is documented, not silently worked around.

   RESPONSIBILITY: define ArchiveRecord and a structural validity check.

   DEPENDENCIES: none.

   NON-GOALS: does not read or write anything. Does not decide what
   "Original Document Archive" means beyond an immutable snapshot of the
   source record's identifying facts captured at archive time (see
   `sourceSnapshot`) — no binary file storage exists anywhere in this
   codebase (research confirmed zero Firebase Storage usage), so an
   ArchiveRecord is never a file; `hasOriginalFile`/`fileRef` are reserved
   metadata fields for a FUTURE file-attachment capability, always false/
   null today.
   ============================================================ */

'use strict';

export const ARCHIVE_RECORD_SCHEMA = 'archive-record@1';

/**
 * @typedef {Object} ArchiveRecord
 * @property {string} id                 - deterministic, e.g. `nor:archive:<norId>`
 * @property {number} version            - append-only, same invariants as KnowledgeItem
 * @property {string} sourceDomainType   - registry-backed domainType (e.g. 'nor')
 * @property {string} sourceId           - the V1 record's own id (e.g. petty-cash NOR's `id`)
 * @property {string} sourceType         - which ArchiveSource produced this (contracts/archive-source-contract.js)
 * @property {string} documentNumber     - e.g. norNumber — the human-facing identifying number
 * @property {string|null} documentDate  - ISO 8601 date, if known
 * @property {string|null} senderOrigin  - "Dari" classification (see header) — `settings.senderTitle` as of archive time
 * @property {string} documentHash       - see document-hash.js
 * @property {boolean} hasContributedKnowledge - cross-referenced against the Knowledge repository
 * @property {Object} sourceSnapshot     - immutable copy of the source record's identifying fields at archive time ("Original Document Archive")
 * @property {boolean} hasOriginalFile   - reserved for a future file-attachment capability; always false today
 * @property {string|null} fileRef       - reserved; always null today
 * @property {string} archivedAt         - ISO 8601
 * @property {string} updatedAt          - ISO 8601
 */

export function isArchiveRecord(r) {
  return !!r && typeof r === 'object'
    && typeof r.id === 'string' && r.id.length > 0
    && typeof r.version === 'number' && r.version >= 1
    && typeof r.sourceDomainType === 'string' && r.sourceDomainType.length > 0
    && typeof r.sourceId === 'string' && r.sourceId.length > 0
    && typeof r.sourceType === 'string' && r.sourceType.length > 0
    && typeof r.documentNumber === 'string' && r.documentNumber.length > 0
    && typeof r.documentHash === 'string' && r.documentHash.length > 0
    && typeof r.hasContributedKnowledge === 'boolean'
    && !!r.sourceSnapshot && typeof r.sourceSnapshot === 'object';
}
