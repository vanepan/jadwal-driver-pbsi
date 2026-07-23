/* ============================================================
   IDENTITY-CONTRACT.JS — Body Intelligence (V2, Phase 12.5.1)

   PURPOSE: fix HOW an Entity's identity and version are formed, kept
   separate from the Entity shape itself — same split
   knowledge/contracts/identity-contract.js already establishes.

   RESPONSIBILITY: generate a deterministic Entity id. Version increment
   is NOT reimplemented here — `nextVersion()` is a pure, zero-import leaf
   utility already proven by every other domain in this platform
   (learning/repository/learning-repository.js and
   organizational-memory/repository/archive-repository.js both reuse it
   the same way); reusing it is the same "don't duplicate a one-line
   utility" discipline every repository in this codebase follows, not a
   domain dependency on knowledge/ (see js/v2/body/README.md's dependency
   section — this file is allowlisted by name in
   scripts/body-ownership-check.mjs, exactly as learning's own reuse is
   allowlisted in scripts/learning-ownership-check.mjs).

   DEPENDENCIES: knowledge/contracts/identity-contract.js (nextVersion
   only — a pure, dependency-free leaf; verified zero imports of its own).

   FUTURE EVOLUTION: none expected — `${entityType}:${sourceRef}` is
   stable for as long as one sensor owns one entityType and one V1 source
   record has one durable id, both true today.
   ============================================================ */

'use strict';

import { nextVersion } from '../../../../src/knowledge/contracts/identity-contract.js';

export const IDENTITY_INVARIANTS = Object.freeze({
  idIsStableAcrossVersions: true,
  versionStartsAt: 1,
  versionIncrement: 1,
  writesAreAppendOnly: true,
});

/**
 * Deterministic identity: `${entityType}:${sourceRef}`. The same V1 source
 * record always maps to the same Entity id, so a sensor re-sensing the same
 * record appends a version instead of creating a duplicate row — the same
 * idempotent-re-acquisition property knowledge/'s identity format gives
 * connectors.
 * @param {{entityType: string, sourceRef: string}} seed
 * @returns {string}
 */
export function generateEntityId({ entityType, sourceRef }) {
  if (typeof entityType !== 'string' || !entityType) throw new Error('generateEntityId: entityType must be a non-empty string');
  if (typeof sourceRef !== 'string' || !sourceRef) throw new Error('generateEntityId: sourceRef must be a non-empty string');
  return `${entityType}:${sourceRef}`;
}

export { nextVersion };
