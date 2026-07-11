/* ============================================================
   CONNECTOR-REGISTRY.JS — Knowledge Platform (V2, Phase 3)

   PURPOSE: the single process-wide directory of knowledge connectors,
   mirroring the provider-registry pattern already proven in this codebase
   (js/prediction/prediction-provider.js, js/engineering/providers/
   provider-registry.js) — reused rather than reinvented (Decision 2).

   RESPONSIBILITY: register/get/list connectors against the Connector
   contract (contracts/connector-contract.js). Holds no connector logic.

   DEPENDENCIES: knowledge/contracts/connector-contract.js.

   NON-GOALS: zero real connectors are registered in Phase 3 — this
   registry starts, and stays, empty until Phase 4+ implements one. No
   bootstrap call exists here (unlike prediction-provider.js, which
   bootstraps two built-in providers) precisely because there is nothing
   real to register yet.

   FUTURE EVOLUTION: Phase 4+ connectors (Documents, Configuration,
   Business Rules, Operational History, Analytics, Recommendation Engines,
   Workflow Definitions, User Corrections, Organizational Decisions,
   Templates, Policies — see connectors/README.md) call
   `registerConnector()` here at their own module load time.
   ============================================================ */

'use strict';

import { isConnector } from '../contracts/connector-contract.js';

export const CONNECTOR_REGISTRY_ERRORS = Object.freeze({
  INVALID_CONNECTOR: 'INVALID_CONNECTOR',
  UNKNOWN_CONNECTOR: 'UNKNOWN_CONNECTOR',
});

/** @type {Map<string, object>} */
const _connectors = new Map();

/**
 * Idempotent per id (re-registering the same id replaces it).
 * Throws INVALID_CONNECTOR for a malformed connector (a programmer error).
 */
export function registerConnector(connector) {
  if (!isConnector(connector)) {
    const err = new Error('registerConnector: connector must satisfy { id, version, description, fetch() }.');
    err.code = CONNECTOR_REGISTRY_ERRORS.INVALID_CONNECTOR;
    throw err;
  }
  _connectors.set(connector.id, connector);
  return connector;
}

export function getConnector(id) {
  return _connectors.get(id) || null;
}

export function hasConnector(id) {
  return _connectors.has(id);
}

/** A frozen summary of every registered connector (no `fetch` fn). */
export function listConnectors() {
  return Object.freeze([..._connectors.values()].map((c) => Object.freeze({
    id: c.id,
    version: c.version,
    description: c.description || null,
  })));
}

/** Test/teardown helper. Not used by any runtime path. */
export function resetConnectorRegistry() {
  _connectors.clear();
}
