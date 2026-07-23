/* ============================================================
   MEMORY-REPOSITORY.JS — Knowledge Repository Foundation (V2, Phase 5)

   PURPOSE: a REAL, correct, non-durable reference implementation of the
   Repository contract — an in-memory Map, mirroring how
   js/engineering/providers/dev-seed-adapter.js is a genuine (not fake)
   working adapter distinguished from a Firebase-backed one. "Memory" is
   itself an implementation-neutral choice (no external backend committed
   to), so this file contains real logic — enforcing append-only versioning
   (identity-contract.js's `nextVersion`) and legal lifecycle transitions
   (lifecycle-contract.js's `canTransition`) — rather than a NOT_IMPLEMENTED
   stub. It exists to prove the Repository contract is actually
   implementable and to give Phase 6+ services something real to compose
   against in tests/dev, never to be assumed as a production backend
   (data does not survive a process restart).

   RESPONSIBILITY: implement every Repository method with real Map-backed
   storage, enforcing:
     - append-only versioning (create() always version 1; appendVersion()
       always version+1 — never an in-place overwrite)
     - legal lifecycle transitions only (illegal moves are rejected, not
       silently allowed)
     - `search()` is a naive case-insensitive substring scan — a reference
       implementation, NOT a real search index (no Vector DB, per Phase 5's
       explicit constraint).

   DEPENDENCIES: contracts/repository-contract.js,
   knowledge/contracts/{knowledge-item,lifecycle,identity,review,
   dependency-graph}-contract.js.

   NON-GOALS: does not generate a canonical KnowledgeItem id (identity
   format is still an open Phase 4+ decision, see identity-contract.js) —
   `create()` requires the caller to supply `item.id`. Does not persist
   across process restarts. Does not implement any real search index.

   FUTURE EVOLUTION: a Firebase-backed repository will need to satisfy the
   exact same contract; this file is the reference both a test suite and
   that future implementation can be checked against.
   ============================================================ */

'use strict';

import { REPOSITORY_ERRORS, repositorySuccess, repositoryFailure } from '../contracts/repository-contract.js';
import { isKnowledgeItem } from '../../contracts/knowledge-item-contract.js';
import { canTransition, LIFECYCLE_STATE } from '../../contracts/lifecycle-contract.js';
import { nextVersion } from '../../contracts/identity-contract.js';
import { isValidReviewDecision } from '../../contracts/review-contract.js';
import { isRelationshipPayload } from '../../contracts/dependency-graph-contract.js';

export const MEMORY_REPOSITORY_ID = 'memory';
export const MEMORY_REPOSITORY_VERSION = 'memory-repository@1';

/** Factory so tests/consumers can hold independent, isolated instances
 *  instead of sharing one process-wide Map (unlike the registries, which
 *  are intentionally process-wide singletons). */
