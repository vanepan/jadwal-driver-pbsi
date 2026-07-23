/* ============================================================
   IDENTITY-CONTRACT.JS — Knowledge Platform (V2, Phase 3 / Phase 9)

   PURPOSE: fix HOW a KnowledgeItem's identity and version are formed, kept
   separate from the item shape itself so identity policy can evolve
   without touching the KnowledgeItem contract.

   RESPONSIBILITY: document the identity/version invariants and generate a
   real, deterministic id.

   DEPENDENCIES: none.

   NON-GOALS: does not decide version numbers beyond simple increment — see
   repository/implementations/memory-repository.js for how create()/
   appendVersion() actually use nextVersion().

   FUTURE EVOLUTION: none expected — this format is now load-bearing for
   idempotent re-acquisition (Phase 9, V2.0.2): the same sourceRef from the
   same connector always resolves to the same id, so re-running acquisition
   appends a version instead of creating a duplicate row.
   ============================================================ */

'use strict';

export const IDENTITY_INVARIANTS = Object.freeze({
  // An id is stable across every version of the same logical KnowledgeItem.
  idIsStableAcrossVersions: true,
  // version starts at 1 and increments by exactly 1 per lifecycle transition
  // or content revision — never reused, never decremented.
  versionStartsAt: 1,
  versionIncrement: 1,
  // A transition is a NEW row (new version), never an overwrite of a prior
  // version — mirrors the Timeline Engine / server event outbox append-only
  // pattern cited in the architecture doc §4.2.3.
  writesAreAppendOnly: true,
});

/**
 * Deterministic identity: `${domainType}:${sourceType}:${sourceRef}`. The
 * same underlying source record always maps to the same KnowledgeItem id,
 * regardless of how many times a connector re-acquires it — this is what
 * makes incremental acquisition idempotent instead of duplicate-generating.
 * @param {{domainType: string, sourceType: string, sourceRef: string}} seed
 * @returns {string}
 */
export function generateKnowledgeId(seed) {
  const { domainType, sourceType, sourceRef } = seed || {};
  if (typeof domainType !== 'string' || !domainType) throw new Error('generateKnowledgeId: domainType must be a non-empty string');
  if (typeof sourceType !== 'string' || !sourceType) throw new Error('generateKnowledgeId: sourceType must be a non-empty string');
  if (typeof sourceRef !== 'string' || !sourceRef) throw new Error('generateKnowledgeId: sourceRef must be a non-empty string');
  return `${domainType}:${sourceType}:${sourceRef}`;
}

/**
 * STUB. Given a current version number, returns the next legal version.
 * Pure arithmetic only — this is NOT the append-only write itself (that is
 * knowledge/repository/knowledge-repository.js's job, Phase 4+).
 * @param {number} currentVersion
 * @returns {number}
 */
export function nextVersion(currentVersion) {
  if (typeof currentVersion !== 'number' || currentVersion < 1) {
    throw new Error('nextVersion: currentVersion must be a number >= 1');
  }
  return currentVersion + IDENTITY_INVARIANTS.versionIncrement;
}
