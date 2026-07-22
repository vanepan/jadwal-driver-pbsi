/* ============================================================
   ARCHIVE-REPOSITORY.JS — Organizational Memory Foundation (V2.0.7, Phase 10)

   PURPOSE: the version-safe archive model — a real, Map-backed, append-
   only store for ArchiveRecords, mirroring knowledge/repository/
   implementations/memory-repository.js's proven append-only shape
   (create() always version 1; appendVersion() always version+1, never an
   in-place overwrite) and reusing identity-contract.js#nextVersion
   directly rather than re-deriving version arithmetic — that function is
   already domain-agnostic (pure `n => n+1`), so this is real reuse, not
   duplication.

   Unlike the Knowledge Repository, this is a single real backend, not a
   Null-default-plus-swappable-backend registry — Organizational Memory
   has no "must be safe with zero backends" requirement the way Knowledge
   does (a repository with nothing in it is just an empty archive, not a
   platform-integrity concern), so one Map-backed module is the
   proportionate amount of architecture here.

   RESPONSIBILITY: create/appendVersion/getById/getVersion/getHistory/
   list/search.

   DEPENDENCIES: knowledge/contracts/identity-contract.js (nextVersion —
   reused, not reimplemented), contracts/archive-record-contract.js.
   ============================================================ */

'use strict';

import { nextVersion } from '../../../js/v2/knowledge/contracts/identity-contract.js';
import { isArchiveRecord, normalizeArchiveRecord } from '../contracts/archive-record-contract.js';

/* ══════════════════════════════════════════════════════════════════════
   PHASE 4, PART 8 — THE ARCHIVE REPOSITORY BOUNDARY, DECLARED.

   These exports are NOT equal, and nothing in the language says so — every one
   of them looks identical to an autocomplete. Same three tiers Knowledge's
   repository already declares (knowledge-repository.js), for the same reasons.

   ── PUBLIC (safe for anyone) ─────────────────────────────────────────
     ARCHIVE_REPOSITORY_ERRORS   error codes. Data, not behaviour.

   ── INTERNAL (one legitimate caller: services/archive-service.js) ────
     getById · getVersion · list · search · getHistory
       Reads. Harmless alone, but every consumer now goes through the Archive
       Service so that "who reads organizational memory?" has ONE answer, and
       any future filtering, caching or access-control has one place to live.

   ── UNSAFE (one legitimate caller, enforced by test) ─────────────────
     create · appendVersion
       These WRITE organizational memory. Called directly they bypass:
         · duplicate detection   (a re-archived document silently doubles)
         · the lifecycle graph   (a record can be born SUPERSEDED)
         · the replacement chain (one-directional links nobody can follow back)
         · provenance            (archiveReason/archivedBy simply absent)
       Exactly this happened: ui/dataset-import-center.js#doArchive called raw
       create() on the pipeline's PRIMARY archive path, bypassing every one of
       the above. Their ONLY legitimate caller is services/archive-service.js.
       Enforced by scripts/archive-ownership-check.mjs.

   ── NOTE: THERE IS NO DELETE, AND THAT IS DELIBERATE ─────────────────
     An organizational memory that can forget on request is not a memory.
     Documents are superseded, deprecated or marked duplicate — never erased.
     See contracts/archive-record-contract.js on why DELETED is not a state.

   ── WHY THESE ARE NOT PRIVATE (yet) ──────────────────────────────────
     Same answer as Knowledge: privatising means a module-boundary refactor
     across the check scripts that import resetArchiveRepository(). No module
     outside the owner calls the writers any more — the door is unlocked, but
     nobody walks through, and a failing test names the rule far more loudly
     than a private field would. Encapsulation deserves its own phase.
   ══════════════════════════════════════════════════════════════════════ */

export const ARCHIVE_REPOSITORY_ERRORS = Object.freeze({
  NOT_FOUND: 'NOT_FOUND',
  DUPLICATE_ID: 'DUPLICATE_ID',
  INVALID_RECORD: 'INVALID_RECORD',
});

function success(data) { return Object.freeze({ ok: true, data: data ?? null, error: null }); }
function failure(code, message) { return Object.freeze({ ok: false, data: null, error: Object.freeze({ code, message }) }); }

