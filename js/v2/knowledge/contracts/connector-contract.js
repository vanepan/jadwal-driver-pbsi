/* ============================================================
   CONNECTOR-CONTRACT.JS — Knowledge Platform (V2, Phase 3)

   PURPOSE: fix the one shape every knowledge SOURCE conforms to (Decision
   2, architecture doc §4.2.2) — Documents, Configuration, Business Rules,
   Operational History, Analytics, Recommendation Engines, Workflow
   Definitions, User Corrections, Organizational Decisions, Templates,
   Policies, and any future source, all land in the repository through this
   ONE contract. Deliberately mirrors the provider-registry pattern already
   proven in this codebase (js/prediction/prediction-provider.js,
   js/engineering/providers/provider-registry.js).

   RESPONSIBILITY: define the Connector shape and its result contract.

   DEPENDENCIES: none. A REAL connector (Phase 4+) will read V1 read-only
   (per §2.5's already-clean seams — *-store.js getters or a ctx handoff),
   but this contract file itself has zero V1 dependency.

   NON-GOALS: no connector is implemented here. `fetch()` is never called by
   Phase 3 code. Every connector is read-only over its source — a connector
   that writes back into V1 violates this contract by construction (Decision
   2's "Core Operations never depends on Intelligence" boundary).

   FUTURE EVOLUTION: knowledge/registry/connector-registry.js (Phase 3,
   empty) is where real connectors register once implemented; this contract
   is what `isConnector()` checks against.
   ============================================================ */

'use strict';

export const CONNECTOR_SCHEMA = 'knowledge-connector@1';

/** Closed set of connector result error codes. */
export const CONNECTOR_ERRORS = Object.freeze({
  FETCH_FAILED: 'FETCH_FAILED',
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
});

/**
 * @typedef {Object} Connector
 * @property {string} id            - unique connector id, e.g. 'documents' | 'configuration' | 'user_corrections'
 * @property {string} version
 * @property {string} description
 * @property {(since: string|null) => ConnectorResult} fetch
 *   - `since` is a `lastIndexedAt` watermark (ISO 8601) or null for a full
 *     read; incremental-by-default is a Phase 4+ Builder concern
 *     (Decision 9), not enforced by the connector itself.
 */

/**
 * @typedef {Object} ConnectorResult
 * @property {boolean} ok
 * @property {import('./knowledge-item-contract.js').KnowledgeItem[]|null} items - always Draft-lifecycle items; never Approved
 * @property {{code: string, message: string}|null} error
 * @property {string} connectorId
 */

export const CONNECTOR_CONTRACT = Object.freeze({
  schema: CONNECTOR_SCHEMA,
  connector: Object.freeze(['id', 'version', 'description', 'fetch']),
  result: Object.freeze(['ok', 'items', 'error', 'connectorId']),
  errorCodes: CONNECTOR_ERRORS,
});

/** A successful fetch. Every emitted item MUST already be Draft-lifecycle. */
export function connectorSuccess(items, { connectorId } = {}) {
  return Object.freeze({
    ok: true,
    items: Object.freeze(items ?? []),
    error: null,
    connectorId: connectorId ?? null,
  });
}

/** A predictable fetch failure. Connectors return this instead of throwing. */
export function connectorFailure(code, message, { connectorId } = {}) {
  return Object.freeze({
    ok: false,
    items: null,
    error: Object.freeze({ code, message }),
    connectorId: connectorId ?? null,
  });
}

/** Structural check that an object satisfies the connector contract. */
export function isConnector(c) {
  return !!c && typeof c === 'object'
    && typeof c.id === 'string' && c.id.length > 0
    && typeof c.version === 'string' && c.version.length > 0
    && typeof c.fetch === 'function';
}
