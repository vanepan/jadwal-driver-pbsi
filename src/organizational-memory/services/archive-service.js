/* ============================================================
   ARCHIVE-SERVICE.JS — Archive Ownership & Archive Intelligence (Phase 4)

   PURPOSE: Archive's ONE owner. The third and last domain to get one, after
   Import Session (pipeline-scheduler.js) and Knowledge (knowledge-service.js),
   and built to the same shape on purpose — a reader who understands one now
   understands all three.

   WHY. The Phase 2.6 ownership audit found Archive with TWO creators:

     organizational-memory/archive-ingestion-engine.js   create() + appendVersion()
                                                          (idempotent, DUPLICATE_ID-aware)
     ui/dataset-import-center.js#doArchive               create()   ← raw, no idempotency

   The UI's path was the pipeline's PRIMARY archive route — every uploaded
   document went through it — and it bypassed the ingestion engine's duplicate
   handling entirely. Worse, organizational-memory/index.js does
   `export * from './repository/archive-repository.js'`, so `create` and
   `appendVersion` were handed to every module that imported the barrel. Four UI
   files import that barrel. Nothing stopped any of them from writing
   organizational memory directly, and one of them did.

   And underneath all of it: an ArchiveRecord had NO LIFECYCLE. It was written
   once and then simply existed. Nothing could say whether a document was
   current, superseded, duplicated, or had contributed knowledge — the archive
   was a storage location wearing a domain's name.

   THE RULE, stated once:

     repository/archive-repository.js#create / appendVersion
     ...have exactly ONE caller in the platform: this file.
     Every other module is a CLIENT. Enforced by
     scripts/archive-ownership-check.mjs, not by discipline.

   ARCHIVE IS APPEND-ONLY, AND THAT IS A FEATURE. There is no delete(). An
   organizational memory that can forget on request is not a memory. Documents
   are superseded, deprecated, or marked duplicate — never erased. See
   contracts/archive-record-contract.js on why DELETED is deliberately not a
   state.

   LAYERING. js/v2/README.md: `organizational-memory/ ──depends on──>
   knowledge/ (read-only cross-reference)`. This file honours that — it holds
   knowledgeItemId / importSessionId / datasetId as plain recorded REFERENCES
   and never imports either domain. Resolving them is the caller's job (the UI
   is the layer allowed to see across). That also keeps the dependency graph
   acyclic: knowledge-service.js may safely read Archive through this file.

   RESPONSIBILITY:
     write   archiveDocument / archiveDuplicate / archiveImportedKnowledge /
             archiveRejectedKnowledge / archiveSupersededKnowledge /
             restoreDocument / deprecateDocument / markReferenced
     read    findArchiveRecord / listArchive / searchArchive /
             getArchiveHistory / getArchiveVersion
     explain explainArchiveRecord / getArchiveRelationships /
             getReplacementChain / getDuplicateIntelligence

   DEPENDENCIES: ../repository/archive-repository.js (the ONLY module allowed to
   call its writers), ../contracts/archive-record-contract.js,
   ../archive-relationship-engine.js (pure — takes records, returns facts).
   Phase 5 adds ../../learning/services/learning-service.js (a document
   supersession is recorded as a relationship-correction Learning Event —
   see that file's header on why organizational-memory/ may depend on
   learning/ but never the reverse).

   PHASE 12.7.0 (Import Pipeline Observability Hardening) — registerArchiveObserver.
   A future domain (Phase 12.7's Recognition layer) needs an event-driven,
   zero-polling signal of "a real write just landed in the Archive" to know
   when there is something new to recognize — the same problem
   pipeline-scheduler.js already solved for its own archiver with an
   injected callback (registerArchiver). archive-repository.js is a plain
   in-memory Map (see its own header — no RTDB, no remote snapshot), so
   there is no cross-tab concern here and no debounced-listener machinery
   to build: every write already happens synchronously, in this process, in
   this file. writeCreate()/writeAppendVersion() below are the two ONLY
   places repoCreate/repoAppendVersion are actually called (every write
   function in this file was migrated onto them in this sprint) — so
   notifying observers from exactly those two functions is a complete,
   exhaustive hook, not a best-effort one. Nothing calls
   registerArchiveObserver yet this phase (dormant, same "structurally
   complete, zero live callers" precedent body/ and learning-bridge/ both
   shipped under) — this is the seam a later sprint wires, not a live
   integration today.
   ============================================================ */

