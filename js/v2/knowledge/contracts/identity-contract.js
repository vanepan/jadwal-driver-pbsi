/* ============================================================
   IDENTITY-CONTRACT.JS — Knowledge Platform (V2, Phase 3)

   PURPOSE: fix HOW a KnowledgeItem's identity and version are formed, kept
   separate from the item shape itself so identity policy (Phase 4+: likely
   a domainType-prefixed id, mirroring js/engineering/config's id-prefix
   tunable) can evolve without touching the KnowledgeItem contract.

   RESPONSIBILITY: document the identity/version invariants and provide a
   locked (stub) id-generation entry point. Real id generation is Phase 4+
   work — see NON-GOALS.

   DEPENDENCIES: none.

   NON-GOALS: does not generate a real id yet. `generateKnowledgeId()`
   throws NOT_IMPLEMENTED rather than returning a plausible-looking fake id,
   so no Phase 3 caller can accidentally depend on placeholder identity
   semantics.

   FUTURE EVOLUTION: Phase 4+ implements real id generation (format TBD —
   candidate: `${domainType}:${sourceType}:${ulid}`) and wires
   `nextVersion()` into the repository's append-only write path.
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
 * STUB. Locks the entry point a real id generator will occupy. Never called
 * by any Phase 3 code path.
 * @param {{domainType: string, sourceType: string}} _seed
 * @returns {never}
 */
export function generateKnowledgeId(_seed) {
  throw new Error('generateKnowledgeId: NOT_IMPLEMENTED — identity generation is Phase 4+ work.');
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
