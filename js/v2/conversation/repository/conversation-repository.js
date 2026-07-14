/* ============================================================
   CONVERSATION-REPOSITORY.JS — Conversation Intelligence Foundation (Phase 6)

   PURPOSE: the version-safe Conversation store — same Map-backed,
   append-only shape as learning-repository.js (create() always version 1;
   appendVersion() always version+1, never an in-place overwrite; local
   success()/failure() envelope). In-memory only, like Knowledge/Archive/
   Learning — a Conversation is a session, not durable-across-refresh V1
   state.

   ── PUBLIC (safe for anyone) ─────────────────────────────────────────
     CONVERSATION_REPOSITORY_ERRORS

   ── INTERNAL (one legitimate caller: services/conversation-service.js) ──
     getById · getVersion · list · getHistory

   ── UNSAFE (one legitimate caller, enforced by test) ─────────────────
     create · appendVersion
       Their ONLY legitimate caller is services/conversation-service.js.
       Enforced by scripts/conversation-ownership-check.mjs — the same rule
       every domain in this platform enforces (see learning-repository.js's
       header for the full "why").

   ── NOTE ON PART 8, "CONVERSATION MEMORY IS TEMPORARY" ───────────────
     There is still no delete() — append-only is this platform's uniform
     answer to "how is history kept honest," and a Conversation's own
     record is as real a fact ("a human asked this, at this time") as any
     other. What makes Conversation Memory NOT Organization Memory is not
     that it vanishes from this Map — it is that NOTHING under learning/ or
     organizational-memory/ may ever import this file (enforced by
     scripts/conversation-ownership-check.mjs). Only the REAL side effects a
     completed Conversation causes — a recordCorrection(), a
     promoteKnowledge(), an archiveDocument() — become organizational fact,
     and those are recorded by the domains that already own that recording,
     not by this repository. See task-executor.js's header.

   RESPONSIBILITY: create/appendVersion/getById/getVersion/getHistory/list/
   resetConversationRepository.

   DEPENDENCIES: ../contracts/conversation-contract.js (isConversation,
   nextVersion-equivalent arithmetic — done inline, this domain has no
   cross-domain identity utility to reuse since conversation ids are not
   `${domainType}:${sourceType}:${sourceRef}` shaped).
   ============================================================ */

'use strict';

import { isConversation } from '../contracts/conversation-contract.js';

export const CONVERSATION_REPOSITORY_ERRORS = Object.freeze({
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
  return latest ? success(latest) : failure(CONVERSATION_REPOSITORY_ERRORS.NOT_FOUND, `No conversation with id "${id}".`);
}

export function getVersion(id, version) {
  const versions = _store.get(id);
  if (!versions) return failure(CONVERSATION_REPOSITORY_ERRORS.NOT_FOUND, `No conversation with id "${id}".`);
  const match = versions.find((v) => v.version === version);
  return match ? success(match) : failure(CONVERSATION_REPOSITORY_ERRORS.NOT_FOUND, `No version ${version} of "${id}".`);
}

export function list(filter = {}) {
  let items = allLatest();
  if (filter.actorId) items = items.filter((i) => i.actorId === filter.actorId);
  if (filter.state) items = items.filter((i) => i.state === filter.state);
  if (filter.intent) items = items.filter((i) => i.currentIntent && i.currentIntent.intent === filter.intent);
  return success(items);
}

export function create(record) {
  if (!record || typeof record.id !== 'string' || !record.id) {
    return failure(CONVERSATION_REPOSITORY_ERRORS.INVALID_RECORD, 'create: record.id must be supplied by the caller.');
  }
  if (_store.has(record.id)) {
    return failure(CONVERSATION_REPOSITORY_ERRORS.DUPLICATE_ID, `A conversation with id "${record.id}" already exists — use appendVersion().`);
  }
  if (record.version !== 1) {
    return failure(CONVERSATION_REPOSITORY_ERRORS.INVALID_RECORD, 'create: a new conversation must start at version 1.');
  }
  if (!isConversation(record)) {
    return failure(CONVERSATION_REPOSITORY_ERRORS.INVALID_RECORD, 'create: record does not satisfy the Conversation contract.');
  }
  _store.set(record.id, [Object.freeze({ ...record })]);
  return success(latestOf(record.id));
}

export function appendVersion(id, patch) {
  const versions = _store.get(id);
  if (!versions) return failure(CONVERSATION_REPOSITORY_ERRORS.NOT_FOUND, `No conversation with id "${id}".`);
  const latest = versions[versions.length - 1];
  const merged = Object.freeze({
    ...latest, ...patch, id, version: latest.version + 1, updatedAt: new Date().toISOString(),
  });
  if (!isConversation(merged)) {
    return failure(CONVERSATION_REPOSITORY_ERRORS.INVALID_RECORD, 'appendVersion: resulting record does not satisfy the Conversation contract.');
  }
  _store.set(id, [...versions, merged]);
  return success(merged);
}

export function getHistory(id) {
  const versions = _store.get(id);
  return versions ? success([...versions]) : failure(CONVERSATION_REPOSITORY_ERRORS.NOT_FOUND, `No conversation with id "${id}".`);
}

/** Test/teardown helper. Not used by any runtime path. */
export function resetConversationRepository() {
  _store.clear();
}