'use strict';

import {
  create as repoCreate,
  appendVersion as repoAppendVersion,
  getById as repoGetById,
  getVersion as repoGetVersion,
  getHistory as repoGetHistory,
  list as repoList,
  search as repoSearch,
  ARCHIVE_REPOSITORY_ERRORS,
} from '../repository/archive-repository.js';
import {
  ARCHIVE_STATE, ARCHIVE_REASON, canTransitionArchive,
  makeArchiveRecord, normalizeArchiveRecord,
} from '../contracts/archive-record-contract.js';
import {
  deriveRelationships, buildReplacementChain, findDuplicateIntelligence, classifyDuplicate,
} from '../archive-relationship-engine.js';
// Phase 5 — organizational-memory/ may depend on learning/ (never the
// reverse — see learning-service.js's header for the full layering
// rationale). A document supersession is one of Part 9's expected Learning
// producers ("Archive Relationships").
import { recordCorrection, CORRECTION_TYPE } from '../../../js/v2/learning/services/learning-service.js';

export const ARCHIVE_SERVICE_ERRORS = Object.freeze({
  NOT_FOUND: 'NOT_FOUND',
  INVALID_RECORD: 'INVALID_RECORD',
  ILLEGAL_TRANSITION: 'ILLEGAL_TRANSITION',
  ALREADY_TERMINAL: 'ALREADY_TERMINAL',
});

/** Phase 12.7.0 — the two real events an observer can be notified of. Data,
 *  not behaviour, same idiom as PIPELINE_OUTCOME/ACQUISITION_EVENT_TYPE
 *  elsewhere in this tree. */
export const ARCHIVE_OBSERVER_EVENT = Object.freeze({
  CREATED: 'created',
  VERSION_APPENDED: 'version_appended',
});

function failure(code, message) {
  return Object.freeze({ ok: false, data: null, error: Object.freeze({ code, message }) });
}

function allRecords(domainType = null) {
  const result = domainType ? repoList({ sourceDomainType: domainType }) : repoList({});
  return result.ok ? result.data : [];
}

/* ── Phase 12.7.0 — observer registration (see header) ────────────────── */

/** @type {Array<(record: object, event: string) => void>} */
const _observers = [];

/**
 * Registers a callback fired synchronously, in-process, after every real
 * write this service makes (never on a failed write). Mirrors
 * pipeline-scheduler.js#registerArchiver's injected-callback shape — an
 * observer never blocks or reverses a write; a throwing observer is caught
 * and logged, never allowed to undo an already-committed Archive write.
 * @param {(record: object, event: string) => void} fn
 */
export function registerArchiveObserver(fn) {
  if (typeof fn === 'function') _observers.push(fn);
}

function notifyArchiveObservers(record, event) {
  for (const fn of _observers) {
    try { fn(record, event); } catch (err) { console.error('[archive-service] observer failed:', err); }
  }
}

/** The ONLY two call sites allowed to touch repoCreate/repoAppendVersion
 *  (enforced the same way as every other rule in this file, by
 *  scripts/archive-ownership-check.mjs) — every write function below routes
 *  through these two wrappers, so "a real write landed" can be observed
 *  exhaustively, not on a best-effort subset of call sites. */
function writeCreate(record) {
  const result = repoCreate(record);
  if (result.ok) notifyArchiveObservers(result.data, ARCHIVE_OBSERVER_EVENT.CREATED);
  return result;
}

function writeAppendVersion(id, patch) {
  const result = repoAppendVersion(id, patch);
  if (result.ok) notifyArchiveObservers(result.data, ARCHIVE_OBSERVER_EVENT.VERSION_APPENDED);
  return result;
}

/** Test/teardown helper — mirrors every other resetX() idiom in this tree.
 *  Not used by any runtime path. */
export function resetArchiveObservers() {
  _observers.length = 0;
}

/* ══ WRITE ════════════════════════════════════════════════════════════ */

