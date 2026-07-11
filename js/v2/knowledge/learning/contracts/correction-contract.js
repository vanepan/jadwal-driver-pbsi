/* ============================================================
   CORRECTION-CONTRACT.JS — Teach Once, Learn Forever (V2.0.5, Phase 9.4)

   PURPOSE: fix the shape of ONE explicit human correction — the input to
   correction-pipeline-engine.js. A correction is fundamentally different
   from a Connector's job: a Connector answers "what's out there in bulk,
   read from a source"; a correction is "here is one specific fix from a
   human, right now" — so it is deliberately NOT routed through
   contracts/connector-contract.js/acquisition-engine.js, which are shaped
   for bulk source reads, not one-at-a-time human input.

   RESPONSIBILITY: define Correction and a validity check.

   DEPENDENCIES: registry/domain-type-registry.js, registry/kind-registry.js
   (domainType/kind must already be registered vocabulary, same rule
   knowledge-item-contract.js enforces).

   NON-GOALS: does not decide whether the correction targets an existing
   item (an update — covers "Pattern/Vocabulary/Relationship Update", all
   the same mechanism regardless of `kind`, since payload shape is opaque
   to the core by design) or proposes a brand new one ("Candidate
   Generation") — `itemId: null` means the latter. Never produces an
   Approved item — see correction-pipeline-engine.js's NON-GOALS.
   ============================================================ */

'use strict';

import { hasDomainType } from '../../registry/domain-type-registry.js';
import { hasKind } from '../../registry/kind-registry.js';

export const CORRECTION_SCHEMA = 'knowledge-correction@1';

/**
 * @typedef {Object} Correction
 * @property {string|null} itemId       - existing KnowledgeItem id to update, or null to propose a new one
 * @property {string} domainType        - registry-backed
 * @property {string} kind              - registry-backed
 * @property {*} correctedPayload       - the corrected/proposed payload (same shape as KnowledgeItem.payload for this kind)
 * @property {string} correctedBy       - human identity, same role-agnostic `approverId`-style field as review-contract.js
 * @property {string|null} note         - human-written explanation, optional
 */

export function isCorrection(c) {
  return !!c && typeof c === 'object'
    && (c.itemId === null || typeof c.itemId === 'string')
    && typeof c.domainType === 'string' && hasDomainType(c.domainType)
    && typeof c.kind === 'string' && hasKind(c.kind)
    && typeof c.correctedBy === 'string' && c.correctedBy.length > 0;
}
