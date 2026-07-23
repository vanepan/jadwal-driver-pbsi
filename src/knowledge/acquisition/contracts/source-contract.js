/* ============================================================
   SOURCE-CONTRACT.JS — Knowledge Acquisition (V2, Phase 9)

   PURPOSE: fix the shape of a KnowledgeSource — the descriptor of WHAT a
   connector reads from, kept separate from the Connector (the code) so the
   pipeline named in the V2.0.2 brief (Connector -> Source -> Acquisition ->
   Builder -> Repository) has a real, inspectable Source node rather than
   folding "what am I reading" into the connector itself.

   RESPONSIBILITY: define KnowledgeSource and, as data, the closed set of
   representation levels a source may read from — structurally enforcing
   "never PDF, never rendered output, never HTML; prefer ViewModels or
   structured document definitions" (V2.0.2 brief) rather than leaving it
   as a comment a connector author could ignore.

   DEPENDENCIES: none.

   NON-GOALS: does not read anything. Does not know what a NOR is — a
   connector supplies its own KnowledgeSource describing its own read.
   ============================================================ */

'use strict';

export const SOURCE_SCHEMA = 'knowledge-source@1';

/** Closed set of representation levels a KnowledgeSource may read from.
 *  Deliberately excludes anything rendered (pdf/html/dom) — the renderer is
 *  presentation, knowledge must learn business structure. */
export const SOURCE_REPRESENTATION = Object.freeze({
  VIEW_MODEL: 'view_model',
  STORE_RECORD: 'store_record',
  CONFIG: 'config',
  RULE_DEFINITION: 'rule_definition',
  ANALYTICS_OUTPUT: 'analytics_output',
  RECOMMENDATION_OUTPUT: 'recommendation_output',
  DECISION_RECORD: 'decision_record',
  WORKFLOW_DEFINITION: 'workflow_definition',
  TEMPLATE_DESCRIPTOR: 'template_descriptor',
  POLICY_DEFINITION: 'policy_definition',
  HUMAN_CORRECTION: 'human_correction',
});

/**
 * @typedef {Object} KnowledgeSource
 * @property {string} id             - unique source id, e.g. 'petty_cash.nors'
 * @property {string} connectorId    - which connector reads this source (contracts/connector-contract.js)
 * @property {string} description
 * @property {string} representation - one of SOURCE_REPRESENTATION
 */

export function makeSource({ id, connectorId, description, representation }) {
  return Object.freeze({ id, connectorId, description: description || null, representation });
}

/** Structural check that an object satisfies the KnowledgeSource contract. */
export function isKnowledgeSource(s) {
  return !!s && typeof s === 'object'
    && typeof s.id === 'string' && s.id.length > 0
    && typeof s.connectorId === 'string' && s.connectorId.length > 0
    && typeof s.representation === 'string'
    && Object.values(SOURCE_REPRESENTATION).includes(s.representation);
}
