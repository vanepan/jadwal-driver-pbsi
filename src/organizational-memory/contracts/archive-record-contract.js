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

/* ══════════════════════════════════════════════════════════════════════
   PHASE 4 — THE ARCHIVE LIFECYCLE.

   Before this phase an ArchiveRecord had NO lifecycle at all. It was written
   once and then simply existed: a row in a Map. That is what made Archive a
   storage location rather than a domain — nothing could be said about a
   record beyond "it is there".

   WHAT IS AND IS NOT MODELLED, AND WHY. The mission proposed:

       Created → Indexed → Available → Referenced → Restored → Deprecated → Deleted

   Four of those are real, observable conditions in this codebase. Three are
   not, and inventing them would reintroduce exactly the defect Phase 3 spent
   itself removing — a state no code can ever write, feeding a UI that counts
   it anyway.

     INDEXED    NOT MODELLED. There is no indexing step to wait on. Duplicate
                detection, gap detection and numbering are all computed on READ
                (duplicate-detection-engine.js, gap-detection-engine.js), from
                the records themselves, every time. A record is searchable the
                instant it is written. A stage that is always instantaneous is
                not a resting point; persisting one would be a fabricated fact.

     RESTORED   MODELLED AS A TRANSITION, NOT A STATE. "Restored" describes an
                EVENT that happened to a record, not a condition it is in — a
                record that has been restored is simply Available again. Leaving
                it parked in a permanent "Restored" state would mean a record
                restored once in 2024 still reads "Restored" forever, which
                tells a reader nothing. The event is recorded where events
                belong: in the append-only version history, with its reason
                (ARCHIVE_REASON.RESTORED). Nothing is lost.

     DELETED    DELIBERATELY NOT MODELLED. An append-only organizational memory
                that can delete its own records is not a memory. Deletion needs
                a real design — tombstones, retention policy, who may authorize
                it, what happens to the Knowledge that cites the deleted record —
                and none of that exists. Declaring the state now, with no writer
                and no in-edges, would create precisely the orphan state
                scripts/knowledge-ownership-check.mjs was built to forbid. When
                deletion is genuinely needed it deserves its own phase, not a
                placeholder. This is a deliberate refusal, not an oversight.

   What remains is real, and every transition below is written by exactly one
   module (services/archive-service.js) with a recorded, explainable reason.
   ══════════════════════════════════════════════════════════════════════ */

export const ARCHIVE_STATE = Object.freeze({
  /** Written, but not yet reconciled against the rest of the archive. Transient —
   *  archiveDocument() advances it in the same operation. Kept as a real state
   *  because a create that fails midway is genuinely distinguishable from one
   *  that completed. */
  CREATED: 'created',
  /** The normal resting state: this document is the organization's current
   *  record of itself. Searchable, citable, countable. */
  AVAILABLE: 'available',
  /** A KnowledgeItem cites this document as its origin — the archive record has
   *  contributed to what the organization knows. Deterministic: it is exactly
   *  `hasContributedKnowledge`, promoted from a boolean to a lifecycle fact. */
  REFERENCED: 'referenced',
  /** A newer document replaced this one (a real, recorded replacement chain —
   *  see `supersededById`). The record stays; it is simply no longer current. */
  SUPERSEDED: 'superseded',
  /** Byte-identical to a document already archived. Kept (never discarded — the
   *  fact that the same document arrived twice is itself organizational
   *  information) but never counted as a distinct document. */
  DUPLICATE: 'duplicate',
  /** Retired: no longer the organization's answer, and not replaced by anything
   *  specific either. */
  DEPRECATED: 'deprecated',
});

export const ARCHIVE_STATE_DEFS = Object.freeze([
  Object.freeze({ id: ARCHIVE_STATE.CREATED, label: 'Dibuat' }),
  Object.freeze({ id: ARCHIVE_STATE.AVAILABLE, label: 'Tersedia' }),
  Object.freeze({ id: ARCHIVE_STATE.REFERENCED, label: 'Menjadi Pengetahuan' }),
  Object.freeze({ id: ARCHIVE_STATE.SUPERSEDED, label: 'Digantikan' }),
  Object.freeze({ id: ARCHIVE_STATE.DUPLICATE, label: 'Duplikat' }),
  Object.freeze({ id: ARCHIVE_STATE.DEPRECATED, label: 'Tidak Berlaku' }),
]);

/** The ONE authority on legal Archive moves. Note the restore edges: SUPERSEDED
 *  and DEPRECATED both lead back to AVAILABLE, because restoring a document IS
 *  the act of making it current again. There is no separate "Restored" sink. */
export const ARCHIVE_GRAPH = Object.freeze({
  [ARCHIVE_STATE.CREATED]: Object.freeze([
    ARCHIVE_STATE.AVAILABLE, ARCHIVE_STATE.DUPLICATE,
  ]),
  [ARCHIVE_STATE.AVAILABLE]: Object.freeze([
    ARCHIVE_STATE.REFERENCED, ARCHIVE_STATE.SUPERSEDED, ARCHIVE_STATE.DEPRECATED,
  ]),
  [ARCHIVE_STATE.REFERENCED]: Object.freeze([
    ARCHIVE_STATE.SUPERSEDED, ARCHIVE_STATE.DEPRECATED,
  ]),
  // restore edges — see the header on why RESTORED is an event, not a state.
  [ARCHIVE_STATE.SUPERSEDED]: Object.freeze([
    ARCHIVE_STATE.AVAILABLE, ARCHIVE_STATE.DEPRECATED,
  ]),
  [ARCHIVE_STATE.DEPRECATED]: Object.freeze([ARCHIVE_STATE.AVAILABLE]),
  // A duplicate is what it is. It cannot become the original.
  [ARCHIVE_STATE.DUPLICATE]: Object.freeze([]),
});