/**
 * The ONE way a document enters organizational memory.
 *
 * Idempotent by id (the create-or-append-on-DUPLICATE_ID pattern that
 * archive-ingestion-engine.js used to own and ui/dataset-import-center.js
 * conspicuously did NOT — its raw create() simply failed on a re-archive and
 * reported the failure as "archive gagal").
 *
 * DUPLICATE DETECTION HAPPENS HERE, at the door, and it is deterministic: if a
 * record with the same documentHash already exists in the same domain, the new
 * arrival is archived as a DUPLICATE linked to the original. It is never
 * discarded — the fact that the same document arrived twice IS organizational
 * information — but it never inflates a count either.
 *
 * @param {object} seed — see makeArchiveRecord
 * @returns {{ok: boolean, data: object|null, error: object|null, op: 'create'|'append'|null, duplicateOf: string|null}}
 */
export function archiveDocument(seed) {
  if (!seed || typeof seed.id !== 'string' || !seed.id) {
    return { ...failure(ARCHIVE_SERVICE_ERRORS.INVALID_RECORD, 'archiveDocument: a record id is required.'), op: null, duplicateOf: null };
  }

  const existing = repoGetById(seed.id);
  if (existing.ok) {
    // Same id: this is a re-archive of the SAME document (an ArchiveSource
    // re-ingesting, or the pipeline re-running). Append, never duplicate.
    const merged = writeAppendVersion(seed.id, {
      ...normalizeArchiveRecord({ ...existing.data, ...seed }),
      version: undefined, // the repository owns versioning
      id: seed.id,
    });
    return { ...merged, op: 'append', duplicateOf: existing.data.duplicateOfId || null };
  }

  // A different id, but the same bytes? Then it is a real duplicate.
  const original = seed.documentHash
    ? allRecords(seed.sourceDomainType).find(
      (r) => r.documentHash === seed.documentHash && r.state !== ARCHIVE_STATE.DUPLICATE,
    )
    : null;

  const record = makeArchiveRecord({
    ...seed,
    state: original ? ARCHIVE_STATE.DUPLICATE : ARCHIVE_STATE.AVAILABLE,
    archiveReason: original ? ARCHIVE_REASON.DUPLICATE_DETECTED : (seed.archiveReason || ARCHIVE_REASON.INGESTED),
    duplicateOfId: original ? original.id : (seed.duplicateOfId || null),
  });

  const created = writeCreate(record);
  if (!created.ok) {
    if (created.error && created.error.code === ARCHIVE_REPOSITORY_ERRORS.DUPLICATE_ID) {
      const appended = writeAppendVersion(record.id, record);
      return { ...appended, op: 'append', duplicateOf: original ? original.id : null };
    }
    return { ...created, op: null, duplicateOf: null };
  }

  // If this arrival supersedes an earlier document, record the chain from BOTH
  // ends — a one-directional link is a link half the readers cannot follow.
  if (record.supersedesId) {
    const predecessor = repoGetById(record.supersedesId);
    if (predecessor.ok && canTransitionArchive(predecessor.data.state, ARCHIVE_STATE.SUPERSEDED)) {
      writeAppendVersion(record.supersedesId, {
        state: ARCHIVE_STATE.SUPERSEDED,
        supersededById: record.id,
        archiveReason: ARCHIVE_REASON.SUPERSEDED,
      });
      // Phase 5, Part 9 — same Learning production as
      // archiveSupersededKnowledge()'s explicit path, so the fact is recorded
      // however the supersession was established.
      recordCorrection({
        domainType: record.sourceDomainType,
        correctionType: CORRECTION_TYPE.RELATIONSHIP,
        targetKey: record.supersedesId,
        actorId: record.archivedBy || 'system',
        before: null,
        after: { supersededById: record.id },
        sourceDocumentId: record.supersedesId,
      });
    }
  }

  return { ...created, op: 'create', duplicateOf: original ? original.id : null };
}

/** Explicitly archives a document already known to duplicate another. A thin,
 *  named front door for callers that have ALREADY established the duplication
 *  themselves (e.g. the file-storage dedup ledger, which compares real SHA-256
 *  before any upload happens) and want that fact recorded rather than
 *  re-derived. */
