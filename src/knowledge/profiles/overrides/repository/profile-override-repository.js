/* ============================================================
   PROFILE-OVERRIDE-REPOSITORY.JS — Organizational Profiles, Editable Layer (V2.1)

   PURPOSE: the version-safe Profile Override store — Map-backed, append-
   only, mirroring organizational-memory/repository/archive-repository.js's
   and datasets/import-session/repository/import-session-repository.js's
   proven shape. Reuses canTransition (knowledge/contracts/
   lifecycle-contract.js) for appendVersion()'s legality check — the exact
   same reuse memory-repository.js already demonstrates, since a Profile
   Override's lifecycleState is the real, unmodified LIFECYCLE_STATE graph.

   RESPONSIBILITY: create/appendVersion/getById/getVersion/getHistory/list/
   resetProfileOverrideRepository.

   DEPENDENCIES: knowledge/contracts/identity-contract.js (nextVersion),
   knowledge/contracts/lifecycle-contract.js (canTransition, reused),
   ../contracts/profile-override-contract.js (isProfileOverrideEntry).
   ============================================================ */

'use strict';

import { nextVersion } from '../../../contracts/identity-contract.js';
import { canTransition } from '../../../contracts/lifecycle-contract.js';
import { isProfileOverrideEntry } from '../contracts/profile-override-contract.js';

export const PROFILE_OVERRIDE_REPOSITORY_ERRORS = Object.freeze({
  NOT_FOUND: 'NOT_FOUND',
  DUPLICATE_ID: 'DUPLICATE_ID',
  INVALID_RECORD: 'INVALID_RECORD',
  ILLEGAL_TRANSITION: 'ILLEGAL_TRANSITION',
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
  return latest ? success(latest) : failure(PROFILE_OVERRIDE_REPOSITORY_ERRORS.NOT_FOUND, `No profile override with id "${id}".`);
}

export function getVersion(id, version) {
  const versions = _store.get(id);
  if (!versions) return failure(PROFILE_OVERRIDE_REPOSITORY_ERRORS.NOT_FOUND, `No profile override with id "${id}".`);
  const match = versions.find((v) => v.version === version);
  return match ? success(match) : failure(PROFILE_OVERRIDE_REPOSITORY_ERRORS.NOT_FOUND, `No version ${version} of "${id}".`);
}

export function list(filter = {}) {
  let items = allLatest();
  if (filter.domainType) items = items.filter((i) => i.domainType === filter.domainType);
  if (filter.overrideType) items = items.filter((i) => i.overrideType === filter.overrideType);
  if (filter.lifecycleState) items = items.filter((i) => i.lifecycleState === filter.lifecycleState);
  return success(items);
}

export function create(record) {
  if (!record || typeof record.id !== 'string' || !record.id) {
    return failure(PROFILE_OVERRIDE_REPOSITORY_ERRORS.INVALID_RECORD, 'create: record.id must be supplied by the caller.');
  }
  if (_store.has(record.id)) {
    return failure(PROFILE_OVERRIDE_REPOSITORY_ERRORS.DUPLICATE_ID, `A profile override with id "${record.id}" already exists — use appendVersion().`);
  }
  if (record.version !== 1) {
    return failure(PROFILE_OVERRIDE_REPOSITORY_ERRORS.INVALID_RECORD, 'create: a new profile override must start at version 1.');
  }
  if (!isProfileOverrideEntry(record)) {
    return failure(PROFILE_OVERRIDE_REPOSITORY_ERRORS.INVALID_RECORD, 'create: record does not satisfy the ProfileOverrideEntry contract.');
  }
  _store.set(record.id, [Object.freeze({ ...record })]);
  return success(latestOf(record.id));
}

export function appendVersion(id, patch) {
  const versions = _store.get(id);
  if (!versions) return failure(PROFILE_OVERRIDE_REPOSITORY_ERRORS.NOT_FOUND, `No profile override with id "${id}".`);
  const latest = versions[versions.length - 1];
  if (patch && typeof patch.lifecycleState === 'string' && patch.lifecycleState !== latest.lifecycleState
    && !canTransition(latest.lifecycleState, patch.lifecycleState)) {
    return failure(PROFILE_OVERRIDE_REPOSITORY_ERRORS.ILLEGAL_TRANSITION, `Cannot transition profile override "${id}" from "${latest.lifecycleState}" to "${patch.lifecycleState}".`);
  }
  const merged = Object.freeze({ ...latest, ...patch, id, version: nextVersion(latest.version), updatedAt: new Date().toISOString() });
  if (!isProfileOverrideEntry(merged)) {
    return failure(PROFILE_OVERRIDE_REPOSITORY_ERRORS.INVALID_RECORD, 'appendVersion: resulting record does not satisfy the ProfileOverrideEntry contract.');
  }
  _store.set(id, [...versions, merged]);
  return success(merged);
}

export function getHistory(id) {
  const versions = _store.get(id);
  return versions ? success([...versions]) : failure(PROFILE_OVERRIDE_REPOSITORY_ERRORS.NOT_FOUND, `No profile override with id "${id}".`);
}

/** Test/teardown helper. Not used by any runtime path. */
export function resetProfileOverrideRepository() {
  _store.clear();
}
