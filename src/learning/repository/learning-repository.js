/* ============================================================
   LEARNING-REPOSITORY.JS — Learning Ownership & Organizational Memory (Phase 5)

   PURPOSE: the version-safe LearningEvent store — same Map-backed,
   append-only shape as knowledge-repository.js and archive-repository.js
   (create() always version 1; appendVersion() always version+1, never an
   in-place overwrite; local success()/failure() envelope). In-memory only,
   like Knowledge and Archive (not RTDB-backed like Import Session) —
   Learning Events are derived organizational memory, not the pipeline's own
   durable-across-refresh state; the facts they reference (Import Sessions,
   Archive Records, KnowledgeItems) are what actually persists.

   ══════════════════════════════════════════════════════════════════════
   PHASE 5, PART 9/8 — THE REPOSITORY BOUNDARY, DECLARED FROM THE START.

   Every prior domain in this series (Import Session in Phase 2.6, Knowledge
   in Phase 3, Archive in Phase 4) SHIPPED with a leaky repository and had to
   retrofit the tiering after the fact. Learning ships with it declared on
   day one, because the lesson generalizes: an autocomplete cannot tell public
   from unsafe, only a comment and a test can.

   ── PUBLIC (safe for anyone) ─────────────────────────────────────────
     LEARNING_REPOSITORY_ERRORS   error codes. Data, not behaviour.

   ── INTERNAL (one legitimate caller: services/learning-service.js) ────
     getById · getVersion · list · getHistory
       Reads. Every consumer (Organization Memory, Pattern Discovery,
       Coverage, the Executive Briefing) goes through the Learning Service,
       so "who reads organizational learning?" has ONE answer.

   ── UNSAFE (one legitimate caller, enforced by test) ─────────────────
     create · appendVersion
       These WRITE organizational memory. Called directly they bypass:
         · the human-gate-equivalent validation (a malformed/no-op event
           could be recorded as if it were real learning)
         · the lifecycle graph (an event could be born HISTORICAL)
         · idempotency (the same correction recorded on every re-render would
           flood the log — see learning-service.js#recordCorrection)
         · supersession (two corrections to the same field would both look
           current forever, with no chain between them)
       Their ONLY legitimate caller is services/learning-service.js. Enforced
       by scripts/learning-ownership-check.mjs.

   ── NOTE: THERE IS NO DELETE ──────────────────────────────────────────
     Same reasoning as Archive: organizational memory that can forget on
     request is not memory. Superseded events are marked HISTORICAL and kept.

   ── WHY THESE ARE NOT PRIVATE (yet) ──────────────────────────────────
     Same deferred-debt answer as every prior domain: no module outside the
     owner calls the writers, so privatising buys real safety but costs a
     module-boundary refactor across every check script's reset*() teardown
     import. Its own phase. See the Phase 5 report's deferred debt.
   ══════════════════════════════════════════════════════════════════════

   RESPONSIBILITY: create/appendVersion/getById/getVersion/getHistory/list/
   resetLearningRepository.

   DEPENDENCIES: knowledge/contracts/identity-contract.js (nextVersion —
   reused, not reimplemented, same as every other repository in this
   platform), ./contracts/learning-event-contract.js (isLearningEvent).
   ============================================================ */

'use strict';

import { nextVersion } from '../../knowledge/contracts/identity-contract.js';
import { isLearningEvent } from '../contracts/learning-event-contract.js';

export const LEARNING_REPOSITORY_ERRORS = Object.freeze({
  NOT_FOUND: 'NOT_FOUND',
  DUPLICATE_ID: 'DUPLICATE_ID',
  INVALID_RECORD: 'INVALID_RECORD',
});

function success(data) { return Object.freeze({ ok: true, data: data ?? null, error: null }); }
function failure(code, message) { return Object.freeze({ ok: false, data: null, error: Object.freeze({ code, message }) }); }

/** @type {Map<string, object[]>} id -> ordered version array, oldest first */
const _store = new Map();

function latestOf(id) {
  const versions = _store.get(id);
  return versions && versions.length ? versions[versions.length - 1] : null;
}

function allLatest() {
  return [..._store.values()].map((versions) => versions[versions.length - 1]);
}

export function getById(id) {
  const latest = latestOf(id);
  return latest ? success(latest) : failure(LEARNING_REPOSITORY_ERRORS.NOT_FOUND, `No learning event with id "${id}".`);
}

export function getVersion(id, version) {
  const versions = _store.get(id);
  if (!versions) return failure(LEARNING_REPOSITORY_ERRORS.NOT_FOUND, `No learning event with id "${id}".`);
  const match = versions.find((v) => v.version === version);
  return match ? success(match) : failure(LEARNING_REPOSITORY_ERRORS.NOT_FOUND, `No version ${version} of "${id}".`);
}

export function list(filter = {}) {
  let items = allLatest();
  if (filter.kind) items = items.filter((i) => i.kind === filter.kind);
  if (filter.correctionType) items = items.filter((i) => i.correctionType === filter.correctionType);
  if (filter.domainType) items = items.filter((i) => i.domainType === filter.domainType);
  if (filter.state) items = items.filter((i) => i.state === filter.state);
  if (filter.actorId) items = items.filter((i) => i.actorId === filter.actorId);
  return success(items);
}

export function create(record) {
  if (!record || typeof record.id !== 'string' || !record.id) {
    return failure(LEARNING_REPOSITORY_ERRORS.INVALID_RECORD, 'create: record.id must be supplied by the caller.');
  }
  if (_store.has(record.id)) {
    return failure(LEARNING_REPOSITORY_ERRORS.DUPLICATE_ID, `A learning event with id "${record.id}" already exists — use appendVersion().`);
  }
  if (record.version !== 1) {
    return failure(LEARNING_REPOSITORY_ERRORS.INVALID_RECORD, 'create: a new learning event must start at version 1.');
  }
  if (!isLearningEvent(record)) {
    return failure(LEARNING_REPOSITORY_ERRORS.INVALID_RECORD, 'create: record does not satisfy the LearningEvent contract.');
  }
  _store.set(record.id, [Object.freeze({ ...record })]);
  return success(latestOf(record.id));
}

export function appendVersion(id, patch) {
  const versions = _store.get(id);
  if (!versions) return failure(LEARNING_REPOSITORY_ERRORS.NOT_FOUND, `No learning event with id "${id}".`);
  const latest = versions[versions.length - 1];
  const merged = Object.freeze({ ...latest, ...patch, id, version: nextVersion(latest.version), updatedAt: new Date().toISOString() });
  if (!isLearningEvent(merged)) {
    return failure(LEARNING_REPOSITORY_ERRORS.INVALID_RECORD, 'appendVersion: resulting record does not satisfy the LearningEvent contract.');
  }
  _store.set(id, [...versions, merged]);
  return success(merged);
}

export function getHistory(id) {
  const versions = _store.get(id);
  return versions ? success([...versions]) : failure(LEARNING_REPOSITORY_ERRORS.NOT_FOUND, `No learning event with id "${id}".`);
}

/** Test/teardown helper. Not used by any runtime path. */
export function resetLearningRepository() {
  _store.clear();
}