export function archiveDuplicate(seed, originalId) {
  return archiveDocument({
    ...seed,
    duplicateOfId: originalId,
    archiveReason: ARCHIVE_REASON.DUPLICATE_DETECTED,
  });
}

/** The Import pipeline's door. A document whose content genuinely became a
 *  KnowledgeItem — so it enters as REFERENCED, not merely AVAILABLE, and its
 *  `knowledgeItemId` is a recorded reference, not an inference.
 *
 *  This replaces ui/dataset-import-center.js#doArchive's raw repository
 *  create(), which is what made the UI a second Archive owner. */
export function archiveImportedKnowledge(seed) {
  const result = archiveDocument({
    ...seed,
    archiveReason: ARCHIVE_REASON.IMPORTED,
  });
  if (!result.ok || !seed.knowledgeItemId) return result;

  const current = repoGetById(result.data.id);
  if (!current.ok) return result;
  // A duplicate stays a duplicate — it did not independently contribute
  // knowledge, the document it duplicates did. Saying otherwise would
  // double-count the organization's own memory.
  if (current.data.state === ARCHIVE_STATE.DUPLICATE) return result;
  if (!canTransitionArchive(current.data.state, ARCHIVE_STATE.REFERENCED)) return result;

  const referenced = writeAppendVersion(result.data.id, {
    state: ARCHIVE_STATE.REFERENCED,
    hasContributedKnowledge: true,
    knowledgeItemId: seed.knowledgeItemId,
    archiveReason: ARCHIVE_REASON.KNOWLEDGE_IMPORTED,
  });
  return { ...referenced, op: result.op, duplicateOf: result.duplicateOf };
}

/** The Knowledge domain declined the knowledge this document produced. The
 *  DOCUMENT is still real and stays archived — a rejected fact does not unmake
 *  the paper it was written on — but it is no longer a source of live knowledge. */
export function archiveRejectedKnowledge(id, { actorId = null, reason = null } = {}) {
  const current = repoGetById(id);
  if (!current.ok) return failure(ARCHIVE_SERVICE_ERRORS.NOT_FOUND, `No archive record "${id}".`);
  if (!canTransitionArchive(current.data.state, ARCHIVE_STATE.DEPRECATED)) {
    return failure(ARCHIVE_SERVICE_ERRORS.ILLEGAL_TRANSITION, `Cannot deprecate "${id}" from "${current.data.state}".`);
  }
  return writeAppendVersion(id, {
    state: ARCHIVE_STATE.DEPRECATED,
    archiveReason: ARCHIVE_REASON.KNOWLEDGE_REJECTED,
    archivedBy: actorId,
    preferenceRationale: reason || null,
  });
}

/** A newer document replaced this one. Records the chain from both ends. */
export function archiveSupersededKnowledge(id, supersededById, { actorId = null } = {}) {
  const current = repoGetById(id);
  if (!current.ok) return failure(ARCHIVE_SERVICE_ERRORS.NOT_FOUND, `No archive record "${id}".`);
  if (!canTransitionArchive(current.data.state, ARCHIVE_STATE.SUPERSEDED)) {
    return failure(ARCHIVE_SERVICE_ERRORS.ILLEGAL_TRANSITION, `Cannot supersede "${id}" from "${current.data.state}".`);
  }
  const result = writeAppendVersion(id, {
    state: ARCHIVE_STATE.SUPERSEDED,
    supersededById,
    archiveReason: ARCHIVE_REASON.SUPERSEDED,
    archivedBy: actorId,
  });
  // The other end of the chain.
  const successor = repoGetById(supersededById);
  if (result.ok && successor.ok && !successor.data.supersedesId) {
    writeAppendVersion(supersededById, { supersedesId: id });
  }
  // Phase 5, Part 9 — Archive Relationships as a Learning producer. A
  // supersession IS a relationship correction: the organization's
  // understanding of "which document is current" just changed. Recorded
  // best-effort — the archive transition above already committed and must
  // never be undone by a Learning-recording failure.
  if (result.ok) {
    recordCorrection({
      domainType: current.data.sourceDomainType,
      correctionType: CORRECTION_TYPE.RELATIONSHIP,
      targetKey: id,
      actorId: actorId || 'system',
      before: null,
      after: { supersededById },
      sourceDocumentId: id,
    });
  }
  return result;
}

