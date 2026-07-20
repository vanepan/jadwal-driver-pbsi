/* ============================================================
   ENTITY-SERVICE.JS — Body Intelligence (V2, Phase 12.5.2)

   PURPOSE: the ONE owner of the Entity Repository — mirrors
   knowledge/services/knowledge-service.js's role, trimmed to what Body
   actually needs (no review/promotion/ingest gate — see
   js/v2/body/README.md §1). The single legitimate caller of
   repository/entity-repository.js's `create`/`appendVersion` — enforced
   by scripts/body-ownership-check.mjs.

   RESPONSIBILITY: `observeEntity(candidate)` — the create-or-append
   reconciliation every sensor observation goes through: a brand new
   `sourceRef` becomes a version-1 Entity; a `sourceRef` already known
   becomes a new appended version, never an overwrite. Plus thin read
   passthroughs (getEntity/listEntities/getEntityHistory/getEntityMetrics)
   so every other Body module reads through this service, never the
   repository directly (same "who reads?" discipline every prior domain's
   service enforces).

   `relationshipIds` and `lastHealthReportId` are deliberately left at
   their honest defaults (`[]` / `null`) by this service and never
   mutated here — see entity-contract.js's field table: maintaining a
   second, mutable index of relationship/health data on the Entity row
   itself would be exactly the duplicated-concept risk the Phase 12.5
   brief warns against. The authoritative answer for "what is this
   entity related to" is always
   graph/entity-relationship-graph-engine.js#getNeighbors(entityId); for
   health, health/entity-health-engine.js#computeEntityHealth(entity).

   DEPENDENCIES: repository/entity-repository.js,
   contracts/{entity,identity}-contract.js.

   NON-GOALS: does not call a sensor. does not decide WHEN to re-observe
   — that is services/body-sensing-service.js's orchestration job
   (Phase 12.5.3).
   ============================================================ */

'use strict';

import {
  getById as repoGetById, list as repoList, create as repoCreate,
  appendVersion as repoAppendVersion, getHistory as repoGetHistory, getMetrics as repoGetMetrics,
  setActiveRepository, getActiveRepositoryId,
} from '../repository/entity-repository.js';
import { REPOSITORY_ERRORS } from '../repository/contracts/repository-contract.js';
import { isEntity } from '../contracts/entity-contract.js';

export const ENTITY_SERVICE_ERRORS = Object.freeze({
  INVALID_CANDIDATE: 'INVALID_CANDIDATE',
});

function failure(code, message) { return Object.freeze({ ok: false, data: null, error: Object.freeze({ code, message }) }); }

/**
 * Create-or-append reconciliation. `candidate` is a full, version-1-shaped
 * Entity exactly as a sensor builds it (id/attributes/observedState/etc
 * already resolved) — this function decides whether that becomes a new
 * row or a new version of an existing one.
 * @param {import('../contracts/entity-contract.js').Entity} candidate
 * @returns {{ok: boolean, data: object|null, error: object|null, op: 'create'|'append'|null}}
 */
export function observeEntity(candidate) {
  if (!candidate || typeof candidate.id !== 'string' || !candidate.id) {
    return { ...failure(ENTITY_SERVICE_ERRORS.INVALID_CANDIDATE, 'observeEntity: candidate.id is required.'), op: null };
  }
  const existing = repoGetById(candidate.id);
  if (!existing.ok && existing.error && existing.error.code !== REPOSITORY_ERRORS.NOT_FOUND) {
    return { ...existing, op: null };
  }
  if (!existing.ok) {
    const created = repoCreate(candidate);
    return { ...created, op: created.ok ? 'create' : null };
  }
  const patch = {
    attributes: candidate.attributes,
    observedState: candidate.observedState,
    observedStateBasis: candidate.observedStateBasis,
    owner: candidate.owner,
    capabilities: candidate.capabilities,
    confidence: candidate.confidence,
    observability: candidate.observability,
    visibility: candidate.visibility,
    aiContextTags: candidate.aiContextTags,
  };
  const appended = repoAppendVersion(candidate.id, patch);
  return { ...appended, op: appended.ok ? 'append' : null };
}

export function getEntity(id) { return repoGetById(id); }
export function listEntities(filter) { return repoList(filter); }
export function getEntityHistory(id) { return repoGetHistory(id); }
export function getEntityMetrics() { return repoGetMetrics(); }

export { isEntity };
export function setBodyBackend(id) { return setActiveRepository(id); }
export function getBodyBackendId() { return getActiveRepositoryId(); }