/** @type {Map<string, object[]>} id -> ordered version array, oldest first */
const _store = new Map();

/* Phase 4 — every read returns a record in its FULL declared shape. Records
   written before this phase have no `state`, no `archiveReason`, no
   relationship fields; normalizeArchiveRecord() restores them from the record's
   own facts (a record that already contributed knowledge is REFERENCED; one
   that did not is AVAILABLE — see the contract). Normalising at the read
   boundary means no downstream engine has to defensively re-check a field the
   contract promised, and no `...spread` merge carries a hole forward. Exactly
   the lesson the Import Session repository learned the hard way in Phase 2.6,
   applied before it costs anything here. */
function latestOf(id) {
  const versions = _store.get(id);
  if (!versions || !versions.length) return null;
  return normalizeArchiveRecord(versions[versions.length - 1]);
}

function allLatest() {
  return [..._store.values()].map((versions) => normalizeArchiveRecord(versions[versions.length - 1]));
}

export function getById(id) {
  const latest = latestOf(id);
  return latest ? success(latest) : failure(ARCHIVE_REPOSITORY_ERRORS.NOT_FOUND, `No archive record with id "${id}".`);
}

export function getVersion(id, version) {
  const versions = _store.get(id);
  if (!versions) return failure(ARCHIVE_REPOSITORY_ERRORS.NOT_FOUND, `No archive record with id "${id}".`);
  const match = versions.find((v) => v.version === version);
  return match ? success(match) : failure(ARCHIVE_REPOSITORY_ERRORS.NOT_FOUND, `No version ${version} of "${id}".`);
}

export function list(filter = {}) {
  let items = allLatest();
  if (filter.sourceDomainType) items = items.filter((i) => i.sourceDomainType === filter.sourceDomainType);
  if (filter.sourceType) items = items.filter((i) => i.sourceType === filter.sourceType);
  return success(items);
}

export function search(query) {
  const q = String(query || '').toLowerCase();
  if (!q) return success([]);
  return success(allLatest().filter((i) => i.documentNumber.toLowerCase().includes(q) || i.id.toLowerCase().includes(q)));
}

export function create(record) {
  if (!record || typeof record.id !== 'string' || !record.id) {
    return failure(ARCHIVE_REPOSITORY_ERRORS.INVALID_RECORD, 'create: record.id must be supplied by the caller.');
  }
  if (_store.has(record.id)) {
    return failure(ARCHIVE_REPOSITORY_ERRORS.DUPLICATE_ID, `An archive record with id "${record.id}" already exists — use appendVersion().`);
  }
  if (record.version !== 1) {
    return failure(ARCHIVE_REPOSITORY_ERRORS.INVALID_RECORD, 'create: a new archive record must start at version 1.');
  }
  if (!isArchiveRecord(record)) {
    return failure(ARCHIVE_REPOSITORY_ERRORS.INVALID_RECORD, 'create: record does not satisfy the ArchiveRecord contract.');
  }
  _store.set(record.id, [Object.freeze({ ...record })]);
  return success(latestOf(record.id));
}

export function appendVersion(id, patch) {
  const versions = _store.get(id);
  if (!versions) return failure(ARCHIVE_REPOSITORY_ERRORS.NOT_FOUND, `No archive record with id "${id}".`);
  const latest = versions[versions.length - 1];
  const merged = Object.freeze({ ...latest, ...patch, id, version: nextVersion(latest.version), updatedAt: new Date().toISOString() });
  if (!isArchiveRecord(merged)) {
    return failure(ARCHIVE_REPOSITORY_ERRORS.INVALID_RECORD, 'appendVersion: resulting record does not satisfy the ArchiveRecord contract.');
  }
  _store.set(id, [...versions, merged]);
  return success(merged);
}

export function getHistory(id) {
  const versions = _store.get(id);
  return versions ? success([...versions]) : failure(ARCHIVE_REPOSITORY_ERRORS.NOT_FOUND, `No archive record with id "${id}".`);
}

/** Test/teardown helper. Not used by any runtime path. */
export function resetArchiveRepository() {
  _store.clear();
}