/** Makes a superseded or deprecated document current again. This is the
 *  "Restored" the mission asked for — implemented as a TRANSITION carrying
 *  ARCHIVE_REASON.RESTORED, not as a permanent state, because a restored
 *  document is simply available again. The event lives in the append-only
 *  history, where events belong. */
export function restoreDocument(id, { actorId = null, reason = null } = {}) {
  const current = repoGetById(id);
  if (!current.ok) return failure(ARCHIVE_SERVICE_ERRORS.NOT_FOUND, `No archive record "${id}".`);
  if (current.data.state === ARCHIVE_STATE.DUPLICATE) {
    return failure(
      ARCHIVE_SERVICE_ERRORS.ILLEGAL_TRANSITION,
      `"${id}" is a duplicate of "${current.data.duplicateOfId}" — restoring it would make the organization believe it has two copies of one document. Restore the original instead.`,
    );
  }
  if (!canTransitionArchive(current.data.state, ARCHIVE_STATE.AVAILABLE)) {
    return failure(ARCHIVE_SERVICE_ERRORS.ILLEGAL_TRANSITION, `Cannot restore "${id}" from "${current.data.state}".`);
  }
  return writeAppendVersion(id, {
    state: ARCHIVE_STATE.AVAILABLE,
    supersededById: null,
    archiveReason: ARCHIVE_REASON.RESTORED,
    archivedBy: actorId,
    preferenceRationale: reason || null,
  });
}

/** Retires a document that nothing specific replaced. */
export function deprecateDocument(id, { actorId = null, reason = null } = {}) {
  const current = repoGetById(id);
  if (!current.ok) return failure(ARCHIVE_SERVICE_ERRORS.NOT_FOUND, `No archive record "${id}".`);
  if (!canTransitionArchive(current.data.state, ARCHIVE_STATE.DEPRECATED)) {
    return failure(ARCHIVE_SERVICE_ERRORS.ILLEGAL_TRANSITION, `Cannot deprecate "${id}" from "${current.data.state}".`);
  }
  return writeAppendVersion(id, {
    state: ARCHIVE_STATE.DEPRECATED,
    archiveReason: ARCHIVE_REASON.DEPRECATED,
    archivedBy: actorId,
    preferenceRationale: reason || null,
  });
}

/** Records that a KnowledgeItem now cites this document. Idempotent. */
export function markReferenced(id, knowledgeItemId) {
  const current = repoGetById(id);
  if (!current.ok) return failure(ARCHIVE_SERVICE_ERRORS.NOT_FOUND, `No archive record "${id}".`);
  if (current.data.state === ARCHIVE_STATE.REFERENCED
    && current.data.knowledgeItemId === knowledgeItemId) return current; // converged
  if (!canTransitionArchive(current.data.state, ARCHIVE_STATE.REFERENCED)) {
    return failure(ARCHIVE_SERVICE_ERRORS.ILLEGAL_TRANSITION, `Cannot mark "${id}" referenced from "${current.data.state}".`);
  }
  return writeAppendVersion(id, {
    state: ARCHIVE_STATE.REFERENCED,
    hasContributedKnowledge: true,
    knowledgeItemId,
    archiveReason: ARCHIVE_REASON.KNOWLEDGE_IMPORTED,
  });
}

/* ══ READ — every consumer's one door ════════════════════════════════ */

export const findArchiveRecord = (id) => repoGetById(id);
export const listArchive = (filter) => repoList(filter || {});
export const searchArchive = (query) => repoSearch(query);
export const getArchiveHistory = (id) => repoGetHistory(id);
export const getArchiveVersion = (id, version) => repoGetVersion(id, version);

/* ══ EXPLAIN (Part 4) + RELATE (Part 5) + DUPLICATE INTELLIGENCE (Part 7) ══ */

/** Every relationship of one record — recorded references plus deterministic
 *  content relationships. The reasoning is pure (archive-relationship-engine.js);
 *  this only supplies the data. */