export function canTransitionArchive(from, to) {
  const reachable = ARCHIVE_GRAPH[from];
  return Array.isArray(reachable) && reachable.includes(to);
}

/** WHY a record moved. Every transition carries one — "nothing should exist
 *  without provenance" (Part 4) applies to changes, not just to records. */
export const ARCHIVE_REASON = Object.freeze({
  IMPORTED: 'imported',                 // arrived through the Import pipeline
  INGESTED: 'ingested',                 // arrived through an ArchiveSource (e.g. NOR)
  DUPLICATE_DETECTED: 'duplicate_detected',
  KNOWLEDGE_IMPORTED: 'knowledge_imported', // a KnowledgeItem now cites it
  SUPERSEDED: 'superseded',
  KNOWLEDGE_REJECTED: 'knowledge_rejected', // the knowledge it produced was declined
  RESTORED: 'restored',
  DEPRECATED: 'deprecated',
});

/* ── Part 5 — RELATIONSHIPS ────────────────────────────────────────────
   Archive is no longer a flat list. Every relationship below is DETERMINISTIC:
   it is either a recorded reference (a field on the record) or a pure function
   of facts already present (an identical hash, an identical document number).
   None is inferred, scored or guessed — see archive-relationship-engine.js. */
export const ARCHIVE_RELATIONSHIP = Object.freeze({
  DUPLICATE_OF: 'duplicate_of',                 // identical documentHash, archived later
  SUPERSEDES: 'supersedes',                     // recorded replacement chain
  SUPERSEDED_BY: 'superseded_by',
  DERIVED_FROM: 'derived_from',                 // recorded parent document
  PARENT_OF: 'parent_of',
  CHILD_OF: 'child_of',
  REFERENCED_BY: 'referenced_by',               // a KnowledgeItem cites it
  IMPORTED_AS_KNOWLEDGE: 'imported_as_knowledge',
  BELONGS_TO_DATASET: 'belongs_to_dataset',
});

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

/* ══ Phase 4 — PROVENANCE (Part 4) ═════════════════════════════════════
   "Nothing should exist without provenance."

   Every field below answers a question a human will eventually ask of an
   archived document, and every one is a REAL recorded reference — never an
   inference:

     state / archiveReason / archivedBy   what happened to it, why, and who
     importSessionId                      which upload produced it
     knowledgeItemId                      what it became
     duplicateOfId                        which earlier document it repeats
     supersedesId / supersededById        the replacement chain
     parentId                             the document it derives from
     datasetId                            the dataset it belongs to

   All are nullable, and null means "genuinely unknown" — never a placeholder.
   isArchiveRecord() above deliberately does NOT require them: records written
   before this phase are still valid records, and normalizeArchiveRecord()
   below fills their declared shape without inventing content. */

/** @param {object} seed */
export function makeArchiveRecord({
  id, sourceDomainType, sourceId, sourceType, documentNumber,
  documentDate = null, senderOrigin = null, documentHash, sourceSnapshot = {},
  hasOriginalFile = false, fileRef = null,
  state = ARCHIVE_STATE.CREATED, archiveReason = ARCHIVE_REASON.INGESTED, archivedBy = null,
  importSessionId = null, knowledgeItemId = null, datasetId = null,
  duplicateOfId = null, supersedesId = null, parentId = null,
}) {
  const now = new Date().toISOString();
  return Object.freeze({
    id,
    version: 1,
    sourceDomainType,
    sourceId,
    sourceType,
    documentNumber,
    documentDate,
    senderOrigin,
    documentHash,
    hasContributedKnowledge: !!knowledgeItemId,
    sourceSnapshot,
    hasOriginalFile,
    fileRef,
    // Phase 4 — lifecycle + provenance
    state,
    archiveReason,
    archivedBy,
    importSessionId,
    knowledgeItemId,
    datasetId,
    duplicateOfId,
    supersedesId,
    supersededById: null,
    parentId,
    archivedAt: now,
    updatedAt: now,
  });
}

/** Restores the declared shape of a record written before Phase 4 (or one that
 *  round-tripped through a store that drops nulls). It only ever fills an
 *  ABSENT key with its documented default; a value that is really there is
 *  never overwritten. A pre-Phase-4 record is honestly reported as AVAILABLE —
 *  it was archived and is searchable, which is precisely what AVAILABLE means —
 *  and REFERENCED if it already carried hasContributedKnowledge. Nothing is
 *  invented; the record's own facts decide. */
export function normalizeArchiveRecord(r) {
  if (!r || typeof r !== 'object') return r;
  const inferredState = r.state
    || (r.hasContributedKnowledge ? ARCHIVE_STATE.REFERENCED : ARCHIVE_STATE.AVAILABLE);
  return {
    ...r,
    state: inferredState,
    archiveReason: r.archiveReason ?? null,
    archivedBy: r.archivedBy ?? null,
    importSessionId: r.importSessionId ?? null,
    knowledgeItemId: r.knowledgeItemId ?? null,
    datasetId: r.datasetId ?? null,
    duplicateOfId: r.duplicateOfId ?? null,
    supersedesId: r.supersedesId ?? null,
    supersededById: r.supersededById ?? null,
    parentId: r.parentId ?? null,
    documentDate: r.documentDate ?? null,
    senderOrigin: r.senderOrigin ?? null,
    hasContributedKnowledge: !!r.hasContributedKnowledge,
    hasOriginalFile: !!r.hasOriginalFile,
    fileRef: r.fileRef ?? null,
    sourceSnapshot: r.sourceSnapshot ?? {},
  };
}