export function createMemoryRepository() {
  /** @type {Map<string, object[]>} id -> ordered version array, oldest first */
  const store = new Map();

  function latestOf(id) {
    const versions = store.get(id);
    return versions && versions.length ? versions[versions.length - 1] : null;
  }

  function allLatest() {
    return [...store.values()].map((versions) => versions[versions.length - 1]);
  }

  function getById(id, opts = {}) {
    const latest = latestOf(id);
    if (!latest) return repositoryFailure(REPOSITORY_ERRORS.NOT_FOUND, `No item with id "${id}".`);
    if (opts.approvedOnly) {
      const versions = store.get(id);
      const approved = [...versions].reverse().find((v) => v.lifecycleState === LIFECYCLE_STATE.APPROVED);
      if (!approved) return repositoryFailure(REPOSITORY_ERRORS.NOT_FOUND, `No Approved version of "${id}".`);
      return repositorySuccess(approved);
    }
    return repositorySuccess(latest);
  }

  function getVersion(id, version) {
    const versions = store.get(id);
    if (!versions) return repositoryFailure(REPOSITORY_ERRORS.NOT_FOUND, `No item with id "${id}".`);
    const match = versions.find((v) => v.version === version);
    if (!match) return repositoryFailure(REPOSITORY_ERRORS.NOT_FOUND, `No version ${version} of "${id}".`);
    return repositorySuccess(match);
  }

  function list(filter = {}) {
    let items = allLatest();
    if (filter.domainType) items = items.filter((i) => i.domainType === filter.domainType);
    if (filter.kind) items = items.filter((i) => i.kind === filter.kind);
    if (filter.lifecycleState) items = items.filter((i) => i.lifecycleState === filter.lifecycleState);
    return repositorySuccess(items);
  }

  function search(query) {
    const q = String(query || '').toLowerCase();
    if (!q) return repositorySuccess([]);
    const items = allLatest().filter((i) => {
      try { return JSON.stringify(i.payload).toLowerCase().includes(q); } catch { return false; }
    });
    return repositorySuccess(items);
  }

  function create(item) {
    if (!item || typeof item.id !== 'string' || !item.id) {
      return repositoryFailure(REPOSITORY_ERRORS.INVALID_ITEM, 'create: item.id must be supplied by the caller (identity format is still open, see identity-contract.js).');
    }
    if (store.has(item.id)) {
      return repositoryFailure(REPOSITORY_ERRORS.DUPLICATE_ID, `An item with id "${item.id}" already exists — use appendVersion().`);
    }
    if (item.version !== 1) {
      return repositoryFailure(REPOSITORY_ERRORS.INVALID_ITEM, 'create: a new item must start at version 1.');
    }
    if (!isKnowledgeItem(item)) {
      return repositoryFailure(REPOSITORY_ERRORS.INVALID_ITEM, 'create: item does not satisfy the KnowledgeItem contract.');
    }
    store.set(item.id, [Object.freeze({ ...item })]);
    return repositorySuccess(latestOf(item.id));
  }

  function appendVersion(id, patch) {
    const versions = store.get(id);
    if (!versions) return repositoryFailure(REPOSITORY_ERRORS.NOT_FOUND, `No item with id "${id}".`);
    const latest = versions[versions.length - 1];
    const toState = patch && patch.lifecycleState;
    if (toState && toState !== latest.lifecycleState && !canTransition(latest.lifecycleState, toState)) {
      return repositoryFailure(REPOSITORY_ERRORS.ILLEGAL_TRANSITION, `${latest.lifecycleState} -> ${toState} is not a legal transition.`);
    }
    const merged = Object.freeze({
      ...latest,
      ...patch,
      id,
      version: nextVersion(latest.version),
      updatedAt: new Date().toISOString(),
    });
    if (!isKnowledgeItem(merged)) {
      return repositoryFailure(REPOSITORY_ERRORS.INVALID_ITEM, 'appendVersion: resulting item does not satisfy the KnowledgeItem contract.');
    }
    store.set(id, [...versions, merged]);
    return repositorySuccess(merged);
  }

  function getHistory(id) {
    const versions = store.get(id);
    if (!versions) return repositoryFailure(REPOSITORY_ERRORS.NOT_FOUND, `No item with id "${id}".`);
    return repositorySuccess([...versions]);
  }

  function rollback(id, toVersion, reviewDecision) {
    const versions = store.get(id);
    if (!versions) return repositoryFailure(REPOSITORY_ERRORS.NOT_FOUND, `No item with id "${id}".`);
    const target = versions.find((v) => v.version === toVersion);
    if (!target) return repositoryFailure(REPOSITORY_ERRORS.NOT_FOUND, `No version ${toVersion} of "${id}".`);
    const latest = versions[versions.length - 1];
    if (!isValidReviewDecision({ ...reviewDecision, toState: LIFECYCLE_STATE.APPROVED }, latest.lifecycleState)) {
      return repositoryFailure(REPOSITORY_ERRORS.INVALID_REVIEW_DECISION, 'rollback: requires a valid ReviewDecision approving the prior version (Decision 3).');
    }
    const restored = Object.freeze({
      ...target,
      version: nextVersion(latest.version),
      lifecycleState: LIFECYCLE_STATE.APPROVED,
      approvedBy: reviewDecision.approverId,
      approvedAt: reviewDecision.decidedAt,
      preferenceRationale: reviewDecision.preferenceRationale,
      updatedAt: new Date().toISOString(),
    });
    store.set(id, [...versions, restored]);
    return repositorySuccess(restored);
  }

  function getDependencies(id) {
    const items = allLatest().filter((i) => i.kind === 'relationship' && isRelationshipPayload(i.payload)
      && (i.payload.fromId === id || i.payload.toId === id));
    return repositorySuccess(items);
  }

  function getMetrics() {
    const items = allLatest();
    const byDomainType = {};
    const byLifecycleState = {};
    for (const i of items) {
      byDomainType[i.domainType] = (byDomainType[i.domainType] || 0) + 1;
      byLifecycleState[i.lifecycleState] = (byLifecycleState[i.lifecycleState] || 0) + 1;
    }
    return repositorySuccess({ totalItems: items.length, byDomainType, byLifecycleState });
  }

  function getPendingReview() {
    return repositorySuccess(allLatest().filter((i) => i.lifecycleState === LIFECYCLE_STATE.PENDING_REVIEW));
  }

  return Object.freeze({
    id: MEMORY_REPOSITORY_ID,
    version: MEMORY_REPOSITORY_VERSION,
    getById, getVersion, list, search, create, appendVersion,
    getHistory, rollback, getDependencies, getMetrics, getPendingReview,
  });
}

/** A shared process-wide instance for convenience — most callers should
 *  prefer this unless they specifically need an isolated instance (tests). */
export const memoryRepository = createMemoryRepository();

export default memoryRepository;