export function getArchiveRelationships(id) {
  const current = repoGetById(id);
  if (!current.ok) return failure(ARCHIVE_SERVICE_ERRORS.NOT_FOUND, `No archive record "${id}".`);
  const rel = deriveRelationships(current.data, allRecords(current.data.sourceDomainType));
  return Object.freeze({ ok: true, data: rel, error: null });
}

/** The full revision chain this document sits in, oldest first. */
export function getReplacementChain(id) {
  const current = repoGetById(id);
  if (!current.ok) return failure(ARCHIVE_SERVICE_ERRORS.NOT_FOUND, `No archive record "${id}".`);
  const chain = buildReplacementChain(current.data, allRecords(current.data.sourceDomainType));
  return Object.freeze({ ok: true, data: chain, error: null });
}

/** Every deterministic duplicate relationship in a domain, classified (Part 7). */
export function getDuplicateIntelligence(domainType = null) {
  return Object.freeze({
    ok: true,
    data: findDuplicateIntelligence(allRecords(domainType)),
    error: null,
  });
}

/**
 * Part 4 — "Nothing should exist without provenance."
 *
 * The complete story of one archived document, assembled entirely from facts it
 * and its history already carry. Cross-domain ids (Import Session, Knowledge
 * Item, Dataset) are returned as BARE REFERENCES: this layer may read
 * knowledge/ but has no business importing it, and the UI — the one layer
 * allowed to see across — resolves them. A field with no real answer is null,
 * never a plausible-looking placeholder.
 */
export function explainArchiveRecord(id) {
  const current = repoGetById(id);
  if (!current.ok) return failure(ARCHIVE_SERVICE_ERRORS.NOT_FOUND, `No archive record "${id}".`);
  const r = current.data;
  const historyResult = repoGetHistory(id);
  const versions = historyResult.ok ? historyResult.data : [];
  const domainRecords = allRecords(r.sourceDomainType);

  // Why it moved, every time it moved — read back out of real version history.
  const lifecycleHistory = [];
  for (let i = 0; i < versions.length; i += 1) {
    const prev = i > 0 ? versions[i - 1] : null;
    const v = versions[i];
    if (!prev || prev.state !== v.state) {
      lifecycleHistory.push(Object.freeze({
        version: v.version,
        fromState: prev ? prev.state : null,
        toState: v.state,
        reason: v.archiveReason || null,
        by: v.archivedBy || null,
        at: v.updatedAt,
      }));
    }
  }

  const duplicateOf = r.duplicateOfId ? repoGetById(r.duplicateOfId) : null;
  const duplicateVerdict = duplicateOf && duplicateOf.ok
    ? classifyDuplicate(duplicateOf.data, r)
    : null;

  return Object.freeze({
    ok: true,
    error: null,
    data: Object.freeze({
      id: r.id,
      documentNumber: r.documentNumber,
      state: r.state,
      /* Part 4's eight required fields, each a real recorded fact or null. */
      importSessionId: r.importSessionId || null,
      knowledgeItemId: r.knowledgeItemId || null,
      duplicateOf: r.duplicateOfId
        ? Object.freeze({
          id: r.duplicateOfId,
          documentNumber: duplicateOf && duplicateOf.ok ? duplicateOf.data.documentNumber : null,
          kind: duplicateVerdict ? duplicateVerdict.kind : null,
          rationale: duplicateVerdict ? duplicateVerdict.rationale : null,
        })
        : null,
      archiveReason: r.archiveReason || null,
      archivedBy: r.archivedBy || null,
      archivedAt: r.archivedAt || null,
      sourceConnector: r.sourceType || null,
      relatedDocuments: deriveRelationships(r, domainRecords),
      /* ...plus the context that makes them useful. */
      datasetId: r.datasetId || null,
      documentHash: r.documentHash || null,
      replacementChain: buildReplacementChain(r, domainRecords).map((c) => Object.freeze({
        id: c.id, documentNumber: c.documentNumber, state: c.state, archivedAt: c.archivedAt,
      })),
      lifecycleHistory: Object.freeze(lifecycleHistory),
      versionCount: versions.length,
    }),
  });
}

export { ARCHIVE_STATE, ARCHIVE_REASON };
