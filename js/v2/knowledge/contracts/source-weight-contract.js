/* ============================================================
   SOURCE-WEIGHT-CONTRACT.JS — Knowledge Platform (V2, Phase 3 / V2.0.9, Phase 12)

   PURPOSE: fix the shape of "how much should this source's say-so count" —
   the input corroboration/confidence computation reads from. Kept as its
   own contract (rather than folded into confidence on KnowledgeItem)
   because weight is a property of the SOURCE/connector, not of any one
   item, and multiple connectors may corroborate the same fact with
   different trust levels.

   RESPONSIBILITY: define the SourceWeight typedef and a real weight
   table, keyed by `sourceType` (the same id space connector-contract.js's
   Connector.id and every engine's `provenance.connectorId` already use —
   'nor', 'correction', 'extraction', 'merge', and a default for anything
   unregistered).

   Weight rationale (documented, not hidden): `correction` (1.0) — an
   explicit human statement is the platform's highest-trust input, by
   design (Decision 6, "teach once, learn forever"). `nor` (0.9) — a real
   connector reading V1 directly. `extraction` (0.7) — mechanically
   DERIVED from already-Approved knowledge (knowledge/extraction/, V2.0.8)
   is real evidence, but one level removed from a primary source.
   `merge` (0.6) — promotion/knowledge-merge-engine.js's shallow,
   intentionally naive combination strategy (V2.0.4) is real but the
   least interpretive. Unregistered sourceTypes (e.g. an inactive
   placeholder connector, which never emits anything anyway) default to
   0.5 — unknown, not distrusted.

   DEPENDENCIES: none.

   NON-GOALS: does not compute a KnowledgeItem's `confidence` field
   directly — see machine-learning/confidence-engine.js, which reads this
   weight table as one input among several (corroboration count, sample
   size). Does not decide corroboration count (see
   explainability-contract.js's `corroborationCount`, derived from the
   dependency graph, not from this file).
   ============================================================ */

'use strict';

/**
 * @typedef {Object} SourceWeight
 * @property {string} sourceType
 * @property {number} weight       - 0–1, relative trust
 * @property {string} rationale
 */

export const SOURCE_WEIGHT_SCHEMA = 'source-weight@1';

export const SOURCE_WEIGHT_CONTRACT = Object.freeze({
  schema: SOURCE_WEIGHT_SCHEMA,
  fields: Object.freeze(['sourceType', 'weight', 'rationale']),
});

export const DEFAULT_SOURCE_WEIGHT = 0.5;

const _weights = new Map();

function register(sourceType, weight, rationale) {
  _weights.set(sourceType, Object.freeze({ sourceType, weight, rationale }));
}

/**
 * @param {string} sourceType
 * @returns {SourceWeight}
 */
export function getSourceWeight(sourceType) {
  return _weights.get(sourceType) || Object.freeze({
    sourceType, weight: DEFAULT_SOURCE_WEIGHT, rationale: 'Unregistered sourceType — default weight (unknown, not distrusted).',
  });
}

export function listSourceWeights() {
  return Object.freeze([..._weights.values()]);
}

/** Test/teardown helper. Re-bootstraps the known weight table. */
export function resetSourceWeights() {
  _weights.clear();
  bootstrap();
}

function bootstrap() {
  register('correction', 1.0, 'Explicit human statement — the platform\'s highest-trust input by design (Decision 6).');
  register('nor', 0.9, 'A real connector reading V1 directly (knowledge/connectors/nor-connector.js).');
  register('extraction', 0.7, 'Mechanically derived from already-Approved knowledge (knowledge/extraction/, V2.0.8) — real evidence, one level removed from a primary source.');
  register('merge', 0.6, 'promotion/knowledge-merge-engine.js\'s intentionally naive shallow-merge strategy (V2.0.4) — real but the least interpretive.');
}

bootstrap();
