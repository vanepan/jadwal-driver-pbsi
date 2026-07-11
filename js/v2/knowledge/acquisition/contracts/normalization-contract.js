/* ============================================================
   NORMALIZATION-CONTRACT.JS — Knowledge Acquisition (V2, Phase 9)

   PURPOSE: fix the shape of KnowledgeNormalization — a record of HOW a
   connector mapped its source's native shape into a KnowledgeItem payload,
   so a reviewer (or a future connector author) can answer "what rule
   turned this record into this item" without reading the connector's
   source code.

   RESPONSIBILITY: define KnowledgeNormalization and a constructor.

   DEPENDENCIES: none.

   NON-GOALS: does not perform any normalization itself — each connector
   writes its own mapping logic and describes it with this shape.
   ============================================================ */

'use strict';

export const NORMALIZATION_SCHEMA = 'knowledge-normalization@1';

/**
 * @typedef {Object} KnowledgeNormalization
 * @property {string} normalizerId      - e.g. 'nor-structure-normalizer'
 * @property {string} normalizerVersion
 * @property {string} sourceRepresentation - one of SOURCE_REPRESENTATION (source-contract.js)
 * @property {string|null} notes        - human-readable, optional
 */

export function makeNormalization({ normalizerId, normalizerVersion, sourceRepresentation, notes = null }) {
  return Object.freeze({ normalizerId, normalizerVersion, sourceRepresentation, notes });
}

/** Structural check that an object satisfies the KnowledgeNormalization contract. */
export function isKnowledgeNormalization(n) {
  return !!n && typeof n === 'object'
    && typeof n.normalizerId === 'string' && n.normalizerId.length > 0
    && typeof n.normalizerVersion === 'string' && n.normalizerVersion.length > 0
    && typeof n.sourceRepresentation === 'string' && n.sourceRepresentation.length > 0;
}
