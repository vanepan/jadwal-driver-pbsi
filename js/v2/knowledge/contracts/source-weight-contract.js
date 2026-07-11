/* ============================================================
   SOURCE-WEIGHT-CONTRACT.JS — Knowledge Platform (V2, Phase 3)

   PURPOSE: fix the shape of "how much should this source's say-so count" —
   the input corroboration/confidence computation will read from, once it
   exists. Kept as its own contract (rather than folded into confidence on
   KnowledgeItem) because weight is a property of the SOURCE/connector, not
   of any one item, and multiple connectors may corroborate the same fact
   with different trust levels.

   RESPONSIBILITY: define the SourceWeight typedef and a registry-shaped
   lookup contract. No weight values are computed or asserted yet.

   DEPENDENCIES: none.

   NON-GOALS: does not compute a KnowledgeItem's `confidence` field (that is
   Phase 4+ builder/connector work). Does not decide corroboration count
   (see explainability-contract.js's `corroboration` field — derived later
   from provenance + relationship items, not from this file).

   FUTURE EVOLUTION: Phase 4+ populates a real weight per registered
   sourceType (e.g. an approved Organizational Decision outweighs a Draft
   User Correction), read by the metrics engine and the builder.
   ============================================================ */

'use strict';

/**
 * @typedef {Object} SourceWeight
 * @property {string} sourceType   - matches a connector id (contracts/connector-contract.js)
 * @property {number} weight       - 0–1, relative trust; not yet computed anywhere
 * @property {string} [rationale]  - why this source is weighted this way
 */

export const SOURCE_WEIGHT_SCHEMA = 'source-weight@1';

export const SOURCE_WEIGHT_CONTRACT = Object.freeze({
  schema: SOURCE_WEIGHT_SCHEMA,
  fields: Object.freeze(['sourceType', 'weight', 'rationale']),
});

/**
 * STUB. Locks the lookup shape a real weight table will occupy.
 * @param {string} _sourceType
 * @returns {never}
 */
export function getSourceWeight(_sourceType) {
  throw new Error('getSourceWeight: NOT_IMPLEMENTED — source weighting is Phase 4+ work.');
}
